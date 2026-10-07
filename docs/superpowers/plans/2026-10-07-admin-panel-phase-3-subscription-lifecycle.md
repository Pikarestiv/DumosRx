# Admin Panel Phase 3 — Subscription Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin panel a worklist of the accounts that need attention this week — expiring, trials ending, lapsed, failed payments — with the actions that resolve each row, gated to super_admin at four independent layers.

**Architecture:** One shared owner-state resolver added to `SubscriptionService` so the admin lists and the application's own subscription gating agree by construction. A separate `AdminSubscriptionLifecycleService` builds four owner-distinct worklists and the lifecycle figures on top of it. A new super_admin-only `Subscriptions` page renders them as tabs, wiring the grant-trial / activate-plan / notify actions that already exist rather than creating new ones.

**Tech Stack:** Laravel 11 + PHPUnit 11 (`tests/Feature`, SQLite in-memory), Next.js 16 + React 19 + TypeScript + Vitest, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-07-admin-panel-phase-3-subscription-lifecycle-design.md`

## Global Constraints

- **Never reimplement subscription truth.** `subscriptionState()` is built on top of `SubscriptionService::resolveEffectiveSubscription()`. Do not re-derive the grace window, re-read `grace_period_days`, or query `subscriptions.status` directly to decide whether an account is live. A second definition is how this subsystem already went wrong.
- **This phase must not change who can use the software.** `resolveEffectiveSubscription()`, `CheckSubscription` and the grace window are read-only here. A diff that alters any of them is out of scope by definition.
- **Never write `subscriptions.status = 'grace_period'`.** The enum allows it; nothing has ever written it; grace is derived from `end_date`.
- **Count owners, not subscription rows.** Every bucket and every figure resolves to distinct owners.
- **A rate with a zero denominator renders as unavailable**, never 0% or 100% (Phase 1's rule, enforced by `web/__tests__/no-fabricated-metrics.test.ts`).
- **Gating is four layers and the route middleware is the only one that protects anything** — see Task 4. A hidden button is not a security control.
- **No dynamic bracket lookup from request input** (§8): the `bucket` parameter resolves through a `match`, and an unknown value returns 422.
- **Pagination caps at 50** (§8).
- **Every file added or modified stays strictly under 350 lines** (§4). `SubscriptionService` is already 295.
- **No inline comments explaining what code does**; max 2 lines for a hyper-local hack (§3). Rationale goes in `/docs` or a package `AGENTS.md`.
- **No hardcoded colors**; semantic theme tokens only (§6). Money through `formatMoney`; timestamps through `formatDateToDDMMYYYY`; bare `YYYY-MM-DD` through `formatDateOnlyToDDMMYYYY`.
- **No `window.confirm`** — use `ConfirmDialog`/`AlertDialog` (§9).
- Docs ship in the same change as the code (§2).

## Review Focus

Input classes the spec implies that a happy-path test will miss. Each has its test assigned to the owning task.

1. **An owner with both an expired subscription and a live one must not appear in `lapsed`.** This is the exact row-vs-owner bug that made the Overview report 7 for one account. → Task 1 and Task 2.
2. **An owner inside the grace window must report `in_grace`, not `lapsed`** — and must not be listed as needing recovery while the application still serves them. If the admin list and `resolveEffectiveSubscription()` disagree, the whole page is untrustworthy. → Task 1.
3. **A custom platform role holding `manage_platform` + `view_platform_data`** must be refused by the endpoint, absent from the nav, and shown the page guard rather than an error screen. This is the A-141 shape and the PG-15 shape in one. → Tasks 4 and 6.
4. **Trial conversion with no trials in the window must return `null`**, not `0%` — and not `100%` from an empty division. → Task 3.
5. **A `plan=` filter on the revenue query must still return the right rows once the query is DB-paginated**, including transactions whose subscription relation is gone. → Task 5.

---

### Task 1: `subscriptionState()` — the shared resolver

**Files:**
- Modify: `laravel-server/app/Services/SubscriptionService.php`
- Test: `laravel-server/tests/Feature/SubscriptionStateTest.php`

**Interfaces:**
- Consumes: the existing `SubscriptionService::resolveEffectiveSubscription(User $owner): ?Subscription`.
- Produces: `SubscriptionService::subscriptionState(User $owner): string` returning exactly one of `'trialing'`, `'active'`, `'in_grace'`, `'lapsed'`, `'none'`. Tasks 2 and 3 depend on these literal strings.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/SubscriptionStateTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionStateTest extends TestCase
{
    use RefreshDatabase;

    private const GRACE_DAYS = 3;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => self::GRACE_DAYS]);
    }

    private function owner(): User
    {
        return User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    private function subscribe(User $owner, array $attributes = []): Subscription
    {
        return Subscription::create(array_merge([
            'user_id' => $owner->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ], $attributes));
    }

    private function state(User $owner): string
    {
        return app(SubscriptionService::class)->subscriptionState($owner);
    }

    public function test_an_owner_on_a_live_paid_plan_is_active(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner);

        $this->assertSame('active', $this->state($owner));
    }

    public function test_an_owner_on_a_live_trial_is_trialing(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['is_trial' => true]);

        $this->assertSame('trialing', $this->state($owner));
    }

    public function test_an_owner_who_has_never_subscribed_is_none(): void
    {
        $this->assertSame('none', $this->state($this->owner()));
    }

    public function test_an_owner_past_end_date_and_grace_is_lapsed(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subDays(self::GRACE_DAYS + 1)]);

        $this->assertSame('lapsed', $this->state($owner));
    }

    /**
     * resolveEffectiveSubscription() still returns this row, and the
     * application still serves the account. Reporting it as lapsed would put a
     * perfectly healthy customer on the retention worklist.
     */
    public function test_an_owner_inside_the_grace_window_is_in_grace_not_lapsed(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subDay()]);

        $this->assertSame('in_grace', $this->state($owner));
        $this->assertNotNull(
            app(SubscriptionService::class)->resolveEffectiveSubscription($owner),
            'the admin state must agree with what the application itself believes'
        );
    }

    /**
     * The row-vs-owner trap: history must not make a paying customer look
     * lapsed.
     */
    public function test_an_owner_with_expired_history_and_a_live_plan_is_active(): void
    {
        $owner = $this->owner();
        $this->subscribe($owner, ['end_date' => now()->subYear(), 'start_date' => now()->subYears(2)]);
        $this->subscribe($owner, ['end_date' => now()->subMonths(6), 'start_date' => now()->subYear()]);
        $this->subscribe($owner);

        $this->assertSame('active', $this->state($owner));
    }

    public function test_lapsed_and_none_are_distinguished(): void
    {
        $lapsed = $this->owner();
        $this->subscribe($lapsed, ['end_date' => now()->subYear()]);

        $this->assertSame('lapsed', $this->state($lapsed));
        $this->assertSame('none', $this->state($this->owner()));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=SubscriptionStateTest`
