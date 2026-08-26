# Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port personal account management from `web/`'s dashboard into `client/` — profile edit (name/phone), Sessions & Devices, and account danger-zone (cloud data reset + account deletion request) — while fixing a real security gap found during design (password confirmation on reset/deletion was client-side-only, never verified server-side).

**Architecture:** All new data is cloud-account-level (Sanctum-authenticated), online-only, direct API calls — no local SQLite, no sync-engine. A new `useCurrentUser` hook (wrapping the already-existing-but-unused `apiClient.getProfile()`) is additive infrastructure representing the cloud store-owner/admin account; it is deliberately kept separate from `auth-context.tsx`'s `User`, which represents the local, PIN-authenticated device user. The backend password-verification fix lands first (independent of the client work), then client API methods, then UI, then final wiring into a new Settings > Account tab.

**Tech Stack:** Laravel 10 (Sanctum, Hash facade, PHPUnit) for the backend; Next.js 14 App Router with static export for `client/`; TanStack Query; Vitest for client-side unit tests.

**Spec:** `docs/superpowers/specs/2026-08-26-account-management-and-fleet-overview-design.md`, Section D.

## Global Constraints

- All personal-account data (profile, sessions, danger-zone state) is CLOUD account data — online-only, direct API calls, no local SQLite involvement, no sync-engine.
- `useCurrentUser()` is new, additive infrastructure. It must not touch or extend `client/lib/context/auth-context.tsx`'s `User` type (the local, PIN-authenticated device user) — the two represent different accounts entirely.
- The password fields on data-reset and account-deletion-request are being upgraded from client-side-only friction to real server-side verification (`Hash::check`) as part of this plan — this is a deliberate security fix, not incidental scope.
- New Settings tab (`account`) is gated `isAdmin &&`, matching the exact pattern already used for `store`/`data`/`staff`/`system`/`billing` — the cloud account being managed here belongs to the store owner/admin; staff members authenticate locally via PIN and have no cloud Sanctum session of their own.
- Danger-zone's data-reset operates on the **cloud** copy of data via `POST /dashboard/reset` — this is deliberately distinct from and must not be confused with or merged into `client/`'s existing separate local-SQLite factory-reset already present in `data-settings.tsx`.

---

### Task 1: Laravel — real password verification on reset/deletion endpoints

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/Web/DashboardController.php` (`resetData` method, lines 62-72)
- Modify: `laravel-server/app/Http/Controllers/Api/AuthController.php` (`requestDeletion` method, lines 717-752)
- Test: `laravel-server/tests/Feature/AccountSecurityTest.php` (new)

**Interfaces:**
- Produces: `POST /dashboard/reset` now requires `{ type: string, password: string }` (was `{ type }` only), returns 403 `{ error: "Invalid Password", message: "The password you entered is incorrect." }` on mismatch, 422 if `password` missing.
- Produces: `POST /profile/request-deletion` now requires `{ reason: string, password: string }` (was `{ reason }` only), returns 403 `{ error: "Invalid Password", message: "The password you entered is incorrect." }` on mismatch, 422 if `password` missing.

- [ ] **Step 1: Write the failing feature test**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('correct-password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_reset_data_rejects_wrong_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/dashboard/reset', [
            'type' => 'all',
            'password' => 'totally-wrong',
        ]);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid Password']);
    }

    public function test_reset_data_requires_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/dashboard/reset', [
            'type' => 'all',
        ]);

        $response->assertStatus(422);
    }

    public function test_reset_data_succeeds_with_correct_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/dashboard/reset', [
            'type' => 'sales',
            'password' => 'correct-password',
        ]);

        $response->assertStatus(200);
    }

    public function test_request_deletion_rejects_wrong_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/profile/request-deletion', [
            'reason' => 'Closing the business',
            'password' => 'totally-wrong',
        ]);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid Password']);
        $this->assertNull($this->user->fresh()->deletion_requested_at);
    }

    public function test_request_deletion_requires_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/profile/request-deletion', [
            'reason' => 'Closing the business',
        ]);

        $response->assertStatus(422);
    }

    public function test_request_deletion_succeeds_with_correct_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/profile/request-deletion', [
            'reason' => 'Closing the business',
            'password' => 'correct-password',
        ]);

        $response->assertStatus(200);
        $this->assertNotNull($this->user->fresh()->deletion_requested_at);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/AccountSecurityTest.php`
