# Cross-Origin Auth Handoff + Impersonation Fix: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-time exchange-code handoff mechanism so a browser session can carry auth across `dumosrx.com` → `app.dumosrx.com` (and back), then use it to (a) un-break the admin impersonation round-trip before any dashboard code is deleted, and (b) point dumosrx.com's post-login/"Go to Dashboard" flows at `app.dumosrx.com`.

**Architecture:** Laravel issues a short-lived (60s), single-use, opaque code that wraps an already-valid Sanctum token. The origin initiating a cross-domain jump mints a code (authenticated call, proving it already possesses the token) and puts only the code in the redirect URL. The destination origin exchanges the code for the real token via an unauthenticated, throttled endpoint, then immediately strips the code from the URL via `history.replaceState`. No JWT/bearer token is ever placed in a URL. This is Steps 1–2 of a larger dashboard-consolidation migration (audited separately); Steps 3–7 (feature migration, nav consolidation, dashboard deletion, redirects) are out of scope for this plan and will be written up after this one lands and is checked in on.

**Tech Stack:** Laravel 10 (Sanctum, `Cache` facade, PHPUnit) for the backend; Next.js 14 App Router with static export (`output: 'export'`) for both `web/` (dumosrx.com) and `client/` (app.dumosrx.com, also the Tauri desktop build); Vitest for client-side unit tests (`web/` has no test runner: verification there is manual/documented, not automated).

**Spec:** This plan implements Steps 1–2 of the approved migration plan discussed in-conversation (Phase 1 audit + migration decisions, 2026-08-24). No separate spec file exists; the decisions are restated in Global Constraints below.

## Global Constraints