Expected: FAIL — `Call to undefined method App\Services\SubscriptionService::subscriptionState()`

- [ ] **Step 3: Write the implementation**

Add to `SubscriptionService`, immediately after `resolveEffectiveSubscription()`:

```php
public function subscriptionState(User $owner): string
{
    $effective = $this->resolveEffectiveSubscription($owner);

    if ($effective) {
        if ($effective->end_date && $effective->end_date->isPast()) {
            return 'in_grace';
        }

        return $effective->is_trial ? 'trialing' : 'active';
    }

    return $owner->subscriptions()->exists() ? 'lapsed' : 'none';
}
```

The `in_grace` branch reads `end_date` only to *classify* the row `resolveEffectiveSubscription()` already chose — it does not re-derive the window. If that method's grace logic changes, this follows automatically.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=SubscriptionStateTest`
Expected: PASS, 7 tests

- [ ] **Step 5: Confirm nothing that gates live traffic changed**

Run: `cd laravel-server && php artisan test --filter="Subscription|License|CheckSubscription"`
Expected: PASS with the same test count as before this task. A changed count here means `resolveEffectiveSubscription()` was touched, which this phase forbids — revert rather than updating an assertion.

- [ ] **Step 6: Check the line limit**

Run: `cd laravel-server && wc -l app/Services/SubscriptionService.php`
Expected: under 350 (it is 295 before this task; this adds ~14). If it crosses, extract the lifecycle helpers rather than trimming the new method.

- [ ] **Step 7: Commit**

```bash
git add laravel-server/app/Services/SubscriptionService.php laravel-server/tests/Feature/SubscriptionStateTest.php
git commit -m "feat: add a shared subscription state resolver for admin lifecycle views"
```