Expected: FAIL — both "wrong password" tests currently succeed/proceed (no check exists) instead of returning 403, and "requires password" tests currently pass (200) instead of 422.

- [ ] **Step 3: Fix `resetData`**

In `laravel-server/app/Http/Controllers/Api/Web/DashboardController.php`, add the import at the top of the file (after the existing `use` block):

```php
use Illuminate\Support\Facades\Hash;
```

Replace `resetData` (lines 62-72):

```php
    public function resetData(Request $request)
    {
        $request->validate([
            'type' => 'nullable|string',
            'password' => 'required|string',
        ]);

        if (!Hash::check($request->password, $request->user()->password)) {
            return response()->json([
                'error' => 'Invalid Password',
                'message' => 'The password you entered is incorrect.',
            ], 403);
        }

        try {
            $type = $request->input('type', 'all');
            $result = $this->dashboardService->resetData($request->user(), $type);
            return response()->json($result);
        } catch (\Exception $e) {
            Log::error("Dashboard Reset Error: " . $e->getMessage());
            return response()->json([
                'error' => 'Reset Failed',
                'message' => $e->getMessage()
            ], 500);
        }
    }
```

Also update the `#[OA\Post(path: '/dashboard/reset', ...)]` attribute's `requestBody` (immediately above `resetData`) to add the new required `password` property:

```php
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'type', type: 'string', default: 'all', description: 'What to reset; see DashboardService::resetData'),
            new OA\Property(property: 'password', type: 'string', description: "The user's current password, required to confirm this destructive action"),
        ])),
```

- [ ] **Step 4: Fix `requestDeletion`**

In `laravel-server/app/Http/Controllers/Api/AuthController.php`, `Hash` is already imported (line 16). Replace the start of `requestDeletion` (lines 717-726):

```php
    public function requestDeletion(Request $request)
    {
        $request->validate([
            'reason' => 'required|string|max:1000',
            'password' => 'required|string',
        ]);

        $user = $request->user();

        if (!Hash::check($request->password, $user->password)) {
            return response()->json([
                'error' => 'Invalid Password',
                'message' => 'The password you entered is incorrect.',
            ], 403);
        }

        $user->deletion_requested_at = now();
        $user->deletion_reason = $request->reason;
        $user->save();
```

(The rest of the method — notifying super admins, logging the activity, returning the success message — is unchanged.)

Also update that endpoint's `#[OA\Post(path: '/profile/request-deletion', ...)]` attribute's `requestBody` to document the new required `password` property, following the same pattern as Step 3.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/AccountSecurityTest.php`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Http/Controllers/Api/Web/DashboardController.php laravel-server/app/Http/Controllers/Api/AuthController.php laravel-server/tests/Feature/AccountSecurityTest.php
git commit -m "fix(server): verify password server-side on data-reset and account-deletion requests"
```

---

### Task 2: `useCurrentUser` hook + profile API methods

**Files:**
- Modify: `client/lib/api/client.ts` (retype `getProfile`, add `updateProfile`)
- Modify: `client/lib/types/user.ts` (add `CurrentUser` type)
- Modify: `client/lib/query-keys.ts` (add `account` entry)
- Create: `client/lib/hooks/use-current-user.ts`
- Test: `client/__tests__/current-user-client.test.ts`

