# Admin Panel Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every figure in the platform admin panel honest, move platform telemetry onto one reachable page, and split `AdminPlatformService` so Phases 2-6 have clean seams to build on.

**Architecture:** Backend aggregation splits by domain (four focused services replacing one 590-line class), with a shared pure-PHP currency-grouping helper underneath the two money metrics. Money is reported per currency and never converted. Frontend gains one new `/admin/operations` route that absorbs the orphaned `/admin/system` page and Platform Settings' health tab; Email Templates moves to Communications and the account-manager config card moves to Settings.

**Tech Stack:** Laravel 11 + PHPUnit 11 (`tests/Unit`, `tests/Feature`, SQLite in-memory), Next.js 16 App Router + React 19 + TypeScript + Vitest, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-panel-phase-1-design.md`

## Global Constraints

- **No file added or modified by this phase may exceed 350 lines** (`.agents/AGENTS.md` §4).
- **No inline comments explaining what code does or why** — max 2 lines reserved for hyper-local hacks or external-API workarounds; decisions go in `/docs` or the package `AGENTS.md` (§3). Retroactively migrate pre-existing explanatory comments out of any file you touch.
- **No hardcoded colors** — semantic Tailwind theme variables only (`bg-card`, `text-muted-foreground`, `border-border`); never `text-[#123456]` (§6).
- **No hardcoded currency symbols** in `web/` — all money renders through `web/lib/utils/currency.ts`'s `formatMoney(amount, currency)`. Do not add a new per-file `naira()` helper.
- **No MySQL `NOW()`/`CURRENT_TIMESTAMP()` in raw SQL** — let Eloquent set timestamps (§7).
- **Pagination caps at 50 items** (§8). This phase adds no new paginated list.
- **Dates render `DD/MM/YYYY`**, never US format (§6).
- **No `window.confirm`** — use the Shadcn `AlertDialog`/`ConfirmDialog` (§9).
- **A metric that cannot be measured renders as unavailable, never as a plausible-looking number.** This is the phase's central claim.
- Docs ship in the same change as the code, never after (§2).

## Review Focus

Input classes the spec implies but which no task's happy path exercises. Each has its test assigned to the task that owns the code.

1. **A store with `currency = NULL`** (legacy rows predate the column) must land in a fallback bucket, not create a `null`-keyed group or crash the roll-up. → Task 1 + Task 3.
2. **`shell_exec` disabled** — the *expected* production state on Namecheap shared hosting, and therefore the single most important path, yet the one the current code treats as an afterthought. Memory must report unavailable, not a 0% bar. → Task 6.
3. **`sys_getloadavg()` unavailable** (Windows, some hardened hosts) must report unavailable rather than a load average of `0`, which reads as a healthy idle server. → Task 6.
4. **Zero `SYNC_%` activity rows in the 24h window** must not render the optimistic `100%` the old UI defaulted to; "no sync activity" and "all syncs succeeded" are different facts. → Task 5.
5. **A custom platform role holding `manage_platform` but not `view_platform_data`** must still reach `/admin/operations`, and must not see nav items it lacks permission for. This is the A-141 bug class, and this phase changes nav visibility. → Task 9.

---

### Task 1: Shared currency-grouping helper

The per-currency breakdown is needed by revenue (Task 2), fleet stock value (Task 3), and Phase 3's lifecycle metrics. It is extracted once as a pure function so it can be unit-tested without touching the database.

**Files:**
- Create: `laravel-server/app/Support/CurrencyTotals.php`
- Test: `laravel-server/tests/Unit/Support/CurrencyTotalsTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `App\Support\CurrencyTotals::FALLBACK_CURRENCY` (string `'NGN'`) and `CurrencyTotals::fromPairs(iterable $pairs): array`, where each `$pair` is an array with keys `currency` (`?string`) and `amount` (numeric). Returns `array<string, float>` keyed by uppercase ISO code, sorted by amount descending. Tasks 2 and 3 depend on this exact signature.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Unit/Support/CurrencyTotalsTest.php`:

```php
<?php

namespace Tests\Unit\Support;

use App\Support\CurrencyTotals;
use PHPUnit\Framework\TestCase;

class CurrencyTotalsTest extends TestCase
{
    public function test_it_sums_amounts_per_currency(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => 'NGN', 'amount' => 1000],
            ['currency' => 'GHS', 'amount' => 50],
            ['currency' => 'NGN', 'amount' => 500],
        ]);

        $this->assertSame(['NGN' => 1500.0, 'GHS' => 50.0], $totals);
    }

    public function test_it_sorts_currencies_by_amount_descending(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => 'KES', 'amount' => 10],
            ['currency' => 'NGN', 'amount' => 900],
            ['currency' => 'GHS', 'amount' => 400],
        ]);

        $this->assertSame(['NGN', 'GHS', 'KES'], array_keys($totals));
    }

    public function test_it_normalises_currency_case(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => 'ngn', 'amount' => 100],
            ['currency' => 'NGN', 'amount' => 100],
        ]);

        $this->assertSame(['NGN' => 200.0], $totals);
    }

    public function test_it_buckets_null_and_blank_currencies_under_the_fallback(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => null, 'amount' => 100],
            ['currency' => '', 'amount' => 25],
            ['currency' => '   ', 'amount' => 25],
        ]);

        $this->assertSame([CurrencyTotals::FALLBACK_CURRENCY => 150.0], $totals);
        $this->assertArrayNotHasKey('', $totals);
    }

    public function test_it_returns_an_empty_array_for_no_rows(): void
    {
        $this->assertSame([], CurrencyTotals::fromPairs([]));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=CurrencyTotalsTest`
Expected: FAIL — `Class "App\Support\CurrencyTotals" not found`

- [ ] **Step 3: Write minimal implementation**

Create `laravel-server/app/Support/CurrencyTotals.php`:

```php
<?php

namespace App\Support;

final class CurrencyTotals
{
    public const FALLBACK_CURRENCY = 'NGN';

    /**
     * @param  iterable<array{currency: ?string, amount: mixed}>  $pairs
     * @return array<string, float>
     */
    public static function fromPairs(iterable $pairs): array
    {
        $totals = [];

        foreach ($pairs as $pair) {
            $currency = self::normalise($pair['currency'] ?? null);
            $totals[$currency] = ($totals[$currency] ?? 0.0) + (float) ($pair['amount'] ?? 0);
        }

        arsort($totals);

        return $totals;
    }

    private static function normalise(?string $currency): string
    {
        $trimmed = strtoupper(trim((string) $currency));

        return $trimmed === '' ? self::FALLBACK_CURRENCY : $trimmed;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=CurrencyTotalsTest`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Support/CurrencyTotals.php laravel-server/tests/Unit/Support/CurrencyTotalsTest.php
git commit -m "feat: add shared per-currency totalling helper for admin money metrics"
```

---

### Task 2: Per-currency subscription revenue

Fixes the live defect where `AdminRevenueService` sums `amount` across rows with different `currency` values. Adds `totals_by_currency` without removing the existing scalar keys, so the Marketing tab keeps working until Task 7 updates it.

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminRevenueService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminRevenueCurrencyBreakdownTest.php`

**Interfaces:**
- Consumes: `CurrencyTotals::fromPairs()` from Task 1.
- Produces: `AdminRevenueService::getOverview()` gains three keys — `totals_by_currency`, `automated_by_currency`, `manual_by_currency`, each `array<string, float>`. Tasks 5 and 7 consume `totals_by_currency`.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminRevenueCurrencyBreakdownTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Admin\AdminRevenueService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminRevenueCurrencyBreakdownTest extends TestCase
{
    use RefreshDatabase;

    private function makeTransaction(string $currency, float $amount, string $provider = 'paystack'): PaymentTransaction
    {
        $user = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $subscription = Subscription::create([
            'user_id' => $user->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
        ]);

        return PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => $provider,
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => $amount,
            'currency' => $currency,
            'status' => 'success',
        ]);
    }

    public function test_it_reports_revenue_broken_down_per_currency(): void
    {
        $this->makeTransaction('NGN', 10000);
        $this->makeTransaction('NGN', 5000);
        $this->makeTransaction('GHS', 300);

        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame(['NGN' => 15000.0, 'GHS' => 300.0], $overview['totals_by_currency']);
    }

    public function test_it_splits_manual_and_automated_revenue_per_currency(): void
    {
        $this->makeTransaction('NGN', 10000, 'paystack');
        $this->makeTransaction('NGN', 2000, 'bank_transfer');
        $this->makeTransaction('KES', 400, 'bank_transfer');

        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame(['NGN' => 10000.0], $overview['automated_by_currency']);
        $this->assertSame(['NGN' => 2000.0, 'KES' => 400.0], $overview['manual_by_currency']);
    }

    public function test_it_buckets_a_transaction_with_no_currency_under_ngn(): void
    {
        $txn = $this->makeTransaction('NGN', 700);
        $txn->forceFill(['currency' => null])->save();

        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame(['NGN' => 700.0], $overview['totals_by_currency']);
    }

    public function test_it_returns_empty_breakdowns_when_there_are_no_payments(): void
    {
        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame([], $overview['totals_by_currency']);
        $this->assertSame([], $overview['automated_by_currency']);
        $this->assertSame([], $overview['manual_by_currency']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminRevenueCurrencyBreakdownTest`
Expected: FAIL — `Undefined array key "totals_by_currency"`

- [ ] **Step 3: Write minimal implementation**

In `laravel-server/app/Services/Admin/AdminRevenueService.php`, add the import:

```php
use App\Support\CurrencyTotals;
```

Add this private method to the class:

```php
private function totalsByCurrency($transactions): array
{
    return CurrencyTotals::fromPairs(
        $transactions->map(fn ($txn) => [
            'currency' => $txn->currency,
            'amount' => $txn->amount,
        ])
    );
}
```

Then, in `getOverview()`, immediately after the existing `$manualRevenue` assignment, add:

```php
$manualTransactions = $transactions->where('provider', 'bank_transfer');
$automatedTransactions = $transactions->where('provider', '!=', 'bank_transfer');
```

And add these three keys to the returned array, directly after the existing `'automated_revenue' => ...` line:

```php
'totals_by_currency' => $this->totalsByCurrency($transactions),
'automated_by_currency' => $this->totalsByCurrency($automatedTransactions),
'manual_by_currency' => $this->totalsByCurrency($manualTransactions),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=AdminRevenueCurrencyBreakdownTest`
Expected: PASS, 4 tests

Run the existing revenue test to confirm no regression:
Run: `cd laravel-server && php artisan test --filter=AdminRevenueOverviewTest`
Expected: PASS

- [ ] **Step 5: Move the fixed bug into FIXED_BUGS.md**

In `docs/FIXED_BUGS.md`, add an entry recording that `AdminRevenueService::getOverview()` summed `amount` across mixed `currency` values without conversion, producing a meaningless scalar once any non-NGN payment landed, and that it now reports `totals_by_currency` per the Phase 1 spec's no-conversion decision.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminRevenueService.php laravel-server/tests/Feature/Admin/AdminRevenueCurrencyBreakdownTest.php docs/FIXED_BUGS.md
git commit -m "fix: report subscription revenue per currency instead of summing mixed currencies"
```

---

### Task 3: Platform-wide stock value per currency

The figure previously mislabelled "Platform Revenue" on Overview. Computed as one set-based query grouped by the owning store's currency, **not** by looping `stockValueRaw()` per store, which would be an N+1 across the whole fleet.

Scoping follows the existing per-store rule: `stock_batches.store_id` is **not** authoritative — scope via `product_id` → `products.store_id` (see `docs/KNOWN_BUGS.md` A-145).

**Files:**
- Create: `laravel-server/app/Services/Admin/AdminFleetMetricsService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminFleetStockValueTest.php`

**Interfaces:**
- Consumes: `CurrencyTotals::fromPairs()` from Task 1.
- Produces: `AdminFleetMetricsService::stockValueByCurrency(): array<string, float>`. Task 8 consumes it via a controller endpoint added in this task.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminFleetStockValueTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminFleetMetricsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminFleetStockValueTest extends TestCase
{
    use RefreshDatabase;

    private function makeStore(?string $currency): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'name' => 'Store '.uniqid(),
            'user_id' => $owner->id,
            'currency' => $currency,
        ]);
    }

    private function stockStore(Store $store, float $quantity, float $costPrice): void
    {
        $product = Product::create([
            'name' => 'Product '.uniqid(),
            'store_id' => $store->id,
        ]);

        StockBatch::create([
            'product_id' => $product->id,
            'store_id' => $store->id,
            'quantity' => $quantity,
            'cost_price' => $costPrice,
        ]);
    }

    public function test_it_totals_stock_value_per_store_currency(): void
    {
        $this->stockStore($this->makeStore('NGN'), 10, 100);
        $this->stockStore($this->makeStore('NGN'), 5, 200);
        $this->stockStore($this->makeStore('GHS'), 3, 50);

        $totals = app(AdminFleetMetricsService::class)->stockValueByCurrency();

        $this->assertSame(['NGN' => 2000.0, 'GHS' => 150.0], $totals);
    }

    public function test_it_buckets_a_store_with_no_currency_under_ngn(): void
    {
        $this->stockStore($this->makeStore(null), 4, 25);

        $totals = app(AdminFleetMetricsService::class)->stockValueByCurrency();

        $this->assertSame(['NGN' => 100.0], $totals);
    }

    public function test_it_excludes_soft_deleted_stock_batches(): void
    {
        $store = $this->makeStore('NGN');
        $this->stockStore($store, 10, 100);
        StockBatch::query()->first()->delete();

        $totals = app(AdminFleetMetricsService::class)->stockValueByCurrency();

        $this->assertSame([], $totals);
    }

    public function test_it_returns_an_empty_array_when_the_fleet_holds_no_stock(): void
    {
        $this->makeStore('NGN');

        $this->assertSame([], app(AdminFleetMetricsService::class)->stockValueByCurrency());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminFleetStockValueTest`
Expected: FAIL — `Class "App\Services\Admin\AdminFleetMetricsService" not found`

- [ ] **Step 3: Write minimal implementation**

Create `laravel-server/app/Services/Admin/AdminFleetMetricsService.php`:

```php
<?php

namespace App\Services\Admin;

use App\Support\CurrencyTotals;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AdminFleetMetricsService
{
    public function stockValueByCurrency(): array
    {
        if (! Schema::hasTable('stock_batches') || ! Schema::hasTable('products') || ! Schema::hasTable('stores')) {
            return [];
        }

        $rows = DB::table('stock_batches')
            ->join('products', 'products.id', '=', 'stock_batches.product_id')
            ->join('stores', 'stores.id', '=', 'products.store_id')
            ->whereNull('stock_batches.deleted_at')
            ->groupBy('stores.currency')
            ->selectRaw('stores.currency as currency, COALESCE(SUM(stock_batches.quantity * stock_batches.cost_price), 0) as amount')
            ->get();

        return CurrencyTotals::fromPairs(
            $rows->map(fn ($row) => ['currency' => $row->currency, 'amount' => $row->amount])
        );
    }
}
```

Note: `products` may also carry `deleted_at`. If `Schema::hasColumn('products', 'deleted_at')` is true, add `->whereNull('products.deleted_at')` to the query — verify against the migration before implementing and include the clause only if the column exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminFleetStockValueTest`
Expected: PASS, 4 tests

- [ ] **Step 5: Expose it on the stores endpoint**

In `laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php`, inject `AdminFleetMetricsService` into the constructor alongside the existing dependencies, and add `'stock_value_by_currency' => $this->fleetMetrics->stockValueByCurrency(),` to the payload returned by `stores()`.

Add an assertion to the test file confirming the key is present on the HTTP response for a `super_admin`, following the authenticated-request pattern in `tests/Feature/Admin/AdminDataAccuracyTest.php` (`$this->actingAs($this->superAdmin)` plus the `withoutMiddleware` block from its `setUp`).

- [ ] **Step 6: Run the stores tests**

Run: `cd laravel-server && php artisan test --filter="AdminFleetStockValueTest|AdminStoreSearchAndMetricsTest"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminFleetMetricsService.php laravel-server/app/Http/Controllers/Api/Admin/AdminStoreController.php laravel-server/tests/Feature/Admin/AdminFleetStockValueTest.php
git commit -m "feat: add platform-wide stock value roll-up per store currency"
```

---

### Task 4: Split `AdminPlatformService` (pure refactor)

`AdminPlatformService` is 590 lines holding six unrelated responsibilities, past §4's 350-line limit. This task moves code **without changing behaviour** — every existing test must pass untouched. Do not fix any metric here; Tasks 5 and 6 do that.

**Files:**
- Create: `laravel-server/app/Services/Admin/AdminSummaryService.php` (from `getGlobalSummary`, `calculateChange`, `getAlertTitle`)
- Create: `laravel-server/app/Services/Admin/AdminHealthService.php` (from `getSystemHealth`, `getRecentErrors`)
- Create: `laravel-server/app/Services/Admin/AdminCatalogService.php` (from `getGlobalProducts`, `getProductMetrics`, `standardizeCatalog`)
- Create: `laravel-server/app/Services/Admin/AdminActivityService.php` (from `getActivityLogs`, `globalSearch`)
- Delete: `laravel-server/app/Services/Admin/AdminPlatformService.php`
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminPlatformController.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: four services whose public method names are **unchanged** from the original. Tasks 5 and 6 modify `AdminSummaryService` and `AdminHealthService` respectively.

- [ ] **Step 1: Establish the green baseline**

Run: `cd laravel-server && php artisan test --filter="Admin"`
Expected: PASS. Record the test count — it must be identical after the refactor. If anything fails before you start, stop and report it rather than refactoring on red.

- [ ] **Step 2: Create the four services**

Move each method verbatim into its new class, carrying its `use` imports. Per the Global Constraints, migrate the long explanatory comment blocks you encounter (notably the `syncStatus` block in `getGlobalSummary` and the `getRecentErrors` docblock about `SENTRY_API_TOKEN`) out of the code and into `laravel-server/AGENTS.md` as part of this move — do not copy them into the new files.

- [ ] **Step 3: Rewire the controller**

Replace the single `AdminPlatformService` constructor dependency with the four new services. Each controller method delegates to its new owner: `summary()` → `AdminSummaryService::getGlobalSummary()`, `health()` → `AdminHealthService::getSystemHealth()`, `errors()` → `AdminHealthService::getRecentErrors()`, `products()` → `AdminCatalogService::getGlobalProducts()`, `standardize()` → `AdminCatalogService::standardizeCatalog()`, `activityLogs()` → `AdminActivityService::getActivityLogs()`, `search()` → `AdminActivityService::globalSearch()`.

- [ ] **Step 4: Find and update every other reference**

Run: `cd laravel-server && grep -rn "AdminPlatformService" app/ tests/ routes/`
Expected: no results once all call sites are updated. Update each hit before proceeding.

- [ ] **Step 5: Delete the old service and verify behaviour is unchanged**

Run: `cd laravel-server && php artisan test --filter="Admin"`
Expected: PASS with the same test count as Step 1.

- [ ] **Step 6: Verify the line limit**

Run: `cd laravel-server && wc -l app/Services/Admin/Admin{Summary,Health,Catalog,Activity}Service.php app/Http/Controllers/Api/Admin/AdminPlatformController.php`
Expected: every file under 350. If one is over, split it further before committing.

- [ ] **Step 7: Commit**

```bash
git add -A laravel-server/app laravel-server/AGENTS.md
git commit -m "refactor: split AdminPlatformService into four domain services"
```

---

### Task 5: Correct the Overview metrics

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminSummaryService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminSummaryMetricHonestyTest.php`

**Interfaces:**
- Consumes: `AdminRevenueService::getOverview()['totals_by_currency']` (Task 2); `AdminFleetMetricsService` is **not** used here — stock value belongs to the Stores page only.
- Produces: `getGlobalSummary()` returns `stats` where the revenue entry has shape `['name' => 'Subscription Revenue', 'totals_by_currency' => array<string,float>, 'icon' => 'TrendingUp', 'color' => 'emerald']` (no `value`, no `change`, no `trend`), and `live_operations` has keys `audit_log_entries` (int), `sync_success_rate_24h` (`?string`, null when no sync activity), and **no** `active_connections`. Task 7 consumes both shapes.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminSummaryMetricHonestyTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminSummaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSummaryMetricHonestyTest extends TestCase
{
    use RefreshDatabase;

    private function statNamed(array $summary, string $name): array
    {
        foreach ($summary['stats'] as $stat) {
            if ($stat['name'] === $name) {
                return $stat;
            }
        }

        $this->fail("No stat named {$name}");
    }

    public function test_revenue_stat_reports_subscription_revenue_per_currency_not_tenant_gmv(): void
    {
        $summary = app(AdminSummaryService::class)->getGlobalSummary();
        $stat = $this->statNamed($summary, 'Subscription Revenue');

        $this->assertArrayHasKey('totals_by_currency', $stat);
        $this->assertArrayNotHasKey('change', $stat);
        $this->assertArrayNotHasKey('trend', $stat);
    }

    public function test_no_stat_claims_to_measure_global_inventory(): void
    {
        $summary = app(AdminSummaryService::class)->getGlobalSummary();
        $names = array_column($summary['stats'], 'name');

        $this->assertNotContains('Global Inventory', $names);
        $this->assertContains('Catalog Products', $names);
    }

    public function test_catalog_product_stat_is_a_raw_count_not_divided_by_a_thousand(): void
    {
        Product::create(['name' => 'Paracetamol', 'store_id' => null]);
        Product::create(['name' => 'Ibuprofen', 'store_id' => null]);

        $summary = app(AdminSummaryService::class)->getGlobalSummary();

        $this->assertSame('2', $this->statNamed($summary, 'Catalog Products')['value']);
    }

    public function test_live_operations_drops_the_fabricated_websocket_metric(): void
    {
        $operations = app(AdminSummaryService::class)->getGlobalSummary()['live_operations'];

        $this->assertArrayNotHasKey('active_connections', $operations);
        $this->assertArrayHasKey('audit_log_entries', $operations);
    }

    public function test_sync_success_rate_is_null_when_there_is_no_sync_activity_in_the_window(): void
    {
        $operations = app(AdminSummaryService::class)->getGlobalSummary()['live_operations'];

        $this->assertNull($operations['sync_success_rate_24h']);
    }

    public function test_sync_success_rate_only_counts_the_last_24_hours(): void
    {
        ActivityLog::create(['action' => 'SYNC_SUCCESS', 'created_at' => now()->subDays(3)]);
        ActivityLog::create(['action' => 'SYNC_SUCCESS', 'created_at' => now()->subHour()]);
        ActivityLog::create(['action' => 'SYNC_FAILURE', 'created_at' => now()->subHour()]);

        $operations = app(AdminSummaryService::class)->getGlobalSummary()['live_operations'];

        $this->assertSame('50%', $operations['sync_success_rate_24h']);
    }

    public function test_count_stats_report_an_absolute_weekly_delta(): void
    {
        $summary = app(AdminSummaryService::class)->getGlobalSummary();

        $this->assertSame('+0 this week', $this->statNamed($summary, 'Total Stores')['change']);
    }

    public function test_it_reports_active_subscriptions_and_trials(): void
    {
        $user = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        \App\Models\Subscription::create([
            'user_id' => $user->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
        ]);

        $summary = app(AdminSummaryService::class)->getGlobalSummary();

        $this->assertSame('1', $this->statNamed($summary, 'Active Subscriptions')['value']);
    }

    public function test_it_counts_only_stores_synced_within_the_last_day(): void
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        Store::create(['name' => 'Fresh', 'user_id' => $owner->id, 'last_sync_at' => now()->subHour()]);
        Store::create(['name' => 'Stale', 'user_id' => $owner->id, 'last_sync_at' => now()->subDays(5)]);
        Store::create(['name' => 'Never', 'user_id' => $owner->id, 'last_sync_at' => null]);

        $summary = app(AdminSummaryService::class)->getGlobalSummary();

        $this->assertSame('1', $this->statNamed($summary, 'Stores Synced (24h)')['value']);
    }
}
```

If `ActivityLog::create` rejects a bare `action`/`created_at` pair because of required columns, mirror the log-creation helper already used in `tests/Feature/ActivityLogActorRoleFilterTest.php` rather than inventing a new fixture shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminSummaryMetricHonestyTest`
Expected: FAIL — `No stat named Subscription Revenue`

- [ ] **Step 3: Write the implementation**

In `AdminSummaryService`:

1. Inject `AdminRevenueService` via the constructor.
2. Delete the `$totalRevenue` / `$prevRevenue` / `$revenueChange` block built on `Sale::sum('total_amount')`.
3. Replace the `Platform Revenue` stat entry with:

```php
[
    'name' => 'Subscription Revenue',
    'totals_by_currency' => $this->revenueService->getOverview()['totals_by_currency'],
    'icon' => 'TrendingUp',
    'color' => 'emerald',
],
```

4. Replace the `Global Inventory` stat with a `Catalog Products` entry whose `value` is `number_format(Product::count())` and whose `change` is the absolute weekly delta below.
5. Replace `calculateChange()` usage in the three count stats with an absolute delta helper:

```php
private function weeklyDelta(int $createdInLastWeek): string
{
    return '+'.number_format($createdInLastWeek).' this week';
}
```

Compute each stat's argument as a `where('created_at', '>=', now()->subDays(7))->count()` on the relevant model. Remove `calculateChange()` entirely once unused.

6. Replace the `live_operations` array with:

```php
$syncLogs = ActivityLog::where('action', 'like', 'SYNC_%')
    ->where('created_at', '>=', now()->subDay());
$syncTotal = $syncLogs->count();
$syncSuccess = (clone $syncLogs)->where('action', 'SYNC_SUCCESS')->count();

$liveOperations = [
    'audit_log_entries' => ActivityLog::count(),
    'sync_success_rate_24h' => $syncTotal > 0
        ? round(($syncSuccess / $syncTotal) * 100, 1).'%'
        : null,
];
```

Note `$syncLogs` is a builder, so clone before the second count or the `where` leaks into the first.

7. Add the two new stats: **Active Subscriptions / Trials** from `Subscription::where('status', 'active')->count()` and `Subscription::where('is_trial', true)->where('status', 'active')->count()`; and **Stores Synced (24h)** from `Store::where('last_sync_at', '>=', now()->subDay())->count()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=AdminSummaryMetricHonestyTest`
Expected: PASS, 9 tests

Run: `cd laravel-server && php artisan test --filter="Admin"`
Expected: PASS. `AdminDataAccuracyTest` and `AdminRecentStoresSyncStatusTest` assert against the summary payload — if either fails, it is asserting the *old* wrong revenue figure. Update that assertion to the new shape and note it in the commit; do not weaken the new behaviour to satisfy an assertion of the bug.

- [ ] **Step 5: Verify the line limit**

Run: `cd laravel-server && wc -l app/Services/Admin/AdminSummaryService.php`
Expected: under 350.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminSummaryService.php laravel-server/tests/Feature/Admin/
git commit -m "fix: report real subscription revenue and catalog counts on the admin overview"
```

---

### Task 6: Remove the health-telemetry fabrications

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminHealthService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminHealthHonestyTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getSystemHealth()` returns `['overallStatus' => string, 'platformAge' => string, 'databaseConnectMs' => ?float, 'resources' => ['loadAverage' => ?array{1: float, 5: float, 15: float}, 'memory' => ?array{used: string, total: string, percent: float}, 'disk' => ?array{used: string, total: string, percent: float}, 'database' => ['load' => int, 'status' => string]], 'probes' => list<array{name: string, status: 'Operational'|'Degraded'|'Unavailable'}>]`. **`nodes`, `uptime`, `latency` and `cpu` are gone.** Task 7 consumes this shape.

A `null` resource means "could not be measured on this host" and the UI must render it as such.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/Admin/AdminHealthHonestyTest.php`:

```php
<?php

namespace Tests\Feature\Admin;

use App\Services\Admin\AdminHealthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminHealthHonestyTest extends TestCase
{
    use RefreshDatabase;

    private function health(): array
    {
        return app(AdminHealthService::class)->getSystemHealth();
    }

    public function test_it_no_longer_reports_fabricated_infrastructure_nodes(): void
    {
        $this->assertArrayNotHasKey('nodes', $this->health());
    }

    public function test_it_reports_real_probes_instead(): void
    {
        $names = array_column($this->health()['probes'], 'name');

        $this->assertContains('Database', $names);
        $this->assertContains('Cache', $names);
        $this->assertContains('Storage', $names);
    }

    public function test_it_reports_database_connect_time_not_a_p99_latency(): void
    {
        $health = $this->health();

        $this->assertArrayNotHasKey('latency', $health);
        $this->assertArrayHasKey('databaseConnectMs', $health);
        $this->assertIsFloat($health['databaseConnectMs']);
    }

    public function test_it_reports_platform_age_not_uptime(): void
    {
        $health = $this->health();

        $this->assertArrayNotHasKey('uptime', $health);
        $this->assertArrayHasKey('platformAge', $health);
    }

    public function test_it_reports_load_average_not_a_fabricated_cpu_percentage(): void
    {
        $resources = $this->health()['resources'];

        $this->assertArrayNotHasKey('cpu', $resources);
        $this->assertArrayHasKey('loadAverage', $resources);
    }

    public function test_load_average_is_null_rather_than_zero_when_unmeasurable(): void
    {
        $loadAverage = $this->health()['resources']['loadAverage'];

        if ($loadAverage === null) {
            $this->assertNull($loadAverage);

            return;
        }

        $this->assertArrayHasKey(1, $loadAverage);
        $this->assertArrayHasKey(5, $loadAverage);
        $this->assertArrayHasKey(15, $loadAverage);
    }

    public function test_memory_is_null_rather_than_a_zero_bar_when_shell_exec_is_unavailable(): void
    {
        $memory = $this->health()['resources']['memory'];

        if ($memory === null) {
            $this->assertNull($memory);

            return;
        }

        $this->assertNotSame('Unknown', $memory['used']);
        $this->assertNotSame(0, $memory['percent']);
    }
}
```

The last two tests are deliberately written to pass on a host where the reading *is* available and on one where it is not — what they forbid is the middle ground the old code produced: a present-looking value that is actually a fabrication (`'Unknown'`, or a `0` that reads as idle).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminHealthHonestyTest`
Expected: FAIL — `nodes` key still present

- [ ] **Step 3: Write the implementation**

Rewrite `getSystemHealth()` in `AdminHealthService`:

- **Load average:** return `null` unless `function_exists('sys_getloadavg')` and the call yields an array; when it does, return `[1 => $load[0], 5 => $load[1], 15 => $load[2]]` as floats. Never multiply by 10.
- **Memory:** return `null` on any failure path — `shell_exec` missing, disabled via `disable_functions`, returning empty, or output that does not parse. Do not return `'Unknown'` strings.
- **Disk:** return `null` when `disk_total_space()` is unavailable or returns `0`/`false`, rather than the current `'Unknown'` strings with `percent => 0`.
- **Database connect time:** keep the `microtime` measurement, return it as a float of milliseconds under `databaseConnectMs`, and `null` with `status => 'Degraded'` on exception.
- **Platform age:** rename the oldest-`ActivityLog` calculation to `platformAge`.
- **Probes:** replace the hardcoded `nodes` array with real checks, each returning `Operational`, `Degraded` or `Unavailable`: `Database` (PDO connect succeeded), `Cache` (write-then-read a sentinel key through `Cache::put`/`Cache::get`), `Storage` (`Storage::disk('local')` is writable), `Queue` (configured connection resolves). Never hardcode a latency literal.
- Drop the `latency`, `uptime`, `nodes` and `resources.cpu` keys entirely.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=AdminHealthHonestyTest`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminHealthService.php laravel-server/tests/Feature/Admin/AdminHealthHonestyTest.php
git commit -m "fix: replace fabricated health telemetry with real probes and nullable readings"
```

---

### Task 7: Frontend types, Overview page and Live Operations

**Files:**
- Modify: `web/lib/types/admin.ts:12-18` (`AdminStat`), `:100-104` (`LiveOperations`), `:119-131` (`AdminHealth`, `ServiceNode`)
- Modify: `web/components/admin/dashboard/stats-grid.tsx`
- Modify: `web/components/admin/dashboard/system-health.tsx:28-40`
- Create: `web/components/admin/dashboard/currency-stat-value.tsx`
- Test: `web/__tests__/admin-currency-stat-value.test.tsx`

**Interfaces:**
- Consumes: the `stats` and `live_operations` shapes from Task 5; the health shape from Task 6.
- Produces: `CurrencyStatValue({ totals }: { totals: Record<string, number> })` — renders one `formatMoney` line per currency, and an explicit empty state when `totals` is `{}` or undefined.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/admin-currency-stat-value.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CurrencyStatValue } from "@/components/admin/dashboard/currency-stat-value";

describe("CurrencyStatValue", () => {
  it("renders one line per currency present", () => {
    render(<CurrencyStatValue totals={{ NGN: 15000, GHS: 300 }} />);

    expect(screen.getByText(/15,000/)).toBeDefined();
    expect(screen.getByText(/300/)).toBeDefined();
  });

  it("shows an explicit empty state rather than a zero amount", () => {
    render(<CurrencyStatValue totals={{}} />);

    expect(screen.getByText(/no payments yet/i)).toBeDefined();
  });

  it("does not crash when totals are missing entirely", () => {
    render(<CurrencyStatValue totals={undefined as never} />);

    expect(screen.getByText(/no payments yet/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/admin-currency-stat-value.test.tsx`
Expected: FAIL — cannot resolve `currency-stat-value`

- [ ] **Step 3: Write the component**

Create `web/components/admin/dashboard/currency-stat-value.tsx`:

```tsx
import { formatMoney } from "@/lib/utils/currency";

export function CurrencyStatValue({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals ?? {});

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments yet</p>;
  }

  return (
    <div className="space-y-0.5">
      {entries.map(([currency, amount]) => (
        <p key={currency} className="text-2xl font-black text-foreground">
          {formatMoney(amount, currency)}
        </p>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/admin-currency-stat-value.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 5: Update the types**

In `web/lib/types/admin.ts`: make `AdminStat`'s `value`, `change` and `trend` optional and add `totals_by_currency?: Record<string, number>`. Replace `LiveOperations` with `{ audit_log_entries?: number; sync_success_rate_24h?: string | null }`. Replace `AdminHealth` with Task 6's shape and **delete the `ServiceNode` interface**.

- [ ] **Step 6: Update the consuming components**

- `stats-grid.tsx`: render `CurrencyStatValue` when a stat carries `totals_by_currency`, the scalar `value` otherwise; render the `change` string only when present, with no trend arrow when `trend` is absent.
- `system-health.tsx`: delete the "Active WebSocket Connections" row entirely. Relabel "Total API Requests" → "Audit Log Entries" reading `audit_log_entries`. Render `sync_success_rate_24h` as "No sync activity (24h)" when `null` — **remove the `|| '100%'` fallback**, which is the fabrication.

- [ ] **Step 7: Verify the build and full suite**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. Deleting `ServiceNode` and narrowing `AdminHealth` will surface every stale consumer — fix each.

Run: `cd web && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/lib/types/admin.ts web/components/admin/dashboard/ web/__tests__/admin-currency-stat-value.test.tsx
git commit -m "feat: render admin money metrics per currency and drop the websocket fabrication"
```

---

### Task 8: Total stock value on the Stores page

**Files:**
- Modify: `web/lib/api/admin-hooks-stores.ts` (response type)
- Modify: `web/app/admin/stores/page.tsx`
- Create: `web/components/admin/stores/fleet-stock-value-card.tsx`

**Interfaces:**
- Consumes: `stock_value_by_currency` from Task 3's endpoint; `CurrencyStatValue` from Task 7.
- Produces: `FleetStockValueCard({ totals }: { totals: Record<string, number> })`.

- [ ] **Step 1: Add the field to the stores response type**

In `web/lib/api/admin-hooks-stores.ts`, add `stock_value_by_currency?: Record<string, number>` to the stores response type.

- [ ] **Step 2: Create the card**

Create `web/components/admin/stores/fleet-stock-value-card.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";
import { CurrencyStatValue } from "@/components/admin/dashboard/currency-stat-value";

export function FleetStockValueCard({ totals }: { totals: Record<string, number> }) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Total Stock Value
          </CardTitle>
          <CardDescription>Cost value of stock held across the fleet</CardDescription>
        </div>
        <Package className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <CurrencyStatValue totals={totals} />
      </CardContent>
    </Card>
  );
}
```

`CurrencyStatValue`'s empty state reads "No payments yet", which is wrong wording here. Add an optional `emptyLabel` prop to it in this step, defaulting to "No payments yet", and pass `emptyLabel="No stock recorded"` from this card. Update `web/__tests__/admin-currency-stat-value.test.tsx` with a case asserting a custom `emptyLabel` renders.

- [ ] **Step 3: Mount it on the stores page**

Render `FleetStockValueCard` above the store table in `web/app/admin/stores/page.tsx`, fed from the existing `useAdminStores` response.

- [ ] **Step 4: Verify the build and the line limit**

Run: `cd web && npx tsc --noEmit && wc -l app/admin/stores/page.tsx components/admin/stores/fleet-stock-value-card.tsx`
Expected: no type errors; both files under 350 lines. `stores/page.tsx` is already at 384 — **it must be split as part of this task** to come under the limit, per §4 and the Global Constraints. Extract the dialog-wiring block into `components/admin/stores/store-dialog-host.tsx`.

- [ ] **Step 5: Commit**

```bash
git add web/app/admin/stores/ web/components/admin/stores/ web/lib/api/admin-hooks-stores.ts
git commit -m "feat: surface per-currency fleet stock value on the admin stores page"
```

---

### Task 9: Operations page and navigation restructure

**Files:**
- Create: `web/app/admin/operations/page.tsx`
- Create: `web/components/admin/operations/health-resources-card.tsx`
- Create: `web/components/admin/operations/health-probes-card.tsx`
- Create: `web/components/admin/operations/sentry-issues-card.tsx`
- Modify: `web/app/admin/system/page.tsx` → redirect only
- Modify: `web/components/admin/sidebar-items.ts`
- Modify: `web/app/admin/settings/[[...tab]]/settings-client.tsx`
- Modify: `web/app/admin/communications/page.tsx`
- Move: `web/app/admin/system/default-account-manager-card.tsx` → `web/components/admin/views/default-account-manager-card.tsx`
- Delete: `web/components/admin/views/system-health-tab.tsx`
- Test: `web/__tests__/admin-nav-visibility.test.ts`

**Interfaces:**
- Consumes: Task 6's health shape; Task 7's updated `AdminHealth` type.
- Produces: the `/admin/operations` route and an `operations` entry in `sidebarItems`.

- [ ] **Step 1: Write the failing nav test**

Create `web/__tests__/admin-nav-visibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { visibleSidebarItems, sidebarItems } from "@/components/admin/sidebar-items";