---

### Task 2: The four worklists

**Files:**
- Create: `laravel-server/app/Services/Admin/AdminSubscriptionLifecycleService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminSubscriptionWorklistTest.php`

**Interfaces:**
- Consumes: `SubscriptionService::subscriptionState()` from Task 1.
- Produces: `expiringSoon(int $days, int $page)`, `trialsEnding(int $days, int $page)`, `lapsed(int $page)`, `paymentsNeedingAttention(int $days, int $page)` — each returning `['data' => list<array>, 'meta' => ['current_page','last_page','total','per_page']]`. Each row carries at minimum `user_id`, `owner_name`, `email`, `store_name`, `store_id`, `plan`, plus its bucket's own fields. Tasks 4 and 7 consume this shape.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminSubscriptionWorklistTest.php`. Reuse the owner/subscribe helpers from `SubscriptionStateTest` (copy them; a shared trait is not worth it for two files).

```php
public function test_expiring_soon_lists_an_owner_whose_plan_ends_inside_the_window(): void
{
    $owner = $this->owner();
    $this->subscribe($owner, ['end_date' => now()->addDays(3)]);

    $rows = $this->service()->expiringSoon(7, 1)['data'];

    $this->assertCount(1, $rows);
    $this->assertSame($owner->id, $rows[0]['user_id']);
}

public function test_expiring_soon_excludes_a_plan_ending_outside_the_window(): void
{
    $this->subscribe($this->owner(), ['end_date' => now()->addDays(20)]);

    $this->assertCount(0, $this->service()->expiringSoon(7, 1)['data']);
}

public function test_expiring_soon_excludes_trials(): void
{
    $this->subscribe($this->owner(), ['end_date' => now()->addDays(3), 'is_trial' => true]);

    $this->assertCount(0, $this->service()->expiringSoon(7, 1)['data']);
    $this->assertCount(1, $this->service()->trialsEnding(7, 1)['data']);
}

/** The row-vs-owner trap, at list level. */
public function test_an_owner_appears_once_however_many_subscriptions_they_have_had(): void
{
    $owner = $this->owner();
    $this->subscribe($owner, ['end_date' => now()->subYear(), 'start_date' => now()->subYears(2)]);
    $this->subscribe($owner, ['end_date' => now()->subMonths(6), 'start_date' => now()->subYear()]);
    $this->subscribe($owner, ['end_date' => now()->addDays(2)]);

    $rows = $this->service()->expiringSoon(7, 1)['data'];

    $this->assertCount(1, $rows);
}

public function test_lapsed_excludes_an_owner_who_also_holds_a_live_plan(): void
{
    $owner = $this->owner();
    $this->subscribe($owner, ['end_date' => now()->subYear()]);
    $this->subscribe($owner);

    $this->assertCount(0, $this->service()->lapsed(1)['data']);
}

public function test_lapsed_excludes_an_owner_inside_the_grace_window(): void
{
    $this->subscribe($this->owner(), ['end_date' => now()->subDay()]);

    $this->assertCount(0, $this->service()->lapsed(1)['data']);
}

public function test_lapsed_lists_an_owner_past_grace_most_recent_first(): void
{
    $older = $this->owner();
    $this->subscribe($older, ['end_date' => now()->subDays(60)]);
    $recent = $this->owner();
    $this->subscribe($recent, ['end_date' => now()->subDays(10)]);

    $rows = $this->service()->lapsed(1)['data'];

    $this->assertSame([$recent->id, $older->id], array_column($rows, 'user_id'));
}

public function test_payments_needing_attention_lists_failed_and_abandoned_only(): void
{
    // one 'failed', one 'abandoned', one 'success', one 'pending'
    // assert exactly the first two appear, with an attempt count
}

public function test_every_worklist_paginates_at_fifty(): void
{
    // 60 owners expiring -> meta.per_page === 50, data count 50, meta.total 60
}
```