- Exchange codes are single-use, 60-second TTL, opaque (random, not a JWT or derivable from one).
- Burn the code server-side on first lookup attempt: success or failure: so it can never be retried. Achieved via `Cache::pull()` (atomic get-and-delete), not `Cache::get()` + separate `forget()`.
- Never place a real bearer token/JWT in a URL query string, only the opaque code.
- On landing, the destination page strips the `code`/`return_code` query params via `history.replaceState` before doing anything else (before the exchange network call completes, so a slow network doesn't leave the code sitting in the visible URL/history any longer than unavoidable).
- Redirect target origins (`app.dumosrx.com`, `dumosrx.com`) must come from configurable env-backed constants, never hardcoded literals in component code: mirrors the existing `WEB_APP_URL` / `WEB_APP_DASHBOARD_URL` pattern already in both `web/lib/constants.ts` and `client/lib/constants.ts`.
- Do not modify or remove the existing `/admin/stores/{id}/impersonate` or `/admin/restore-session` endpoints, or the `drx_admin_session` cookie they set: `AuthenticateFromCookie` middleware depends on that cookie for same-origin admin requests and is out of scope here. The new handoff endpoints are additive.
- Backend is Laravel (`laravel-server/`), not NestJS: all new server-side logic goes there.
- Both `web/` and `client/` build with `output: 'export'`: no new API routes, middleware, or Server Actions in either Next.js app. All new routes are plain static pages that do their work client-side.
- Do not set up a pnpm workspace or shared package as part of this work (deferred per migration decision): the two Next.js apps get parallel, independently-written (not copy-pasted-then-forgotten) client code for the handoff calls.

---

## File Structure

| File | Responsibility |
|---|---|
| `laravel-server/app/Http/Controllers/Api/AuthHandoffController.php` | New. Mint (`create`) and redeem (`consume`) one-time handoff codes. |
| `laravel-server/routes/api.php` | Modified. Register the two new routes in the existing public `throttle:auth` group. |
| `laravel-server/tests/Feature/AuthHandoffTest.php` | New. Coverage for create/consume/expiry/single-use/invalid-token. |
| `web/lib/constants.ts`, `client/lib/constants.ts` | Modified. Add `APP_URL` (base origin of app.dumosrx.com, no path). |
| `web/lib/api/client.ts` | Modified. Add `createHandoffCode` / `consumeHandoffCode` to `WebApiClient`. |
| `client/lib/api/client.ts` | Modified. Add `createHandoffCode` / `consumeHandoffCode` to `ApiClient`. |
| `client/__tests__/handoff-client.test.ts` | New. Unit tests for the two client-side API methods. |
| `client/app/auth/callback/page.tsx` | New. Lands cross-origin handoffs arriving at app.dumosrx.com; consumes `code` (and optional `return_code` for impersonation). |
| `client/components/dashboard/impersonation-banner.tsx` | New. The "Impersonation Mode" banner + "End Session" button, re-homed from `web/components/dashboard/header.tsx`. |
| `client/components/dashboard/dashboard-layout.tsx` | Modified. Render the new banner when an impersonator token is present. |
| `web/app/admin/handoff/page.tsx` | New. Lands the return trip from client back to admin; consumes a code into `drx_admin_token`. |
| `web/app/admin/stores/page.tsx` | Modified. `handleImpersonate` mints two codes and redirects to `app.dumosrx.com/auth/callback` instead of same-origin `router.push("/dashboard")`. |
| `web/components/auth/login-form.tsx` | **Deleted** (Task 9, revised). dumosrx.com no longer performs authentication itself. |
| `web/app/login/page.tsx` | Modified (Task 9, revised). Becomes an immediate client-side redirect to `${APP_URL}/login`: no form, no auth call. |
| `web/components/landing/header-section.tsx`, `web/components/landing/hero-section.tsx` | Modified (Task 9, revised). Auth-state-conditional links removed; unconditional "Log in" / "Get Started" links point at `APP_URL` directly: no handoff code involved. |

---

### Task 1: Laravel handoff endpoints

**Files:**
- Create: `laravel-server/app/Http/Controllers/Api/AuthHandoffController.php`
- Modify: `laravel-server/routes/api.php:33-40` (inside the existing `throttle:auth` group)
- Test: `laravel-server/tests/Feature/AuthHandoffTest.php`

**Interfaces:**
- Produces: `POST /api/v1/auth/handoff`: body `{ token: string }` is the sole credential (no `Authorization` header is read or required; the body token may be any currently-valid token, not necessarily the caller's own, impersonation depends on that, see step 3), returns `{ code: string, expires_in: 60 }` on 200, `{ error: string }` on 403/422.
- Produces: `POST /api/v1/auth/handoff/consume`: body `{ code: string }`, no auth required, returns `{ token: string, user: {...} }` on 200, `{ error: string }` on 403/410/422.

- [ ] **Step 1: Write the failing feature test**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class AuthHandoffTest extends TestCase
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
            'password' => bcrypt('password'),
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

    public function test_create_mints_a_code_for_a_valid_token(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/auth/handoff', ['token' => $token]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['code', 'expires_in']);
        $this->assertSame(60, $response->json('expires_in'));
    }

    public function test_create_rejects_a_garbage_token(): void
    {
        $response = $this->postJson('/api/v1/auth/handoff', ['token' => 'not-a-real-token']);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid token.']);
    }

    public function test_create_requires_token_field(): void
    {
        $response = $this->postJson('/api/v1/auth/handoff', []);

        $response->assertStatus(422);
    }

    public function test_consume_exchanges_a_valid_code_for_the_token_and_user(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $response->assertStatus(200);
        $response->assertJson([
            'token' => $token,
            'user' => ['id' => $this->user->id, 'email' => $this->user->email],
        ]);
    }

    public function test_consume_is_single_use(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code])->assertStatus(200);
        $second = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $second->assertStatus(410);
        $second->assertJson(['error' => 'Code expired or already used.']);
    }

    public function test_consume_rejects_an_unknown_code(): void
    {
        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => 'totally-made-up']);

        $response->assertStatus(410);
    }

    public function test_consume_rejects_a_code_whose_underlying_token_was_since_revoked(): void
    {
        $tokenResult = $this->user->createToken('test-revocable');
        $token = $tokenResult->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        $tokenResult->accessToken->delete();

        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Token no longer valid.']);
        // Burned even though it failed: a retry with the same code is also rejected, not re-validated.
        $this->assertNull(Cache::get("auth_handoff:{$code}"));
    }

    public function test_consume_expires_after_the_ttl(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        Cache::forget("auth_handoff:{$code}"); // simulate TTL elapsing without waiting 60s in the test

        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $response->assertStatus(410);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/AuthHandoffTest.php`
Expected: FAIL: route `/api/v1/auth/handoff` does not exist (404s), or class `AuthHandoffController` not found.

- [ ] **Step 3: Implement the controller**

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * One-time cross-origin auth handoff. dumosrx.com and app.dumosrx.com are
 * different origins with no shared localStorage, so a bearer token minted on
 * one can't just be read by JS on the other. `create` wraps an
 * already-possessed, already-valid token in a short-lived opaque code safe
 * to put in a redirect URL; `consume` redeems it exactly once. See
 * RestoreSessionTest for the same trust pattern (validate via
 * PersonalAccessToken::findToken, not raw string comparison).
 */
class AuthHandoffController extends Controller
{
    private const TTL_SECONDS = 60;

    public function create(Request $request)
    {
        $validated = $request->validate([
            'token' => 'required|string',
        ]);

        $accessToken = PersonalAccessToken::findToken($validated['token']);
        $user = $accessToken?->tokenable;

        if (!$user) {
            return response()->json(['error' => 'Invalid token.'], 403);
        }

        $code = Str::random(48);
        Cache::put("auth_handoff:{$code}", $validated['token'], self::TTL_SECONDS);

        return response()->json(['code' => $code, 'expires_in' => self::TTL_SECONDS]);
    }

    public function consume(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|string',
        ]);

        // Cache::pull is atomic get-and-delete: the code is burned the instant
        // it's read, before any further validation below can fail and leave
        // it retryable.
        $token = Cache::pull("auth_handoff:{$validated['code']}");

        if (!$token) {
            return response()->json(['error' => 'Code expired or already used.'], 410);
        }

        $accessToken = PersonalAccessToken::findToken($token);
        $user = $accessToken?->tokenable;

        if (!$user) {
            return response()->json(['error' => 'Token no longer valid.'], 403);
        }

        return response()->json(['token' => $token, 'user' => $user]);
    }
}
```

- [ ] **Step 4: Register the routes**

In `laravel-server/routes/api.php`, add the `use` import near the other controller imports at the top of the file:

```php
use App\Http\Controllers\Api\AuthHandoffController;
```

Then, inside the existing `Route::middleware('throttle:auth')->group(function () { ... })` block (`laravel-server/routes/api.php:33-40`, alongside `/login`, `/register`), add:

```php
        Route::post('/auth/handoff', [AuthHandoffController::class, 'create']);
        Route::post('/auth/handoff/consume', [AuthHandoffController::class, 'consume']);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/AuthHandoffTest.php`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Http/Controllers/Api/AuthHandoffController.php laravel-server/routes/api.php laravel-server/tests/Feature/AuthHandoffTest.php
git commit -m "feat(auth): add one-time cross-origin handoff endpoints"
```

---

### Task 2: `APP_URL` constant in both frontends

**Files:**
- Modify: `web/lib/constants.ts:6`
- Modify: `client/lib/constants.ts:6`

**Interfaces:**
- Produces: `APP_URL` (string, e.g. `https://app.dumosrx.com`): the base origin of the app, no trailing slash, no path. Used by Task 5/6 (client callback route base) and Task 8/9 (web redirect targets).

- [ ] **Step 1: Add the constant to `web/lib/constants.ts`**

Insert immediately after line 6 (`WEB_APP_DASHBOARD_URL`):

```ts
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.dumosrx.com";
```

- [ ] **Step 2: Add the same constant to `client/lib/constants.ts`**

Insert immediately after line 6 (`WEB_APP_DASHBOARD_URL`):

```ts
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.dumosrx.com";
```

- [ ] **Step 3: Verify both apps still build**

Run: `cd web && npm run build && cd ../client && npm run build`
Expected: both succeed (this is a pure constant addition, no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add web/lib/constants.ts client/lib/constants.ts
git commit -m "feat: add configurable APP_URL constant to web and client"
```

---

### Task 3: `web/` handoff API client methods

**Files:**
- Modify: `web/lib/api/client.ts` (add methods to `WebApiClient`, near `impersonateStore`/`restoreSession`)

**Interfaces:**
- Consumes: `apiClient` from `web/lib/api/base-client.ts` (existing axios instance).
- Produces: `webApiClient.createHandoffCode(token: string): Promise<{ code: string; expires_in: number }>`, `webApiClient.consumeHandoffCode(code: string): Promise<{ token: string; user: Record<string, unknown> }>`.

- [ ] **Step 1: Add the methods**

In `web/lib/api/client.ts`, add near `restoreSession`:

```ts
  async createHandoffCode(token: string) {
    const { data } = await apiClient.post<{ code: string; expires_in: number }>(
      "/auth/handoff",
      { token },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return data;
  }

  async consumeHandoffCode(code: string) {
    const { data } = await apiClient.post<{
      token: string;
      user: Record<string, unknown>;
    }>("/auth/handoff/consume", { code });
    return data;
  }
```

`createHandoffCode` passes the `Authorization` header explicitly rather than relying on the axios request interceptor's localStorage read (`web/lib/api/base-client.ts:50-58`), because callers of this method (Task 8, Task 9) mint a code for a token that may not be written to `localStorage` yet at call time.

- [ ] **Step 2: Manual verification (no test runner exists in `web/`)**

`web/` has no configured test framework (`package.json` has no `test` script). Verify via a local dev server and browser devtools console instead:

```bash
cd web && npm run dev
```

In the browser console on `http://localhost:3000`, after logging in normally so a real token exists in `localStorage.drx_token`:

```js
const { webApiClient } = await import("/lib/api/client");
const token = localStorage.getItem("drx_token");
const { code } = await webApiClient.createHandoffCode(token);
console.log(code); // expect a 48-char random string
const result = await webApiClient.consumeHandoffCode(code);
console.log(result); // expect { token, user } matching the original
```

Expected: `code` is a non-empty string; `consumeHandoffCode` returns the same token and the logged-in user's record.

- [ ] **Step 3: Commit**

```bash
git add web/lib/api/client.ts
git commit -m "feat(web): add handoff code create/consume API client methods"
```

---

### Task 4: `client/` handoff API client methods + tests

**Files:**
- Modify: `client/lib/api/client.ts` (add methods to `ApiClient`, near `login`)
- Test: `client/__tests__/handoff-client.test.ts`

**Interfaces:**
- Consumes: `BaseApiClient.request<T>()` from `client/lib/api/base-client.ts` (existing fetch-based request method, protected, inherited).
- Produces: `apiClient.createHandoffCode(token: string): Promise<{ code: string; expires_in: number }>`, `apiClient.consumeHandoffCode(code: string): Promise<{ token: string; user: { id: string; email: string; name: string; role: string } }>` (`apiClient` here is `client/lib/api/client.ts`'s singleton instance of `ApiClient`, not to be confused with `web/`'s axios instance of the same name).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('handoff code API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createHandoffCode posts to /auth/handoff with an explicit Authorization header', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'abc123', expires_in: 60 }),
    });

    const result = await apiClient.createHandoffCode('my-token');

    expect(result).toEqual({ code: 'abc123', expires_in: 60 });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/handoff');
    expect(config.headers.Authorization).toBe('Bearer my-token');
    expect(JSON.parse(config.body)).toEqual({ token: 'my-token' });
  });

  it('consumeHandoffCode posts to /auth/handoff/consume and returns token + user', async () => {
    const payload = {
      token: 'restored-token',
      user: { id: '1', email: 'a@b.com', name: 'A B', role: 'store_owner' },
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.consumeHandoffCode('xyz789');

    expect(result).toEqual(payload);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/handoff/consume');
    expect(JSON.parse(config.body)).toEqual({ code: 'xyz789' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/handoff-client.test.ts`
Expected: FAIL: `apiClient.createHandoffCode is not a function`.

- [ ] **Step 3: Implement the methods**

In `client/lib/api/client.ts`, add inside the `ApiClient` class, near `login`:

```ts
  async createHandoffCode(token: string) {
    return this.request<{ code: string; expires_in: number }>("/auth/handoff", {
      method: "POST",
      body: JSON.stringify({ token }),
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async consumeHandoffCode(code: string) {
    return this.request<{
      token: string;
      user: { id: string; email: string; name: string; role: string };
    }>("/auth/handoff/consume", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }
```

`headers` here reaches `BaseApiClient.request`'s `customHeaders` spread (`client/lib/api/base-client.ts:77-84`), which is applied *after* the token-derived `Authorization` header, so it correctly overrides it for this one call.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/handoff-client.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add client/lib/api/client.ts client/__tests__/handoff-client.test.ts
git commit -m "feat(client): add handoff code create/consume API client methods"
```

---

### Task 5: `client/app/auth/callback` landing page

**Files:**
- Create: `client/app/auth/callback/page.tsx`

**Interfaces:**
- Consumes: `apiClient.consumeHandoffCode` (Task 4), `apiClient.setToken` (existing, `client/lib/api/base-client.ts:46-48`), `APP_URL`/other constants as needed (Task 2).
- Produces: sets `localStorage.impersonator_token` when a `return_code` param is present (consumed by Task 6's banner): this is `client/`'s equivalent of web's `drx_impersonator_token`, deliberately a different key name since it lives in a different app's localStorage namespace.

This route sits outside the `client/app/(dashboard)` route group (which requires local PIN auth to render), as a sibling of `client/app/login` and `client/app/setup`, so it can run before any local session exists.

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/api/client";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const returnCode = searchParams.get("return_code");

    // Strip the codes from the visible URL/history immediately, before the
    // exchange network call, so they don't linger in browser history or get
    // sent as a Referer header to any resource this page happens to load.
    window.history.replaceState({}, "", window.location.pathname);

    if (!code) {
      setError("Missing handoff code.");
      return;
    }

    (async () => {
      try {
        const { token } = await apiClient.consumeHandoffCode(code);
        apiClient.setToken(token);

        if (returnCode) {
          localStorage.setItem("impersonator_handoff_return_code", returnCode);
        }

        router.replace("/dashboard");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete sign-in.");
      }
    })();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center px-4">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-semibold">{error}</p>
        <p className="text-sm text-muted-foreground">
          The link may have expired. Please try again from where you came from.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
```

Note on `return_code`: it is stored as-is (still an opaque, unconsumed code, one further exchange, not the raw admin token) under a distinct key (`impersonator_handoff_return_code`), not consumed yet. Task 6 consumes it lazily, only if/when the user actually clicks "End Session"; minting a *fresh* pair only happens once at handoff time in Task 8; this stored code is redeemed at most once, whenever the session ends. If unused, it simply expires after 60s and "End Session" will need to re-derive a path back to admin some other way, flagged as a follow-up limitation below, not solved in this task (see note at the end of Task 6).

- [ ] **Step 2: Build to confirm the static export succeeds**

Run: `cd client && npm run build`
Expected: succeeds. `useSearchParams` requires the `Suspense` boundary during static export prerendering: this page has one: so this build must not fail with the "should be wrapped in a suspense boundary" error.

- [ ] **Step 3: Manual verification**

```bash
cd client && npm run dev
```

Visit `http://localhost:3000/auth/callback?code=bogus` in a browser. Expected: the loading spinner briefly appears, then the error state renders ("The link may have expired..."), and the URL bar no longer shows `?code=bogus`.

- [ ] **Step 4: Commit**

```bash
git add client/app/auth/callback/page.tsx
git commit -m "feat(client): add cross-origin auth handoff callback route"
```

---

### Task 6: Impersonation banner in `client/`

**Files:**
- Create: `client/components/dashboard/impersonation-banner.tsx`
- Modify: `client/components/dashboard/dashboard-layout.tsx`

**Interfaces:**
- Consumes: `localStorage.impersonator_handoff_return_code` (set by Task 5), `apiClient.createHandoffCode`/`consumeHandoffCode` (Task 4), `WEB_APP_URL` (existing constant in `client/lib/constants.ts:5`).
- Produces: a rendered banner + "End Session" button whenever an impersonation session is active; on click, redirects the browser to `web/app/admin/handoff` (Task 7).

This is the re-homed equivalent of `web/components/dashboard/header.tsx`'s `handleEndImpersonation` (which lived inside `components/dashboard/**`, the directory slated for deletion in a later step of the overall migration: re-homing it here is what un-breaks the round-trip before that deletion happens).

- [ ] **Step 1: Create the banner component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { WEB_APP_URL } from "@/lib/constants";

const RETURN_CODE_KEY = "impersonator_handoff_return_code";

export function ImpersonationBanner() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    setIsImpersonating(!!localStorage.getItem(RETURN_CODE_KEY));
  }, []);

  if (!isImpersonating) return null;

  const handleEndImpersonation = async () => {
    const returnCode = localStorage.getItem(RETURN_CODE_KEY);
    if (!returnCode) return;

    setEnding(true);
    try {
      // The stored value from the original handoff is itself a one-time
      // code (see client/app/auth/callback/page.tsx): redeem it now to get
      // the admin's real token back, then immediately re-wrap it in a fresh
      // code for the trip back to dumosrx.com. Two hops, but neither origin
      // ever sees the other's raw token, and each code is single-use.
      const { token: adminToken } = await apiClient.consumeHandoffCode(returnCode);
      const { code } = await apiClient.createHandoffCode(adminToken);

      localStorage.removeItem(RETURN_CODE_KEY);
      apiClient.clearToken();

      window.location.href = `${WEB_APP_URL}/admin/handoff?code=${code}`;
    } catch (_error) {
      toast.error("Failed to return to admin session");
      setEnding(false);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-primary/10 border-b border-primary/20">
      <div className="flex items-center justify-center gap-3 px-4 py-2">
        <ShieldAlert className="h-4 w-4 text-primary" />
        <span className="text-xs font-black text-primary uppercase tracking-tighter">
          Impersonation Mode
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={ending}
          className="h-7 px-3 text-[10px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary/90 rounded-lg flex items-center gap-2"
          onClick={handleEndImpersonation}
        >
          <LogOut className="h-3 w-3" />
          End Session
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the dashboard layout**

In `client/components/dashboard/dashboard-layout.tsx`, add the import alongside the other component imports (near line 11, `import { BroadcastBanner } from "./broadcast-banner";`):

```tsx
import { ImpersonationBanner } from "./impersonation-banner";
```

Render `<ImpersonationBanner />` as the first child inside the layout's top-level returned JSX (immediately before wherever `<BroadcastBanner />` currently renders), so it appears above the rest of the dashboard chrome exactly like the web version did.

- [ ] **Step 3: Manual verification**

```bash
cd client && npm run dev
```

In the browser console at `http://localhost:3000`, simulate an active impersonation session and reload:

```js
localStorage.setItem("impersonator_handoff_return_code", "fake-code-for-visual-check");
location.reload();
```

Expected: the banner renders at the top of the dashboard. Clicking "End Session" should attempt the network call and fail gracefully (toast error), since `"fake-code-for-visual-check"` isn't a real code: that's expected at this stage; full end-to-end verification happens once Task 7 and Task 8 are also done (see Task 8's final verification step).

- [ ] **Step 4: Commit**

```bash
git add client/components/dashboard/impersonation-banner.tsx client/components/dashboard/dashboard-layout.tsx
git commit -m "feat(client): add impersonation banner with end-session handoff"
```

---

### Task 7: `web/app/admin/handoff` return landing page

**Files:**
- Create: `web/app/admin/handoff/page.tsx`

**Interfaces:**
- Consumes: `webApiClient.consumeHandoffCode` (Task 3).
- Produces: writes `localStorage.drx_admin_token` and `localStorage.drx_admin_user`, matching the keys `web/lib/store/use-admin-auth-store.ts` and `web/lib/api/base-client.ts:52` already read.

This is the symmetric counterpart to Task 5, on the admin side, completing the return leg of impersonation.

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";

function HandoffHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    window.history.replaceState({}, "", window.location.pathname);

    if (!code) {
      setError("Missing handoff code.");
      return;
    }

    (async () => {
      try {
        const { token, user } = await webApiClient.consumeHandoffCode(code);
        localStorage.setItem("drx_admin_token", token);
        localStorage.setItem("drx_admin_user", JSON.stringify(user));
        toast.success("Session Restored", { description: "Back to Admin Dashboard" });
        router.replace("/admin/stores/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to restore admin session.");
      }
    })();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center px-4">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="font-semibold">{error}</p>
        <p className="text-sm text-muted-foreground">
          Please sign in to the admin dashboard again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function AdminHandoffPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <HandoffHandler />
    </Suspense>
  );
}
```

- [ ] **Step 2: Build to confirm the static export succeeds**

Run: `cd web && npm run build`
Expected: succeeds, same `Suspense`-around-`useSearchParams` requirement as Task 5.

- [ ] **Step 3: Manual verification**

Run: `cd web && npm run dev`, visit `http://localhost:3000/admin/handoff?code=bogus`.
Expected: spinner, then the error state, `?code=bogus` stripped from the URL bar.

- [ ] **Step 4: Commit**

```bash
git add web/app/admin/handoff/page.tsx
git commit -m "feat(web): add admin-side handoff return landing page"
```

---

### Task 8: Rewire `handleImpersonate` to cross-origin handoff

**Files:**
- Modify: `web/app/admin/stores/page.tsx:143-177`

**Interfaces:**
- Consumes: `webApiClient.createHandoffCode` (Task 3), `APP_URL` (Task 2).

- [ ] **Step 1: Replace the localStorage/same-origin logic**

In `web/app/admin/stores/page.tsx`, add the import:

```ts
import { APP_URL } from "@/lib/constants";
```

Replace `handleImpersonate` (lines 143-177) with:

```tsx
  const handleImpersonate = (store: AdminStoreSummary) => {
    impersonateMutation.mutate(store.id, {
      onSuccess: async (data) => {
        try {
          const adminToken = localStorage.getItem("drx_admin_token");
          if (!adminToken) {
            toast.error("Impersonation Failed", {
              description: "No active admin session to hand back to.",
            });
            return;
          }

          const [{ code: userCode }, { code: returnCode }] = await Promise.all([
            webApiClient.createHandoffCode(data.token),
            webApiClient.createHandoffCode(adminToken),
          ]);

          toast.success("Impersonation Successful", {
            description: `Logged in as ${data.user.name}. Redirecting...`,
          });

          window.location.href = `${APP_URL}/auth/callback?code=${userCode}&return_code=${returnCode}`;
        } catch (_err) {
          toast.error("Impersonation Failed", {
            description: "Could not hand off session to the app.",
          });
        }
      },
      onError: (err) => {
        toast.error("Impersonation Failed", {
          description: err.message || "Failed to start impersonation session.",
        });
      }
    });
  };
```

Note: `data.token` (the impersonated store's token, returned by `POST /admin/stores/{id}/impersonate`) and the admin's own `drx_admin_token` are each wrapped in their own code and never written to `localStorage` for the new origin to read. This replaces the old `localStorage.setItem("drx_token", ...)` / `localStorage.setItem("drx_impersonator_token", ...)` same-origin approach entirely. The `queryClient.cancelQueries()/.clear()` calls from the old implementation are dropped too, they existed to avoid app.dumosrx.com's *own* different query-cache instance rendering stale data, which is moot now that the browser does a full cross-origin navigation instead of an SPA route push.

- [ ] **Step 2: Manual verification**

This can't be automated (no test runner in `web/`, and it requires a live backend). With both `laravel-server` and `web`/`client` dev servers running, and Task 5–7 already merged:

1. Log in to `/admin/login` as a `super_admin`.
2. Go to `/admin/stores`, click "Impersonate" on any store.
3. Expected: browser navigates to `app.dumosrx.com/auth/callback?code=...&return_code=...` (or `localhost:3000/auth/callback...` in dev), briefly shows a spinner, then lands on `/dashboard` logged in as that store, with the "Impersonation Mode" banner visible.
4. Click "End Session" in the banner.
5. Expected: browser navigates to `dumosrx.com/admin/handoff?code=...`, spinner, then lands on `/admin/stores/` logged back in as the original super_admin.

This is the "verify a superadmin can impersonate and return, end to end" checkpoint.

- [ ] **Step 3: Commit**

```bash
git add web/app/admin/stores/page.tsx
git commit -m "feat(web): route impersonation through cross-origin auth handoff"
```

---

### Task 9 (revised 2026-08-24, post-Task-5 session resume): Point all dumosrx.com auth entry points at `app.dumosrx.com`, redirect-only

**Ruling: supersedes this task's original text below the line "Decision superseded" was never reached during execution; this is a plan correction made mid-session, not a fix-loop finding.** The user clarified the intended login architecture after Tasks 1-5 were already built (Tasks 1-8 are unaffected: they only depend on the handoff-code mechanism itself, not on how a user first authenticates). The original Task 9 had dumosrx.com perform real authentication via its own `LoginForm` (`webApiClient.login`) and then hand off to `app.dumosrx.com` post-success. That is not the intended design.

**Corrected design:** dumosrx.com never authenticates anyone and never holds a token. `app.dumosrx.com` already has its own complete, working login flow (`client/lib/context/auth-context.tsx:376` calls `apiClient.login(email, password)` directly, and `client/app/page.tsx` already branches on local login state to skip straight to `/dashboard` when appropriate). dumosrx.com's job is only to point visitors at `app.dumosrx.com`; it does not check or track whether they're logged in (confirmed with the user: always show a neutral CTA, never conditionally render "Dashboard" vs "Log in" based on local auth state). This makes the handoff-code mechanism (Tasks 1-5) irrelevant to the *normal login* path entirely. It remains exactly as needed for admin impersonation (Tasks 6-8), which is a different flow (an already-authenticated admin session jumping origins), untouched by this correction.

**Files:**
- Modify: `web/app/login/page.tsx`: replace its content entirely with an immediate client-side redirect to `${APP_URL}/login`.
- Delete: `web/components/auth/login-form.tsx`, becomes fully orphaned once `app/login/page.tsx` no longer imports it (verified: no other file imports `LoginForm`; `components/auth/admin-login-form.tsx` is a separate component for the admin path and is untouched).
- Modify: `web/components/landing/header-section.tsx`: remove the `isLoggedIn` local-storage check (`useEffect` reading `drx_token`) and the two conditional branches it drives (desktop nav around the old lines 82-95, mobile sheet around the old lines 167-180); replace both with a single unconditional "Log in" link and unconditional CTA, both pointing at `app.dumosrx.com`.
- Modify: `web/components/landing/hero-section.tsx:39`, same treatment: whatever conditional "Open Dashboard" vs. other CTA logic exists there collapses to one unconditional link to `${APP_URL}`.

**Interfaces:**
- Consumes: `APP_URL` (Task 2). No `webApiClient.createHandoffCode` call anywhere in this task: that API remains used only by Task 8 (impersonation) and Task 3 exists for that purpose.
- Produces: nothing new is exported; this task only removes dead-end same-origin auth UI and repoints links.

- [ ] **Step 1: Redirect `web/app/login` to `app.dumosrx.com/login`**

Replace the full contents of `web/app/login/page.tsx` with:

```tsx
"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { APP_URL } from "@/lib/constants";

export default function LoginPage() {
  useEffect(() => {
    window.location.href = `${APP_URL}/login`;
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 text-primary animate-spin" />
    </div>
  );
}
```

No `Suspense` boundary is needed here: this page reads no search params.

- [ ] **Step 2: Delete the now-orphaned login form**

```bash
git rm web/components/auth/login-form.tsx
```

- [ ] **Step 3: Simplify the landing page header**

In `web/components/landing/header-section.tsx`:
- Remove the `isLoggedIn` state and its `useEffect` (the `localStorage.getItem("drx_token")` check).
- Replace the `isLoggedIn ? <Link href="/dashboard">...</Link> : <>...</>` conditional (both the desktop nav block and the mobile sheet block) with the unconditional pair every visitor sees:

```tsx
<Button variant="ghost" className="font-semibold" asChild>
  <Link href={`${APP_URL}/login`}>Log in</Link>
</Button>
<Button className="font-semibold shadow-lg shadow-primary/20" asChild>
  <Link href={APP_URL}>Get Started</Link>
</Button>
```

(Keep the existing "Start Free Trial" / `/register` link as-is if registration stays on dumosrx.com: that flow was not part of this correction and is out of scope here. Only the login/dashboard-state branching is being removed.)

Add `import { APP_URL } from "@/lib/constants";` alongside the file's other imports.

- [ ] **Step 4: Simplify the hero section CTA**

In `web/components/landing/hero-section.tsx`, apply the same treatment to whatever "Open Dashboard" / logged-in-state conditional exists around line 39: collapse it to one unconditional `<Link href={APP_URL}>Open Dashboard</Link>` (or matching copy for that file), importing `APP_URL` from `@/lib/constants`.

- [ ] **Step 5: Manual verification**

`web/` has no test runner. Verify manually:

```bash
cd web && npm run dev
```

1. Visit `/login`. Expected: an immediate redirect to `app.dumosrx.com/login` (or the `APP_URL` dev override), no login form ever renders on dumosrx.com.
2. Visit `/` (marketing home). Expected: header and hero CTAs always point at `app.dumosrx.com`: never conditionally rendered based on any dumosrx.com-local auth state, regardless of whether `localStorage.drx_token` is set or not.

- [ ] **Step 6: Commit**

```bash
git add web/app/login/page.tsx web/components/landing/header-section.tsx web/components/landing/hero-section.tsx
git rm web/components/auth/login-form.tsx
git commit -m "feat(web): route all auth entry points to app.dumosrx.com, drop local login form"
```

---

## Self-Review Notes

- **Spec coverage:** impersonation start (Task 8) and end (Task 6/7) both use the exchange-code flow; codes are single-use/60s-TTL/burned-on-first-attempt (Task 1); codes are stripped from the URL via `replaceState` before the exchange call (Task 5/7); no raw token ever appears in a URL (Tasks 1, 5, 6, 7, 8); dumosrx.com's auth entry points (`/login`, header, hero) target `app.dumosrx.com` via the configurable `APP_URL` env var, not a hardcoded literal (Task 2, Task 9: revised).
- **Task 9 was revised mid-session (2026-08-24), after Tasks 1-5 were already built:** the original text had dumosrx.com perform real login via its own form and hand off a token post-success, mirroring the impersonation mechanism. The user clarified the actual intent: dumosrx.com never authenticates anyone; it only redirects to `app.dumosrx.com`, which already has its own complete login flow. dumosrx.com also does not track or branch on login state (confirmed: always a neutral CTA, never a conditional "Dashboard" vs "Log in" render). This is a plan correction, not a fix-loop finding, see the ruling inline in Task 9's text. The handoff-code mechanism (Tasks 1-5) is retained in full because Tasks 6-8 (admin impersonation) genuinely need it; only the *normal user login* path stopped using it.
- **Known follow-up, not solved here:** if a user lands via Task 5's callback with a `return_code` but never clicks "End Session" within 60 seconds, that stored code silently expires: clicking "End Session" later will fail with a toast error and no path back to admin except manually re-navigating to `dumosrx.com/admin/login`. Acceptable for this phase (matches the original same-origin implementation's lack of any timeout handling either), but worth a product-level decision later (e.g. re-mint on demand by keeping the admin's *own* session alive independently, which Task 6 partially relies on already).
- **Type consistency:** `createHandoffCode`/`consumeHandoffCode` signatures match exactly between `web/lib/api/client.ts` (Task 3) and `client/lib/api/client.ts` (Task 4) in shape (`{ code, expires_in }` / `{ token, user }`), even though they're deliberately separate implementations per the "defer shared package" decision. Post-revision, these methods are exercised only by the impersonation path (Task 8), not by normal login.
