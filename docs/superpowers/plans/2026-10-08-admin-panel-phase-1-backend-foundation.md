# Admin Panel Improvements — Phase 1: Backend Foundation & Safety Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every `laravel-server/` change the admin-panel UI phases depend on, plus the four destructive-action defects found while surveying, so the UI phases are pure frontend work.

**Architecture:** Two list endpoints (`GET /admin/stores`, `GET /admin/users`) gain filter and sort parameters. Because both service methods are already at the limit of what a positional parameter list can carry (`getStores()` has six), each gains a small readonly filter object built in the controller from the validated request; both delegate sort-column resolution to one shared allow-list resolver so no request value ever reaches `orderBy()`. Separately, `deleteUser()` gains the self-deletion and platform-role guards it never had, a new referrer-reassignment endpoint mirrors the existing account-manager one, and `standardizeCatalog()` gains a dry-run and store scoping.

**Tech Stack:** Laravel 11, PHP 8.2+ readonly classes, Pest/PHPUnit feature tests (`#[Test]` attributes, `RefreshDatabase`), MySQL (InnoDB) in production / SQLite in tests.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-panel-improvements-design.md`

## Global Constraints

- **Files strictly below 350 lines.** `AdminUserService.php` and `AdminStoreService.php` are already large; new logic goes in new classes rather than widening them (the same reason `AdminUserDeviceService` exists).
- **No inline comments explaining what code does or why a choice was made.** Maximum 2 lines for a hyper-local hack. Decisions belong in `/docs` or the relevant `AGENTS.md`.
- **Never use MySQL `NOW()`/`CURRENT_TIMESTAMP()` in raw SQL.** Let Eloquent set timestamps. (Root `AGENTS.md` §7.)
- **No dynamic bracket lookup `obj[key]` from request input.** Use `match` or a strict allow-list. (Root `AGENTS.md` §8.) This is load-bearing for the sort work: an unvalidated `sort` param reaching `orderBy()` is a SQL injection surface.
- **Pagination stays at its current page size.** Do not change `paginate(10, ...)` in this phase.
- **Conventional Commits, single sentence, no multiline body.** (Root `AGENTS.md` §10.)
- **No `Co-Authored-By` trailer in this repo.**
- **Docs ship with the code, never after it.** Every task that changes documented behavior updates the doc in the same commit.
- Sortable store columns, exactly: `name`, `created_at`, `status`, `total_revenue`.
- Sortable user columns, exactly: `name` (→ `first_name` then `last_name`), `email`, `created_at`, `last_login_at`, `role`.
- Demo filter values, exactly: `all` (default), `only`, `exclude`.
- Purge confirmation literal, exactly: `DumosRx`.

## Review Focus

Five conditions the spec implies but which no task's happy path exercises. Each has a test assigned to the task that owns the code.

1. **A hostile `sort` value** (`name; DROP TABLE users`, `users.password`, an array, a 10KB string) must fall back to the default ordering and never reach `orderBy()` — Task 1.
2. **`deleteUser()` called with the acting admin's own id** must refuse, including when that admin is the last super admin — Task 4.
3. **Reassigning a referrer to a user who is already the referrer, or to the owner themselves** (a self-referral cycle) must refuse rather than write a row pointing at itself — Task 5.
4. **`demo=only` combined with `archived=only`** must apply both filters, not the last one written — Task 2.
5. **The dry-run of `standardizeCatalog()`** must write nothing, including when it reports a non-zero count, and must report the same count the real run then affects — Task 6.

---

## File Structure

**Create:**
- `laravel-server/app/Services/Admin/Support/ListSortResolver.php` — the only place a request `sort`/`direction` pair becomes a column name and direction. Shared by both list endpoints.
- `laravel-server/app/Services/Admin/Filters/StoreListFilters.php` — readonly carrier for the store list's eight parameters.
- `laravel-server/app/Services/Admin/Filters/UserListFilters.php` — readonly carrier for the user list's seven parameters.
- `laravel-server/tests/Feature/Admin/AdminListSortingTest.php`
- `laravel-server/tests/Feature/Admin/AdminStoreDemoFilterTest.php`
- `laravel-server/tests/Feature/Admin/AdminUserDeletionGuardsTest.php`
- `laravel-server/tests/Feature/Admin/AdminStoreReferrerTest.php`
- `laravel-server/tests/Feature/Admin/AdminCatalogStandardizeTest.php`

**Modify:**
- `laravel-server/app/Services/Admin/AdminStoreService.php:103` — `getStores()` takes `StoreListFilters`; adds the demo filter and the sort application.
- `laravel-server/app/Services/Admin/AdminUserService.php:163` — `getGlobalUsers()` takes `UserListFilters`; adds the sort application.
- `laravel-server/app/Services/Admin/AdminUserService.php:412` — `deleteUser()` gains the guards.
- `laravel-server/app/Services/Admin/AdminCatalogService.php:112` — `standardizeCatalog()` gains `$dryRun` and `$storeId`.
- `laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php:47` — builds `StoreListFilters`; new `updateReferrer()` action.
- `laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php:42` — builds `UserListFilters`.
- `laravel-server/app/Http/Controllers/Api/Admin/AdminPlatformController.php:107` — passes dry-run/scope through; corrected OpenAPI summary.
- `laravel-server/routes/api.php:246` — the referrer route.
- `web/components/admin/users/delete-user-dialog.tsx` — honest copy (§7.2).
- `web/components/admin/stores/store-delete-dialogs.tsx` — owner-removal copy (§7.3).
- `laravel-server/AGENTS.md`, `docs/KNOWN_BUGS.md`, `docs/FIXED_BUGS.md`, `docs/ADMIN_STORE_LIFECYCLE.md`.

**Why a filter object rather than more parameters.** `getStores()` already takes six positional arguments; this phase adds three more (`demo`, `sort`, `direction`). Nine positional arguments at a call site is unreadable and mis-ordering two of them is a silent bug. Both methods have exactly one caller each (their controller — every test drives the HTTP endpoint), so the refactor is contained.

---

## Task 1: The sort allow-list resolver

**Files:**
- Create: `laravel-server/app/Services/Admin/Support/ListSortResolver.php`
- Create: `laravel-server/tests/Unit/Admin/ListSortResolverTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `ListSortResolver::storeColumns(): array`, `ListSortResolver::userColumns(): array`, `ListSortResolver::direction(?string $direction): string`. Each `*Columns()` call returns the ordered list of real column names for the given sort key, or `[]` when the key is unrecognised. Returning a *list* is deliberate: the users list's `name` sorts by `first_name` then `last_name`, so a single-column return type would not express it.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Unit/Admin/ListSortResolverTest.php`:

```php
<?php

namespace Tests\Unit\Admin;

use App\Services\Admin\Support\ListSortResolver;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ListSortResolverTest extends TestCase
{
    #[Test]
    public function it_resolves_each_allow_listed_store_column(): void
    {
        $this->assertSame(['stores.name'], ListSortResolver::storeColumns('name'));
        $this->assertSame(['stores.created_at'], ListSortResolver::storeColumns('created_at'));
        $this->assertSame(['stores.status'], ListSortResolver::storeColumns('status'));
        $this->assertSame(['total_revenue'], ListSortResolver::storeColumns('total_revenue'));
    }

    #[Test]
    public function it_resolves_each_allow_listed_user_column(): void
    {
        $this->assertSame(['users.first_name', 'users.last_name'], ListSortResolver::userColumns('name'));
        $this->assertSame(['users.email'], ListSortResolver::userColumns('email'));
        $this->assertSame(['users.created_at'], ListSortResolver::userColumns('created_at'));
        $this->assertSame(['users.last_login_at'], ListSortResolver::userColumns('last_login_at'));
        $this->assertSame(['users.role'], ListSortResolver::userColumns('role'));
    }

    #[Test]
    public function it_rejects_columns_that_are_computed_after_the_query(): void
    {
        $this->assertSame([], ListSortResolver::storeColumns('plan'));
        $this->assertSame([], ListSortResolver::storeColumns('owner'));
        $this->assertSame([], ListSortResolver::userColumns('last_sync'));
        $this->assertSame([], ListSortResolver::userColumns('store'));
    }

    #[Test]
    public function it_rejects_hostile_sort_values(): void
    {
        $hostile = [
            'name; DROP TABLE users',
            'users.password',
            '(SELECT 1)',
            'name,email',
            'NAME',
            str_repeat('a', 10000),
            '',
            null,
        ];

        foreach ($hostile as $value) {
            $this->assertSame([], ListSortResolver::storeColumns($value), 'store: '.var_export($value, true));
            $this->assertSame([], ListSortResolver::userColumns($value), 'user: '.var_export($value, true));
        }
    }

    #[Test]
    public function it_defaults_direction_to_desc_and_only_accepts_an_exact_asc(): void
    {
        $this->assertSame('asc', ListSortResolver::direction('asc'));
        $this->assertSame('desc', ListSortResolver::direction('desc'));
        $this->assertSame('desc', ListSortResolver::direction('ASC'));
        $this->assertSame('desc', ListSortResolver::direction('ascending'));
        $this->assertSame('desc', ListSortResolver::direction(null));
        $this->assertSame('desc', ListSortResolver::direction(''));
    }
}
```