Fill the two sketched bodies out in full when implementing — they follow the same fixture style as the cases above. `payment_transactions` requires `subscription_id`, `provider`, `provider_reference`, `amount`, `currency`, `status`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminSubscriptionWorklistTest`
Expected: FAIL — `Class "App\Services\Admin\AdminSubscriptionLifecycleService" not found`

- [ ] **Step 3: Write the implementation**

Each bucket narrows with SQL first (a `whereBetween` on `end_date`, a `whereIn` on payment status), then resolves the candidate owners and filters with `subscriptionState()`. Do **not** attempt to express grace in SQL — that is the second definition the Global Constraints forbid. Narrowing first keeps the in-PHP pass bounded to the page plus a margin rather than the whole table.

`lapsed` needs the candidate set to be "owners whose newest `end_date` is past", then `subscriptionState() === 'lapsed'` to exclude grace and anyone holding a newer live row.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminSubscriptionWorklistTest`
Expected: PASS

- [ ] **Step 5: Check the line limit**

Run: `cd laravel-server && wc -l app/Services/Admin/AdminSubscriptionLifecycleService.php`
Expected: under 350. If the four buckets plus Task 3's figures would cross it, split the figures into `AdminSubscriptionFiguresService` rather than trimming.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminSubscriptionLifecycleService.php laravel-server/tests/Feature/Admin/AdminSubscriptionWorklistTest.php
git commit -m "feat: add owner-distinct subscription lifecycle worklists"
```

---

### Task 3: The lifecycle figures

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminSubscriptionLifecycleService.php` (or a new `AdminSubscriptionFiguresService` if the line limit demands it)
- Test: `laravel-server/tests/Feature/Admin/AdminSubscriptionFiguresTest.php`

**Interfaces:**
- Produces: `figures(int $days): array` with keys `trial_conversion_rate` (`?string`, e.g. `'42.9%'`), `trials_started`, `lapsed_in_period`, `recovered_in_period`, `payment_mix` (`['success' => int, 'failed' => int, 'abandoned' => int, 'pending' => int]`), and `bucket_counts` (`['expiring' => int, 'trials' => int, 'lapsed' => int, 'payments' => int]`). Tasks 4 and 7 consume this.

- [ ] **Step 1: Write the failing test**

```php
public function test_trial_conversion_is_null_when_no_trials_started_in_the_window(): void
{
    $figures = $this->service()->figures(30);

    $this->assertNull($figures['trial_conversion_rate']);
    $this->assertSame(0, $figures['trials_started']);
}

public function test_trial_conversion_counts_trial_owners_who_later_paid(): void
{
    // 3 owners start trials in-window; 1 later holds a paid subscription
    // -> '33.3%'
}

public function test_payment_mix_counts_every_status(): void
{
    // one of each -> ['success' => 1, 'failed' => 1, 'abandoned' => 1, 'pending' => 1]
}

public function test_bucket_counts_match_the_worklists(): void
{
    // seed one owner into each bucket; assert each count is 1 and matches
    // the corresponding worklist's meta.total
}
```

The first case is the Phase 1 rule applied here: an empty denominator must not become `0%` (which reads as "the trial is failing") or `100%` (which reads as "it is perfect").

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminSubscriptionFiguresTest`
Expected: FAIL — `figures()` undefined

- [ ] **Step 3: Write the implementation**

`trial_conversion_rate` is `paid owners / trial owners` over the window, both distinct, returning `null` when the denominator is zero. `recovered_in_period` is an owner who was lapsed and now holds a live paid subscription — resolve via `subscriptionState()`, not by comparing `status` columns.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminSubscriptionFiguresTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Services/Admin/ laravel-server/tests/Feature/Admin/AdminSubscriptionFiguresTest.php
git commit -m "feat: add subscription lifecycle figures including trial conversion"
```

---

### Task 4: Endpoints and server-side gating

This is the task the spec's "gate thoroughly" instruction lands on. Layer 1 is the only thing that actually protects the data; the rest is UX built in Task 6.

**Files:**
- Create: `laravel-server/app/Http/Controllers/Api/Admin/AdminSubscriptionController.php`
- Modify: `laravel-server/routes/api.php`
- Test: `laravel-server/tests/Feature/Admin/AdminSubscriptionEndpointGateTest.php`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces: `GET /admin/subscriptions/lifecycle` and `GET /admin/subscriptions/{bucket}`.

- [ ] **Step 1: Write the failing test**

