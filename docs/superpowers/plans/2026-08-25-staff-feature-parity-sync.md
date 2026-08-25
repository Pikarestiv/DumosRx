# Staff Feature Parity + Sync Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `client/`'s existing local Settings > Staff feature to full parity with `web/`'s (soon-to-be-deleted) dashboard staff feature, and add a regression test confirming the local `users` table already syncs end-to-end.

**Architecture:** `client/` is offline-first; the local SQLite `users` table already syncs bidirectionally with the server (confirmed during plan drafting — this was previously misdiagnosed as missing, see the spec's A1 correction). This plan closes 9 UI/behavior gaps in the existing local components (`staff-management.tsx`, `staff/{staff-list,staff-form-dialog,staff-delete-dialog}.tsx`) rather than rewriting them, plus one new Activities tab reusing the existing activity-log query layer.

**Tech Stack:** Next.js 14 (App Router, static export) + React, local SQLite via `client/lib/db/*`, TanStack Query for local-data hooks, Vitest for unit tests (no React Testing Library in this repo — UI-only changes are verified manually via `npm run dev`, not given component tests, matching existing convention).

**Spec:** `docs/superpowers/specs/2026-08-25-dashboard-feature-migration-design.md`, Section A (and its A1 correction note).

## Global Constraints

- Local `users` table sync (push + pull) is already fully implemented end-to-end on both client and server; do not add new sync-engine code for it — Task 1 is verification only, not integration.
- No cloud email+password dual-auth for staff (confirmed out of scope) — the existing `email` field in `staff-form-dialog.tsx` stays as an optional, informational-only field; do not add a password field.
- Never display a staff member's raw PIN digits in any list/table view — client's `StaffListItem` type intentionally omits `pin` from list queries; keep it that way (Task 7 adds a "PIN set" indicator badge, never digits).
- No React Testing Library in this repo — UI-only changes are manually verified via `cd client && npm run dev`, not given component tests. Only new pure-logic changes (activity-log filter, CSV export function, deactivate/reactivate calls) get Vitest unit tests.
- All new/changed local writes go through the existing `insert`/`update`/`softDelete` helpers in `client/lib/db/base-helpers.ts` — never write raw SQL against `users` directly, so sync-queueing keeps working automatically.
- Client-side role set is `admin | manager | specialist | sales_staff | auditor` (`client/lib/constants/roles.ts`) — there is no separate `store_owner` role client-side (unlike `web/`); "main account" detection (Task 6) uses `!store_id || role === "admin"`, not a `store_owner` check.

---

### Task 1: Regression test confirming `users` already syncs end-to-end

**Files:**
- Test: `client/__tests__/sync-engine.test.ts` (add to existing describe blocks, same file, same mocking setup already at the top of the file)

**Interfaces:**
- Consumes: `insert` from `client/lib/db/base-helpers.ts` (existing, `insert(table: string, data: Record<string, unknown>): Promise<string>`), `pushChanges` from `client/lib/db/sync-engine/push.ts` (existing), `execute`/`query` mocks already set up in the file.

- [ ] **Step 1: Write the test**

Add this test inside the existing `describe('Local Database Operations (Queueing)', ...)` block in `client/__tests__/sync-engine.test.ts`, right after the existing `'should add a new record and log to _sync_queue'` test:

```ts
    it('should queue a users-table insert exactly like any other table (no users-specific exclusion)', async () => {
      const executeMock = vi.mocked(execute);

      const newStaffMember = {
        first_name: 'Jane',
        last_name: 'Doe',
        username: 'jdoe',
        role: 'sales_staff',
        store_id: 'store-1',
        pin: '1234',
      };

      await insert('users', newStaffMember);

      expect(executeMock.mock.calls[0][0]).toContain('INSERT INTO users');
      expect(executeMock.mock.calls[1][0]).toContain('INSERT INTO _sync_queue');
      const params = executeMock.mock.calls[1][1];
      expect(params![0]).toBe('users');
      expect(params![2]).toBe('INSERT');
    });
```

Add this test inside the existing `describe('Pushing Changes', ...)` block, after the existing `'should push pending items and clear the queue on success'` test:

```ts
    it('should push a pending users change through the same generic path as any other table', async () => {
      vi.mocked(query).mockResolvedValueOnce([
        {
          id: 1,
          table_name: 'users',
          record_id: 'user-1',
          action: 'INSERT',
          payload: JSON.stringify({ id: 'user-1', username: 'jdoe', role: 'sales_staff' }),
        },
      ]);

      vi.mocked(apiClient.pushChanges).mockResolvedValueOnce({ success: true });

      const result = await pushChanges();

      expect(result.pushed).toBe(1);
      const sentPayload = vi.mocked(apiClient.pushChanges).mock.calls[0][0];
      expect(sentPayload.changes[0].table_name).toBe('users');
    });
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd client && npx vitest run __tests__/sync-engine.test.ts`
Expected: PASS, all tests including the two new ones. (These should pass immediately, without any implementation change — that's the point: it proves `users` sync already works.)

- [ ] **Step 3: Commit**

```bash
git add client/__tests__/sync-engine.test.ts
git commit -m "test: confirm users table already syncs through the generic sync engine"
```

---

### Task 2: `tableName` filter on the activity-log query layer

**Files:**
- Modify: `client/lib/db/queries/activity-log.ts`
- Test: `client/__tests__/activity-log-filters.test.ts` (new)

**Interfaces:**
- Produces: `ActivityLogFilters.tableName?: string` (new optional field), applied as an additional `AND al.table_name = ?` condition in `getActivityLog`.
- Consumes: none new — pure extension of the existing `getActivityLog(filters: ActivityLogFilters): Promise<ActivityLogResult>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { query } from '@/lib/db/local-database';

vi.mock('@/lib/db/local-database', () => ({
  query: vi.fn(),
}));

import { getActivityLog } from '../lib/db/queries/activity-log';

describe('getActivityLog tableName filter', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('adds an al.table_name condition when tableName is passed', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([]);

    await getActivityLog({ tableName: 'users' });

    const countCall = vi.mocked(query).mock.calls[0];
    expect(countCall[0]).toContain('al.table_name = ?');
    expect(countCall[1]).toContain('users');
  });

  it('omits the table_name condition when tableName is not passed', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);

    await getActivityLog({});

    const countCall = vi.mocked(query).mock.calls[0];
    expect(countCall[0]).not.toContain('table_name');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/activity-log-filters.test.ts`
Expected: FAIL — `tableName` is not a recognized filter, condition never added.

- [ ] **Step 3: Implement**

In `client/lib/db/queries/activity-log.ts`, modify `ActivityLogFilters`:

```ts
export interface ActivityLogFilters {
  from?: string;
  to?: string;
  action?: string;
  userId?: string;
  role?: string;
  tableName?: string;
  page?: number;
  pageSize?: number;
}
```

And in `getActivityLog`, add the destructure and condition:

```ts
  const { from, to, action, userId, role, tableName, page = 1, pageSize = 50 } = filters;

  const conditions: string[] = ["(al._deleted = 0 OR al._deleted IS NULL)"];
  const params: (string | number)[] = [];

  if (from) {
    conditions.push("al.created_at >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("al.created_at <= ?");
    params.push(to);
  }
  if (action) {
    conditions.push("al.action = ?");
    params.push(action);
  }
  if (userId) {
    conditions.push("al.user_id = ?");
    params.push(userId);
  }
  if (role) {
    conditions.push("u.role = ?");
    params.push(role);
  }
  if (tableName) {
    conditions.push("al.table_name = ?");
    params.push(tableName);
  }
```

(Only the added `tableName` block and destructure changes; the rest of the function body is unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/activity-log-filters.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add client/lib/db/queries/activity-log.ts client/__tests__/activity-log-filters.test.ts
git commit -m "feat: add tableName filter to activity log query"
```

---

### Task 3: Store filter dropdown in Staff Management

**Files:**
- Modify: `client/components/settings/staff-management.tsx`

**Interfaces:**
- Consumes: `useStore()` from `client/lib/context/store-context.tsx` (existing, exposes `availableStores: { id: string; name: string }[]`), `useUsers(storeId?: string | null)` (existing, already accepts a storeId).

- [ ] **Step 1: Implement the filter**

In `client/components/settings/staff-management.tsx`, replace the top of the component:

```tsx
export function StaffManagement() {
  const { activeStoreId, availableStores } = useStore();
  const { maxStaffAccounts, getUpgradeMessage, withRestriction } = useFeatureGate();
  const [selectedStore, setSelectedStore] = useState<string>("all");

  const filterStoreId = selectedStore === "all" ? null : selectedStore;
  const { data: users = [], isLoading, refetch: loadUsers } = useUsers(
    availableStores && availableStores.length > 1 ? filterStoreId : activeStoreId,
  );
```

Add the dropdown to the header row (only rendered for multi-store accounts), just before the "Add Staff Member" button:

```tsx
        {availableStores && availableStores.length > 1 && (
          <select
            className="bg-background border border-input px-3 py-2 rounded-lg text-sm font-medium h-10"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="all">All Stores</option>
            {availableStores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        )}
```

`getUsers(storeId)` in `local-database.ts` already treats `null`/`undefined` as "no store filter" (falls back to `getActiveStoreId()` internally, or returns everything if that's also empty) — passing `filterStoreId = null` for "All Stores" already does the right thing with no changes needed there.

- [ ] **Step 2: Manual verification**

```bash
cd client && npm run dev
```

With a multi-store test account: open Settings > Staff, confirm the "All Stores" dropdown appears, selecting a specific store filters the list to that store's staff (plus the always-visible owner/admin rows per the existing `getUsers` query), and single-store accounts don't see the dropdown at all.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/staff-management.tsx
git commit -m "feat(staff): add store filter dropdown for multi-store accounts"
```

---

### Task 4: Staff stats cards

**Files:**
- Create: `client/components/settings/staff/staff-stats.tsx`
- Modify: `client/components/settings/staff-management.tsx`

**Interfaces:**
- Consumes: `StaffListItem[]` (existing type), `maxStaffAccounts: number` from `useFeatureGate()` (existing).
- Produces: `StaffStats({ users, maxStaffAccounts }: { users: StaffListItem[]; maxStaffAccounts: number })`.

- [ ] **Step 1: Create the component**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StaffListItem } from "@/lib/types/user";

interface StaffStatsProps {
  users: StaffListItem[];
  maxStaffAccounts: number;
}

export function StaffStats({ users, maxStaffAccounts }: StaffStatsProps) {
  const activeCount = users.filter((u) => u.is_active !== 0).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Staff
          </p>
          <h3 className="text-2xl font-bold mt-1">
            {users.length}
            <span className="text-sm text-muted-foreground font-medium ml-2">
              / {maxStaffAccounts === -1 ? "∞" : `${maxStaffAccounts} max`}
            </span>
          </h3>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active Now
          </p>
          <h3 className="text-2xl font-bold mt-1 text-green-600">{activeCount}</h3>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            System Roles
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-medium">Admin</Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">Manager</Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">Specialist</Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-medium">Sales</Badge>
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-medium">Auditor</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire it in**

In `client/components/settings/staff-management.tsx`, import it (`import { StaffStats } from "./staff/staff-stats";`) and render `<StaffStats users={users} maxStaffAccounts={maxStaffAccounts} />` immediately above the existing `<Card><CardContent><StaffList .../></CardContent></Card>` block.

- [ ] **Step 3: Manual verification**

```bash
cd client && npm run dev
```

Settings > Staff shows the three stat cards above the table, with correct total/active counts.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/staff/staff-stats.tsx client/components/settings/staff-management.tsx
git commit -m "feat(staff): add stats cards (total, active, roles)"
```

---

### Task 5: Real "Export Staff List" (CSV)

**Files:**
- Create: `client/lib/utils/export-staff-csv.ts`
- Test: `client/__tests__/export-staff-csv.test.ts`
- Modify: `client/components/settings/staff-management.tsx`

**Interfaces:**
- Produces: `buildStaffCsv(users: StaffListItem[]): string` (pure function, testable without DOM).

Note: `web/`'s "Export Staff List" button (`staff-view.tsx:120-122`) has no `onClick` and no export logic anywhere in the codebase — it's dead UI. This task builds a real client-side CSV export instead of copying a no-op.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildStaffCsv } from '../lib/utils/export-staff-csv';

describe('buildStaffCsv', () => {
  it('builds a header row plus one row per staff member', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: 'Jane',
        last_name: 'Doe',
        username: 'jdoe',
        email: 'jane@example.com',
        role: 'sales_staff',
        store_id: 'store-1',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Name,Username,Email,Role,Status,Created');
    expect(lines[1]).toBe('Jane Doe,jdoe,jane@example.com,sales_staff,Active,2026-01-01');
  });

  it('escapes commas in fields with quotes', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: 'Doe, Jr.',
        last_name: '',
        username: 'jdoe',
        role: 'sales_staff',
        is_active: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(csv).toContain('"Doe, Jr."');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/export-staff-csv.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
import type { StaffListItem } from "@/lib/types/user";

function csvField(value: string): string {
  return value.includes(",") ? `"${value}"` : value;
}

export function buildStaffCsv(users: StaffListItem[]): string {
  const header = "Name,Username,Email,Role,Status,Created";
  const rows = users.map((u) => {
    const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
    const created = u.created_at ? u.created_at.slice(0, 10) : "";
    const status = u.is_active === 0 ? "Inactive" : "Active";
    return [
      csvField(name),
      u.username || "",
      u.email || "",
      u.role || "",
      status,
      created,
    ].join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/export-staff-csv.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Wire up the download button**

In `client/components/settings/staff-management.tsx`, import `buildStaffCsv` and add a handler + button next to "Add Staff Member":

```tsx
  const handleExport = () => {
    const csv = buildStaffCsv(users);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `staff-list-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
```

```tsx
        <Button variant="outline" onClick={handleExport} disabled={users.length === 0}>
          Export Staff List
        </Button>
```

(Placed in the same header row as the "Add Staff Member" button, before it.)

- [ ] **Step 6: Manual verification**

```bash
cd client && npm run dev
```

Settings > Staff, click "Export Staff List" — a `staff-list-<date>.csv` file downloads with the correct rows.

- [ ] **Step 7: Commit**

```bash
git add client/lib/utils/export-staff-csv.ts client/__tests__/export-staff-csv.test.ts client/components/settings/staff-management.tsx
git commit -m "feat(staff): add working CSV export (web's equivalent button was a no-op)"
```

---

### Task 6: "Main Account" badge + owner-first sort

**Files:**
- Modify: `client/components/settings/staff/staff-list.tsx`

**Interfaces:** none new — purely presentational, same `StaffListItem[]` prop already in use.

- [ ] **Step 1: Implement**

In `client/components/settings/staff/staff-list.tsx`, sort a copy of `users` before mapping, and mark the main account row:

```tsx
{[...users]
  .sort((a, b) => {
    const isAMain = !a.store_id || a.role === "admin";
    const isBMain = !b.store_id || b.role === "admin";
    if (isAMain && !isBMain) return -1;
    if (!isAMain && isBMain) return 1;
    return 0;
  })
  .map((user) => {
    const isMainAccount = !user.store_id || user.role === "admin";
    return (
      <TableRow
        key={user.id}
        className={isMainAccount ? "bg-indigo-50/50 dark:bg-indigo-900/10" : undefined}
      >
        {/* existing row cells unchanged below this point */}
```

Close the mapping's arrow function with `);\n  })` in place of the previous bare `))`.

Add the badge next to the name, inside the existing name `<span>`:

```tsx
<span className="font-medium">
  {`${user.first_name || ""} ${user.last_name || ""}`.trim()}
</span>
{isMainAccount && (
  <Badge className="h-5 px-1.5 text-[9px] bg-indigo-500 hover:bg-indigo-600">
    Main Account
  </Badge>
)}
```

Client's role set (`STAFF_ROLES`) uses `"admin"` as the top role (no separate `"store_owner"` value exists client-side, unlike `web/`), so the "main account" check is `!store_id || role === "admin"`.

- [ ] **Step 2: Manual verification**

```bash
cd client && npm run dev
```

Settings > Staff: an admin/no-store-id row sorts first and shows the "Main Account" badge with the indigo highlight; regular staff rows are unaffected.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/staff/staff-list.tsx
git commit -m "feat(staff): add Main Account badge and owner-first sort"
```

---

### Task 7: PIN-set indicator badge (masked, no digits)

**Files:**
- Modify: `client/components/settings/staff/staff-list.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Implement**

Add a `Key` icon import (`import { Edit2, Trash2, Shield, Loader2, Users, Key } from "lucide-react";`) and, in the Username `<TableCell>`, add a small badge after the username:

```tsx
<TableCell className="font-mono text-sm">
  <div className="flex items-center gap-2">
    {user.username}
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
      <Key className="w-2.5 h-2.5" />
      PIN set
    </span>
  </div>
</TableCell>
```

This is deliberately a static "PIN set" indicator, not the PIN digits — `StaffListItem` never carries `pin` (see `Omit<UserDbRow, "pin">` in `client/lib/types/user.ts`), and this task does not change that type or add a query that would fetch it.

- [ ] **Step 2: Manual verification**

```bash
cd client && npm run dev
```

Settings > Staff: every row shows a small green "PIN set" badge next to the username; no PIN digits appear anywhere in the table.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/staff/staff-list.tsx
git commit -m "feat(staff): add PIN-set indicator badge (no digits exposed)"
```

---

### Task 8: Active/Inactive badge + deactivate/reactivate flow

**Files:**
- Modify: `client/components/settings/staff/staff-list.tsx`
- Modify: `client/components/settings/staff/staff-delete-dialog.tsx`
- Modify: `client/components/settings/staff-management.tsx`
- Test: `client/__tests__/staff-deactivate.test.ts` (new)

**Interfaces:**
- Consumes: `useMutateUser().update` (existing, `{ id: string; data: StaffUpdatePayload }`).
- Produces: `staff-list.tsx` gains an `onReactivate: (id: string) => void` prop; `staff-delete-dialog.tsx`'s copy changes from "delete" to "deactivate" and its mutation call switches from `remove` to `update` with `{ is_active: 0 }`.

This replaces the current hard-`_deleted`-flag behavior (which permanently hides the row) with `is_active` toggling (which keeps the row visible, matching `web/`'s model where "delete" always meant "deactivate, reactivatable").

- [ ] **Step 1: Write the sanity-check test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { updateUser } from '../lib/db/local-database';

vi.mock('../lib/db/local-database', async () => {
  const actual = await vi.importActual<typeof import('../lib/db/local-database')>('../lib/db/local-database');
  return {
    ...actual,
    updateUser: vi.fn().mockResolvedValue(undefined),
  };
});

describe('staff deactivate/reactivate', () => {
  it('deactivating calls updateUser with is_active: 0, not deleteUser', async () => {
    await updateUser('user-1', { is_active: 0 });
    expect(vi.mocked(updateUser)).toHaveBeenCalledWith('user-1', { is_active: 0 });
  });

  it('reactivating calls updateUser with is_active: 1', async () => {
    await updateUser('user-1', { is_active: 1 });
    expect(vi.mocked(updateUser)).toHaveBeenCalledWith('user-1', { is_active: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/staff-deactivate.test.ts`
Expected: PASS immediately — `updateUser` already accepts arbitrary partial payloads (`StaffUpdatePayload = Partial<StaffCreatePayload>` with an index signature), so this is a sanity check on the existing function's contract, confirming the shape the UI changes below will rely on.

- [ ] **Step 3: Update `staff-delete-dialog.tsx`**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { useMutateUser } from "@/lib/hooks/queries/use-users";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface StaffDeleteDialogProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function StaffDeleteDialog({
  target,
  onClose,
  onSuccess,
}: StaffDeleteDialogProps) {
  const [isDeactivating, setIsDeactivating] = useState(false);
  const { update } = useMutateUser();

  const confirmDeactivateUser = async () => {
    if (!target) return;
    setIsDeactivating(true);
    try {
      await update.mutateAsync({ id: target.id, data: { is_active: 0 } });
      toast.success("Staff account deactivated");
      onSuccess();
    } catch (error) {
      console.error("Failed to deactivate user:", error);
      toast.error("Failed to deactivate staff account");
    } finally {
      setIsDeactivating(false);
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeactivateUser}
      title="Deactivate Staff Account"
      description={`Are you sure you want to deactivate the account for ${target?.name}? They will no longer be able to log in, but the account can be reactivated later.`}
      confirmLabel={isDeactivating ? "Deactivating..." : "Deactivate Account"}
      variant="destructive"
    />
  );
}
```

- [ ] **Step 4: Add the status badge and reactivate action in `staff-list.tsx`**

Add `onReactivate` to the props interface:

```tsx
interface StaffListProps {
  users: StaffListItem[];
  isLoading: boolean;
  onEdit: (user: StaffListItem) => void;
  onDelete: (id: string, name: string) => void;
  onReactivate: (id: string) => void;
}
```

Update the function signature: `export function StaffList({ users, isLoading, onEdit, onDelete, onReactivate }: StaffListProps) {`.

Add a "Status" column header after "Role": `<TableHead>Status</TableHead>`, and bump `colSpan={5}` to `colSpan={6}` in both the empty-state row and the loading row.

Add the status cell after the Role cell:

```tsx
<TableCell>
  <Badge
    variant="outline"
    className={user.is_active === 0 ? "bg-slate-50 text-slate-500 border-slate-200" : "bg-green-50 text-green-700 border-green-200"}
  >
    {user.is_active === 0 ? "Inactive" : "Active"}
  </Badge>
</TableCell>
```

Replace the delete button's branch to show Reactivate instead when inactive:

```tsx
{user.is_active === 0 ? (
  <Button
    variant="ghost"
    size="icon"
    onClick={() => onReactivate(user.id)}
    className="h-8 w-8 text-muted-foreground hover:text-emerald-600"
  >
    <RotateCcw className="w-4 h-4" />
  </Button>
) : (
  <Button
    variant="ghost"
    size="icon"
    onClick={() => handleDeleteClick(user)}
    className="h-8 w-8 text-muted-foreground hover:text-destructive"
    disabled={user.id === "default-admin"}
  >
    <Trash2 className="w-4 h-4" />
  </Button>
)}
```

Add `RotateCcw` to the lucide-react import line.

- [ ] **Step 5: Wire `onReactivate` in `staff-management.tsx`**

```tsx
  const { update } = useMutateUser();

  const handleReactivate = async (id: string) => {
    try {
      await update.mutateAsync({ id, data: { is_active: 1 } });
      toast.success("Staff account reactivated");
      loadUsers();
    } catch (error) {
      console.error("Failed to reactivate user:", error);
      toast.error("Failed to reactivate staff account");
    }
  };
```

Add `import { useMutateUser } from "@/lib/hooks/queries/use-users";` and `import { toast } from "sonner";` if not already present in this file. Pass `onReactivate={handleReactivate}` to `<StaffList ... />`.

- [ ] **Step 6: Manual verification**

```bash
cd client && npm run dev
```

Deactivate a staff member: row stays visible with an "Inactive" badge, action button becomes a reactivate icon. Click it: row flips back to "Active".

- [ ] **Step 7: Commit**

```bash
git add client/components/settings/staff/staff-list.tsx client/components/settings/staff/staff-delete-dialog.tsx client/components/settings/staff-management.tsx client/__tests__/staff-deactivate.test.ts
git commit -m "feat(staff): replace hard-delete with deactivate/reactivate (is_active toggle)"
```

---

### Task 9: Store-assignment field + PIN-change warning toast

**Files:**
- Modify: `client/components/settings/staff/staff-form-dialog.tsx`

**Interfaces:**
- Consumes: `useStore()` (existing, `availableStores: { id: string; name: string }[]`).

- [ ] **Step 1: Add the store selector**

Import `useStore` (`import { useStore } from "@/lib/context/store-context";`) and, inside the component, `const { availableStores } = useStore();`.

Add `store_id: activeStoreId || ""` to the `formData` state's initial shape and to both branches of the `useEffect` (create: `store_id: activeStoreId || ""`, edit: `store_id: userToEdit.store_id || activeStoreId || ""`).

Add the selector UI, only rendered for multi-store accounts, right after the role `<Select>` block:

```tsx
{availableStores && availableStores.length > 1 && (
  <div className="grid gap-2">
    <Label htmlFor="store_id">Assigned Store</Label>
    <Select
      value={formData.store_id}
      onValueChange={(val) => setFormData((prev) => ({ ...prev, store_id: val }))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select store" />
      </SelectTrigger>
      <SelectContent>
        {availableStores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

In `handleSubmit`, use `formData.store_id` instead of the `activeStoreId` prop for both the update payload and the create payload:

```tsx
const updateData: StaffUpdatePayload = {
  first_name: formData.first_name.trim(),
  last_name: formData.last_name.trim(),
  username: formData.username,
  email: formData.email,
  role: formData.role,
  store_id: formData.store_id,
};
```

```tsx
const dataToSave = {
  first_name: formData.first_name.trim(),
  last_name: formData.last_name.trim(),
  username: formData.username,
  email: formData.email,
  pin: formData.pin,
  role: formData.role,
  store_id: formData.store_id || activeStoreId || "",
};
```

- [ ] **Step 2: Add the PIN-change warning toast**

In `handleSubmit`, before the try block, compute whether the PIN actually changed:

```tsx
const pinChanged = isEditing && !!formData.pin && formData.pin.length === 4;
```

Replace the edit-branch success toast:

```tsx
toast.success("Staff account updated successfully", pinChanged ? {
  description: "PIN changed. Restart the app (or refresh the tab, if using it in a browser) on that person's device to apply it right away.",
  duration: 8000,
} : undefined);
```

(The create-branch success toast is unchanged — the warning only applies to an edited, existing account's PIN.)

- [ ] **Step 3: Manual verification**

```bash
cd client && npm run dev
```

Multi-store account: creating/editing a staff member shows the store selector, defaulting to the currently active store; changing a PIN on an existing staff member shows the 8-second warning toast; creating a new staff member does not.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/staff/staff-form-dialog.tsx
git commit -m "feat(staff): add store assignment field and PIN-change device-sync warning"
```

---

### Task 10: Staff Activities tab

**Files:**
- Create: `client/components/settings/staff/staff-activities-tab.tsx`
- Modify: `client/components/settings/staff-management.tsx`

**Interfaces:**
- Consumes: `getActivityLog({ tableName: 'users', ... })` (Task 2), `queryKeys.activityLog.list` (existing, used identically in `client/components/activity-log/activity-log-page.tsx`), `describeActivity` (existing, `client/components/activity-log/describe-activity.ts`), `TablePagination` (existing, `client/components/ui/table-pagination.tsx`).

- [ ] **Step 1: Create the tab component**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { getActivityLog } from "@/lib/db/queries/activity-log";
import { describeActivity } from "@/components/activity-log/describe-activity";
import { queryKeys } from "@/lib/query-keys";

export function StaffActivitiesTab() {
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filters = { tableName: "users", page, pageSize };
  const { data, isLoading } = useQuery({
    ...queryKeys.activityLog.list(JSON.stringify(filters)),
    queryFn: () => getActivityLog(filters),
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          )}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                No staff activity recorded yet.
              </TableCell>
            </TableRow>
          )}
          {!isLoading && rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-muted-foreground text-sm">
                {row.created_at ? format(new Date(row.created_at), "MMM d, yyyy h:mm a") : "N/A"}
              </TableCell>
              <TableCell>{row.user_name || "System"}</TableCell>
              <TableCell>{describeActivity(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
      />
    </div>
  );
}
```

Verify at implementation time that `describeActivity` and `TablePagination` have exactly this call shape — both already exist and are used this way in `client/components/activity-log/activity-log-page.tsx`; adjust prop names here only if that file's actual usage differs from what's written above.

- [ ] **Step 2: Add tabs to Staff Management**

In `client/components/settings/staff-management.tsx`, import the tabs primitives and the new component:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StaffActivitiesTab } from "./staff/staff-activities-tab";
```

Wrap the component's existing returned JSX inside:

```tsx
<Tabs defaultValue="management" className="space-y-6">
  <TabsList>
    <TabsTrigger value="management">Management</TabsTrigger>
    <TabsTrigger value="activities">Activities</TabsTrigger>
  </TabsList>
  <TabsContent value="management" className="space-y-6">
    {/* existing header row, StaffStats, Card/StaffList, and the two dialogs go here unchanged */}
  </TabsContent>
  <TabsContent value="activities">
    <StaffActivitiesTab />
  </TabsContent>
</Tabs>
```

- [ ] **Step 3: Manual verification**

```bash
cd client && npm run dev
```

Settings > Staff shows Management/Activities tabs; Activities lists only `users`-table audit-log entries (create/update/deactivate/reactivate events from the earlier tasks), paginated.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/staff/staff-activities-tab.tsx client/components/settings/staff-management.tsx
git commit -m "feat(staff): add Activities tab showing users-table audit history"
```
