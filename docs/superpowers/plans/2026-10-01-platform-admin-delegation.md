# Platform Admin Delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a superadmin delegate 5 specific platform-admin capabilities to the `platform_admin`/`agent` roles (and to new custom platform roles they create), with per-admin overrides in both directions, while a fixed set of actions (money, identity, destructive, settings) stays permanently superadmin-only.

**Architecture:** Reuses the existing but unused `roles`/`permissions`/`permission_role`/`permission_user` RBAC tables and `User::hasPermission()`/`CheckPermission` middleware. Adds one column (`permission_user.granted`) to support per-admin denial overrides, one column (`roles.is_system`) to protect the 3 built-in roles, and a new `AdminRoleController`/`AdminRoleService` pair for role/permission CRUD. Swaps 11 existing routes from `role:super_admin` to `permission:<slug>`. On the frontend, extends the admin auth store with a resolved `effective_permissions` list and adds permission-aware nav/action gating alongside the existing role-only checks.

**Tech Stack:** Laravel 12 / PHP 8.2 (`laravel-server/`), Next.js / React / TanStack Query / Zustand (`web/`).

**Spec:** `docs/superpowers/specs/2026-10-01-platform-admin-delegation-design.md`

## Global Constraints

- The never-delegatable actions (grant trial/plan, coupons/payouts, edit another admin's profile/role, delete user/store, platform/subscription settings) must never get a `permission:*` middleware entry — enforced by omission, not a deny rule.
- `super_admin` always bypasses every permission check (existing `CheckPermission` behavior) — never add a super_admin-specific permission row or special-case it in new code beyond the existing bypass pattern.
- Every new admin mutation that changes role/permission state writes an `ActivityLog` row, following the exact `ActivityLog::create([...])` shape already used in `UpdatesUserProfiles::logProfileUpdate()`.
- No inline comments beyond a rare ≤2-line note (per `.agents/AGENTS.md` §3); document trade-offs in `laravel-server/AGENTS.md`/`web/AGENTS.md` instead.
- Conventional Commits, single-sentence subject, no `Co-Authored-By` trailer.
- Keep new/modified files under 350 lines; several existing admin files (`AdminUserController.php`, `AdminUserService.php`) are already over this limit — don't make them worse, split out new logic into new files instead of appending.

## Review Focus

- **A `platform_admin` with only `view_platform_data` granted must not be able to reach any never-delegatable action via a list/detail response that embeds an action link or id the frontend could call directly** — the backend route middleware is the real gate; the frontend hiding a button is cosmetic only. Task 12's route-level tests are what actually matter here.
- **An admin whose role grants a permission, but who has an explicit `granted:false` override for it, must be denied** — the most likely place to get the precedence backwards (checking role before the override instead of after). Task 6's resolution-order tests.
- **Deleting a custom role that still has users assigned to it must fail loudly, not silently orphan those users' `role_id`** — Task 8's `deleteRole()` guard.
- **The per-admin override UI must not render (or must render disabled) for a `super_admin` target** — editing permissions for an account that bypasses permissions entirely is meaningless and would mislead the superadmin into thinking it does something. Task 20.
- **Changing `AdminUserService`'s role validation from a fixed 3-item whitelist to a dynamic lookup must still reject a store-tenant role slug** (`admin`, `store_owner`, `manager`, `specialist`, `sales_staff`, `auditor`) — the dynamic lookup must be scoped to platform-relevant roles only, not every row in the shared `roles` table. Task 13's negative test.

---

## Task 1: `permission_user` gains a `granted` flag and a uniqueness constraint

**Files:**
- Create: `laravel-server/database/migrations/2026_10_02_000001_add_granted_to_permission_user_table.php`
- Test: `laravel-server/tests/Feature/PermissionUserGrantedColumnTest.php`

**Interfaces:**
- Produces: `permission_user.granted` (boolean, default `true`), a unique index on `(user_id, permission_id)`.

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('adds a granted column to permission_user defaulting to true', function () {
    $user = User::factory()->create();
    $permission = Permission::factory()->create(['slug' => 'test_granted_column']);

    $user->permissions()->attach($permission->id);

    $row = \DB::table('permission_user')
        ->where('user_id', $user->id)
        ->where('permission_id', $permission->id)
        ->first();

    expect((bool) $row->granted)->toBeTrue();
});

it('rejects a duplicate user_id/permission_id pair', function () {
    $user = User::factory()->create();
    $permission = Permission::factory()->create(['slug' => 'test_unique_pair']);

    \DB::table('permission_user')->insert([
        'user_id' => $user->id,
        'permission_id' => $permission->id,
        'granted' => true,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    expect(fn () => \DB::table('permission_user')->insert([
        'user_id' => $user->id,
        'permission_id' => $permission->id,
        'granted' => false,
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(\Illuminate\Database\QueryException::class);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=PermissionUserGrantedColumnTest`
Expected: FAIL — `granted` column doesn't exist yet (first test), second test currently succeeds without an exception (no unique constraint), so it fails for the opposite reason (assertion that an exception IS thrown never satisfied).

- [ ] **Step 3: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('permission_user', function (Blueprint $table) {
            $table->boolean('granted')->default(true)->after('permission_id');
            $table->unique(['user_id', 'permission_id']);
        });
    }

    public function down(): void
    {
        Schema::table('permission_user', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'permission_id']);
            $table->dropColumn('granted');
        });
    }
};
```

- [ ] **Step 4: Run migration and test**

Run: `cd laravel-server && php artisan migrate && php artisan test --filter=PermissionUserGrantedColumnTest`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
cd laravel-server
git add database/migrations/2026_10_02_000001_add_granted_to_permission_user_table.php tests/Feature/PermissionUserGrantedColumnTest.php
git commit -m "feat(server): add a granted flag and uniqueness constraint to permission_user"
```

---

## Task 2: `roles` gains an `is_system` flag

**Files:**
- Create: `laravel-server/database/migrations/2026_10_02_000002_add_is_system_to_roles_table.php`
- Modify: `laravel-server/app/Models/Role.php:14` (add `is_system` to `$fillable`)
- Test: `laravel-server/tests/Feature/RoleIsSystemColumnTest.php`

**Interfaces:**
- Produces: `roles.is_system` (boolean, default `true`). `Role::$fillable` includes `is_system`.

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('defaults is_system to true for existing seeded roles', function () {
    $superAdmin = Role::where('slug', 'super_admin')->first();
    expect($superAdmin->is_system)->toBeTrue();
});

it('allows creating a custom role with is_system false', function () {
    $role = Role::create([
        'name' => 'Support Lead',
        'slug' => 'support_lead',
        'is_system' => false,
    ]);

    expect($role->fresh()->is_system)->toBeFalse();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=RoleIsSystemColumnTest`
Expected: FAIL — column doesn't exist.

- [ ] **Step 3: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->boolean('is_system')->default(true)->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn('is_system');
        });
    }
};
```

- [ ] **Step 4: Update the Role model's fillable array**

In `laravel-server/app/Models/Role.php`, change:

```php
    protected $fillable = ['name', 'slug', 'description'];
```

to:

```php
    protected $fillable = ['name', 'slug', 'description', 'is_system'];
```

- [ ] **Step 5: Run migration and test**

Run: `cd laravel-server && php artisan migrate && php artisan test --filter=RoleIsSystemColumnTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd laravel-server
git add database/migrations/2026_10_02_000002_add_is_system_to_roles_table.php app/Models/Role.php tests/Feature/RoleIsSystemColumnTest.php
git commit -m "feat(server): add an is_system flag to roles to protect the 3 built-in roles"
```

---

## Task 3: Seed the 5 delegatable permissions onto `platform_admin`/`agent`

**Files:**
- Create: `laravel-server/database/migrations/2026_10_02_000003_seed_admin_delegation_permissions.php`
- Modify: `laravel-server/database/seeders/RolesAndPermissionsSeeder.php` (so a fresh `migrate:fresh --seed` matches what the migration produces on an existing database)
- Test: `laravel-server/tests/Feature/AdminDelegationPermissionSeedTest.php`

**Interfaces:**
- Produces: 5 new `permissions` rows (`view_platform_data`, `send_notifications`, `reset_user_passwords`, `manage_account_status`, `impersonate_store`), attached to `platform_admin` (all 5) and `agent` (`view_platform_data`, `send_notifications` only) via `permission_role`.

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('grants platform_admin all 5 delegatable permissions', function () {
    $this->artisan('migrate')->run();
    $platformAdmin = Role::where('slug', 'platform_admin')->first();
    $slugs = $platformAdmin->permissions()->pluck('slug')->sort()->values()->all();

    expect($slugs)->toContain('view_platform_data', 'send_notifications', 'reset_user_passwords', 'manage_account_status', 'impersonate_store');
});

it('grants agent only view_platform_data and send_notifications', function () {
    $this->artisan('migrate')->run();
    $agent = Role::where('slug', 'agent')->first();
    $slugs = $agent->permissions()->pluck('slug')->all();

    expect($slugs)->toContain('view_platform_data', 'send_notifications')
        ->and($slugs)->not->toContain('reset_user_passwords', 'manage_account_status', 'impersonate_store');
});

it('does not remove platform_admins existing manage_platform/create_accounts/grant_trials permissions', function () {
    $this->artisan('migrate')->run();
    $platformAdmin = Role::where('slug', 'platform_admin')->first();
    $slugs = $platformAdmin->permissions()->pluck('slug')->all();

    expect($slugs)->toContain('manage_platform', 'create_accounts', 'grant_trials');
});
```

Note: these tests run the migration explicitly inside the test because `RefreshDatabase` in this suite runs migrations once per test run via the normal `php artisan test` bootstrap — this explicit call just documents intent and is a no-op if already migrated. Follow whatever this repo's existing migration-content tests do for this pattern (check `laravel-server/tests/Feature/ClearStoreIdOnStoreOwnersTest.php` from the A-127 work for the precedent of testing a data-repair migration's effect).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminDelegationPermissionSeedTest`
Expected: FAIL — the 5 permissions don't exist yet.

- [ ] **Step 3: Write the migration**

```php
<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    private const DELEGATABLE_PERMISSIONS = [
        'view_platform_data' => 'View stores, platform users and activity logs',
        'send_notifications' => 'Send user notifications and manage broadcasts',
        'reset_user_passwords' => "Force-reset a user's password",
        'manage_account_status' => 'Suspend/reactivate a store or user',
        'impersonate_store' => "View a store's data as if logged in as them",
    ];

    private const ROLE_GRANTS = [
        'platform_admin' => ['view_platform_data', 'send_notifications', 'reset_user_passwords', 'manage_account_status', 'impersonate_store'],
        'agent' => ['view_platform_data', 'send_notifications'],
    ];

    public function up(): void
    {
        foreach (self::DELEGATABLE_PERMISSIONS as $slug => $description) {
            Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => ucwords(str_replace('_', ' ', $slug)), 'description' => $description],
            );
        }

        foreach (self::ROLE_GRANTS as $roleSlug => $permissionSlugs) {
            $role = Role::where('slug', $roleSlug)->first();
            if (!$role) {
                continue;
            }
            $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
            // syncWithoutDetaching, not sync: this role already carries
            // manage_platform/create_accounts/grant_trials and this migration
            // must only ADD the 5 new slugs, never touch existing ones.
            $role->permissions()->syncWithoutDetaching($permissionIds);
        }
    }

    public function down(): void
    {
        foreach (self::ROLE_GRANTS as $roleSlug => $permissionSlugs) {
            $role = Role::where('slug', $roleSlug)->first();
            if (!$role) {
                continue;
            }
            $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
            $role->permissions()->detach($permissionIds);
        }

        Permission::whereIn('slug', array_keys(self::DELEGATABLE_PERMISSIONS))->delete();
    }
};
```

- [ ] **Step 4: Update `RolesAndPermissionsSeeder.php` to match**

Open `laravel-server/database/seeders/RolesAndPermissionsSeeder.php`. Add the 5 slugs to the `$permissions` array (same shape as the existing entries like `'manage_platform' => '...'`), and add them to `platform_admin`'s and `agent`'s `permissions` arrays in the `$roles` array, matching the grants above exactly.

- [ ] **Step 5: Run migration and test**

Run: `cd laravel-server && php artisan migrate && php artisan test --filter=AdminDelegationPermissionSeedTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd laravel-server
git add database/migrations/2026_10_02_000003_seed_admin_delegation_permissions.php database/seeders/RolesAndPermissionsSeeder.php tests/Feature/AdminDelegationPermissionSeedTest.php
git commit -m "feat(server): seed the 5 admin-delegation permissions onto platform_admin and agent"
```

---

## Task 4: `User::hasPermission()` honors a `granted:false` override and gains a `super_admin` bypass

**Files:**
- Modify: `laravel-server/app/Models/User.php:185-188` (the `permissions()` relation) and `laravel-server/app/Models/User.php:213-230` (the `hasPermission()` method)
- Test: `laravel-server/tests/Feature/HasPermissionResolutionTest.php`

**Interfaces:**
- Consumes: `permission_user.granted` (Task 1), `roles.is_system` is not used here.
- Produces: `User::hasPermission(string $slug): bool` — the single source every `permission:*` middleware check and the new `effective_permissions` accessor (Task 5) call.

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function () {
    $this->artisan('migrate')->run();
    $this->permission = Permission::firstOrCreate(['slug' => 'test_perm'], ['name' => 'Test']);
});

it('grants via role with no override', function () {
    $role = Role::factory()->create(['slug' => 'test_role_a']);
    $role->permissions()->attach($this->permission->id);
    $user = User::factory()->create(['role' => 'test_role_a', 'role_id' => $role->id]);

    expect($user->hasPermission('test_perm'))->toBeTrue();
});

it('denies when role grants it but a granted:false override exists', function () {
    $role = Role::factory()->create(['slug' => 'test_role_b']);
    $role->permissions()->attach($this->permission->id);
    $user = User::factory()->create(['role' => 'test_role_b', 'role_id' => $role->id]);

    $user->permissions()->attach($this->permission->id, ['granted' => false]);

    expect($user->hasPermission('test_perm'))->toBeFalse();
});

it('grants when role denies it but a granted:true override exists', function () {
    $role = Role::factory()->create(['slug' => 'test_role_c']);
    $user = User::factory()->create(['role' => 'test_role_c', 'role_id' => $role->id]);

    $user->permissions()->attach($this->permission->id, ['granted' => true]);

    expect($user->hasPermission('test_perm'))->toBeTrue();
});

it('denies when role denies it and there is no override', function () {
    $role = Role::factory()->create(['slug' => 'test_role_d']);
    $user = User::factory()->create(['role' => 'test_role_d', 'role_id' => $role->id]);

    expect($user->hasPermission('test_perm'))->toBeFalse();
});

it('always grants to super_admin regardless of any row', function () {
    $superAdminRole = Role::where('slug', 'super_admin')->first();
    $user = User::factory()->create(['role' => 'super_admin', 'role_id' => $superAdminRole->id]);

    expect($user->hasPermission('test_perm'))->toBeTrue();
    expect($user->hasPermission('anything_made_up'))->toBeTrue();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=HasPermissionResolutionTest`