```php
/**
 * Layer 1 of the spec's four. The nav item and the page guard are UX; this
 * is the control. The custom-role case is the A-141 shape: a role-slug
 * allow-list gets it wrong in both directions.
 */
public function test_only_super_admin_may_read_the_lifecycle_endpoints(): void
{
    $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

    $this->actingAs($this->makeAdmin('super_admin'))
        ->getJson('/api/v1/admin/subscriptions/lifecycle')->assertOk();

    foreach (['platform_admin', 'agent'] as $role) {
        $this->actingAs($this->makeAdmin($role))
            ->getJson('/api/v1/admin/subscriptions/lifecycle')->assertStatus(403);
        $this->actingAs($this->makeAdmin($role))
            ->getJson('/api/v1/admin/subscriptions/expiring')->assertStatus(403);
    }
}

public function test_a_custom_platform_role_is_refused_too(): void
{
    $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    $super = $this->makeAdmin('super_admin');
    $role = app(\App\Services\Admin\AdminRoleService::class)
        ->createRole('Billing Watcher', ['view_platform_data'], $super->id);

    $user = $this->makeAdmin(is_array($role) ? ($role['slug'] ?? 'billing_watcher') : $role->slug);

    $this->actingAs($user)->getJson('/api/v1/admin/subscriptions/lifecycle')->assertStatus(403);
}

public function test_an_unknown_bucket_is_rejected_rather_than_defaulted(): void
{
    $this->actingAs($this->makeAdmin('super_admin'))
        ->getJson('/api/v1/admin/subscriptions/constructor')->assertStatus(422);
}

public function test_the_days_window_is_validated_against_an_allow_list(): void
{
    $this->actingAs($this->makeAdmin('super_admin'))
        ->getJson('/api/v1/admin/subscriptions/expiring?days=999')->assertStatus(422);
}

public function test_each_bucket_paginates_at_fifty(): void
{
    // 60 expiring owners -> meta.per_page === 50
}

/**
 * Layer 4's server half. The worklist renders these actions but does not
 * proxy or re-expose them, so their authorisation must be exactly what it
 * was before this phase. A hidden button is not a security control.
 */
public function test_the_actions_the_worklist_offers_still_refuse_a_caller_without_the_permission(): void
{
    $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    $super = $this->makeAdmin('super_admin');

    $role = app(\App\Services\Admin\AdminRoleService::class)
        ->createRole('No Trials', ['view_platform_data'], $super->id);
    $slug = is_array($role) ? ($role['slug'] ?? 'no_trials') : $role->slug;
    $caller = $this->makeAdmin($slug);

    $owner = $this->owner();

    $this->actingAs($caller)
        ->postJson("/api/v1/admin/users/{$owner->id}/grant-trial", ['plan' => 'premium'])
        ->assertStatus(403);

    $this->actingAs($caller)
        ->postJson("/api/v1/admin/users/{$owner->id}/notify", ['title' => 'x', 'message' => 'y'])
        ->assertStatus(403);
}
```

Note `createRole` only accepts `User::DELEGATABLE_PERMISSIONS`; `manage_platform` is attached automatically, which is exactly the role shape this test needs.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminSubscriptionEndpointGateTest`
Expected: FAIL — 404, routes not defined.

- [ ] **Step 3: Write the controller**

Thin delegator per §4. The bucket resolves through a `match`:

```php
$result = match ($bucket) {
    'expiring' => $this->lifecycle->expiringSoon($days, $page),
    'trials' => $this->lifecycle->trialsEnding($days, $page),
    'lapsed' => $this->lifecycle->lapsed($page),
    'payments' => $this->lifecycle->paymentsNeedingAttention($days, $page),
    default => abort(422, 'Unknown bucket'),
};
```

Never `$this->lifecycle->{$bucket}()` or an array lookup keyed by request input (§8). Validate `days` with `in:7,14,30`.

- [ ] **Step 4: Register the routes**

In `routes/api.php`, inside the existing `permission:manage_platform` admin group:

```php
Route::get('/subscriptions/lifecycle', [AdminSubscriptionController::class, 'lifecycle'])->middleware('role:super_admin');
Route::get('/subscriptions/{bucket}', [AdminSubscriptionController::class, 'bucket'])->middleware('role:super_admin');
```

Order matters: `/subscriptions/lifecycle` must be registered **before** `/subscriptions/{bucket}`, or the wildcard swallows it and `lifecycle` becomes a bucket name that returns 422.

- [ ] **Step 5: Run tests**

Run: `cd laravel-server && php artisan test --filter=AdminSubscriptionEndpointGateTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Http/Controllers/Api/Admin/AdminSubscriptionController.php laravel-server/routes/api.php laravel-server/tests/Feature/Admin/AdminSubscriptionEndpointGateTest.php
git commit -m "feat: expose super_admin-only subscription lifecycle endpoints"
```

---

### Task 5: PG-12 — stop loading every transaction to show twenty

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminRevenueService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminRevenuePaginationTest.php`
- Modify: `docs/KNOWN_BUGS.md`, `docs/FIXED_BUGS.md`