Note on `direction('ASC')` returning `desc`: the resolver does no case folding. The client sends exactly `asc` or `desc`; anything else is not a direction this API accepts, and silently normalising near-misses hides a client bug. `desc` is the pre-existing default ordering (`latest()`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Unit/Admin/ListSortResolverTest.php`
Expected: FAIL — `Class "App\Services\Admin\Support\ListSortResolver" not found`

- [ ] **Step 3: Write minimal implementation**

Create `laravel-server/app/Services/Admin/Support/ListSortResolver.php`:

```php
<?php

namespace App\Services\Admin\Support;

/**
 * Turns a request's `sort`/`direction` pair into real column names. The
 * match arms ARE the allow-list: an unrecognised key returns no columns and
 * the caller keeps its default ordering, so no request value can reach
 * orderBy(). See docs/superpowers/specs/2026-10-08-admin-panel-improvements-design.md
 * for which visible columns are deliberately absent and why.
 *
 * @return list<string>
 */
class ListSortResolver
{
    public static function storeColumns(mixed $sort): array
    {
        return match ($sort) {
            'name' => ['stores.name'],
            'created_at' => ['stores.created_at'],
            'status' => ['stores.status'],
            'total_revenue' => ['total_revenue'],
            default => [],
        };
    }

    public static function userColumns(mixed $sort): array
    {
        return match ($sort) {
            'name' => ['users.first_name', 'users.last_name'],
            'email' => ['users.email'],
            'created_at' => ['users.created_at'],
            'last_login_at' => ['users.last_login_at'],
            'role' => ['users.role'],
            default => [],
        };
    }

    public static function direction(mixed $direction): string
    {
        return $direction === 'asc' ? 'asc' : 'desc';
    }
}
```

`match` uses identity comparison, so a non-string `$sort` (an array from `?sort[]=x`) falls to `default` without a type error — which is why the parameters are `mixed` rather than `?string`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Unit/Admin/ListSortResolverTest.php`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Services/Admin/Support/ListSortResolver.php laravel-server/tests/Unit/Admin/ListSortResolverTest.php
git commit -m "feat: add an allow-list resolver for admin list sort params"
```

---

## Task 2: Store list filters — demo filter and sorting

**Files:**
- Create: `laravel-server/app/Services/Admin/Filters/StoreListFilters.php`
- Create: `laravel-server/tests/Feature/Admin/AdminStoreDemoFilterTest.php`
- Modify: `laravel-server/app/Services/Admin/AdminStoreService.php:103`
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php:47`

**Interfaces:**
- Consumes: `ListSortResolver::storeColumns()`, `ListSortResolver::direction()` from Task 1.
- Produces: `StoreListFilters` with public readonly properties `page`, `search`, `status`, `plan`, `archived`, `demo`, `sort`, `direction`, `includeRevenue`, plus `StoreListFilters::fromRequest(Request $request, bool $includeRevenue): self`. `AdminStoreService::getStores(StoreListFilters $filters): array` — the array shape is unchanged from today.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminStoreDemoFilterTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * GET /admin/stores `demo` param, and its independence from `archived`.
 */
class AdminStoreDemoFilterTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeStore(string $name, bool $isDemo, bool $archived = false): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'name' => $name,
            'user_id' => $owner->id,
            'is_demo' => $isDemo,
        ]);

        if ($archived) {
            $store->delete();
        }

        return $store;
    }

    private function names(array $json): array
    {
        return collect($json['data'])->pluck('name')->sort()->values()->all();
    }

    #[Test]
    public function it_returns_every_store_when_no_demo_filter_is_given(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/admin/stores');

        $response->assertOk();
        $this->assertSame(['Demo Pharmacy', 'Real Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_returns_only_demo_stores_for_demo_only(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/admin/stores?demo=only');

        $response->assertOk();
        $this->assertSame(['Demo Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_excludes_demo_stores_for_demo_exclude(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/admin/stores?demo=exclude');

        $response->assertOk();
        $this->assertSame(['Real Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_ignores_an_unrecognised_demo_value_rather_than_erroring(): void
    {
        $this->makeStore('Real Pharmacy', false);
        $this->makeStore('Demo Pharmacy', true);

        $response = $this->actingAs($this->superAdmin)->getJson('/api/admin/stores?demo=maybe');

        $response->assertOk();
        $this->assertSame(['Demo Pharmacy', 'Real Pharmacy'], $this->names($response->json()));
    }

    #[Test]
    public function it_applies_the_demo_and_archived_filters_together(): void
    {
        $this->makeStore('Live Real', false);
        $this->makeStore('Live Demo', true);
        $this->makeStore('Archived Real', false, archived: true);
        $this->makeStore('Archived Demo', true, archived: true);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/admin/stores?demo=only&archived=only');

        $response->assertOk();
        $this->assertSame(['Archived Demo'], $this->names($response->json()));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminStoreDemoFilterTest.php`
Expected: FAIL — `it_returns_only_demo_stores_for_demo_only` and `it_applies_the_demo_and_archived_filters_together` fail because the `demo` param is ignored today; the three others pass already.

- [ ] **Step 3: Write minimal implementation — the filter object**

Create `laravel-server/app/Services/Admin/Filters/StoreListFilters.php`:

```php
<?php

namespace App\Services\Admin\Filters;

use Illuminate\Http\Request;

class StoreListFilters
{
    public function __construct(
        public readonly int $page = 1,
        public readonly ?string $search = null,
        public readonly ?string $status = null,
        public readonly ?string $plan = null,
        public readonly string $archived = 'active',
        public readonly string $demo = 'all',
        public readonly mixed $sort = null,
        public readonly mixed $direction = null,
        public readonly bool $includeRevenue = false,
    ) {}

    public static function fromRequest(Request $request, bool $includeRevenue): self
    {
        return new self(
            page: max(1, (int) $request->query('page', 1)),
            search: $request->query('search'),
            status: $request->query('status'),
            plan: $request->query('plan'),
            archived: in_array($request->query('archived'), ['only', 'all'], true)
                ? $request->query('archived')
                : 'active',
            demo: in_array($request->query('demo'), ['only', 'exclude'], true)
                ? $request->query('demo')
                : 'all',
            sort: $request->query('sort'),
            direction: $request->query('direction'),
            includeRevenue: $includeRevenue,
        );
    }
}
```

- [ ] **Step 4: Write minimal implementation — the service**

In `laravel-server/app/Services/Admin/AdminStoreService.php`, change the signature at line 103 and apply the two new filters. Keep the existing revenue-subquery comment block exactly where it is.

```php
public function getStores(StoreListFilters $filters)
{
    // ... existing comment block and $query construction unchanged ...

    if ($filters->archived === 'only') {
        $query->onlyTrashed();
    } elseif ($filters->archived === 'all') {
        $query->withTrashed();
    }

    if ($filters->demo === 'only') {
        $query->where('is_demo', true);
    } elseif ($filters->demo === 'exclude') {
        $query->where('is_demo', false);
    }

    // ... existing search / status / plan blocks, reading $filters->search etc ...

    $sortColumns = ListSortResolver::storeColumns($filters->sort);

    if ($sortColumns === []) {
        $query->latest();
    } else {
        $direction = ListSortResolver::direction($filters->direction);
        foreach ($sortColumns as $column) {
            $query->orderBy($column, $direction);
        }
    }

    $paginator = $query->paginate(10, ['*'], 'page', $filters->page);

    // ... existing mapping unchanged, reading $filters->includeRevenue ...
}
```

Add the two imports at the top of the file:

```php
use App\Services\Admin\Filters\StoreListFilters;
use App\Services\Admin\Support\ListSortResolver;
```

- [ ] **Step 5: Write minimal implementation — the controller**

In `laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php`, replace the body of `stores()` (lines 49-58) with:

```php
return $this->withErrorResponse('Stores', 'Failed to fetch stores', function () use ($request) {
    $includeRevenue = (bool) $request->user()?->hasRole('super_admin');
    $payload = $this->adminStoreService->getStores(
        StoreListFilters::fromRequest($request, $includeRevenue),
    );

    if ($includeRevenue) {
        $payload['stock_value_by_currency'] = $this->fleetMetrics->stockValueByCurrency();
    }

    return response()->json($payload);
});
```

Add to the `#[OA\Get]` attribute's `parameters` array, beside the existing `archived` parameter:

```php
new OA\Parameter(name: 'demo', in: 'query', description: 'all (default), only, or exclude', schema: new OA\Schema(type: 'string', enum: ['all', 'only', 'exclude'])),
new OA\Parameter(name: 'sort', in: 'query', description: 'name, created_at, status or total_revenue. Anything else keeps the default newest-first ordering.', schema: new OA\Schema(type: 'string', enum: ['name', 'created_at', 'status', 'total_revenue'])),
new OA\Parameter(name: 'direction', in: 'query', description: 'asc or desc (default)', schema: new OA\Schema(type: 'string', enum: ['asc', 'desc'])),
```

And import `use App\Services\Admin\Filters\StoreListFilters;`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminStoreDemoFilterTest.php`
Expected: PASS (5 tests)

- [ ] **Step 7: Run the existing store suites to verify the refactor broke nothing**

Run: `cd laravel-server && ./vendor/bin/phpunit --filter 'AdminStore|AdminDataAccuracy|AdminFleetStockValue|ArchivedStoreAccess'`
Expected: PASS. These drive the HTTP endpoint, so they exercise the new `fromRequest()` path. If any fail, the filter object is not reproducing a default the old positional call had.

- [ ] **Step 8: Commit**

```bash
git add laravel-server/app/Services/Admin/Filters/StoreListFilters.php laravel-server/app/Services/Admin/AdminStoreService.php laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php laravel-server/tests/Feature/Admin/AdminStoreDemoFilterTest.php
git commit -m "feat: filter the admin store fleet by demo flag and sort it server-side"
```

---

## Task 3: User list filters — sorting

**Files:**
- Create: `laravel-server/app/Services/Admin/Filters/UserListFilters.php`
- Create: `laravel-server/tests/Feature/Admin/AdminListSortingTest.php`
- Modify: `laravel-server/app/Services/Admin/AdminUserService.php:163`
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php:42`

**Interfaces:**
- Consumes: `ListSortResolver` from Task 1.
- Produces: `UserListFilters` with public readonly `page`, `search`, `role`, `accountType`, `storeId`, `sort`, `direction`, plus `UserListFilters::fromRequest(Request $request, array $validated): self`. `AdminUserService::getGlobalUsers(UserListFilters $filters): array` — array shape unchanged.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminListSortingTest.php`. This file also carries the Review Focus #1 hostile-input case for both endpoints.

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Server-side sorting on GET /admin/stores and GET /admin/users, and the
 * guarantee that an unrecognised or hostile `sort` value falls back to the
 * default ordering instead of reaching orderBy().
 */
class AdminListSortingTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeOwnerWithStore(string $first, string $last, string $storeName): Store
    {
        $owner = User::create([
            'first_name' => $first,
            'last_name' => $last,
            'email' => strtolower($first).'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'name' => $storeName,
            'user_id' => $owner->id,
        ]);
    }

    #[Test]
    public function it_sorts_stores_by_name_in_both_directions(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Zulu Pharmacy');
        $this->makeOwnerWithStore('Bola', 'Two', 'Alpha Pharmacy');
        $this->makeOwnerWithStore('Chidi', 'Three', 'Mike Pharmacy');

        $asc = $this->actingAs($this->superAdmin)
            ->getJson('/api/admin/stores?sort=name&direction=asc')
            ->json('data');
        $this->assertSame(
            ['Alpha Pharmacy', 'Mike Pharmacy', 'Zulu Pharmacy'],
            collect($asc)->pluck('name')->all(),
        );

        $desc = $this->actingAs($this->superAdmin)
            ->getJson('/api/admin/stores?sort=name&direction=desc')
            ->json('data');
        $this->assertSame(
            ['Zulu Pharmacy', 'Mike Pharmacy', 'Alpha Pharmacy'],
            collect($desc)->pluck('name')->all(),
        );
    }

    #[Test]
    public function it_sorts_users_by_name_across_first_then_last_name(): void
    {
        $this->makeOwnerWithStore('Ada', 'Zulu', 'Store A');
        $this->makeOwnerWithStore('Ada', 'Alpha', 'Store B');
        $this->makeOwnerWithStore('Bola', 'Alpha', 'Store C');

        $names = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/admin/users?account_type=owners&sort=name&direction=asc')
                ->json('data'),
        )->pluck('name')->all();

        $this->assertSame(['Ada Alpha', 'Ada Zulu', 'Bola Alpha'], $names);
    }

    #[Test]
    public function it_sorts_users_by_email(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Store A');
        $this->makeOwnerWithStore('Bola', 'Two', 'Store B');

        $emails = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/admin/users?account_type=owners&sort=email&direction=asc')
                ->json('data'),
        )->pluck('email')->all();

        $this->assertSame(collect($emails)->sort()->values()->all(), $emails);
    }

    #[Test]
    public function a_hostile_sort_value_falls_back_to_the_default_ordering(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Alpha Pharmacy');
        $this->makeOwnerWithStore('Bola', 'Two', 'Zulu Pharmacy');

        $hostile = [
            'name; DROP TABLE users',
            'users.password',
            '(SELECT 1)',
            'name,email',
            'NAME',
            str_repeat('a', 2000),
        ];

        foreach ($hostile as $value) {
            $stores = $this->actingAs($this->superAdmin)
                ->getJson('/api/admin/stores?sort='.urlencode($value));
            $stores->assertOk();

            $users = $this->actingAs($this->superAdmin)
                ->getJson('/api/admin/users?sort='.urlencode($value));
            $users->assertOk();
        }

        $this->assertNotNull(DB::table('users')->first(), 'users table must still exist');
        $this->assertSame(2, DB::table('stores')->count());
    }

    #[Test]
    public function an_array_sort_param_does_not_error(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Alpha Pharmacy');

        $this->actingAs($this->superAdmin)
            ->getJson('/api/admin/stores?sort[]=name&sort[]=email')
            ->assertOk();

        $this->actingAs($this->superAdmin)
            ->getJson('/api/admin/users?sort[]=name')
            ->assertOk();
    }

    #[Test]
    public function columns_computed_after_the_query_are_not_sortable(): void
    {
        $this->makeOwnerWithStore('Ada', 'One', 'Zulu Pharmacy');
        $this->makeOwnerWithStore('Bola', 'Two', 'Alpha Pharmacy');

        $byPlan = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/admin/stores?sort=plan&direction=asc')
                ->json('data'),
        )->pluck('name')->all();

        $default = collect(
            $this->actingAs($this->superAdmin)
                ->getJson('/api/admin/stores')
                ->json('data'),
        )->pluck('name')->all();

        $this->assertSame($default, $byPlan);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminListSortingTest.php`
Expected: FAIL — the sorting cases fail (params ignored today); `a_hostile_sort_value_...`, `an_array_sort_param_...` and `columns_computed_after_the_query_...` pass already, because nothing reads `sort` yet. They are regression guards for after the feature lands.

- [ ] **Step 3: Write minimal implementation — the filter object**

Create `laravel-server/app/Services/Admin/Filters/UserListFilters.php`:

```php
<?php

namespace App\Services\Admin\Filters;

use Illuminate\Http\Request;

class UserListFilters
{
    public function __construct(
        public readonly int $page = 1,
        public readonly ?string $search = null,
        public readonly ?string $role = null,
        public readonly ?string $accountType = null,
        public readonly ?string $storeId = null,
        public readonly mixed $sort = null,
        public readonly mixed $direction = null,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public static function fromRequest(Request $request, array $validated): self
    {
        return new self(
            page: max(1, (int) $request->query('page', 1)),
            search: $request->query('search'),
            role: $request->query('role'),
            accountType: $validated['account_type'] ?? null,
            storeId: $validated['store_id'] ?? null,
            sort: $request->query('sort'),
            direction: $request->query('direction'),
        );
    }
}
```

`account_type` and `store_id` come from `$validated` rather than the raw query, preserving the controller's existing `in:` validation on `account_type` (which returns 422 on an unrecognised value — a behaviour `AdminUsersAccountTypeFilterTest` already pins).

- [ ] **Step 4: Write minimal implementation — the service**

In `laravel-server/app/Services/Admin/AdminUserService.php`, change `getGlobalUsers()` at line 163 to take the filter object, and replace the `->latest()` in the paginate chain:

```php
public function getGlobalUsers(UserListFilters $filters)
{
    $query = User::query();

    $this->constrainToAccountType($query, $filters->accountType);

    if ($filters->storeId) {
        $query->where(function ($q) use ($filters) {
            $q->where('users.store_id', $filters->storeId)
                ->orWhereHas('stores', fn ($sq) => $sq->where('stores.id', $filters->storeId));
        });
    }

    if ($filters->search) {
        $query->where(function ($q) use ($filters) {
            $search = $filters->search;
            $q->where('first_name', 'like', "%{$search}%")
                ->orWhere('last_name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
                ->orWhere('id', 'like', "%{$search}%");
        });
    }

    if ($filters->role) {
        $query->where('role', $filters->role);
    }

    $sortColumns = ListSortResolver::userColumns($filters->sort);

    if ($sortColumns === []) {
        $query->latest();
    } else {
        $direction = ListSortResolver::direction($filters->direction);
        foreach ($sortColumns as $column) {
            $query->orderBy($column, $direction);
        }
    }

    $paginator = $query->with(['store', 'employerStore'])->paginate(10, ['*'], 'page', $filters->page);

    // ... existing mapping and meta block unchanged ...
}
```

Add imports:

```php
use App\Services\Admin\Filters\UserListFilters;
use App\Services\Admin\Support\ListSortResolver;
```

- [ ] **Step 5: Write minimal implementation — the controller**

In `laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php`, replace the `users()` body's service call:

```php
return $this->withErrorResponse('Users', 'Failed to fetch users', function () use ($request, $validated) {
    return response()->json($this->adminUserService->getGlobalUsers(
        UserListFilters::fromRequest($request, $validated),
    ));
});
```

Add to the `#[OA\Get]` `parameters` array:

```php
new OA\Parameter(name: 'sort', in: 'query', description: 'name, email, created_at, last_login_at or role. Anything else keeps the default newest-first ordering.', schema: new OA\Schema(type: 'string', enum: ['name', 'email', 'created_at', 'last_login_at', 'role'])),
new OA\Parameter(name: 'direction', in: 'query', description: 'asc or desc (default)', schema: new OA\Schema(type: 'string', enum: ['asc', 'desc'])),
```

And import `use App\Services\Admin\Filters\UserListFilters;`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminListSortingTest.php`
Expected: PASS (6 tests)

- [ ] **Step 7: Run the existing user suites**

Run: `cd laravel-server && ./vendor/bin/phpunit --filter 'AdminUsers|AdminGlobalUsers|AdminUserSyncVisibility|AdminBulkNotify|AdminUserProfileUpdate'`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add laravel-server/app/Services/Admin/Filters/UserListFilters.php laravel-server/app/Services/Admin/AdminUserService.php laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php laravel-server/tests/Feature/Admin/AdminListSortingTest.php
git commit -m "feat: sort the admin users directory server-side through the same allow-list"
```

---

## Task 4: `deleteUser()` self-deletion and platform-role guards (§7.1)

**Files:**
- Create: `laravel-server/tests/Feature/Admin/AdminUserDeletionGuardsTest.php`
- Modify: `laravel-server/app/Services/Admin/AdminUserService.php:412`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `deleteUser()` now throws `App\Exceptions\StoreActionBlockedException` (the existing exception `AdminStoreDeletionService` already throws for the same class of refusal) rather than deleting. Confirm how that exception maps to an HTTP status before writing the test's `assertStatus`; `AdminStoreDeletionTest` already asserts it for the purge path, so mirror whatever it expects.

- [ ] **Step 1: Confirm the existing exception's HTTP mapping**

Run: `cd laravel-server && grep -rn "StoreActionBlockedException" app/ tests/ | head -20`

Read how `AdminStoreDeletionController` turns it into a response and what status `AdminStoreDeletionTest` asserts. Use the same exception and the same status below. Do not invent a new exception type — a second refusal exception for the same concept is how two error shapes end up on one API.

- [ ] **Step 2: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminUserDeletionGuardsTest.php`. Replace `EXPECTED_STATUS` with the status confirmed in Step 1.

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DELETE /admin/users/{id} refusals. Before these guards existed the
 * endpoint deleted whatever id it was given, including the caller's own
 * account and other super admins; the only friction was a client-side
 * type-the-email dialog. See the spec's §7.1.
 */
class AdminUserDeletionGuardsTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeUser(string $role): User
    {
        return User::create([
            'first_name' => 'Target',
            'last_name' => uniqid(),
            'email' => 'target-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_the_acting_admins_own_account(): void
    {
        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/admin/users/{$this->superAdmin->id}")
            ->assertStatus(EXPECTED_STATUS);

        $this->assertDatabaseHas('users', [
            'id' => $this->superAdmin->id,
            'deleted_at' => null,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_the_acting_admins_own_account_even_as_the_last_super_admin(): void
    {
        $this->assertSame(1, User::where('role', 'super_admin')->count());

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/admin/users/{$this->superAdmin->id}")
            ->assertStatus(EXPECTED_STATUS);

        $this->assertSame(1, User::where('role', 'super_admin')->count());
    }

    #[Test]
    public function it_refuses_to_delete_another_platform_account(): void
    {
        foreach (['super_admin', 'platform_admin', 'agent'] as $role) {
            $target = $this->makeUser($role);

            $this->actingAs($this->superAdmin)
                ->deleteJson("/api/admin/users/{$target->id}")
                ->assertStatus(EXPECTED_STATUS);

            $this->assertDatabaseHas('users', [
                'id' => $target->id,
                'deleted_at' => null,
            ]);
        }
    }

    #[Test]
    public function it_still_deletes_an_ordinary_store_owner(): void
    {
        $owner = $this->makeUser('store_owner');
        $store = Store::create(['name' => 'Target Pharmacy', 'user_id' => $owner->id]);

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/admin/users/{$owner->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $owner->id]);
        $this->assertSoftDeleted('stores', ['id' => $store->id]);
    }

    #[Test]
    public function it_still_deletes_an_ordinary_staff_account(): void
    {
        $owner = $this->makeUser('store_owner');
        $store = Store::create(['name' => 'Target Pharmacy', 'user_id' => $owner->id]);
        $staff = $this->makeUser('admin');
        $staff->store_id = $store->id;
        $staff->save();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/admin/users/{$staff->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $staff->id]);
        $this->assertDatabaseHas('stores', ['id' => $store->id, 'deleted_at' => null]);
    }

    #[Test]
    public function it_records_the_refusal_without_writing_a_deletion_audit_entry(): void
    {
        $before = \App\Models\ActivityLog::where('action', 'USER_DELETION')->count();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/admin/users/{$this->superAdmin->id}")
            ->assertStatus(EXPECTED_STATUS);

        $this->assertSame(
            $before,
            \App\Models\ActivityLog::where('action', 'USER_DELETION')->count(),
        );
    }
}
```

The last two cases matter beyond the guard itself: `it_still_deletes_an_ordinary_staff_account` pins that deleting staff does **not** archive their employer's store (the `foreach ($user->stores ...)` loop iterates stores *owned*, and staff own none), and the audit case pins that a refused delete leaves no misleading `USER_DELETION` entry.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminUserDeletionGuardsTest.php`
Expected: FAIL — the three refusal cases fail because the deletion currently succeeds; the two "still deletes" cases pass.

- [ ] **Step 4: Write minimal implementation**

In `laravel-server/app/Services/Admin/AdminUserService.php`, add the role constant beside the existing `ACCOUNT_TYPE_*` constants:

```php
private const PROTECTED_ROLES = ['super_admin', 'platform_admin', 'agent'];
```

Then guard at the top of the transaction in `deleteUser()`, before `$userEmail` is read:

```php
public function deleteUser($id)
{
    return DB::transaction(function () use ($id) {
        $user = User::findOrFail($id);

        $this->assertDeletionAllowed($user);

        $userEmail = $user->email;

        // ... existing body unchanged ...
    });
}

private function assertDeletionAllowed(User $user): void
{
    if ($user->id === Auth::id()) {
        throw new StoreActionBlockedException('You cannot delete your own account.');
    }

    if (in_array($user->role, self::PROTECTED_ROLES, true)) {
        throw new StoreActionBlockedException(
            "This is a platform account ({$user->role}). Platform accounts cannot be deleted from the users directory."
        );
    }
}
```

Add `use App\Exceptions\StoreActionBlockedException;` (adjust to the namespace confirmed in Step 1).

- [ ] **Step 5: Ensure the controller surfaces the refusal**

`AdminUserController::deleteUser()` wraps the call in `withErrorResponse()`, which may convert the exception into a generic 500. Check how `AdminStoreDeletionController` avoids that for the same exception and mirror it. Run the test after this step, not before — the guard and its HTTP surfacing are one deliverable.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminUserDeletionGuardsTest.php`
Expected: PASS (6 tests)

Run: `cd laravel-server && ./vendor/bin/phpunit --filter 'AdminUser|AdminStoreDeletion'`
Expected: PASS

- [ ] **Step 7: Update the docs**

In `laravel-server/AGENTS.md`, in the admin users section, add that `deleteUser()` refuses the caller's own account and any `super_admin`/`platform_admin`/`agent` target, and that this is a service-level guard, not only a dialog.

Add an entry to `docs/FIXED_BUGS.md` describing the gap (destructive super-admin endpoint with no self-deletion guard; client-side-only friction) and this fix. Check `docs/KNOWN_BUGS.md` for an existing entry covering it and remove it outright if present, including its executive-summary count and remediation-order entry.

- [ ] **Step 8: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminUserService.php laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php laravel-server/tests/Feature/Admin/AdminUserDeletionGuardsTest.php laravel-server/AGENTS.md docs/FIXED_BUGS.md docs/KNOWN_BUGS.md
git commit -m "fix: refuse to delete the acting admin's own account or any platform account"
```

---

## Task 5: Referrer reassignment endpoint (§4.2)

**Files:**
- Create: `laravel-server/tests/Feature/Admin/AdminStoreReferrerTest.php`
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php`
- Modify: `laravel-server/app/Services/Admin/AdminStoreService.php` (or a new `AdminStoreReferrerService` if `AdminStoreService` is at the line limit — check first)
- Modify: `laravel-server/routes/api.php:246`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PUT /admin/stores/{id}/referrer`, body `{"referrer_id": "<uuid>"|null}`, super-admin only. Returns `200` with `{"message": string, "referrer": {"id","name"}|null}`.

- [ ] **Step 1: Check where the method belongs**

Run: `cd laravel-server && wc -l app/Services/Admin/AdminStoreService.php`

If adding ~40 lines would take it past 350, create `app/Services/Admin/AdminStoreReferrerService.php` instead and inject it into the controller, exactly as `AdminUserDeviceService` was split out of `AdminUserService` for this reason. Record the choice in the commit message.

- [ ] **Step 2: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminStoreReferrerTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * PUT /admin/stores/{id}/referrer. Referral attribution lives on the store
 * OWNER (users.referred_by_id), not on the store. Reassignment is
 * forward-only: it never rewrites existing referral credit rows. See the
 * spec's §4.2.
 */
class AdminStoreReferrerTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected User $oldReferrer;

    protected User $newReferrer;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->oldReferrer = User::create([
            'first_name' => 'Old',
            'last_name' => 'Referrer',
            'email' => 'old@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'agent',
        ]);

        $this->newReferrer = User::create([
            'first_name' => 'New',
            'last_name' => 'Referrer',
            'email' => 'new@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'referred_by_id' => $this->oldReferrer->id,
        ]);

        $this->store = Store::create([
            'name' => 'Target Pharmacy',
            'user_id' => $this->owner->id,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function a_super_admin_can_reassign_the_referrer(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertOk()
            ->assertJsonPath('referrer.id', $this->newReferrer->id);

        $this->assertSame(
            $this->newReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_can_clear_the_referrer(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => null,
            ])
            ->assertOk()
            ->assertJsonPath('referrer', null);

        $this->assertNull($this->owner->fresh()->referred_by_id);
    }

    #[Test]
    public function it_writes_an_audit_entry_naming_both_referrers(): void
    {
        $before = ActivityLog::count();

        $this->actingAs($this->superAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertOk();

        $this->assertSame($before + 1, ActivityLog::count());

        $log = ActivityLog::latest('id')->first();
        $this->assertSame('STORE_REFERRER_REASSIGNED', $log->action);
        $this->assertSame($this->superAdmin->id, $log->user_id);
        $this->assertStringContainsString($this->newReferrer->id, $log->description.json_encode($log->properties));
        $this->assertStringContainsString($this->oldReferrer->id, $log->description.json_encode($log->properties));
    }

    #[Test]
    public function it_refuses_to_make_the_owner_their_own_referrer(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->owner->id,
            ])
            ->assertStatus(422);

        $this->assertSame(
            $this->oldReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_accepts_a_reassignment_to_the_current_referrer_without_a_second_audit_entry(): void
    {
        $before = ActivityLog::count();

        $this->actingAs($this->superAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->oldReferrer->id,
            ])
            ->assertOk();

        $this->assertSame($before, ActivityLog::count());
        $this->assertSame($this->oldReferrer->id, $this->owner->fresh()->referred_by_id);
    }

    #[Test]
    public function it_rejects_an_unknown_referrer_id(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => 'not-a-real-user-id',
            ])
            ->assertStatus(422);

        $this->assertSame(
            $this->oldReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_rejects_a_non_super_admin(): void
    {
        $platformAdmin = User::create([
            'first_name' => 'Platform',
            'last_name' => 'Admin',
            'email' => 'platform@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);

        $this->actingAs($platformAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertForbidden();

        $this->assertSame(
            $this->oldReferrer->id,
            $this->owner->fresh()->referred_by_id,
        );
    }

    #[Test]
    public function it_never_rewrites_existing_referral_credit_rows(): void
    {
        $tables = ['referral_credits', 'referral_transactions'];

        $snapshots = [];
        foreach ($tables as $table) {
            if (\Illuminate\Support\Facades\Schema::hasTable($table)) {
                $snapshots[$table] = \Illuminate\Support\Facades\DB::table($table)->get()->toJson();
            }
        }

        $this->actingAs($this->superAdmin)
            ->putJson("/api/admin/stores/{$this->store->id}/referrer", [
                'referrer_id' => $this->newReferrer->id,
            ])
            ->assertOk();

        foreach ($snapshots as $table => $before) {
            $this->assertSame(
                $before,
                \Illuminate\Support\Facades\DB::table($table)->get()->toJson(),
                "{$table} must be untouched by a referrer reassignment",
            );
        }

        $this->assertNotEmpty($snapshots, 'expected at least one referral table to exist');
    }
}
```

Before running: confirm the referral table names with `cd laravel-server && grep -n "Schema::create" database/migrations/2026_05_30_123000_create_referral_system_tables.php` and correct the `$tables` array to match. The assertion that `$snapshots` is non-empty exists so a renamed table turns into a visible failure rather than a silently vacuous test.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminStoreReferrerTest.php`
Expected: FAIL — 404 on every case; the route does not exist.

- [ ] **Step 4: Write minimal implementation — the service method**

In the class chosen in Step 1:

```php
public function updateReferrer(string $storeId, ?string $referrerId): ?array
{
    return DB::transaction(function () use ($storeId, $referrerId) {
        $store = Store::withTrashed()->findOrFail($storeId);
        $owner = $store->user_id ? User::withTrashed()->findOrFail($store->user_id) : null;

        if (! $owner) {
            throw ValidationException::withMessages([
                'referrer_id' => 'This store has no owner account to attribute a referral to.',
            ]);
        }

        if ($referrerId !== null && $referrerId === $owner->id) {
            throw ValidationException::withMessages([
                'referrer_id' => 'A store owner cannot be their own referrer.',
            ]);
        }

        $newReferrer = $referrerId !== null ? User::find($referrerId) : null;

        if ($referrerId !== null && ! $newReferrer) {
            throw ValidationException::withMessages([
                'referrer_id' => 'That referrer account does not exist.',
            ]);
        }

        $previousId = $owner->referred_by_id;

        if ($previousId === $referrerId) {
            return $this->referrerPayload($newReferrer);
        }

        $owner->referred_by_id = $referrerId;
        $owner->save();

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'STORE_REFERRER_REASSIGNED',
            'description' => mb_substr(
                "Reassigned referrer for {$store->name} ({$store->id}) from ".
                ($previousId ?? 'none')." to ".($referrerId ?? 'none'),
                0,
                255,
            ),
            'properties' => [
                'store_id' => $store->id,
                'owner_id' => $owner->id,
                'previous_referrer_id' => $previousId,
                'new_referrer_id' => $referrerId,
            ],
        ]);

        return $this->referrerPayload($newReferrer);
    });
}

private function referrerPayload(?User $referrer): ?array
{
    return $referrer ? [
        'id' => $referrer->id,
        'name' => trim("{$referrer->first_name} {$referrer->last_name}"),
    ] : null;
}
```

The `description` is truncated to 255 because `activity_logs.description` is a bounded VARCHAR — the same constraint recorded for A-146 in `docs/FIXED_BUGS.md`. The structured values go in `properties`.

- [ ] **Step 5: Write minimal implementation — the controller action**

```php
#[OA\Put(
    path: '/admin/stores/{id}/referrer',
    summary: "Reassign who referred a store's owner",
    description: 'Forward-only: sets users.referred_by_id on the store owner and writes an audit entry. Never rewrites existing referral credit or commission rows.',
    tags: ['Admin'],
    security: [['sanctum' => []]],
    parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
    requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
        properties: [new OA\Property(property: 'referrer_id', type: 'string', nullable: true)],
    )),
    responses: [
        new OA\Response(response: 200, description: 'Reassigned'),
        new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        new OA\Response(response: 422, description: 'Unknown referrer, or a self-referral'),
        new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
    ],
)]
public function updateReferrer(Request $request, $id)
{
    $validated = $request->validate([
        'referrer_id' => ['present', 'nullable', 'string'],
    ]);

    return $this->withErrorResponse('Update Referrer', 'Failed to reassign the referrer', function () use ($id, $validated) {
        $referrer = $this->adminStoreService->updateReferrer($id, $validated['referrer_id']);

        return response()->json([
            'message' => 'Referrer reassigned.',
            'referrer' => $referrer,
        ]);
    });
}
```

Check that `withErrorResponse()` lets a `ValidationException` through as a 422 rather than swallowing it into a 500. If it does not, rethrow or validate before entering the wrapper — the tests assert 422.

- [ ] **Step 6: Add the route**

In `laravel-server/routes/api.php`, immediately after the existing account-manager route at line 246:

```php
Route::put('/stores/{id}/referrer', [AdminStoreController::class, 'updateReferrer'])->middleware('role:super_admin');
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminStoreReferrerTest.php`
Expected: PASS (8 tests)

Run: `cd laravel-server && ./vendor/bin/phpunit --filter 'Referral|AdminStore'`
Expected: PASS

- [ ] **Step 8: Update the docs**

In `laravel-server/AGENTS.md`, document the endpoint beside the account-manager one: what it writes, that it is forward-only, and the coupling that reassigning a referrer changes the *resolved* account manager for stores whose manager is not explicitly assigned (`AccountManagerController::resolveFor()`).

- [ ] **Step 9: Commit**

```bash
git add laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php laravel-server/app/Services/Admin/ laravel-server/routes/api.php laravel-server/tests/Feature/Admin/AdminStoreReferrerTest.php laravel-server/AGENTS.md
git commit -m "feat: let a super admin reassign a store owner's referrer without rewriting credits"
```

---

## Task 6: `standardizeCatalog()` honesty, dry-run and scoping (§7.4)

**Files:**
- Create: `laravel-server/tests/Feature/Admin/AdminCatalogStandardizeTest.php`
- Modify: `laravel-server/app/Services/Admin/AdminCatalogService.php:112`
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminPlatformController.php:96-112`
- Modify: `docs/KNOWN_BUGS.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `standardizeCatalog(bool $dryRun = false, ?string $storeId = null): array` returning `['count' => int, 'message' => string, 'dry_run' => bool, 'store_id' => ?string]`. `POST /admin/products/standardize` accepts `{"dry_run": bool, "store_id": string|null}`.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminCatalogStandardizeTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * POST /admin/products/standardize. The operation backfills two blank
 * fields; it does not dedupe or normalize names, whatever its button says.
 * It is cross-tenant unless scoped, irreversible, and bumps updated_at on
 * every row it touches — which re-pulls each one to every client. See the
 * spec's §7.4.
 */
class AdminCatalogStandardizeTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected Store $storeA;

    protected Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->storeA = $this->makeStore('Store A');
        $this->storeB = $this->makeStore('Store B');

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeStore(string $name): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create(['name' => $name, 'user_id' => $owner->id]);
    }

    private function makeBlankProduct(Store $store, string $name): Product
    {
        return Product::create([
            'store_id' => $store->id,
            'name' => $name,
            'generic_name' => null,
            'manufacturer' => '',
        ]);
    }

    #[Test]
    public function a_dry_run_writes_nothing_but_reports_the_count(): void
    {
        $product = $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $originalUpdatedAt = $product->updated_at;

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/admin/products/standardize', ['dry_run' => true]);

        $response->assertOk()
            ->assertJsonPath('dry_run', true);

        $this->assertGreaterThan(0, $response->json('count'));

        $fresh = $product->fresh();
        $this->assertNull($fresh->generic_name);
        $this->assertSame('', $fresh->manufacturer);
        $this->assertEquals($originalUpdatedAt, $fresh->updated_at);
    }

    #[Test]
    public function the_dry_run_count_matches_what_the_real_run_affects(): void
    {
        $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $this->makeBlankProduct($this->storeB, 'Ibuprofen');

        $dry = $this->actingAs($this->superAdmin)
            ->postJson('/api/admin/products/standardize', ['dry_run' => true])
            ->json('count');

        $real = $this->actingAs($this->superAdmin)
            ->postJson('/api/admin/products/standardize', ['dry_run' => false])
            ->json('count');

        $this->assertSame($dry, $real);
    }

    #[Test]
    public function a_real_run_backfills_both_blank_fields(): void
    {
        $product = $this->makeBlankProduct($this->storeA, 'Paracetamol');

        $this->actingAs($this->superAdmin)
            ->postJson('/api/admin/products/standardize', ['dry_run' => false])
            ->assertOk();

        $fresh = $product->fresh();
        $this->assertSame('General', $fresh->generic_name);
        $this->assertSame('Unknown', $fresh->manufacturer);
    }

    #[Test]
    public function it_leaves_populated_fields_alone(): void
    {
        $product = Product::create([
            'store_id' => $this->storeA->id,
            'name' => 'Amoxicillin',
            'generic_name' => 'Amoxicillin trihydrate',
            'manufacturer' => 'Emzor',
        ]);
        $originalUpdatedAt = $product->updated_at;

        $this->actingAs($this->superAdmin)
            ->postJson('/api/admin/products/standardize', ['dry_run' => false])
            ->assertOk();

        $fresh = $product->fresh();
        $this->assertSame('Amoxicillin trihydrate', $fresh->generic_name);
        $this->assertSame('Emzor', $fresh->manufacturer);
        $this->assertEquals($originalUpdatedAt, $fresh->updated_at);
    }

    #[Test]
    public function a_scoped_run_touches_only_the_named_store(): void
    {
        $inScope = $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $outOfScope = $this->makeBlankProduct($this->storeB, 'Ibuprofen');

        $this->actingAs($this->superAdmin)
            ->postJson('/api/admin/products/standardize', [
                'dry_run' => false,
                'store_id' => $this->storeA->id,
            ])
            ->assertOk()
            ->assertJsonPath('store_id', $this->storeA->id);

        $this->assertSame('General', $inScope->fresh()->generic_name);
        $this->assertNull($outOfScope->fresh()->generic_name);
    }

    #[Test]
    public function an_unscoped_run_is_cross_tenant(): void
    {
        $a = $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $b = $this->makeBlankProduct($this->storeB, 'Ibuprofen');

        $this->actingAs($this->superAdmin)
            ->postJson('/api/admin/products/standardize', ['dry_run' => false])
            ->assertOk();

        $this->assertSame('General', $a->fresh()->generic_name);
        $this->assertSame('General', $b->fresh()->generic_name);
    }

    #[Test]
    public function it_rejects_a_non_super_admin(): void
    {
        $platformAdmin = User::create([
            'first_name' => 'Platform',
            'last_name' => 'Admin',
            'email' => 'platform@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);

        $product = $this->makeBlankProduct($this->storeA, 'Paracetamol');

        $this->actingAs($platformAdmin)
            ->postJson('/api/admin/products/standardize', ['dry_run' => false])
            ->assertForbidden();

        $this->assertNull($product->fresh()->generic_name);
    }
}
```

`Product::create()` may require more columns than shown; run one test first and add whatever the DB rejects, keeping `generic_name` null and `manufacturer` empty.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminCatalogStandardizeTest.php`
Expected: FAIL — the dry-run and scoping cases fail (both parameters are ignored, and `dry_run: true` performs a real write); the backfill, cross-tenant and permission cases pass.

- [ ] **Step 3: Write minimal implementation**

Replace `standardizeCatalog()` in `laravel-server/app/Services/Admin/AdminCatalogService.php`:

```php
public function standardizeCatalog(bool $dryRun = false, ?string $storeId = null)
{
    $blankGeneric = fn () => Product::query()
        ->when($storeId, fn ($q) => $q->where('store_id', $storeId))
        ->where(fn ($q) => $q->whereNull('generic_name')->orWhere('generic_name', ''));

    $blankManufacturer = fn () => Product::query()
        ->when($storeId, fn ($q) => $q->where('store_id', $storeId))
        ->where(fn ($q) => $q->whereNull('manufacturer')->orWhere('manufacturer', ''));

    if ($dryRun) {
        $count = $blankGeneric()->count() + $blankManufacturer()->count();

        return [
            'count' => $count,
            'dry_run' => true,
            'store_id' => $storeId,
            'message' => "{$count} catalog entries would be backfilled. Nothing was written.",
        ];
    }

    $count = $blankGeneric()->update(['generic_name' => 'General'])
        + $blankManufacturer()->update(['manufacturer' => 'Unknown']);

    return [
        'count' => $count,
        'dry_run' => false,
        'store_id' => $storeId,
        'message' => "Backfilled {$count} blank catalog fields.",
    ];
}
```

The closures matter: each returns a fresh query. Reusing one builder would apply the second `where` on top of the first and undercount.

- [ ] **Step 4: Write minimal implementation — the controller**

Replace `standardize()` in `AdminPlatformController.php` and correct the OpenAPI attribute. The old summary claimed "dedupe/normalize product names", which the implementation has never done:

```php
#[OA\Post(
    path: '/admin/products/standardize',
    summary: 'Backfill blank generic_name and manufacturer fields on products',
    description: 'Sets blank generic_name to "General" and blank manufacturer to "Unknown". It does NOT dedupe or normalize product names. Unscoped it runs across every store on the platform; pass store_id to scope it. Irreversible, and it bumps updated_at on every row it touches, so each one re-pulls to its client on the next incremental sync. Pass dry_run to get the affected count without writing.',
    tags: ['Admin'],
    security: [['sanctum' => []]],
    requestBody: new OA\RequestBody(required: false, content: new OA\JsonContent(
        properties: [
            new OA\Property(property: 'dry_run', type: 'boolean', default: false),
            new OA\Property(property: 'store_id', type: 'string', nullable: true),
        ],
    )),
    responses: [
        new OA\Response(response: 200, description: 'Standardization result', content: new OA\JsonContent(type: 'object')),
        new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
    ],
)]
public function standardize(Request $request)
{
    $validated = $request->validate([
        'dry_run' => ['nullable', 'boolean'],
        'store_id' => ['nullable', 'string', 'exists:stores,id'],
    ]);

    return $this->withErrorResponse('Standardize', 'Failed to standardize catalog', function () use ($validated) {
        return response()->json($this->catalogService->standardizeCatalog(
            (bool) ($validated['dry_run'] ?? false),
            $validated['store_id'] ?? null,
        ));
    });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/Admin/AdminCatalogStandardizeTest.php`
Expected: PASS (7 tests)

Run: `cd laravel-server && ./vendor/bin/phpunit --filter 'AdminProducts|AdminPlatform|Catalog'`
Expected: PASS

- [ ] **Step 6: Log the sync blast radius**

Add an entry to `docs/KNOWN_BUGS.md` recording that an unscoped run bumps `updated_at` platform-wide, so the next incremental pull re-downloads every touched row to every client — potentially every store's whole catalogue at once. Note that the dry-run and `store_id` scope added here are the mitigation, not a fix, and that the UI still needs to stop calling it unscoped by default (Phase 4 item).

Note explicitly that PHP generates the timestamp in UTC, so root `AGENTS.md` §7's MySQL clock gotcha does **not** apply here — otherwise a future reader will assume it does and chase the wrong thing.

- [ ] **Step 7: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminCatalogService.php laravel-server/app/Http/Controllers/Api/Admin/AdminPlatformController.php laravel-server/tests/Feature/Admin/AdminCatalogStandardizeTest.php docs/KNOWN_BUGS.md
git commit -m "fix: give catalog standardization a dry run and store scope and describe what it actually does"
```

---

## Task 7: Honest destructive-action copy (§7.2, §7.3)

**Files:**
- Modify: `web/components/admin/users/delete-user-dialog.tsx:17-22,33-36`
- Modify: `web/components/admin/stores/store-delete-dialogs.tsx:120-125`
- Create: `web/__tests__/admin-destructive-copy.test.tsx`
- Modify: `docs/ADMIN_STORE_LIFECYCLE.md`

**Interfaces:**
- Consumes: nothing. Pure copy, deliberately landed in Phase 1 rather than with the UI phases, because the current text tells an admin that data is gone when it is not.
- Produces: nothing other tasks depend on.

**Why.** `User` and `Store` both use `SoftDeletes`; `AdminUserService::deleteUser()` calls `$user->delete()` and `$store->delete()`, both soft. The dialog says the action "erases the user's stores, sales and products irreversibly" and the toast says "permanently deleted". Neither is true — the rows remain and the email stays taken. Separately, `purgeRows()` hard-deletes the store's **owner** when it was their only store, which `PurgeStoreDialog` does not mention.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/admin-destructive-copy.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeleteUserDialog } from "@/components/admin/users/delete-user-dialog";
import { PurgeStoreDialog } from "@/components/admin/stores/store-delete-dialogs";
import type { AdminStoreSummary, AdminUser } from "@/lib/types/admin";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const user = {
  id: "user-1",
  name: "Ada Owner",
  email: "ada@example.com",
  role: "Store Owner",
  role_slug: "store_owner",
  store: "Ada Pharmacy",
  status: "Active",
  lastActive: "2 hours ago",
  joinedAt: "Jan 01, 2026",
} as unknown as AdminUser;

const store = {
  id: "store-1",
  name: "Ada Pharmacy",
  owner: "Ada Owner",
  status: "Active",
} as unknown as AdminStoreSummary;

describe("destructive action copy", () => {
  it("does not tell the admin that deleting a user is permanent", () => {
    render(
      <DeleteUserDialog
        isOpen
        onOpenChange={() => {}}
        selectedUser={user}
        setSelectedUser={() => {}}
        deleteMutation={{ mutate: vi.fn(), isPending: false } as never}
      />,
    );

    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/permanently/i);
    expect(body).not.toMatch(/irreversibl/i);
    expect(body).not.toMatch(/cannot be undone/i);
    expect(body).toMatch(/archiv/i);
  });

  it("tells the admin that purging a store can remove the owner account", () => {
    render(
      <PurgeStoreDialog
        store={store}
        onOpenChange={() => {}}
        onConfirm={() => {}}
        isPending={false}
      />,
    );

    const body = document.body.textContent ?? "";
    expect(body).toMatch(/owner/i);
    expect(body).toMatch(/cannot be undone/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/admin-destructive-copy.test.tsx`
Expected: FAIL — the first case fails on the current "irreversibly" / "permanently deleted" wording; the second fails because the purge dialog never mentions the owner.

- [ ] **Step 3: Rewrite the user-deletion copy**

In `web/components/admin/users/delete-user-dialog.tsx`, replace the dialog description and the success toast so they describe a soft delete. Also delete the existing 3-line comment block at lines 17-19 and let the code read for itself (root `AGENTS.md` §3) — the reason for the typed confirmation belongs in the spec, not above the state hook.

Description copy:

> Deactivates **{name}** and archives the stores they own, signing them out so those stores stop syncing. The account and its data are retained and can be restored — this does not free the email address. To remove a store and its data for good, use Delete Permanently on the store itself.

Success toast:

> `${selectedUser.name}'s account was deactivated and their stores archived.`

- [ ] **Step 4: Extend the purge copy**

In `web/components/admin/stores/store-delete-dialogs.tsx`, extend `PurgeStoreDialog`'s description to name the owner consequence:

> This erases **{name}** and everything scoped to it — products, sales, stock records, customers and its staff accounts. **If this is the owner's only store, their account is deleted too.** It cannot be undone and there is no backup. Archive it instead if you only want it out of the way.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd web && npx vitest run __tests__/admin-destructive-copy.test.tsx`
Expected: PASS (2 tests)

Run: `cd web && npm test`
Expected: PASS. Any existing test asserting the old wording is a test that pinned the false claim — update it and note which in the commit body's absence by naming it in the commit subject scope.

- [ ] **Step 6: Correct the lifecycle doc**

Read `docs/ADMIN_STORE_LIFECYCLE.md`. Where it describes user deletion as permanent, correct it to soft-delete-plus-archive, and where it describes purge, add the owner-account consequence. If it already says this correctly, note that in the commit message rather than editing.

- [ ] **Step 7: Commit**

```bash
git add web/components/admin/users/delete-user-dialog.tsx web/components/admin/stores/store-delete-dialogs.tsx web/__tests__/admin-destructive-copy.test.tsx docs/ADMIN_STORE_LIFECYCLE.md
git commit -m "fix: stop telling admins that user deletion is permanent when it soft-deletes"
```

---

## Task 8: Phase close-out

**Files:**
- Modify: `laravel-server/AGENTS.md`
- Modify: `docs/KNOWN_BUGS.md`, `docs/FIXED_BUGS.md`

- [ ] **Step 1: Run the full backend suite**

Run: `cd laravel-server && ./vendor/bin/phpunit`
Expected: PASS. `ArchitectureTest` and `DatabaseEngineIsPinnedTest` are included — if `ArchitectureTest` enforces a file-size or layering rule, the new `Filters/` and `Support/` classes must satisfy it.

- [ ] **Step 2: Run the full web suite**

Run: `cd web && npm test && npm run lint`
Expected: PASS

- [ ] **Step 3: Verify the file-size rule**

Run: `cd laravel-server && wc -l app/Services/Admin/*.php app/Services/Admin/*/*.php app/Http/Controllers/Api/Admin/AdminStoreController.php app/Http/Controllers/Api/Admin/AdminUserController.php | sort -n | tail -15`

Any file this phase pushed past 350 lines gets split before the phase closes, not after.

- [ ] **Step 4: Confirm the docs are consistent**

Re-read the `laravel-server/AGENTS.md` sections touched in Tasks 4, 5 and 6 together. Check that nothing in that file still claims the old behaviour of a thing this phase changed, and that §7 (the MySQL clock gotcha) has not been contradicted.

- [ ] **Step 5: Commit any close-out doc fixes**

```bash
git add laravel-server/AGENTS.md docs/KNOWN_BUGS.md docs/FIXED_BUGS.md
git commit -m "docs: reconcile the admin backend docs with phase 1's endpoint and guard changes"
```

---

## Self-Review

**Spec coverage.** This plan covers spec §3.1 (demo filter, Task 2), §4.2 backend (Task 5), §6.1 backend (Tasks 1-3), §7.1 (Task 4), §7.2 (Task 7), §7.3 (Task 7), §7.4 (Task 6). Deliberately deferred to later phases, each named in the spec: §1 navigation, §2 users page, §3.2-3.3 stores UI, §4.1 contact specialist card, §5.2 staff sync display, §6.1 frontend `SortableHeaderCell`, §6.2 grey surfaces.

**Not yet planned, and why.** Phases 2-4 are deliberately unwritten. Each depends on code this phase changes — the hook signatures in `web/lib/api/admin-hooks-stores.ts` will change shape once `useAdminStores` stops taking five positional arguments, and planning the UI against a signature that is about to change would produce code samples that are wrong on arrival. Phase 2's plan gets written once Phase 1 is merged.

**Known risk.** Task 2 and Task 3 refactor two service signatures with one caller each. The existing suites drive the HTTP layer, so they do cover the refactor — but a default reproduced wrongly in `fromRequest()` (an `archived` fallback, a page floor) would pass the new tests and break an old behaviour. Steps 2.7 and 3.7 exist specifically to catch that, and must not be skipped.

**Deferred decision.** Task 5 Step 1 chooses between extending `AdminStoreService` and creating `AdminStoreReferrerService` based on the file's measured length. That is a genuine either/or left to execution time because it depends on the file's state after Task 2 edits it.