const roleWith = (permissions: string[]) => ({
  role: "custom_platform_role",
  effective_permissions: permissions,
});

describe("admin nav visibility", () => {
  it("exposes an operations entry", () => {
    expect(sidebarItems.map((i) => i.id)).toContain("operations");
  });

  it("lets a custom platform role reach operations without a code change", () => {
    const ids = visibleSidebarItems(roleWith(["manage_platform", "view_platform_data"])).map(
      (i) => i.id,
    );

    expect(ids).toContain("operations");
  });

  it("hides items a custom role lacks permission for", () => {
    const ids = visibleSidebarItems(roleWith(["manage_platform"])).map((i) => i.id);

    expect(ids).not.toContain("users");
    expect(ids).not.toContain("activity");
  });

  it("still shows every item to super_admin", () => {
    const ids = visibleSidebarItems({ role: "super_admin", effective_permissions: [] }).map(
      (i) => i.id,
    );

    expect(ids).toContain("operations");
    expect(ids).toContain("users");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/admin-nav-visibility.test.ts`
Expected: FAIL — no `operations` entry

- [ ] **Step 3: Build the Operations page**

Compose `/admin/operations` from the three new cards, reading `useAdminHealth()` and `useAdminErrors()`. Carry over the real content of `app/admin/system/page.tsx` — resource readings and the Sentry issue list — and render each `null` resource from Task 6 as "Unavailable on this host" rather than a zeroed `Progress` bar. Give the page a single `<h1>`.

- [ ] **Step 4: Add the nav entry**

Add to `sidebarItems`, after `stores`:

```ts
{
  id: "operations",
  name: "Operations",
  icon: Activity,
  href: "/admin/operations",
  permissions: ["view_platform_data"],
},
```

Import `Activity` from `lucide-react`.

- [ ] **Step 5: Redirect the old route**

Replace the body of `web/app/admin/system/page.tsx` with a client component that calls `router.replace("/admin/operations")`. Keep the file so existing bookmarks resolve.

- [ ] **Step 6: Move the tabs**

- `settings-client.tsx`: remove the `health` trigger and `TabsContent`, and delete the `SystemHealthTab` import. The default tab becomes `billing` — update `activeTab`'s fallback and the `handleTabChange` special case that currently maps `health` to the bare `/admin/settings` path, so `billing` gets that treatment instead. Remove the `templates` trigger and content. Add an `account-manager` tab rendering the moved `DefaultAccountManagerCard`.
- `communications/page.tsx`: add a `templates` tab rendering `EmailTemplatesTab`, gated to `isSuperAdmin` like the existing `mails` and `feedback` tabs.
- Delete `components/admin/views/system-health-tab.tsx`.

- [ ] **Step 7: Run tests and the type check**

Run: `cd web && npx vitest run __tests__/admin-nav-visibility.test.ts && npx tsc --noEmit && npm test`
Expected: PASS, no type errors.

- [ ] **Step 8: Browser smoke test — required, not optional**

§9 is explicit that backend verification is not UI verification, and this task changes nav visibility and route structure. Start the app, sign in to `/admin`, and confirm by eye:

1. **As `super_admin`:** Operations appears in the sidebar and loads; the Sentry feed is visible without typing a URL; Settings no longer shows System Health or Email Templates but does show Default Account Manager; Communications shows Templates and it loads; `/admin/settings` lands on Billing & Plans with no blank tab; visiting `/admin/system` redirects to `/admin/operations`.
2. **As a custom platform role** holding `manage_platform` + `view_platform_data` (create one through the existing admin-delegation "create role" UI): sign in, confirm Operations is reachable and its data call returns 200 rather than 403.

Record what you observed in the commit body. If any step fails, fix it before committing rather than reporting the task done.

- [ ] **Step 9: Commit**

```bash
git add -A web/app/admin web/components/admin web/__tests__
git commit -m "refactor: consolidate admin telemetry onto a reachable operations page"
```

---

### Task 10: Fabrication scanner and documentation

**Files:**
- Create: `web/__tests__/no-fabricated-metrics.test.ts`
- Modify: `web/AGENTS.md`, `laravel-server/AGENTS.md`, `docs/KNOWN_BUGS.md`, `docs/SYSTEM_FEATURES_DOCUMENTATION.md`

**Interfaces:**
- Consumes: the finished state of Tasks 5-9.
- Produces: a build-failing guard against re-introduced metric literals.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/no-fabricated-metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCANNED_DIRS = ["app/admin", "components/admin"];

const FABRICATIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: "hardcoded 42ms latency", pattern: /"42ms"|'42ms'/ },
  { label: "optimistic 100% sync fallback", pattern: /\|\|\s*['"]100%['"]/ },
  { label: "hardcoded performance badge", pattern: /High Performance/ },
  { label: "placeholder status-page toast", pattern: /Status Page Pending/ },
  { label: "non-existent WebSocket metric", pattern: /WebSocket/ },
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

describe("admin metrics carry no fabricated literals (Phase 1)", () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)));

  for (const { label, pattern } of FABRICATIONS) {
    it(`leaves no ${label}`, () => {
      const offenders = files
        .filter((file) => pattern.test(readFileSync(file, "utf8")))
        .map((file) => path.relative(ROOT, file));

      expect(offenders).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails or passes for the right reason**

Run: `cd web && npx vitest run __tests__/no-fabricated-metrics.test.ts`
Expected: PASS if Tasks 5-9 removed every literal. **If it fails, that is the test working** — remove the literal it names rather than relaxing the pattern.

- [ ] **Step 3: Update the package docs**

- `web/AGENTS.md`: a new section on the admin IA — the Operations page as the single telemetry surface, why `/admin/system` is a redirect rather than a deletion, where Email Templates and the account-manager card now live, and the rule that unmeasurable metrics render as unavailable.
- `laravel-server/AGENTS.md`: the `AdminPlatformService` split and which service owns what; the per-currency money rule and `CurrencyTotals`; the long explanatory comments migrated out of the code in Task 4.

- [ ] **Step 4: Update the bug and feature docs**

- `docs/KNOWN_BUGS.md`: log the two defects this phase deliberately does not fix — `AdminRevenueService::getOverview()`'s PHP-side pagination (`->get()` on all matching rows, violating §8; Phase 3), and the oversized admin files not touched here (`activity/page.tsx` 550, `broadcasts-tab.tsx` 472, `users/page.tsx` 420, `subscription-config-tab.tsx` 399, `users/new/page.tsx` 394). Include where each is and the fix if known.
- `docs/SYSTEM_FEATURES_DOCUMENTATION.md`: document the Operations page as a shipped feature.

- [ ] **Step 5: Run the full suite in both packages**

Run: `cd laravel-server && php artisan test`
Run: `cd web && npm test && npx tsc --noEmit`
Expected: PASS. Note that `vitest` has a known flaky teardown false-failure in this repo — if a failure is a teardown error rather than an assertion, re-run before treating it as real.

- [ ] **Step 6: Commit**

```bash
git add web/__tests__/no-fabricated-metrics.test.ts web/AGENTS.md laravel-server/AGENTS.md docs/
git commit -m "test: guard against re-introduced fabricated admin metrics and document phase 1"
```

---

## Verification

Against the spec's success criteria:

1. No fabricated figure remains → Task 10's scanner enforces it mechanically.
2. Overview revenue equals Marketing → Revenue → both read `AdminRevenueService` (Tasks 2, 5).
3. Stock value on Stores, per currency → Tasks 3, 8.
4. Every telemetry surface reachable from the sidebar → Task 9, verified in a browser.
5. Templates beside campaigns → Task 9.
6. No file over 350 lines → checked in Tasks 4, 5, 8.
7. Unavailable metrics visibly unavailable → Tasks 6, 7, 9.