**Interfaces:**
- Produces: `getOverview()`'s existing return shape, unchanged. Only the query changes.

- [ ] **Step 1: Write the failing test**

```php
/**
 * PG-12: getOverview() called ->get() on every matching row and sliced 20 out
 * in PHP. Phase 2 added AdminSummaryService as a second caller, so this runs
 * on every Overview load.
 */
public function test_it_does_not_load_every_transaction_to_render_one_page(): void
{
    $this->makeTransactions(60);

    $loaded = 0;
    \Illuminate\Support\Facades\DB::listen(function ($query) use (&$loaded) {
        if (str_contains($query->sql, 'select * from "payment_transactions"')) {
            $loaded++;
        }
    });

    $overview = app(AdminRevenueService::class)->getOverview();

    $this->assertSame(20, count($overview['transactions']['data']));
    $this->assertSame(60, $overview['transactions']['meta']['total']);
    $this->assertLessThanOrEqual(2, $loaded, 'the page query must be bounded, not a full table load');
}

public function test_a_plan_filter_still_returns_the_right_rows(): void
{
    // two 'premium' and one 'basic' -> filtering by premium yields 2
}

public function test_a_transaction_whose_subscription_is_gone_still_renders_a_plan(): void
{
    // delete the subscription; assert the row still shows its metadata plan
    // and is excluded from a plan= filter
}
```

The last case pins the spec's decision: an orphaned transaction has no authoritative plan to filter on, so it keeps its metadata plan for display and drops out of a filter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=AdminRevenuePaginationTest`
Expected: FAIL on the query-count assertion.

- [ ] **Step 3: Rewrite the query**

Join `subscriptions` and filter/group on `subscriptions.plan_name` in SQL, then `->paginate(20)`. `planNameFor()` already prefers the relation and falls back to metadata, so keep it for display of the page's rows only. The per-currency totals and the by-plan-tier grouping must be computed by aggregate queries, not by loading the collection — that is the whole point.

- [ ] **Step 4: Run tests and the existing revenue suites**

Run: `cd laravel-server && php artisan test --filter="AdminRevenue"`
Expected: PASS, including `AdminRevenueOverviewTest` and `AdminRevenueCurrencyBreakdownTest` unchanged.

- [ ] **Step 5: Move PG-12 into FIXED_BUGS**

Remove PG-12 from `docs/KNOWN_BUGS.md` **outright** (§2 — never mark it done in place) and add its entry to `docs/FIXED_BUGS.md`. **Grep `docs/*.md` for the highest `PG-`/`A-` id before assigning any new one**; PG-5 collided once already.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminRevenueService.php laravel-server/tests/Feature/Admin/AdminRevenuePaginationTest.php docs/
git commit -m "fix: paginate the admin revenue query in SQL instead of loading every transaction"
```

---

### Task 6: The Subscriptions page, nav entry and page guard

**Files:**
- Create: `web/app/admin/subscriptions/page.tsx`
- Create: `web/lib/api/admin-hooks-subscriptions.ts`
- Modify: `web/components/admin/sidebar-items.ts`, `web/lib/types/admin.ts`
- Test: `web/__tests__/admin-subscriptions-gate.test.tsx`

**Interfaces:**
- Consumes: Task 4's endpoints.
- Produces: `useAdminSubscriptionLifecycle()`, `useAdminSubscriptionBucket(bucket, days, page)`, and the `subscriptions` nav entry.

- [ ] **Step 1: Write the failing test**

```tsx
/** Layers 2 and 3 of the spec's four. Layer 1 (route middleware) is pinned
 * server-side in Task 4. */