Expected: FAIL — the `granted:false` override test and the `super_admin` bypass test fail against today's code (today's `hasPermission` grants on mere presence of a direct row, ignoring `granted`, and has no `super_admin` short-circuit).

- [ ] **Step 3: Update the `permissions()` relation**

In `laravel-server/app/Models/User.php`, change:

```php
    public function permissions()
    {
        return $this->belongsToMany(Permission::class);
    }
```

to:

```php
    public function permissions()
    {
        return $this->belongsToMany(Permission::class)->withPivot('granted');
    }
```

- [ ] **Step 4: Rewrite `hasPermission()`**

Replace the existing method body (starting `public function hasPermission($permissionSlug)`) with:

```php
    public function hasPermission($permissionSlug)
    {
        if ($this->hasRole('super_admin')) {
            return true;
        }

        $directGrant = $this->permissions()->where('slug', $permissionSlug)->first();
        if ($directGrant) {
            return (bool) $directGrant->pivot->granted;
        }

        if ($this->userRole) {
            if ($this->userRole->permissions()->where('slug', $permissionSlug)->exists()) {
                return true;
            }
            if ($this->userRole->slug === 'store_owner') {
                $adminRole = Role::where('slug', 'admin')->first();
                if ($adminRole && $adminRole->permissions()->where('slug', $permissionSlug)->exists()) {
                    return true;
                }
            }
        }

        return false;
    }
```