**Interfaces:**
- Consumes: `BaseApiClient.request<T>()` (existing).
- Produces: `apiClient.getProfile(): Promise<CurrentUser>`, `apiClient.updateProfile(payload: { first_name: string; last_name: string; phone?: string | null }): Promise<{ message: string; user: CurrentUser }>`; `useCurrentUser()` (query), `useUpdateProfileMutation()` (mutation, invalidates `currentUser` on success).

- [ ] **Step 1: Add the `CurrentUser` type**

In `client/lib/types/user.ts`, add:

```ts
/** The cloud Sanctum-authenticated account (store owner/admin) — distinct
 * from the auth-context `User`, which represents the local, PIN-authenticated
 * device user. Only the store owner/admin has one of these; staff members
 * log in locally and have no cloud session of their own. */
export interface CurrentUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role: string;
  deletion_requested_at?: string | null;
  deletion_reason?: string | null;
}
```

- [ ] **Step 2: Add the query-key entry**

In `client/lib/query-keys.ts`, add a new top-level entry (after `billing`, before the closing `} as const;`):

```ts
  account: {
    // Remote API data, not a local table.
    currentUser: () => resource(["currentUser"] as const, []),
    sessions: () => resource(["accountSessions"] as const, []),
  },
```

- [ ] **Step 3: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('current user API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getProfile fetches /user', async () => {
    const payload = { id: '1', first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', role: 'store_owner' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getProfile();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/user');
  });

  it('updateProfile posts to /profile/update with the profile payload', async () => {
    const response = { message: 'Profile updated successfully', user: { id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', role: 'store_owner' } };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => response,
    });

    const result = await apiClient.updateProfile({ first_name: 'Jane', last_name: 'Smith', phone: '08012345678' });

    expect(result).toEqual(response);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/profile/update');
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body)).toEqual({ first_name: 'Jane', last_name: 'Smith', phone: '08012345678' });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/current-user-client.test.ts`
Expected: FAIL — `apiClient.updateProfile is not a function`.

- [ ] **Step 5: Implement the methods**

In `client/lib/api/client.ts`, add the import at the top:

```ts
import type { CurrentUser } from "@/lib/types/user";
```

Replace the existing `getProfile` method:

```ts
  async getProfile() {
    return this.request<CurrentUser>("/user");
  }

  async updateProfile(payload: { first_name: string; last_name: string; phone?: string | null }) {
    return this.request<{ message: string; user: CurrentUser }>("/profile/update", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/current-user-client.test.ts`
Expected: PASS, both tests.

- [ ] **Step 7: Create the hook**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";

export function useCurrentUser() {
  return useQuery({
    ...queryKeys.account.currentUser(),
    queryFn: () => apiClient.getProfile(),
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { first_name: string; last_name: string; phone?: string | null }) =>
      apiClient.updateProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.account.currentUser());
    },
  });
}
```

- [ ] **Step 8: Verify the app still builds**

Run: `cd client && npm run build`
Expected: succeeds (pure addition, no consumers yet).

- [ ] **Step 9: Commit**

```bash
git add client/lib/api/client.ts client/lib/types/user.ts client/lib/query-keys.ts client/lib/hooks/use-current-user.ts client/__tests__/current-user-client.test.ts
git commit -m "feat(client): add useCurrentUser hook and profile API methods"
```

---

### Task 3: Profile edit UI component

**Files:**
- Create: `client/components/settings/account/profile-settings.tsx`

**Interfaces:**
- Consumes: `useCurrentUser()`, `useUpdateProfileMutation()` (Task 2).
- Produces: `<ProfileSettings />`, consumed by Task 8's Account tab.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, useUpdateProfileMutation } from "@/lib/hooks/use-current-user";

export function ProfileSettings() {
  const { data: user, isLoading, isError } = useCurrentUser();
  const updateProfile = useUpdateProfileMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ first_name: "", last_name: "", phone: "" });

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
      });
    }
  }, [user]);

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        phone: formData.phone.trim() || null,
      });
      toast.success("Profile updated successfully");
      setIsEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !user) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-destructive">
          Failed to load your account details — check your connection and try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Your name and contact details.</CardDescription>
        </div>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name</Label>
            <Input
              id="first_name"
              value={formData.first_name}
              disabled={!isEditing}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name</Label>
            <Input
              id="last_name"
              value={formData.last_name}
              disabled={!isEditing}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user.email} disabled className="opacity-70 cursor-not-allowed" />
          <p className="text-xs text-muted-foreground">Emails cannot be changed.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            disabled={!isEditing}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        {isEditing && (
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setFormData({
                  first_name: user.first_name || "",
                  last_name: user.last_name || "",
                  phone: user.phone || "",
                });
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateProfile.isPending}>
              {updateProfile.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Deferred to Task 8 (this component isn't mounted anywhere until the Account tab exists).

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/account/profile-settings.tsx
git commit -m "feat(client): add personal profile edit component"
```

---

### Task 4: Sessions & Devices API methods + hooks

**Files:**
- Modify: `client/lib/api/client.ts` (add 3 methods)
- Modify: `client/lib/types/user.ts` (add `Session` type)
- Create: `client/lib/hooks/use-sessions.ts`
- Test: `client/__tests__/sessions-client.test.ts`

**Interfaces:**
- Produces: `apiClient.getSessions(): Promise<Session[]>`, `apiClient.revokeSession(id: string): Promise<{ message: string }>`, `apiClient.revokeAllSessions(): Promise<{ message: string }>`; `useSessions()`, `useRevokeSessionMutation()`, `useRevokeAllSessionsMutation()` (both mutations invalidate `queryKeys.account.sessions()` on success).

- [ ] **Step 1: Add the `Session` type**

In `client/lib/types/user.ts`, add:

```ts
export interface Session {
  id: string;
  name: string;
  ip_address: string | null;
  user_agent: string | null;
  last_used_at: string | null;
  created_at: string;
  is_current: boolean;
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('sessions API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getSessions fetches /sessions', async () => {
    const payload = [{ id: '1', name: 'Client App', ip_address: '1.2.3.4', user_agent: null, last_used_at: '2026-01-01', created_at: '2026-01-01', is_current: true }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getSessions();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/sessions');
  });

  it('revokeSession deletes /sessions/:id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Session revoked' }),
    });

    const result = await apiClient.revokeSession('1');

    expect(result).toEqual({ message: 'Session revoked' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/sessions/1');
    expect(config.method).toBe('DELETE');
  });

  it('revokeAllSessions posts to /sessions/revoke-all', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'All other sessions revoked' }),
    });

    const result = await apiClient.revokeAllSessions();

    expect(result).toEqual({ message: 'All other sessions revoked' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/sessions/revoke-all');
    expect(config.method).toBe('POST');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/sessions-client.test.ts`
Expected: FAIL — none of the three methods exist yet.

- [ ] **Step 4: Implement the methods**

In `client/lib/api/client.ts`, add the import:

```ts
import type { CurrentUser, Session } from "@/lib/types/user";
```

Add the methods (near `getProfile`/`updateProfile`):

```ts
  async getSessions() {
    return this.request<Session[]>("/sessions");
  }

  async revokeSession(id: string) {
    return this.request<{ message: string }>(`/sessions/${id}`, {
      method: "DELETE",
    });
  }

  async revokeAllSessions() {
    return this.request<{ message: string }>("/sessions/revoke-all", {
      method: "POST",
    });
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/sessions-client.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Create the hooks**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";

export function useSessions() {
  return useQuery({
    ...queryKeys.account.sessions(),
    queryFn: () => apiClient.getSessions(),
  });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.account.sessions());
    },
  });
}