describe("Subscriptions access", () => {
  it("is absent from the nav for every non-super_admin role", () => {
    for (const permissions of [["manage_platform"], ["manage_platform", "view_platform_data"]]) {
      const ids = visibleSidebarItems({ role: "custom_role", effective_permissions: permissions })
        .map((i) => i.id);
      expect(ids).not.toContain("subscriptions");
    }
    expect(
      visibleSidebarItems({ role: "platform_admin", effective_permissions: [] }).map((i) => i.id),
    ).not.toContain("subscriptions");
  });

  it("is in the nav for super_admin", () => {
    expect(
      visibleSidebarItems({ role: "super_admin", effective_permissions: [] }).map((i) => i.id),
    ).toContain("subscriptions");
  });

  it("shows a deep-linking non-super_admin an explanation, not an error screen", () => {
    authState.user = { role: "platform_admin", first_name: "P", last_name: "A", email: "p@a.com" };
    render(<SubscriptionsPage />);

    expect(screen.getByText(/only available to super admins/i)).toBeDefined();
    expect(screen.queryByText(/failed to load/i)).toBeNull();
    expect(screen.queryByText(/retry/i)).toBeNull();
  });
});
```

The third case is the PG-15 defect written as a test: without the guard, a deep link renders a generic failure and the colleague files a bug about an outage.

**Copy the mocking harness from `web/__tests__/admin-nav-role-visibility.test.tsx`** rather than writing a new one — it already provides the hoisted `authState`, the `next/navigation` mocks, and the `use-admin-auth-store` mock including `checkIsSuperAdmin` and `checkHasPermission`. Add a `@/lib/api/admin-hooks-subscriptions` mock so the guard test can assert **no request is issued** for a refused role (e.g. a `vi.fn()` query hook whose call count must be zero, or an `enabled: false` assertion).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/admin-subscriptions-gate.test.tsx`
Expected: FAIL — no `subscriptions` nav entry, page does not exist.

- [ ] **Step 3: Add the nav entry**

In `sidebar-items.ts`, with **no** `roles`/`permissions` key so it defaults to `SUPER_ADMIN_ONLY`, matching the endpoint:

```ts
{
  id: "subscriptions",
  name: "Subscriptions",
  icon: BadgeCheck,
  href: "/admin/subscriptions",
},
```

- [ ] **Step 4: Build the page with its guard**

The page checks `checkIsSuperAdmin(user?.role)` before rendering anything and returns the explanation state with a link to `/admin`. Do not fetch before the guard — a refused role should issue no request at all.

- [ ] **Step 5: Verify**

Run: `cd web && npx vitest run __tests__/admin-subscriptions-gate.test.tsx && npx tsc --noEmit && npm test`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/app/admin/subscriptions/ web/lib/api/admin-hooks-subscriptions.ts web/components/admin/sidebar-items.ts web/lib/types/admin.ts web/__tests__/admin-subscriptions-gate.test.tsx
git commit -m "feat: add a super_admin-gated subscriptions page with a deep-link guard"
```

---

### Task 7: The worklist tabs and their actions

**Files:**
- Create: `web/components/admin/subscriptions/lifecycle-figures.tsx`
- Create: `web/components/admin/subscriptions/worklist-table.tsx`
- Modify: `web/app/admin/subscriptions/page.tsx`
- Test: `web/__tests__/admin-subscription-worklist.test.tsx`

**Interfaces:**
- Consumes: Task 6's hooks; the existing `SharedGrantTrialDialog`, `SharedActivatePlanDialog`, `SendNotificationDialog`.
- Produces: `LifecycleFigures` and `WorklistTable`.

- [ ] **Step 1: Write the failing test**

```tsx
it("reports an unavailable conversion rate rather than zero", () => {
  render(<LifecycleFigures data={{ ...base, trial_conversion_rate: null, trials_started: 0 }} isLoading={false} />);

  expect(screen.getByText(/no trials started/i)).toBeDefined();
  expect(screen.queryByText("0%")).toBeNull();
});

it("says nothing needs attention rather than rendering an empty table", () => {
  render(<WorklistTable rows={[]} bucket="expiring" isLoading={false} canGrantTrials canNotify />);

  expect(screen.getByText(/nothing needs attention/i)).toBeDefined();
});

it("hides the grant-trial action from a caller without the permission", () => {
  render(<WorklistTable rows={[row]} bucket="expiring" isLoading={false} canGrantTrials={false} canNotify />);

  expect(screen.queryByRole("button", { name: /grant trial/i })).toBeNull();
  expect(screen.getByRole("button", { name: /notify/i })).toBeDefined();
});