(This preserves the existing `store_owner` → `admin` fallback exactly as it was — only the direct-grant block and the leading `super_admin` check are new.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=HasPermissionResolutionTest`
Expected: PASS (all 5 cases)

- [ ] **Step 6: Run the full server suite to check for regressions**

Run: `cd laravel-server && php artisan test`
Expected: PASS, same count as before plus the new tests (no existing test should have relied on the old "presence = grant, ignore pivot" behavior, since `permission_user` had zero application writers before this feature).

- [ ] **Step 7: Commit**

```bash
cd laravel-server
git add app/Models/User.php tests/Feature/HasPermissionResolutionTest.php
git commit -m "fix(server): make hasPermission() honor a granted:false override and bypass for super_admin"
```

---

## Task 5: Serialize the caller's effective permissions onto the `User` model

**Files:**
- Modify: `laravel-server/app/Models/User.php:54` (the `$appends` array) and add a new accessor method near the other accessors in that file
- Test: `laravel-server/tests/Feature/EffectivePermissionsAttributeTest.php`

**Interfaces:**
- Consumes: `User::hasPermission()` (Task 4), the 5-slug catalog (duplicated here as a small local constant — the authoritative catalog constant is defined in Task 8's `AdminRoleService`; this file is loaded before that one in this plan's order, so this task defines its own copy and Task 8's test/Review-Focus pass should cross-check they match, or — simpler — define the catalog constant once, in `User.php`, and have `AdminRoleService` reference `User::DELEGATABLE_PERMISSIONS` instead of duplicating it).
- Produces: `$user->effective_permissions` → `string[]` (every one of the 5 catalog slugs this user currently has, by any route). Appears automatically in every JSON response that serializes a `User` model, including `GET /user` and `POST /admin/session/refresh` (`AuthenticatesSessions.php:340`, `:271`, `:282`) with zero controller changes needed, since both already just return the model directly.

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('includes effective_permissions in a serialized user with only its granted catalog slugs', function () {
    $this->artisan('migrate')->run();
    $role = Role::where('slug', 'agent')->first();
    $user = User::factory()->create(['role' => 'agent', 'role_id' => $role->id]);

    $array = $user->toArray();

    expect($array)->toHaveKey('effective_permissions');
    expect($array['effective_permissions'])->toContain('view_platform_data', 'send_notifications');
    expect($array['effective_permissions'])->not->toContain('impersonate_store');
});

it('returns an empty array for a super_admin rather than listing the whole catalog', function () {
    $this->artisan('migrate')->run();
    $role = Role::where('slug', 'super_admin')->first();
    $user = User::factory()->create(['role' => 'super_admin', 'role_id' => $role->id]);

    expect($user->toArray()['effective_permissions'])->toBe([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=EffectivePermissionsAttributeTest`
Expected: FAIL — key doesn't exist.

- [ ] **Step 3: Add the catalog constant and accessor**

In `laravel-server/app/Models/User.php`, add near the top of the class body (alongside other constants, if any — otherwise just under the class declaration):

```php
    public const DELEGATABLE_PERMISSIONS = [
        'view_platform_data',
        'send_notifications',
        'reset_user_passwords',
        'manage_account_status',
        'impersonate_store',
    ];
```

Change the `$appends` line from:

```php
    protected $appends = ['name', 'require_email_verification'];
```

to:

```php
    protected $appends = ['name', 'require_email_verification', 'effective_permissions'];
```

Add the accessor near the other `get...Attribute` methods:

```php
    public function getEffectivePermissionsAttribute(): array
    {
        if ($this->hasRole('super_admin')) {
            return [];
        }

        return array_values(array_filter(
            self::DELEGATABLE_PERMISSIONS,
            fn (string $slug) => $this->hasPermission($slug),
        ));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=EffectivePermissionsAttributeTest`
Expected: PASS

- [ ] **Step 5: Run the full server suite**

Run: `cd laravel-server && php artisan test`
Expected: PASS — check specifically that no existing test asserts an exact/closed key set on a serialized `User` (e.g. `assertExactJson`) that this new appended key would break. If one exists, update its expected key list to include `effective_permissions`.

- [ ] **Step 6: Commit**

```bash
cd laravel-server
git add app/Models/User.php tests/Feature/EffectivePermissionsAttributeTest.php
git commit -m "feat(server): serialize a user's effective delegatable permissions"
```

---

## Task 6: Swap the 11 delegated routes from `role:super_admin` to `permission:<slug>`

**Files:**
- Modify: `laravel-server/routes/api.php:194-225` (exact lines below)
- Test: `laravel-server/tests/Feature/DelegatedRouteAuthorizationTest.php`

**Interfaces:**
- Consumes: `User::DELEGATABLE_PERMISSIONS` slugs (Task 5), the `permission:*` middleware alias (already registered — `CheckPermission` is already used elsewhere in this file, e.g. `permission:manage_platform` at line 182).

Change these 11 lines in `laravel-server/routes/api.php` (inside the `permission:manage_platform` group that already wraps lines 182-264+ — these edits only touch each route's own, stricter, inner middleware):

```php
// Line 194 — was ->middleware('role:super_admin')
Route::post('/stores/{id}/suspend', [AdminStoreController::class, 'suspendStore'])->middleware('permission:manage_account_status');
// Line 195 — was ->middleware('role:super_admin')
Route::post('/stores/{id}/unsuspend', [AdminStoreController::class, 'unsuspendStore'])->middleware('permission:manage_account_status');
// Line 187 — was ->middleware('role:super_admin')
Route::get('/stores', [AdminStoreController::class, 'stores'])->middleware('permission:view_platform_data');
// Line 193 — was ->middleware('role:super_admin')
Route::get('/stores/{id}', [AdminStoreController::class, 'storeDetail'])->middleware('permission:view_platform_data');
// Line 208 — was ->middleware('role:super_admin')
Route::get('/users', [AdminUserController::class, 'users'])->middleware('permission:view_platform_data');
// Line 221 — was ->middleware('role:super_admin')
Route::get('/activity-logs', [AdminPlatformController::class, 'activityLogs'])->middleware('permission:view_platform_data');
// Line 215 — was ->middleware('role:super_admin')
Route::post('/users/{id}/deactivate', [AdminUserController::class, 'deactivateUser'])->middleware('permission:manage_account_status');
// Line 216 — was ->middleware('role:super_admin')
Route::post('/users/{id}/reactivate', [AdminUserController::class, 'reactivateUser'])->middleware('permission:manage_account_status');
// Line 217 — was ->middleware('role:super_admin')
Route::post('/users/{id}/reset-password', [AdminUserController::class, 'forcePasswordReset'])->middleware('permission:reset_user_passwords');
// Line 218 — was ->middleware('role:super_admin')
Route::post('/users/{id}/notify', [AdminUserController::class, 'notifyUser'])->middleware('permission:send_notifications');
// Line 219 — was ->middleware('role:super_admin')
Route::post('/users/bulk-notify', [AdminUserController::class, 'bulkNotify'])->middleware('permission:send_notifications');
// Line 225 — was ->middleware('role:super_admin')
Route::post('/stores/{id}/impersonate', [AdminStoreController::class, 'impersonateStore'])->middleware('permission:impersonate_store');
```

Also change the broadcasts group's outer middleware at line 239, from:

```php
Route::prefix('announcements')->middleware(['subscription:broadcast_create', 'role:super_admin'])->group(function () {
```

to:

```php
Route::prefix('announcements')->middleware(['subscription:broadcast_create', 'permission:send_notifications'])->group(function () {
```

Every other `role:super_admin` route in this file (mark-demo/unmark-demo, grant-trial/activate-plan already use `permission:grant_trials` and stay unchanged, purge/archive/restore, products, health, errors, downloads, `PUT /users/{id}`, `DELETE /users/{id}`, email-templates, feedback, mail/send, system-configs, revenue, coupons, account-manager) is **untouched** — confirm by re-reading the full `routes/api.php:182-270` block after editing that nothing else changed.

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function () {
    $this->artisan('migrate')->run();
    $this->store = Store::factory()->create();
});

function actingAsRole(string $roleSlug, array $extraPermissionSlugs = []): User
{
    $role = Role::where('slug', $roleSlug)->first();
    $user = User::factory()->create(['role' => $roleSlug, 'role_id' => $role->id]);
    if ($extraPermissionSlugs) {
        $ids = \App\Models\Permission::whereIn('slug', $extraPermissionSlugs)->pluck('id');
        $user->permissions()->attach($ids->mapWithKeys(fn ($id) => [$id => ['granted' => true]]));
    }
    Sanctum::actingAs($user);
    return $user;
}

it('lets an agent view the stores list (has view_platform_data by default)', function () {
    actingAsRole('agent');
    $this->getJson('/api/v1/admin/stores')->assertOk();
});

it('forbids an agent from suspending a store (does not have manage_account_status by default)', function () {
    actingAsRole('agent');
    $this->postJson("/api/v1/admin/stores/{$this->store->id}/suspend")->assertForbidden();
});

it('lets a platform_admin suspend a store (has manage_account_status by default)', function () {
    actingAsRole('platform_admin');
    $this->postJson("/api/v1/admin/stores/{$this->store->id}/suspend")->assertOk();
});

it('forbids a platform_admin from impersonating with the permission explicitly revoked', function () {
    $user = actingAsRole('platform_admin');
    $permission = \App\Models\Permission::where('slug', 'impersonate_store')->first();
    $user->permissions()->attach($permission->id, ['granted' => false]);

    $this->postJson("/api/v1/admin/stores/{$this->store->id}/impersonate")->assertForbidden();
});

it('still forbids delete-user for a platform_admin granted every one of the 5 delegatable permissions', function () {
    $target = User::factory()->create();
    actingAsRole('platform_admin', \App\Models\User::DELEGATABLE_PERMISSIONS);

    $this->deleteJson("/api/v1/admin/users/{$target->id}")->assertForbidden();
});

it('super_admin can still do everything regardless of permission_role/permission_user state', function () {
    actingAsRole('super_admin');
    $this->getJson('/api/v1/admin/stores')->assertOk();
    $this->postJson("/api/v1/admin/stores/{$this->store->id}/suspend")->assertOk();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=DelegatedRouteAuthorizationTest`
Expected: FAIL — against today's routes, the agent-views-stores test fails (403, since `/admin/stores` is still `role:super_admin`), and the platform_admin-suspends test fails the same way.

- [ ] **Step 3: Apply the route changes above**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=DelegatedRouteAuthorizationTest`
Expected: PASS (all 6 cases)

- [ ] **Step 5: Run the full server suite**

Run: `cd laravel-server && php artisan test`
Expected: PASS — this is the highest-risk step in the whole plan for breaking something unrelated; read any new failure carefully, since some existing test may currently assert a `platform_admin`/`agent` gets 403 on one of these 11 routes as a *feature* of today's locked-down behavior, which this task deliberately changes. If so, that test's expectation needs updating to reflect the new, intended delegation — not reverted.

- [ ] **Step 6: Commit**

```bash
cd laravel-server
git add routes/api.php tests/Feature/DelegatedRouteAuthorizationTest.php
git commit -m "feat(server): delegate 5 admin capabilities from role:super_admin to permission-gated routes"
```

---

## Task 7: `AdminRoleService` — role/permission CRUD backend logic

**Files:**
- Create: `laravel-server/app/Services/Admin/AdminRoleService.php`
- Test: `laravel-server/tests/Feature/AdminRoleServiceTest.php`

**Interfaces:**
- Consumes: `User::DELEGATABLE_PERMISSIONS` (Task 5), `roles.is_system` (Task 2), `permission_user.granted` (Task 1).
- Produces: `listRoles(): array`, `updateRolePermissions(string $roleSlug, array $permissionSlugs, string $actorId): Role`, `createRole(string $name, array $permissionSlugs, string $actorId): Role`, `deleteRole(string $roleSlug, string $actorId): void`, `setUserPermissionOverride(string $userId, string $permissionSlug, ?bool $granted, string $actorId): User` — all consumed by Task 8's controller.

```php
<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AdminRoleService
{
    public function listRoles(): array
    {
        return Role::with('permissions')
            ->whereIn('slug', $this->platformRoleSlugs())
            ->get()
            ->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
                'is_system' => $role->is_system,
                'permissions' => $role->permissions->pluck('slug')->intersect(User::DELEGATABLE_PERMISSIONS)->values(),
                'user_count' => User::where('role_id', $role->id)->count(),
            ])
            ->all();
    }

    public function updateRolePermissions(string $roleSlug, array $permissionSlugs, string $actorId): Role
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $this->assertCatalogSubset($permissionSlugs);

        $before = $role->permissions()->whereIn('slug', User::DELEGATABLE_PERMISSIONS)->pluck('slug')->sort()->values()->all();

        $nonCatalogIds = $role->permissions()->whereNotIn('slug', User::DELEGATABLE_PERMISSIONS)->pluck('permissions.id');
        $desiredCatalogIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');

        $role->permissions()->sync($nonCatalogIds->merge($desiredCatalogIds)->unique());

        $after = collect($permissionSlugs)->sort()->values()->all();

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'ROLE_PERMISSIONS_UPDATED',
            'description' => "Updated delegated permissions for role \"{$role->name}\" ({$role->slug})",
            'status' => 'success',
            'properties' => ['role_slug' => $role->slug, 'before' => $before, 'after' => $after],
        ]);

        return $role->fresh('permissions');
    }

    public function createRole(string $name, array $permissionSlugs, string $actorId): Role
    {
        $this->assertCatalogSubset($permissionSlugs);

        $slug = Str::slug($name, '_');
        if (Role::where('slug', $slug)->exists()) {
            throw ValidationException::withMessages(['name' => 'A role with this name already exists.']);
        }

        $role = Role::create(['name' => $name, 'slug' => $slug, 'is_system' => false]);
        $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
        $role->permissions()->sync($permissionIds);

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'PLATFORM_ROLE_CREATED',
            'description' => "Created platform role \"{$name}\" ({$slug})",
            'status' => 'success',
            'properties' => ['role_slug' => $slug, 'permissions' => $permissionSlugs],
        ]);

        return $role;
    }

    public function deleteRole(string $roleSlug, string $actorId): void
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();

        if ($role->is_system) {
            throw ValidationException::withMessages(['role' => 'This role is built in and cannot be deleted.']);
        }

        $userCount = User::where('role_id', $role->id)->count();
        if ($userCount > 0) {
            throw ValidationException::withMessages(['role' => "Reassign the {$userCount} user(s) on this role before deleting it."]);
        }

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'PLATFORM_ROLE_DELETED',
            'description' => "Deleted platform role \"{$role->name}\" ({$role->slug})",
            'status' => 'success',
        ]);

        $role->delete();
    }

    public function setUserPermissionOverride(string $userId, string $permissionSlug, ?bool $granted, string $actorId): User
    {
        $this->assertCatalogSubset([$permissionSlug]);
        $user = User::findOrFail($userId);
        $permission = Permission::where('slug', $permissionSlug)->firstOrFail();

        if ($granted === null) {
            DB::table('permission_user')->where('user_id', $user->id)->where('permission_id', $permission->id)->delete();
            $action = 'USER_PERMISSION_OVERRIDE_CLEARED';
            $description = "Cleared {$permissionSlug} override for {$user->email}, reverting to role default";
        } else {
            DB::table('permission_user')->updateOrInsert(
                ['user_id' => $user->id, 'permission_id' => $permission->id],
                ['granted' => $granted, 'updated_at' => now(), 'created_at' => now()],
            );
            $action = 'USER_PERMISSION_OVERRIDE_SET';
            $verb = $granted ? 'Granted' : 'Revoked';
            $description = "{$verb} {$permissionSlug} override for {$user->email}";
        }

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => $action,
            'description' => $description,
            'status' => 'success',
            'properties' => ['target_user_id' => $user->id, 'permission' => $permissionSlug, 'granted' => $granted],
        ]);

        return $user->fresh();
    }

    private function assertCatalogSubset(array $permissionSlugs): void
    {
        $unknown = array_diff($permissionSlugs, User::DELEGATABLE_PERMISSIONS);
        if ($unknown) {
            throw ValidationException::withMessages(['permissions' => 'Unknown permission(s): ' . implode(', ', $unknown)]);
        }
    }

    private function platformRoleSlugs(): array
    {
        return array_merge(
            \App\Services\Admin\Concerns\UpdatesUserProfiles::PLATFORM_ROLES,
            Role::where('is_system', false)->pluck('slug')->all(),
        );
    }
}
```

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function () {
    $this->artisan('migrate')->run();
    $this->service = app(AdminRoleService::class);
    $this->actor = User::factory()->create(['role' => 'super_admin', 'role_id' => Role::where('slug', 'super_admin')->value('id')]);
});

it('lists platform roles with only catalog permissions and a user count', function () {
    $roles = $this->service->listRoles();
    $platformAdmin = collect($roles)->firstWhere('slug', 'platform_admin');

    expect($platformAdmin['permissions'])->toContain('manage_account_status')
        ->and($platformAdmin['permissions'])->not->toContain('manage_platform');
});

it('updates a roles permissions without touching its non-catalog permissions', function () {
    $role = $this->service->updateRolePermissions('agent', ['view_platform_data'], $this->actor->id);
    $slugs = $role->permissions->pluck('slug')->all();

    expect($slugs)->toContain('view_platform_data', 'manage_platform', 'create_accounts')
        ->and($slugs)->not->toContain('send_notifications');
});

it('rejects a permission outside the 5-slug catalog', function () {
    expect(fn () => $this->service->updateRolePermissions('agent', ['manage_platform'], $this->actor->id))
        ->toThrow(ValidationException::class);
});

it('logs a ROLE_PERMISSIONS_UPDATED activity entry with a before/after diff', function () {
    $this->service->updateRolePermissions('agent', ['view_platform_data'], $this->actor->id);

    $log = \App\Models\ActivityLog::where('action', 'ROLE_PERMISSIONS_UPDATED')->latest()->first();
    expect($log)->not->toBeNull();
    expect($log->properties['after'])->toBe(['view_platform_data']);
});

it('creates a custom role scoped to the catalog', function () {
    $role = $this->service->createRole('Support Lead', ['view_platform_data', 'send_notifications'], $this->actor->id);

    expect($role->is_system)->toBeFalse();
    expect($role->slug)->toBe('support_lead');
    expect($role->permissions->pluck('slug')->all())->toBe(['view_platform_data', 'send_notifications']);
});

it('refuses to delete a system role', function () {
    expect(fn () => $this->service->deleteRole('platform_admin', $this->actor->id))
        ->toThrow(ValidationException::class);
});

it('refuses to delete a custom role that still has an assigned user', function () {
    $role = $this->service->createRole('Billing Agent', ['view_platform_data'], $this->actor->id);
    User::factory()->create(['role' => 'billing_agent', 'role_id' => $role->id]);

    expect(fn () => $this->service->deleteRole('billing_agent', $this->actor->id))
        ->toThrow(ValidationException::class);
});

it('deletes a custom role once no user holds it', function () {
    $role = $this->service->createRole('Temp Role', ['view_platform_data'], $this->actor->id);
    $this->service->deleteRole('temp_role', $this->actor->id);

    expect(Role::where('slug', 'temp_role')->exists())->toBeFalse();
});

it('grants, revokes, and clears a per-user permission override', function () {
    $permRole = Role::where('slug', 'agent')->first();
    $user = User::factory()->create(['role' => 'agent', 'role_id' => $permRole->id]);

    $this->service->setUserPermissionOverride($user->id, 'impersonate_store', true, $this->actor->id);
    expect($user->fresh()->hasPermission('impersonate_store'))->toBeTrue();

    $this->service->setUserPermissionOverride($user->id, 'view_platform_data', false, $this->actor->id);
    expect($user->fresh()->hasPermission('view_platform_data'))->toBeFalse();

    $this->service->setUserPermissionOverride($user->id, 'view_platform_data', null, $this->actor->id);
    expect($user->fresh()->hasPermission('view_platform_data'))->toBeTrue();
});

it('writes an ActivityLog row for every role/permission mutation', function () {
    $this->service->createRole('Logged Role', ['view_platform_data'], $this->actor->id);
    expect(\App\Models\ActivityLog::where('action', 'PLATFORM_ROLE_CREATED')->exists())->toBeTrue();

    $this->service->deleteRole('logged_role', $this->actor->id);
    expect(\App\Models\ActivityLog::where('action', 'PLATFORM_ROLE_DELETED')->exists())->toBeTrue();

    $user = User::factory()->create(['role' => 'agent', 'role_id' => Role::where('slug', 'agent')->value('id')]);
    $this->service->setUserPermissionOverride($user->id, 'impersonate_store', true, $this->actor->id);
    expect(\App\Models\ActivityLog::where('action', 'USER_PERMISSION_OVERRIDE_SET')->exists())->toBeTrue();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminRoleServiceTest`
Expected: FAIL — `AdminRoleService` doesn't exist yet.

- [ ] **Step 3: Create `AdminRoleService.php` with the content above**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminRoleServiceTest`
Expected: PASS (all 9 cases)

- [ ] **Step 5: Commit**

```bash
cd laravel-server
git add app/Services/Admin/AdminRoleService.php tests/Feature/AdminRoleServiceTest.php
git commit -m "feat(server): add AdminRoleService for role/permission CRUD and per-user overrides"
```

---

## Task 8: `AdminRoleController` and its routes

**Files:**
- Create: `laravel-server/app/Http/Controllers/Api/Admin/AdminRoleController.php`
- Modify: `laravel-server/routes/api.php` (add `use` import near line 3-6, add 5 new routes inside the existing `permission:manage_platform` admin group, e.g. right after line 227's `/admin/account-managers`)
- Test: `laravel-server/tests/Feature/AdminRoleControllerTest.php`

**Interfaces:**
- Consumes: `AdminRoleService` (Task 7).
- Produces: `GET /admin/roles`, `POST /admin/roles`, `PUT /admin/roles/{role}/permissions`, `DELETE /admin/roles/{role}`, `PUT /admin/users/{id}/permission-overrides` — all `role:super_admin` gated (role/permission management itself is never delegatable, per spec).

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminRoleController extends AdminBaseController
{
    public function __construct(private AdminRoleService $adminRoleService)
    {
    }

    public function index()
    {
        return $this->withErrorResponse('List Roles', 'Failed to list roles', function () {
            return response()->json(['roles' => $this->adminRoleService->listRoles()]);
        });
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|min:2|max:100',
            'permissions' => 'required|array',
            'permissions.*' => [Rule::in(User::DELEGATABLE_PERMISSIONS)],
        ]);

        return $this->withErrorResponse('Create Role', 'Failed to create role', function () use ($validated, $request) {
            $role = $this->adminRoleService->createRole($validated['name'], $validated['permissions'], $request->user()->id);
            return response()->json(['role' => $role->load('permissions')], 201);
        });
    }

    public function updatePermissions(Request $request, string $role)
    {
        $validated = $request->validate([
            'permissions' => 'required|array',
            'permissions.*' => [Rule::in(User::DELEGATABLE_PERMISSIONS)],
        ]);

        return $this->withErrorResponse('Update Role Permissions', 'Failed to update role permissions', function () use ($validated, $role, $request) {
            $updated = $this->adminRoleService->updateRolePermissions($role, $validated['permissions'], $request->user()->id);
            return response()->json(['role' => $updated]);
        });
    }

    public function destroy(Request $request, string $role)
    {
        return $this->withErrorResponse('Delete Role', 'Failed to delete role', function () use ($role, $request) {
            $this->adminRoleService->deleteRole($role, $request->user()->id);
            return response()->json(['message' => 'Role deleted']);
        });
    }

    public function updateUserPermissionOverrides(Request $request, string $id)
    {
        $validated = $request->validate([
            'overrides' => 'required|array',
            'overrides.*' => 'nullable|boolean',
        ]);

        $allowedKeys = array_diff(array_keys($validated['overrides']), User::DELEGATABLE_PERMISSIONS);
        if ($allowedKeys) {
            return response()->json(['message' => 'Unknown permission(s): ' . implode(', ', $allowedKeys)], 422);
        }

        return $this->withErrorResponse('Update User Permission Overrides', 'Failed to update permission overrides', function () use ($validated, $id, $request) {
            $user = null;
            foreach ($validated['overrides'] as $slug => $granted) {
                $user = $this->adminRoleService->setUserPermissionOverride($id, $slug, $granted, $request->user()->id);
            }
            return response()->json(['user' => $user ?? \App\Models\User::findOrFail($id)]);
        });
    }
}
```

Add to `laravel-server/routes/api.php`, near the other admin controller `use` statements (alphabetically after `AdminPlatformController`):

```php
use App\Http\Controllers\Api\Admin\AdminRoleController;
```

Add inside the `permission:manage_platform` admin group (after line 227's `account-managers` route, before the Email Templates comment at line 229):

```php
            Route::get('/roles', [AdminRoleController::class, 'index'])->middleware('role:super_admin');
            Route::post('/roles', [AdminRoleController::class, 'store'])->middleware('role:super_admin');
            Route::put('/roles/{role}/permissions', [AdminRoleController::class, 'updatePermissions'])->middleware('role:super_admin');
            Route::delete('/roles/{role}', [AdminRoleController::class, 'destroy'])->middleware('role:super_admin');
            Route::put('/users/{id}/permission-overrides', [AdminRoleController::class, 'updateUserPermissionOverrides'])->middleware('role:super_admin');
```

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

beforeEach(function () {
    $this->artisan('migrate')->run();
    $this->superAdmin = User::factory()->create(['role' => 'super_admin', 'role_id' => Role::where('slug', 'super_admin')->value('id')]);
    Sanctum::actingAs($this->superAdmin);
});

it('lists roles via the API', function () {
    $this->getJson('/api/v1/admin/roles')->assertOk()->assertJsonStructure(['roles']);
});

it('creates a custom role via the API', function () {
    $this->postJson('/api/v1/admin/roles', ['name' => 'Support Lead', 'permissions' => ['view_platform_data']])
        ->assertCreated()
        ->assertJsonPath('role.slug', 'support_lead');
});

it('rejects a non-catalog permission on create', function () {
    $this->postJson('/api/v1/admin/roles', ['name' => 'Bad Role', 'permissions' => ['manage_platform']])
        ->assertStatus(422);
});

it('updates a roles permissions via the API', function () {
    $this->putJson('/api/v1/admin/roles/agent/permissions', ['permissions' => ['view_platform_data']])
        ->assertOk();
});

it('deletes an unused custom role via the API', function () {
    $this->postJson('/api/v1/admin/roles', ['name' => 'Temp', 'permissions' => []]);
    $this->deleteJson('/api/v1/admin/roles/temp')->assertOk();
});

it('sets a user permission override via the API', function () {
    $target = User::factory()->create(['role' => 'agent', 'role_id' => Role::where('slug', 'agent')->value('id')]);

    $this->putJson("/api/v1/admin/users/{$target->id}/permission-overrides", [
        'overrides' => ['impersonate_store' => true],
    ])->assertOk();

    expect($target->fresh()->hasPermission('impersonate_store'))->toBeTrue();
});

it('forbids a platform_admin from reaching any of these 5 endpoints', function () {
    $platformAdmin = User::factory()->create(['role' => 'platform_admin', 'role_id' => Role::where('slug', 'platform_admin')->value('id')]);
    Sanctum::actingAs($platformAdmin);

    $this->getJson('/api/v1/admin/roles')->assertForbidden();
    $this->postJson('/api/v1/admin/roles', ['name' => 'x', 'permissions' => []])->assertForbidden();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminRoleControllerTest`
Expected: FAIL — routes/controller don't exist.

- [ ] **Step 3: Create the controller and wire the routes per above**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminRoleControllerTest`
Expected: PASS (all 7 cases)

- [ ] **Step 5: Run the full server suite**

Run: `cd laravel-server && php artisan test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd laravel-server
git add app/Http/Controllers/Api/Admin/AdminRoleController.php routes/api.php tests/Feature/AdminRoleControllerTest.php
git commit -m "feat(server): add admin role and permission-override endpoints"
```

---

## Task 9: Dynamic platform-role whitelist for the profile-edit endpoint

**Files:**
- Modify: `laravel-server/app/Services/Admin/Concerns/UpdatesUserProfiles.php` (the `PLATFORM_ROLES` usage in validation, if referenced there — otherwise the controller)
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php:311` (the `Rule::in(AdminUserService::PLATFORM_ROLES)` validation rule)
- Test: `laravel-server/tests/Feature/Admin/AdminUserProfileUpdateTest.php` (add new cases to the existing file from the earlier profile-edit feature)

**Interfaces:**
- Consumes: `Role::is_system` (Task 2).
- Produces: `AdminUserService::platformRoleSlugs(): array` (new method, or reuse `AdminRoleService`'s private one — make it a public static-callable helper since two classes need it; simplest is to add it as a public method on `UpdatesUserProfiles` trait, since `AdminUserService` already `use`s that trait).

- [ ] **Step 1: Write the failing tests** (append to the existing `AdminUserProfileUpdateTest.php`)

```php
it('accepts a newly created custom platform role for the role field', function () {
    $this->artisan('migrate')->run();
    app(\App\Services\Admin\AdminRoleService::class)->createRole('Support Lead', ['view_platform_data'], $this->superAdmin->id);

    $target = \App\Models\User::factory()->create(['role' => 'agent', 'role_id' => \App\Models\Role::where('slug', 'agent')->value('id')]);

    $this->putJson("/api/v1/admin/users/{$target->id}", ['role' => 'support_lead'])
        ->assertOk();
});

it('still rejects a store-tenant role slug for the role field', function () {
    $target = \App\Models\User::factory()->create(['role' => 'agent', 'role_id' => \App\Models\Role::where('slug', 'agent')->value('id')]);

    $this->putJson("/api/v1/admin/users/{$target->id}", ['role' => 'store_owner'])
        ->assertStatus(422);
});
```

(Match whatever `beforeEach`/`$this->superAdmin` setup the existing file already has — read `laravel-server/tests/Feature/Admin/AdminUserProfileUpdateTest.php` first and follow its exact existing pattern rather than introducing a second one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminUserProfileUpdateTest`
Expected: FAIL — the custom-role case fails because `Rule::in(AdminUserService::PLATFORM_ROLES)` is still the fixed 3-item array and doesn't know about `support_lead`.

- [ ] **Step 3: Add a dynamic platform-role-slugs method**

In `laravel-server/app/Services/Admin/Concerns/UpdatesUserProfiles.php`, add a new public method near `PLATFORM_ROLES`:

```php
    public static function platformRoleSlugs(): array
    {
        return array_merge(
            self::PLATFORM_ROLES,
            \App\Models\Role::where('is_system', false)->pluck('slug')->all(),
        );
    }
```

In `laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php:311`, change:

```php
            'role' => ['sometimes', 'required', 'string', Rule::in(AdminUserService::PLATFORM_ROLES)],
```

to:

```php
            'role' => ['sometimes', 'required', 'string', Rule::in(AdminUserService::platformRoleSlugs())],
```

(Also update the `#[OA\Property(... enum: AdminUserService::PLATFORM_ROLES)]` attribute above it at line 295 for documentation accuracy — OpenAPI enums are static so this stays as the 3 built-ins with a one-line doc comment noting custom roles are also accepted; this is a cosmetic/docs-only limitation, not a behavior gap.)

Also update `AdminRoleService::platformRoleSlugs()` (Task 7) to call this same trait method instead of duplicating the logic — change its private method to:

```php
    private function platformRoleSlugs(): array
    {
        return \App\Services\Admin\Concerns\UpdatesUserProfiles::platformRoleSlugs();
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminUserProfileUpdateTest`
Expected: PASS (both new cases, plus all pre-existing cases in that file still pass — this is a Review Focus item, double check the store-tenant-role-rejection case specifically)

- [ ] **Step 5: Run the full server suite**

Run: `cd laravel-server && php artisan test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd laravel-server
git add app/Services/Admin/Concerns/UpdatesUserProfiles.php app/Http/Controllers/Api/Admin/AdminUserController.php app/Services/Admin/AdminRoleService.php tests/Feature/Admin/AdminUserProfileUpdateTest.php
git commit -m "feat(server): let the profile-edit role field accept custom platform roles"
```

---

## Task 10: Activity Log gains an `actor_role` filter

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminPlatformService.php:482` (the `getActivityLogs()` signature and body)
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminPlatformController.php:170-182` (the `activityLogs()` method and its OA attributes)
- Test: `laravel-server/tests/Feature/ActivityLogActorRoleFilterTest.php`

**Interfaces:**
- Produces: `AdminPlatformService::getActivityLogs(..., $role = null)` — a new, final positional parameter (keeps backward compatibility with every existing call site that doesn't pass it).

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminPlatformService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('filters activity logs by the acting users role', function () {
    $this->artisan('migrate')->run();
    $agent = User::factory()->create(['role' => 'agent', 'role_id' => Role::where('slug', 'agent')->value('id')]);
    $superAdmin = User::factory()->create(['role' => 'super_admin', 'role_id' => Role::where('slug', 'super_admin')->value('id')]);

    ActivityLog::create(['user_id' => $agent->id, 'action' => 'TEST_AGENT_ACTION', 'description' => 'x', 'status' => 'success']);
    ActivityLog::create(['user_id' => $superAdmin->id, 'action' => 'TEST_SUPERADMIN_ACTION', 'description' => 'x', 'status' => 'success']);

    $result = app(AdminPlatformService::class)->getActivityLogs(1, null, null, null, null, null, null, 'agent');

    $actions = collect($result['data'])->pluck('action')->all();
    expect($actions)->toContain('TEST_AGENT_ACTION')->and($actions)->not->toContain('TEST_SUPERADMIN_ACTION');
});

it('returns every role when no role filter is given', function () {
    $this->artisan('migrate')->run();
    $agent = User::factory()->create(['role' => 'agent', 'role_id' => Role::where('slug', 'agent')->value('id')]);
    ActivityLog::create(['user_id' => $agent->id, 'action' => 'TEST_UNFILTERED', 'description' => 'x', 'status' => 'success']);

    $result = app(AdminPlatformService::class)->getActivityLogs(1, null, null, null, null, null, null, null);

    expect(collect($result['data'])->pluck('action')->all())->toContain('TEST_UNFILTERED');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=ActivityLogActorRoleFilterTest`
Expected: FAIL — `getActivityLogs()` doesn't accept an 8th argument yet.

- [ ] **Step 3: Add the parameter**

In `laravel-server/app/Services/Admin/AdminPlatformService.php`, change the signature:

```php
    public function getActivityLogs($page = 1, $search = null, $action = null, $storeId = null, $userId = null, $dateFrom = null, $dateTo = null)
```

to:

```php
    public function getActivityLogs($page = 1, $search = null, $action = null, $storeId = null, $userId = null, $dateFrom = null, $dateTo = null, $role = null)
```

Add, right after the existing `if ($userId) { ... }` block:

```php
        if ($role) {
            $query->whereHas('user', function ($uq) use ($role) {
                $uq->where('role', $role);
            });
        }
```

- [ ] **Step 4: Wire the controller param**

In `laravel-server/app/Http/Controllers/Api/Admin/AdminPlatformController.php:172-182`, add `$request->query('role'),` as a new final argument to the `getActivityLogs(...)` call. Add a matching `new OA\Parameter(name: 'role', in: 'query', schema: new OA\Schema(type: 'string'))` to the method's existing `#[OA\Get(...)]` parameters list.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=ActivityLogActorRoleFilterTest`
Expected: PASS

- [ ] **Step 6: Run the full server suite**

Run: `cd laravel-server && php artisan test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd laravel-server
git add app/Services/Admin/AdminPlatformService.php app/Http/Controllers/Api/Admin/AdminPlatformController.php tests/Feature/ActivityLogActorRoleFilterTest.php
git commit -m "feat(server): add an actor-role filter to the platform activity log"
```

---

## Task 11: Frontend — permission-aware admin auth store

**Files:**
- Modify: `web/lib/store/use-admin-auth-store.ts` (the `User` interface and the exported helper functions)
- Test: `web/__tests__/admin-auth-permission-helpers.test.ts` (new)

**Interfaces:**
- Consumes: `effective_permissions: string[]` on the serialized user (Task 5).
- Produces: `checkHasPermission(user: User | null, slug: string): boolean` — the function every nav-item/action-button gate in Tasks 12-14 calls.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { checkHasPermission, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import type { User } from "@/lib/store/use-admin-auth-store";

function makeUser(overrides: Partial<User>): User {
  return {
    id: "u1",
    email: "a@b.com",
    first_name: "A",
    last_name: "B",
    role: "agent",
    effective_permissions: [],
    ...overrides,
  };
}

describe("checkHasPermission", () => {
  it("returns true for super_admin regardless of effective_permissions", () => {
    const user = makeUser({ role: "super_admin", effective_permissions: [] });
    expect(checkHasPermission(user, "impersonate_store")).toBe(true);
  });

  it("returns true when the slug is in effective_permissions", () => {
    const user = makeUser({ effective_permissions: ["view_platform_data"] });
    expect(checkHasPermission(user, "view_platform_data")).toBe(true);
  });

  it("returns false when the slug is absent", () => {
    const user = makeUser({ effective_permissions: ["view_platform_data"] });
    expect(checkHasPermission(user, "impersonate_store")).toBe(false);
  });

  it("returns false for a null user", () => {
    expect(checkHasPermission(null, "view_platform_data")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run admin-auth-permission-helpers`
Expected: FAIL — `checkHasPermission` and `effective_permissions` don't exist yet.

- [ ] **Step 3: Extend the `User` interface and add the helper**

In `web/lib/store/use-admin-auth-store.ts`, change:

```ts
export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  email_verified_at?: string | null;
  require_email_verification?: boolean;
}
```

to:

```ts
export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  email_verified_at?: string | null;
  require_email_verification?: boolean;
  effective_permissions?: string[];
}
```

Add, alongside the existing `checkIsSuperAdmin`/`checkCanAccessAdmin` exports:

```ts
export function checkHasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (checkIsSuperAdmin(user.role)) return true;
  return (user.effective_permissions ?? []).includes(permission);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run admin-auth-permission-helpers`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd web
git add lib/store/use-admin-auth-store.ts __tests__/admin-auth-permission-helpers.test.ts
git commit -m "feat(web): add a permission-aware check alongside the admin auth store's role checks"
```

---

## Task 12: Frontend — permission-aware sidebar visibility

**Files:**
- Modify: `web/components/admin/sidebar-items.ts` (the `AdminSidebarItem` interface and `visibleSidebarItems` signature)
- Modify: whatever file calls `visibleSidebarItems` today (locate it first — grep `web/components/admin/admin-sidebar.tsx` for the call site and update it to pass the full user object instead of just `role`)
- Test: `web/__tests__/sidebar-items-permission-visibility.test.ts` (new)

**Interfaces:**
- Consumes: `checkHasPermission` (Task 11).
- Produces: `visibleSidebarItems(user: { role?: string; effective_permissions?: string[] } | undefined): AdminSidebarItem[]` (signature change — was `visibleSidebarItems(role: string | undefined)`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { sidebarItems, visibleSidebarItems } from "@/components/admin/sidebar-items";

describe("visibleSidebarItems", () => {
  it("still shows a role-only item to a user whose role matches", () => {
    const items = visibleSidebarItems({ role: "super_admin", effective_permissions: [] });
    expect(items.length).toBeGreaterThan(0);
  });

  it("shows a permission-gated item to an agent who holds the permission", () => {
    const stores = sidebarItems.find((i) => i.id === "stores");
    expect(stores?.permissions).toContain("view_platform_data");

    const items = visibleSidebarItems({ role: "agent", effective_permissions: ["view_platform_data"] });
    expect(items.some((i) => i.id === "stores")).toBe(true);
  });

  it("hides a permission-gated item from an agent who lacks the permission", () => {
    const items = visibleSidebarItems({ role: "agent", effective_permissions: [] });
    expect(items.some((i) => i.id === "stores")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run sidebar-items-permission-visibility`
Expected: FAIL — `visibleSidebarItems` only takes a bare role string today and the `stores` item has no `permissions` field.

- [ ] **Step 3: Update `sidebar-items.ts`**

Change the interface:

```ts
export interface AdminSidebarItem {
  id: string;
  name: string;
  icon: LucideIcon;
  href: string;
  roles?: string[];
  permissions?: string[];
}
```

Find the `stores`, `users`/platform-users, and `activity`/activity-log entries in the `sidebarItems` array and add `permissions: ["view_platform_data"]` to each (read the existing array first to match the exact `id` values used — do not guess ids, copy them verbatim from the file).

Change the function:

```ts
export function visibleSidebarItems(role: string | undefined): AdminSidebarItem[] {
  return sidebarItems.filter((item) =>
    (item.roles ?? SUPER_ADMIN_ONLY).includes(role ?? ""),
  );
}
```

to:

```ts
import { checkHasPermission } from "@/lib/store/use-admin-auth-store";

export function visibleSidebarItems(
  user: { role?: string; effective_permissions?: string[] } | undefined,
): AdminSidebarItem[] {
  const role = user?.role ?? "";
  return sidebarItems.filter((item) => {
    const roleAllowed = (item.roles ?? SUPER_ADMIN_ONLY).includes(role);
    if (!item.permissions) return roleAllowed;
    return roleAllowed || item.permissions.some((p) => checkHasPermission(user as never, p));
  });
}
```

(The `roleAllowed || permission-check` union means: an item with both `roles` and `permissions` is visible if EITHER matches — in practice, give the 3 nav items above `roles: ["super_admin", "platform_admin", "agent"]` alongside their new `permissions`, so a super_admin always sees them via the role check, and a platform_admin/agent sees them only when they actually hold the permission.)

- [ ] **Step 4: Update the call site**

Read `web/components/admin/admin-sidebar.tsx`, find where `visibleSidebarItems(role)` (or similar) is called, and change it to pass the full user object from `useAdminAuthStore` instead of just `.role`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run sidebar-items-permission-visibility`
Expected: PASS

- [ ] **Step 6: Run the full web suite**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS — check for any other caller of `visibleSidebarItems` whose signature just changed.

- [ ] **Step 7: Commit**

```bash
cd web
git add components/admin/sidebar-items.ts components/admin/admin-sidebar.tsx __tests__/sidebar-items-permission-visibility.test.ts
git commit -m "feat(web): gate stores/users/activity-log nav items by permission, not just role"
```

---

## Task 13: Frontend — API hooks for role/permission management

**Files:**
- Create: `web/lib/api/admin-hooks-roles.ts`
- Create: `web/lib/constants/platform-permissions.ts`
- Test: covered by Tasks 14-15's component tests (this task is pure wiring with no independent behavior to unit test beyond a typecheck)

**Interfaces:**
- Produces: `useAdminRoles()`, `useUpdateRolePermissionsMutation()`, `useCreateRoleMutation()`, `useDeleteRoleMutation()`, `useUpdateUserPermissionOverridesMutation()`. `PLATFORM_PERMISSION_OPTIONS: readonly {value,label,description}[]`.

- [ ] **Step 1: Create the permission options constant**

```ts
export interface PlatformPermissionOption {
  value: string;
  label: string;
  description: string;
}

/** The 5 capabilities a superadmin can delegate — must match
 * User::DELEGATABLE_PERMISSIONS in laravel-server/app/Models/User.php. */
export const PLATFORM_PERMISSION_OPTIONS: readonly PlatformPermissionOption[] = [
  { value: "view_platform_data", label: "View Platform Data", description: "View stores, platform users and activity logs" },
  { value: "send_notifications", label: "Send Notifications", description: "Send user notifications and manage broadcasts" },
  { value: "reset_user_passwords", label: "Reset Passwords", description: "Force-reset a user's password" },
  { value: "manage_account_status", label: "Manage Account Status", description: "Suspend or reactivate a store or user" },
  { value: "impersonate_store", label: "Store Impersonation", description: "View a store's data as if logged in as them" },
] as const;
```

- [ ] **Step 2: Create the hooks file**

Read `web/lib/api/admin-hooks-users.ts` first to copy its exact import style and `webApiClient.request` pattern. Then write:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";

export interface AdminRole {
  id: number;
  name: string;
  slug: string;
  is_system: boolean;
  permissions: string[];
  user_count: number;
}

export const useAdminRoles = () =>
  useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => webApiClient.request<{ roles: AdminRole[] }>("admin/roles"),
  });

export const useUpdateRolePermissionsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, permissions }: { slug: string; permissions: string[] }) =>
      webApiClient.request<unknown>(`admin/roles/${slug}/permissions`, { method: "PUT", body: { permissions } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
};

export const useCreateRoleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, permissions }: { name: string; permissions: string[] }) =>
      webApiClient.request<unknown>("admin/roles", { method: "POST", body: { name, permissions } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
};

export const useDeleteRoleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => webApiClient.request<unknown>(`admin/roles/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
  });
};

export const useUpdateUserPermissionOverridesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, overrides }: { id: string; overrides: Record<string, boolean | null> }) =>
      webApiClient.request<unknown>(`admin/users/${id}/permission-overrides`, { method: "PUT", body: { overrides } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
};
```

(Adjust `webApiClient.request<T>(path, { method, body })`'s exact call shape to match whatever `admin-hooks-users.ts` actually does, verbatim — the signature above is inferred from Task description context and must be double-checked against the real file before committing.)

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: PASS (no runtime behavior to test yet — these hooks are exercised by Tasks 14-15's component tests)

- [ ] **Step 4: Commit**

```bash
cd web
git add lib/api/admin-hooks-roles.ts lib/constants/platform-permissions.ts
git commit -m "feat(web): add API hooks for admin role and permission-override management"
```

---

## Task 14: Frontend — "Admin Permissions" card in Platform Settings

**Files:**
- Create: `web/components/admin/views/admin-permissions-card.tsx`
- Modify: whichever file renders `SubscriptionConfigTab` as a Platform Settings tab (locate by grepping `web/app/admin` for `SubscriptionConfigTab` — add a new sibling tab entry, do not add this card inside `subscription-config-tab.tsx` itself, since that file is already 399 lines and this is a logically separate settings concern)
- Test: `web/__tests__/admin-permissions-card.test.tsx` (new)

**Interfaces:**
- Consumes: `useAdminRoles`, `useUpdateRolePermissionsMutation`, `useCreateRoleMutation`, `useDeleteRoleMutation` (Task 13), `PLATFORM_PERMISSION_OPTIONS` (Task 13).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminPermissionsCard } from "@/components/admin/views/admin-permissions-card";

vi.mock("@/lib/api/admin-hooks-roles", () => ({
  useAdminRoles: () => ({
    data: {
      roles: [
        { id: 1, name: "Platform Admin", slug: "platform_admin", is_system: true, permissions: ["view_platform_data"], user_count: 2 },
        { id: 2, name: "Agent", slug: "agent", is_system: true, permissions: ["view_platform_data"], user_count: 1 },
      ],
    },
    isLoading: false,
  }),
  useUpdateRolePermissionsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("AdminPermissionsCard", () => {
  it("renders one row per catalog permission and one column per role", () => {
    render(<AdminPermissionsCard />);
    expect(screen.getByText("View Platform Data")).toBeInTheDocument();
    expect(screen.getByText("Platform Admin")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("does not show a delete action for a system role", () => {
    render(<AdminPermissionsCard />);
    expect(screen.queryByRole("button", { name: /delete platform admin/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run admin-permissions-card`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write the component**

Build a straightforward checkbox-matrix component: rows = `PLATFORM_PERMISSION_OPTIONS`, columns = `useAdminRoles()`'s `roles` array. Each cell is a checkbox bound to whether `role.permissions.includes(permission.value)`, calling `useUpdateRolePermissionsMutation()` on change with the role's full updated permission list. A "New Role" button opens a small inline form (name input + the same 5 checkboxes) calling `useCreateRoleMutation()`. Each non-`is_system` column header shows a delete button calling `useDeleteRoleMutation()`, gated behind a `ConfirmDialog` (reuse `@/components/ui/confirm-dialog`, following `subscription-config-tab.tsx`'s existing confirm-before-destructive-action pattern). Follow this codebase's existing Shadcn table/checkbox component conventions (check a neighboring admin settings card for the exact `Table`/`Checkbox` import paths rather than guessing).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run admin-permissions-card`
Expected: PASS

- [ ] **Step 5: Register the new tab**

Grep `web/app/admin` for `SubscriptionConfigTab`, read the hosting file, and add `AdminPermissionsCard` as a sibling tab entry in the same tab list (same pattern, new tab id/label like "Admin Permissions").

- [ ] **Step 6: Run the full web suite**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd web
git add components/admin/views/admin-permissions-card.tsx __tests__/admin-permissions-card.test.tsx
git commit -m "feat(web): add the Admin Permissions matrix to Platform Settings"
```

(Commit the tab-registration file change separately if it's a distinct, larger file — otherwise fold it into the same commit.)

---

## Task 15: Frontend — per-admin permission override tab in the user profile dialog

**Files:**
- Modify: `web/components/admin/users/user-profile-dialog.tsx`
- Create: `web/components/admin/users/user-permission-overrides-form.tsx`
- Test: `web/__tests__/user-permission-overrides-form.test.tsx` (new)

**Interfaces:**
- Consumes: `useUpdateUserPermissionOverridesMutation` (Task 13), `checkHasPermission`/`checkIsSuperAdmin` (Task 11), `PLATFORM_PERMISSION_OPTIONS` (Task 13).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserPermissionOverridesForm } from "@/components/admin/users/user-permission-overrides-form";

vi.mock("@/lib/api/admin-hooks-roles", () => ({
  useUpdateUserPermissionOverridesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("UserPermissionOverridesForm", () => {
  it("renders a 3-state control per catalog permission for a platform_admin target", () => {
    render(
      <UserPermissionOverridesForm
        user={{ id: "u1", role: "platform_admin", effective_permissions: ["view_platform_data"] }}
      />,
    );
    expect(screen.getByText("View Platform Data")).toBeInTheDocument();
    expect(screen.getByText("Store Impersonation")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run user-permission-overrides-form`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write the component**

One row per `PLATFORM_PERMISSION_OPTIONS` entry, each a 3-way control (e.g. a `Select` with "Inherited" / "Granted" / "Revoked", or three radio buttons — follow whatever 3-state pattern already exists elsewhere in this codebase's Shadcn components, checking first). "Inherited" sends `null` for that key, "Granted" sends `true`, "Revoked" sends `false`, batched into one `overrides` object and submitted via `useUpdateUserPermissionOverridesMutation().mutateAsync({ id: user.id, overrides })` on save.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run user-permission-overrides-form`
Expected: PASS

- [ ] **Step 5: Wire into `user-profile-dialog.tsx`**

Add a new section/tab "Permissions" alongside the existing "Edit Profile" affordance, visible only when `selectedUser.role !== "super_admin"` AND `checkIsSuperAdmin(viewerRole)` (the same `canEdit` gate the file already computes) — read the file's current structure (per the earlier exploration: a single `Dialog`, not tabbed) and decide whether to add a second toggleable mode (like `isEditing`) or a simple two-button row ("Edit Profile" / "Manage Permissions") switching which panel renders, matching the existing `isEditing` pattern's shape rather than introducing real tab components if the file doesn't already use them.

- [ ] **Step 6: Run the full web suite**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Browser smoke test (Review Focus item)**

Start the local dev stack (`laravel-server`'s `php artisan serve` + `web`'s dev server), log in to the admin panel as a super_admin, open a `platform_admin` user's profile, confirm the "Manage Permissions" option does NOT appear for a `super_admin`-role user and DOES appear for the `platform_admin` one, toggle one permission, save, and confirm the change round-trips (refresh and see it persisted).

- [ ] **Step 8: Commit**

```bash
cd web
git add components/admin/users/user-profile-dialog.tsx components/admin/users/user-permission-overrides-form.tsx __tests__/user-permission-overrides-form.test.tsx
git commit -m "feat(web): let a superadmin override an individual admin's permissions"
```

---

## Task 16: Frontend — Team Activity actor-role filter

**Files:**
- Modify: `web/app/admin/activity/page.tsx` (add a `roleFilter` state and a new `DropdownMenu` filter, following the existing `ACTION_FILTERS` pattern exactly)
- Modify: `web/lib/api/admin-activity-hooks.ts` (thread the new `role` param through `useAdminActivityLogs`'s call, matching the existing positional-argument order established by `AdminPlatformService::getActivityLogs` in Task 10)
- Test: `web/__tests__/admin-activity-role-filter.test.tsx` (new, or extend an existing activity-page test file if one already exists — check first)

**Interfaces:**
- Consumes: the `role` query param (Task 10).

- [ ] **Step 1: Read the existing `ACTION_FILTERS` implementation in `web/app/admin/activity/page.tsx` in full**, to copy its exact `DropdownMenu` JSX structure and state-handling pattern.

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActivityPage from "@/app/admin/activity/page";

const mockUseAdminActivityLogs = vi.fn(() => ({ data: { data: [] }, isLoading: false }));
vi.mock("@/lib/api/admin-activity-hooks", () => ({
  useAdminActivityLogs: (...args: unknown[]) => mockUseAdminActivityLogs(...args),
}));

describe("Activity page actor-role filter", () => {
  it("passes the selected role through to useAdminActivityLogs", () => {
    render(<ActivityPage />);
    fireEvent.click(screen.getByRole("button", { name: /role/i }));
    fireEvent.click(screen.getByText("Agent"));

    expect(mockUseAdminActivityLogs).toHaveBeenLastCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      "agent",
    );
  });
});
```

(Adjust the exact assertion to however `useAdminActivityLogs` is actually called once you've read the file in Step 1 — positional vs. named args.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npx vitest run admin-activity-role-filter`
Expected: FAIL — no role filter UI exists.

- [ ] **Step 4: Add the filter**

Add a `roleFilter` state variable and a new `DropdownMenu` populated from a static `ROLE_FILTERS` array (built from `PLATFORM_ROLE_OPTIONS` plus the store-level role slugs already in `RolesAndPermissionsSeeder.php` — or, simpler and sufficient for v1, just the 3 platform roles plus any custom roles fetched via `useAdminRoles()`, since filtering activity by a store-tenant role is out of this feature's scope), placed in the toolbar next to the existing `ACTION_FILTERS` dropdown. Thread `roleFilter` into the `useAdminActivityLogs(...)` call as the new final argument.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npx vitest run admin-activity-role-filter`
Expected: PASS

- [ ] **Step 6: Run the full web suite**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd web
git add app/admin/activity/page.tsx lib/api/admin-activity-hooks.ts __tests__/admin-activity-role-filter.test.tsx
git commit -m "feat(web): add an actor-role filter to the Team Activity view"
```

---

## Task 17: Nav/action gating sweep and final browser smoke test

**Files:**
- Modify: whichever admin pages render the suspend/reactivate, notify/broadcast, reset-password, and impersonate buttons (locate each by grepping for the corresponding API hook calls, e.g. `useDeactivateUserMutation`, `useImpersonateStoreMutation` or similar in `web/components/admin/`)
- No new test file — this task is verification-only, confirming Tasks 11-16's gating actually covers every action button, not just nav items.

- [ ] **Step 1: Grep for every admin action button whose backend route moved to a `permission:*` middleware in Task 6** (suspend/unsuspend, deactivate/reactivate, reset-password, notify/bulk-notify, broadcast create/edit/delete, impersonate). For each, confirm it's wrapped in a `checkHasPermission(viewerUser, '<matching slug>')` conditional (disable or hide the button) — add the wrapper where missing, following whatever conditional-rendering pattern that specific component already uses for its existing role checks.

- [ ] **Step 2: Run the full web suite**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Full-stack browser smoke test**

With `laravel-server` and `web` both running locally: create a `platform_admin` test account, log in as it, confirm the Stores/Users/Activity Log nav items are visible (default `view_platform_data` grant) and the suspend/impersonate buttons work. Then, as super_admin, revoke `manage_account_status` from the `platform_admin` role via the new Admin Permissions card, refresh the `platform_admin` session, and confirm the suspend button disappears and a direct API call to the suspend endpoint now 403s.

- [ ] **Step 4: Run both full suites one final time**

Run: `cd laravel-server && php artisan test` and `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS, full green

- [ ] **Step 5: Commit**

```bash
cd web
git add -A
git commit -m "feat(web): gate every delegated admin action button by permission, not just its nav entry"
```