export function useRevokeAllSessionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.revokeAllSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.account.sessions());
    },
  });
}
```

- [ ] **Step 7: Verify the app still builds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add client/lib/api/client.ts client/lib/types/user.ts client/lib/hooks/use-sessions.ts client/__tests__/sessions-client.test.ts
git commit -m "feat(client): add sessions & devices API methods and hooks"
```

---

### Task 5: Sessions & Devices UI component

**Files:**
- Create: `client/components/settings/account/sessions-list.tsx`

**Interfaces:**
- Consumes: `useSessions()`, `useRevokeSessionMutation()`, `useRevokeAllSessionsMutation()` (Task 4).
- Produces: `<SessionsList />`, consumed by Task 8's Account tab.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Monitor, Smartphone, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useSessions, useRevokeSessionMutation, useRevokeAllSessionsMutation } from "@/lib/hooks/use-sessions";
import type { Session } from "@/lib/types/user";

function getDeviceIcon(session: Session) {
  const ua = (session.user_agent || "").toLowerCase();
  if (ua.includes("android") || ua.includes("iphone")) return Smartphone;
  return Monitor;
}

function parseDeviceName(session: Session) {
  // Prefer the device_name supplied at login (e.g. client/'s own "Client App")
  // over UA-sniffing — client's own login already sends a meaningful name,
  // unlike web's, which relies entirely on UA parsing as its only signal.
  if (session.name && session.name.toLowerCase() !== "unknown") return session.name;
  const ua = session.user_agent || "";
  if (!ua) return "Unknown Device";
  let os = "Unknown OS";
  if (ua.includes("Windows NT 10.0")) os = "Windows 10/11";
  else if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";
  let browser = "Unknown Browser";
  if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  return `${browser} on ${os}`;
}