it("renders dates in DD/MM/YYYY", () => {
  render(<WorklistTable rows={[{ ...row, end_date: "2026-10-07" }]} bucket="expiring" isLoading={false} canGrantTrials canNotify />);

  expect(screen.getByText(/07\/10\/2026/)).toBeDefined();
});
```

The third case pins `web/AGENTS.md`'s rule: a missing permission **hides** the control, it does not disable it. The fourth pins §6 — and `end_date` is a bare `YYYY-MM-DD`, so it must go through `formatDateOnlyToDDMMYYYY`, which Phase 2 added after finding bare dates shift a day west of UTC.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/admin-subscription-worklist.test.tsx`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Build the components and wire the actions**

Tabs carry their counts in the label, because zero is the answer on a good week and should be visible without clicking. Actions reuse the existing dialogs and endpoints; this phase adds no new mutation endpoint and does not proxy the existing ones.

- [ ] **Step 4: Verify**

Run: `cd web && npx vitest run __tests__/admin-subscription-worklist.test.tsx && npx tsc --noEmit && npm test && wc -l app/admin/subscriptions/page.tsx components/admin/subscriptions/*.tsx`
Expected: PASS, no type errors, every file under 350 lines.

- [ ] **Step 5: Commit**

```bash
git add web/components/admin/subscriptions/ web/app/admin/subscriptions/page.tsx web/__tests__/admin-subscription-worklist.test.tsx
git commit -m "feat: render the subscription worklists with their resolving actions"
```

---

### Task 8: Docs and the browser smoke test

**Files:**
- Modify: `laravel-server/AGENTS.md`, `web/AGENTS.md`, `docs/KNOWN_BUGS.md`

- [ ] **Step 1: Document the shared-resolver rule**

`laravel-server/AGENTS.md`: that `subscriptionState()` is built on `resolveEffectiveSubscription()` and must never re-derive grace or read `subscriptions.status` to decide liveness; that every lifecycle list counts owners, not rows; and that `grace_period` remains an unwritten enum value.

`web/AGENTS.md`: the Subscriptions page, its four-layer gate, and specifically **the page guard pattern** — that a surface gated more narrowly than `admin/layout.tsx` needs its own guard, or a deep link renders a generic failure. Note that PG-15 is the same defect on `/admin`, so this is the pattern to copy when fixing it.

- [ ] **Step 2: Log what is deliberately deferred**

`docs/KNOWN_BUGS.md`: the per-agent scoped view (`registered_by_id`), named as the Phase 3 follow-up.

- [ ] **Step 3: Browser smoke test — required, not optional**

§9: backend verification is not UI verification, and **every prior phase had a real defect found only on screen**. Against a local API (never production), signed in as super_admin: each tab lists seeded accounts with correct counts; an action dialog opens and completes and the row updates; an empty bucket reads "Nothing needs attention". Then, signed in as a `platform_admin`, deep-link to `/admin/subscriptions` and confirm the guard renders rather than an error screen, and that no request to `/admin/subscriptions/*` is issued. Record what you observed in the commit body.

- [ ] **Step 4: Full verification**

Run: `cd laravel-server && php artisan test`
Run: `cd web && npm test && npx tsc --noEmit`
Run: `cd web && TZ=America/New_York npm test`
Expected: all pass. The EDT run guards the date-only formatting Phase 2 fixed. `vitest` has a known flaky teardown false-failure in this repo — if a failure is a teardown error rather than an assertion, re-run before treating it as real.

- [ ] **Step 5: Commit**

```bash
git add laravel-server/AGENTS.md web/AGENTS.md docs/
git commit -m "docs: record the subscription lifecycle resolver rule and page-guard pattern"
```

---

## Verification

Against the spec's success criteria:

1. One page answers "who needs me this week", with actions per row → Tasks 2, 6, 7.
2. The lists never disagree with the application → Task 1's grace test, the shared resolver.
3. Failed and abandoned payments visible → Task 2.
4. Buckets count owners, not rows → Tasks 1 and 2.
5. A rate with no denominator renders unavailable → Tasks 3 and 7.
6. The revenue query no longer loads everything → Task 5.
7. No file over 350 lines → checked in Tasks 1, 2, 7.
8. Gating holds at four layers → Task 4 (server), Task 6 (nav + guard), Task 7 (buttons), Task 8 (browser).