export function SessionsList() {
  const { data: sessions = [], isLoading, isError } = useSessions();
  const revokeSession = useRevokeSessionMutation();
  const revokeAll = useRevokeAllSessionsMutation();

  const handleRevoke = async (id: string) => {
    try {
      await revokeSession.mutateAsync(id);
      toast.success("Session revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke session");
    }
  };

  const handleRevokeAll = async () => {
    try {
      await revokeAll.mutateAsync();
      toast.success("Logged out of all other devices");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to log out other devices");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Sessions & Devices</CardTitle>
          <CardDescription>Everywhere you&apos;re currently logged in.</CardDescription>
        </div>
        {sessions.length > 1 && (
          <Button variant="outline" size="sm" onClick={handleRevokeAll} disabled={revokeAll.isPending}>
            {revokeAll.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Log out of all other devices
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive text-center py-6">
            Failed to load sessions — check your connection and try again.
          </p>
        )}
        {!isLoading && !isError && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No active sessions found.</p>
        )}
        {!isLoading &&
          sessions.map((session) => {
            const Icon = getDeviceIcon(session);
            return (
              <div
                key={session.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{parseDeviceName(session)}</span>
                      {session.is_current && (
                        <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500 hover:bg-emerald-600">
                          Current Device
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ip_address || "Unknown IP"} • Last active:{" "}
                      {new Date(session.last_used_at || session.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!session.is_current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(session.id)}
                    disabled={revokeSession.isPending}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Log out
                  </Button>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Deferred to Task 8.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/account/sessions-list.tsx
git commit -m "feat(client): add sessions & devices list component"
```

---

### Task 6: Danger-zone API methods + password confirmation dialog

**Files:**
- Modify: `client/lib/api/client.ts` (add 3 methods)
- Create: `client/components/settings/account/password-confirm-dialog.tsx`
- Test: `client/__tests__/account-danger-client.test.ts`

**Interfaces:**
- Produces: `apiClient.resetData(type: string, password: string): Promise<{ message: string }>` (`POST /dashboard/reset`), `apiClient.requestAccountDeletion(payload: { reason: string; password: string }): Promise<{ message: string }>` (`POST /profile/request-deletion`), `apiClient.cancelAccountDeletion(): Promise<{ message: string }>` (`POST /profile/cancel-deletion`).
- Produces: `<PasswordConfirmDialog open, onOpenChange, title, description, confirmLabel, onConfirm(password: string), extraField?: ReactNode />` — a new dialog component (not an extension of `ConfirmDialog`, whose `requirePin` is a fixed 4-digit local PIN `InputOTP`, not an arbitrary-length cloud account password field; the two confirmation types are different enough to warrant separate components rather than overloading one).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('account danger-zone API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resetData posts type and password to /dashboard/reset', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Reset complete' }),
    });

    const result = await apiClient.resetData('sales', 'my-password');

    expect(result).toEqual({ message: 'Reset complete' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/dashboard/reset');
    expect(JSON.parse(config.body)).toEqual({ type: 'sales', password: 'my-password' });
  });

  it('requestAccountDeletion posts reason and password to /profile/request-deletion', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Account deletion requested successfully.' }),
    });

    const result = await apiClient.requestAccountDeletion({ reason: 'Closing up', password: 'my-password' });

    expect(result).toEqual({ message: 'Account deletion requested successfully.' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/profile/request-deletion');
    expect(JSON.parse(config.body)).toEqual({ reason: 'Closing up', password: 'my-password' });
  });

  it('cancelAccountDeletion posts to /profile/cancel-deletion with no body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Account deletion request cancelled successfully.' }),
    });

    const result = await apiClient.cancelAccountDeletion();

    expect(result).toEqual({ message: 'Account deletion request cancelled successfully.' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/profile/cancel-deletion');
    expect(config.method).toBe('POST');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/account-danger-client.test.ts`
Expected: FAIL — none of the three methods exist yet.

- [ ] **Step 3: Implement the methods**

In `client/lib/api/client.ts`, add:

```ts
  async resetData(type: string, password: string) {
    return this.request<{ message: string }>("/dashboard/reset", {
      method: "POST",
      body: JSON.stringify({ type, password }),
    });
  }

  async requestAccountDeletion(payload: { reason: string; password: string }) {
    return this.request<{ message: string }>("/profile/request-deletion", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async cancelAccountDeletion() {
    return this.request<{ message: string }>("/profile/cancel-deletion", {
      method: "POST",
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/account-danger-client.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Create the password confirmation dialog**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface PasswordConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isSubmitting?: boolean;
  onConfirm: (password: string) => void;
  /** Extra form content rendered above the password field, e.g. a reason textarea. */
  extraField?: ReactNode;
}

export function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  isSubmitting = false,
  onConfirm,
  extraField,
}: PasswordConfirmDialogProps) {
  const [password, setPassword] = useState("");

  const handleClose = () => {
    setPassword("");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm(password);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {extraField}
          <div className="space-y-2">
            <Label htmlFor="password-confirm">Enter your password to confirm</Label>
            <Input
              id="password-confirm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!password.trim() || isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Verify the app still builds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/lib/api/client.ts client/components/settings/account/password-confirm-dialog.tsx client/__tests__/account-danger-client.test.ts
git commit -m "feat(client): add account danger-zone API methods and password confirmation dialog"
```

---

### Task 7: Danger-zone UI component

**Files:**
- Create: `client/components/settings/account/account-danger-zone.tsx`

**Interfaces:**
- Consumes: `apiClient.resetData`/`requestAccountDeletion`/`cancelAccountDeletion` (Task 6), `PasswordConfirmDialog` (Task 6), `useCurrentUser()` (Task 2, to read `deletion_requested_at`).
- Produces: `<AccountDangerZone />`, consumed by Task 8's Account tab.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { PasswordConfirmDialog } from "./password-confirm-dialog";

const RESET_TYPES: { type: string; label: string; description: string }[] = [
  { type: "sales", label: "Clear Sales", description: "Permanently delete all sales records from the cloud." },
  { type: "logs", label: "Clear Logs", description: "Permanently delete all activity logs from the cloud." },
  { type: "stock_batches", label: "Clear Stock Batch", description: "Permanently delete all stock batch records from the cloud." },
  { type: "customers", label: "Clear Customers", description: "Permanently delete all customer records from the cloud." },
  { type: "stores", label: "Clear Terminals", description: "Permanently delete all store/terminal records from the cloud." },
  { type: "all", label: "Nuke Everything (Full Reset)", description: "WARNING: This will delete ALL cloud data (Sales, Logs, Stock Batch, Customers). This is irreversible." },
];

export function AccountDangerZone() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = useState<{ type: string; label: string; description: string } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleReset = async (password: string) => {
    if (!resetTarget) return;
    setIsResetting(true);
    try {
      await apiClient.resetData(resetTarget.type, password);
      toast.success(`${resetTarget.label} completed`);
      setResetTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setIsResetting(false);
    }
  };

  const handleRequestDeletion = async (password: string) => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for the deletion request");
      return;
    }
    setIsRequestingDeletion(true);
    try {
      await apiClient.requestAccountDeletion({ reason: reason.trim(), password });
      toast.success("Account deletion requested successfully.");
      setDeletionDialogOpen(false);
      setReason("");
      queryClient.invalidateQueries(queryKeys.account.currentUser());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request account deletion");
    } finally {
      setIsRequestingDeletion(false);
    }
  };

  const handleCancelDeletion = async () => {
    setIsCancelling(true);
    try {
      await apiClient.cancelAccountDeletion();
      toast.success("Account deletion request cancelled successfully.");
      queryClient.invalidateQueries(queryKeys.account.currentUser());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel deletion request");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            These actions affect your cloud account data and cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {RESET_TYPES.map((reset) => (
              <Button
                key={reset.type}
                variant="outline"
                className="justify-start border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setResetTarget(reset)}
              >
                {reset.label}
              </Button>
            ))}
          </div>

          <div className="border-t pt-6">
            {user?.deletion_requested_at ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
                <p className="text-sm font-medium">Account deletion requested</p>
                <p className="text-xs text-muted-foreground">
                  Reason: {user.deletion_reason || "No reason provided"}
                </p>
                <Button variant="link" className="h-auto p-0 text-sm" onClick={handleCancelDeletion} disabled={isCancelling}>
                  Cancel Request
                </Button>
              </div>
            ) : (
              <Button variant="destructive" onClick={() => setDeletionDialogOpen(true)}>
                Request Account Deletion
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <PasswordConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title={resetTarget?.label || ""}
        description={resetTarget?.description || ""}
        confirmLabel={isResetting ? "Resetting..." : "Confirm Reset"}
        isSubmitting={isResetting}
        onConfirm={handleReset}
      />

      <PasswordConfirmDialog
        open={deletionDialogOpen}
        onOpenChange={setDeletionDialogOpen}
        title="Request Account Deletion"
        description="Your account will be reviewed for deletion. This is not immediate — an admin will process your request."
        confirmLabel={isRequestingDeletion ? "Submitting..." : "Request Deletion"}
        isSubmitting={isRequestingDeletion}
        onConfirm={handleRequestDeletion}
        extraField={
          <div className="space-y-2">
            <Label htmlFor="deletion-reason">Reason for deletion</Label>
            <Textarea
              id="deletion-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us why you're leaving..."
            />
          </div>
        }
      />
    </>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Deferred to Task 8.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/account/account-danger-zone.tsx
git commit -m "feat(client): add account danger-zone component"
```

---

### Task 8: New Settings > Account tab — nav entry, shell, and wiring

**Files:**
- Modify: `client/app/(dashboard)/settings/[tab]/settings-tab-nav.tsx`
- Modify: `client/app/(dashboard)/settings/[tab]/settings-client.tsx`
- Modify: `client/app/(dashboard)/settings/[tab]/page.tsx` (add `account` to `generateStaticParams` — `output: "export"` builds need every tab enumerated or the route 404s)
- Modify: `client/hooks/use-settings.ts` (add `account` to tab-recognition/non-admin-redirect arrays)
- Modify: `client/components/settings/settings-mobile-menu.tsx` (add an Account entry)
- Create: `client/components/settings/account/account-settings.tsx`

**Interfaces:**
- Consumes: `ProfileSettings` (Task 3), `SessionsList` (Task 5), `AccountDangerZone` (Task 7) — all exist by this point, making this the first task where the full Account tab builds and renders together.
- Produces: `<AccountSettings />`, mounted as the new `account` Settings tab's content.

- [ ] **Step 1: Add the nav entry**

In `client/app/(dashboard)/settings/[tab]/settings-tab-nav.tsx`, change the icon import:

```tsx
import { Store, Bell, Shield, Database, Palette, Globe, Users, CreditCard, UserCircle } from "lucide-react";
```

Add, immediately after the `appearance` (General) `TabsTrigger` block and before the `isAdmin && store` block, still gated `isAdmin &&` (matching the pattern used for `store`/`data`/`staff`/`system`/`billing`):

```tsx
      {isAdmin && (
        <TabsTrigger
          value="account"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <UserCircle className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">Account</span>
        </TabsTrigger>
      )}
```

- [ ] **Step 2: Create the tab shell**

```tsx
"use client";

import { ProfileSettings } from "./profile-settings";
import { SessionsList } from "./sessions-list";
import { AccountDangerZone } from "./account-danger-zone";

export function AccountSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Account</h1>
        <p className="text-muted-foreground">Manage your personal information, sessions, and account settings</p>
      </div>

      <ProfileSettings />
      <SessionsList />
      <AccountDangerZone />
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab into `settings-client.tsx`**

Add the import:

```tsx
import { AccountSettings } from "@/components/settings/account/account-settings";
```

Add, immediately after the `appearance` `TabsContent` block (before the `isAdmin && store` `TabsContent` block, matching the nav ordering from Step 1):

```tsx
            {isAdmin && (
              <TabsContent value="account">
                <AccountSettings />
              </TabsContent>
            )}
```

- [ ] **Step 4: Add `account` to static params**

In `client/app/(dashboard)/settings/[tab]/page.tsx`, find `generateStaticParams` and add `{ tab: "account" }` to the returned array (alongside the existing `appearance`/`store`/`notifications`/`data`/`security`/`staff`/`system`/`billing` entries).

- [ ] **Step 5: Add `account` to tab-recognition/redirect arrays**

In `client/hooks/use-settings.ts`, find the arrays used for tab recognition and non-admin-redirect (the same ones the Billing plan's Task 8 modified to add `billing`) and add `"account"` alongside `"billing"`/`"staff"`/`"system"`/`"store"`/`"data"` in both.

- [ ] **Step 6: Add the mobile menu entry**

In `client/components/settings/settings-mobile-menu.tsx`, find the menu-item array (the same one the Billing plan's Task 8 added a Billing entry to) and add an Account entry following the exact same shape (label "Account", `UserCircle` icon, `href`/`value` "account", `adminOnly: true`).

- [ ] **Step 7: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds; `/settings/account` appears in the static export's page list.

- [ ] **Step 8: Manual end-to-end verification**

Run: `cd client && npm run dev`, navigate to Settings > Account (admin account).
Expected: profile fields populate from `useCurrentUser()`, editing and saving name/phone works, sessions list shows at least the current device with no revoke button on it, "Request Account Deletion" opens the password+reason dialog and (with a live backend) succeeds with the correct password / 403s with the wrong one per Task 1's fix.

- [ ] **Step 9: Commit**

```bash
git add client/app/\(dashboard\)/settings/\[tab\]/settings-tab-nav.tsx client/app/\(dashboard\)/settings/\[tab\]/settings-client.tsx client/app/\(dashboard\)/settings/\[tab\]/page.tsx client/hooks/use-settings.ts client/components/settings/settings-mobile-menu.tsx client/components/settings/account/account-settings.tsx
git commit -m "feat(client): wire Settings > Account tab together"
```
