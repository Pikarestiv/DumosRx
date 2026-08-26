# Fleet Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the cross-store fleet overview from `web/`'s dashboard into `client/` — aggregate stats cards, a cloud-storage meter, a stores summary table, and the daily-summary email trigger — folded into the existing Settings > Store Profile tab.

**Architecture:** A new, slim `GET /dashboard/stats` Laravel endpoint (standalone, not a refactor of the existing untested `getSummary`) backs a new `client/` API method, type, and query hook. All new data is online-only, no local SQLite, no sync-engine — this is account/subscription-owner-level data, not POS operational data. The UI is three small presentational components composed into one `FleetOverview` card, mounted above the existing Fleet management list.

**Tech Stack:** Laravel 10 (Eloquent, PHPUnit) for the backend; Next.js 14 App Router with static export for `client/`; TanStack Query; Vitest for client-side unit tests.

**Spec:** `docs/superpowers/specs/2026-08-26-account-management-and-fleet-overview-design.md`, Section E. Note: the spec names a `stock_batch_value` stats field; the actual backend field (verified against `DashboardService`) is `inventory_value` — this plan uses the real field name throughout.

## Global Constraints

- Fleet Overview reads are online-only: no local SQLite table, no sync-engine involvement (this is account/subscription-owner-level data, not POS operational data).
- The new `GET /dashboard/stats` endpoint is added standalone, **not** by refactoring the existing, untested `DashboardService::getSummary`/`DashboardController::summary` — zero regression risk to already-shipped code. Some field-computation logic is necessarily near-duplicated between the two; that duplication is accepted as the lower-risk choice given `getSummary` has no test coverage to refactor against safely.
- `getFleetStats()`'s stats block uses a fixed 7-day growth-comparison window (no period selector) — there is no UI requirement for period switching; don't build one.
- Fleet Overview mounts in the existing Settings > Store Profile tab (`client/components/settings/store-settings.tsx`), directly above `<MultiStoreCard />` — no new top-level nav entry, per the standing decision to keep Fleet/Staff/Billing Settings-tab-only.
- The stores table's row click does NOT attempt to recreate the `store-details` drill-down view that this migration is deliberately not porting — the table is informational only.

---

### Task 1: `GET /dashboard/stats` backend endpoint

**Files:**
- Modify: `laravel-server/app/Services/Web/DashboardService.php` (add `getStats` method)
- Modify: `laravel-server/app/Http/Controllers/Api/Web/DashboardController.php` (add `stats` action)
- Modify: `laravel-server/routes/api.php:93-97` (add route inside the existing `dashboard` prefix group)
- Test: `laravel-server/tests/Feature/DashboardStatsTest.php`

**Interfaces:**
- Produces: `GET /dashboard/stats` → `200 { stats: { total_sales: {value:float, growth:string}, inventory_value: {value:float}, customers: {value:int, growth:string}, stores_count:int, last_sync:string, cloud_storage: {used_gb:float, limit_gb:int, percentage:int} }, stores: Array<{id,name,location,status,lastSync,sales,staff_count,low_stock_alerts,expiring_items}> }`

- [ ] **Step 1: Write the failing feature test**

```php
<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardStatsTest extends TestCase
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

    public function test_stats_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/dashboard/stats');
        $response->assertStatus(401);
    }

    public function test_stats_returns_shape_for_authenticated_user_with_no_stores(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/stats');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'stats' => ['total_sales' => ['value', 'growth'], 'inventory_value' => ['value'], 'customers' => ['value', 'growth'], 'stores_count', 'last_sync', 'cloud_storage' => ['used_gb', 'limit_gb', 'percentage']],
            'stores',
        ]);
        $response->assertJson(['stats' => ['stores_count' => 0]]);
    }

    public function test_stats_includes_a_slim_store_row_without_heavy_nested_data(): void
    {
        $store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Main Branch',
            'store_type' => 'pharmacy',
        ]);
        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/stats');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'stores');
        $response->assertJsonPath('stores.0.id', $store->id);
        $response->assertJsonPath('stores.0.name', 'Main Branch');
        $response->assertJsonMissingPath('stores.0.recent_transactions');
        $response->assertJsonMissingPath('stores.0.recent_activities');
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/DashboardStatsTest.php`
Expected: FAIL — route `/api/v1/dashboard/stats` does not exist (404).

- [ ] **Step 3: Implement `DashboardService::getStats`**

In `laravel-server/app/Services/Web/DashboardService.php`, add this new public method (place it after `getSummary`, before `resetData`):

```php
    /**
     * Slim stats + stores payload for client/'s Fleet Overview — same
     * underlying figures as getSummary()'s 'stats'/'stores' keys, computed
     * independently rather than by refactoring getSummary (which has no
     * test coverage to refactor safely against), and without the heavy
     * per-store recent_transactions/recent_activities getSummary() includes.
     */
    public function getStats($user)
    {
        $userId = $user->id;
        $now = Carbon::now();
        $currentStartDate = $now->copy()->subDays(7);
        $previousStartDate = $now->copy()->subDays(14);
        $previousEndDate = $now->copy()->subDays(7);

        $storeIds = Store::where('user_id', $userId)->pluck('id')->toArray();
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($userId)->toArray();

        $totalSales = 0;
        $salesGrowth = 0;
        try {
            $totalSales = (float) Sale::whereIn('cashier_id', $userIds)->sum('total_amount');
            $salesThisPeriod = (float) Sale::whereIn('cashier_id', $userIds)
                ->where('created_at', '>=', $currentStartDate)
                ->sum('total_amount');
            $salesPrevPeriod = (float) Sale::whereIn('cashier_id', $userIds)
                ->where('created_at', '>=', $previousStartDate)
                ->where('created_at', '<', $previousEndDate)
                ->sum('total_amount');
            if ($salesPrevPeriod > 0) {
                $salesGrowth = (($salesThisPeriod - $salesPrevPeriod) / $salesPrevPeriod) * 100;
            } elseif ($salesThisPeriod > 0) {
                $salesGrowth = 100;
            }
        } catch (\Exception $e) {
            Log::error('DashboardService::getStats [Sales]: '.$e->getMessage());
        }

        $inventoryValue = 0;
        try {
            $inventoryStats = DB::table('stock_batches')
                ->whereIn('user_id', $userIds)
                ->select(DB::raw('SUM(quantity * cost_price) as total_value'))
                ->first();
            $inventoryValue = (float) ($inventoryStats->total_value ?? 0);
        } catch (\Exception $e) {
            Log::error('DashboardService::getStats [Inventory]: '.$e->getMessage());
        }

        $totalCustomers = 0;
        $newCustomersThisPeriod = 0;
        try {
            $totalCustomers = Customer::whereIn('user_id', $userIds)->count();
            $newCustomersThisPeriod = Customer::whereIn('user_id', $userIds)->where('created_at', '>=', $currentStartDate)->count();
        } catch (\Exception $e) {
            Log::error('DashboardService::getStats [Customers]: '.$e->getMessage());
        }

        $userStores = collect([]);
        try {
            if (Schema::hasTable('stores')) {
                $userStores = Store::where('user_id', $userId)->get();
            }
        } catch (\Exception $e) {
            Log::error('DashboardService::getStats [Stores]: '.$e->getMessage());
        }

        $lastSyncTime = 'Never';
        try {
            if ($userStores->count() > 0) {
                $latestStore = $userStores->sortByDesc('last_sync_at')->first();
                if ($latestStore && $latestStore->last_sync_at) {
                    $lastSyncTime = Carbon::parse($latestStore->last_sync_at)->diffForHumans();
                }
            }
        } catch (\Exception $e) {
            Log::error('DashboardService::getStats [Sync]: '.$e->getMessage());
        }

        $storesCount = $userStores->count();
        $stores = $userStores->map(function ($store) use ($storesCount, $userId) {
            $storeStaffIds = User::where('store_id', $store->id)->pluck('id')->toArray();
            $cashierIds = $storeStaffIds;
            if ($storesCount === 1) {
                $cashierIds[] = $userId;
            }
            $cashierIds = array_unique($cashierIds);

            $storeTotalSales = (float) Sale::whereIn('cashier_id', $cashierIds)->sum('total_amount');

            $lowStock = DB::table('products')
                ->whereIn('products.user_id', $cashierIds)
                ->whereNull('products.deleted_at')
                ->leftJoin('stock_batches', 'products.id', '=', 'stock_batches.product_id')
                ->select('products.id', 'products.reorder_level', DB::raw('SUM(COALESCE(stock_batches.quantity, 0)) as total_stock'))
                ->groupBy('products.id', 'products.reorder_level')
                ->get()
                ->filter(fn ($product) => $product->total_stock <= $product->reorder_level)
                ->count();

            $warningDays = $store->expiry_warning_days ?? 90;
            $expiringItems = DB::table('stock_batches')
                ->whereIn('user_id', $cashierIds)
                ->where('quantity', '>', 0)
                ->where('expiry_date', '<=', now()->addDays($warningDays))
                ->where('expiry_date', '>=', now()->toDateString())
                ->count();

            return [
                'id' => $store->id,
                'name' => $store->name,
                'location' => $store->location,
                'status' => $store->last_sync_at && Carbon::parse($store->last_sync_at)->gt(now()->subMinutes(30)) ? 'online' : 'offline',
                'lastSync' => $store->last_sync_at ? Carbon::parse($store->last_sync_at)->diffForHumans() : 'Never',
                'sales' => '₦'.number_format($storeTotalSales, 2),
                'staff_count' => count($storeStaffIds),
                'low_stock_alerts' => $lowStock,
                'expiring_items' => $expiringItems,
            ];
        })->values();

        $storageUsedGB = 0.05;
        try {
            $salesCount = Sale::whereIn('cashier_id', $userIds)->count();
            $customersCount = Customer::where('user_id', $userId)->count();
            $logsCount = Schema::hasTable('activity_logs') ? ActivityLog::where('user_id', $userId)->count() : 0;
            $storageUsedMB = 50 + (($salesCount + $customersCount + $logsCount) * 0.005);
            $storageUsedGB = round($storageUsedMB / 1024, 3);
        } catch (\Exception $e) {
        }
        $storageLimitGB = 10;
        $storagePercentage = min(100, round(($storageUsedGB / $storageLimitGB) * 100));

        return [
            'stats' => [
                'total_sales' => ['value' => $totalSales, 'growth' => round($salesGrowth, 1).'%'],
                'inventory_value' => ['value' => $inventoryValue],
                'customers' => ['value' => $totalCustomers, 'growth' => '+'.$newCustomersThisPeriod.' new'],
                'stores_count' => $storesCount,
                'last_sync' => $lastSyncTime,
                'cloud_storage' => ['used_gb' => $storageUsedGB, 'limit_gb' => $storageLimitGB, 'percentage' => $storagePercentage],
            ],
            'stores' => $stores,
        ];
    }
```

- [ ] **Step 4: Implement the controller action**

In `laravel-server/app/Http/Controllers/Api/Web/DashboardController.php`, add after `summary()`:

```php
    #[OA\Get(
        path: '/dashboard/stats',
        summary: 'Slim cross-store fleet stats for client dashboards',
        tags: ['Dashboard'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Fleet stats', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function stats(Request $request)
    {
        try {
            $data = $this->dashboardService->getStats($request->user());
            return response()->json($data);
        } catch (\Exception $e) {
            Log::critical("Dashboard Stats Error: " . $e->getMessage());
            return response()->json([
                'error' => 'Internal Server Error',
                'message' => $e->getMessage()
            ], 500);
        }
    }
```

- [ ] **Step 5: Register the route**

In `laravel-server/routes/api.php`, inside the existing `Route::prefix('dashboard')->group(...)` block (line 93-97), add immediately after the `/summary` line:

```php
            Route::get('/stats', [DashboardController::class, 'stats']);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd laravel-server && ./vendor/bin/phpunit tests/Feature/DashboardStatsTest.php`
Expected: PASS, all 3 tests.

- [ ] **Step 7: Commit**

```bash
git add laravel-server/app/Services/Web/DashboardService.php laravel-server/app/Http/Controllers/Api/Web/DashboardController.php laravel-server/routes/api.php laravel-server/tests/Feature/DashboardStatsTest.php
git commit -m "feat(server): add slim /dashboard/stats endpoint for client's fleet overview"
```

---

### Task 2: `getFleetStats()` client API method + type + hook

**Files:**
- Modify: `client/lib/types/store.ts` (add `FleetStats`, extend `FleetStore` with the stats-table fields)
- Modify: `client/lib/api/client.ts` (add `getFleetStats()`, near `getStores`)
- Modify: `client/lib/query-keys.ts` (add `fleet.stats` entry)
- Create: `client/lib/hooks/use-fleet-stats.ts`
- Test: `client/__tests__/fleet-stats-client.test.ts`

**Interfaces:**
- Produces: `apiClient.getFleetStats(): Promise<FleetStats>`, `useFleetStats()` query hook.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('fleet stats API method', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getFleetStats fetches /dashboard/stats', async () => {
    const payload = {
      stats: {
        total_sales: { value: 50000, growth: '12.5%' },
        inventory_value: { value: 100000 },
        customers: { value: 20, growth: '+3 new' },
        stores_count: 2,
        last_sync: '5 minutes ago',
        cloud_storage: { used_gb: 0.1, limit_gb: 10, percentage: 1 },
      },
      stores: [
        { id: '1', name: 'Main Branch', location: 'Lagos', status: 'online', lastSync: '5 minutes ago', sales: '₦50,000.00', staff_count: 2, low_stock_alerts: 1, expiring_items: 0 },
      ],
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getFleetStats();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/dashboard/stats');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/fleet-stats-client.test.ts`
Expected: FAIL — `apiClient.getFleetStats is not a function`.

- [ ] **Step 3: Add the types**

In `client/lib/types/store.ts`, extend `FleetStore` and add `FleetStats`. Note: `FleetStore` was previously `export type FleetStore = StoreOption;` (a plain alias) — change it to an explicit interface extending `StoreOption`, which stays structurally compatible everywhere `FleetStore` is already used:

```ts
export interface FleetStore extends StoreOption {
  status?: "online" | "offline";
  lastSync?: string;
  sales?: string;
  staff_count?: number;
  low_stock_alerts?: number;
  expiring_items?: number;
}

export interface FleetStats {
  stats: {
    total_sales: { value: number; growth: string };
    inventory_value: { value: number };
    customers: { value: number; growth: string };
    stores_count: number;
    last_sync: string;
    cloud_storage: { used_gb: number; limit_gb: number; percentage: number };
  };
  stores: FleetStore[];
}
```

- [ ] **Step 4: Implement the method**

In `client/lib/api/client.ts`, add the import `FleetStats` alongside the existing `FleetStore` import, then add the method after `deleteStore`:

```ts
  async getFleetStats() {
    return this.request<FleetStats>("/dashboard/stats");
  }
```

- [ ] **Step 5: Add the query-key entry**

In `client/lib/query-keys.ts`, add a new top-level entry (matching the `billing` entry's remote-only shape):

```ts
  fleet: {
    stats: () => resource(["fleetStats"] as const, []),
  },
```

- [ ] **Step 6: Create the hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";

export function useFleetStats() {
  return useQuery({
    ...queryKeys.fleet.stats(),
    queryFn: () => apiClient.getFleetStats(),
  });
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/fleet-stats-client.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/lib/types/store.ts client/lib/api/client.ts client/lib/query-keys.ts client/lib/hooks/use-fleet-stats.ts client/__tests__/fleet-stats-client.test.ts
git commit -m "feat(client): add fleet stats API method, type, and query hook"
```

---

### Task 3: `sendEndOfDaySummary()` client API method

**Files:**
- Modify: `client/lib/api/client.ts` (add method near `getFleetStats`)
- Test: `client/__tests__/fleet-stats-client.test.ts` (add a second test to the same file)

**Interfaces:**
- Produces: `apiClient.sendEndOfDaySummary(): Promise<{ message: string }>`

- [ ] **Step 1: Add the failing test**

Append to `client/__tests__/fleet-stats-client.test.ts`, inside the same `describe` block:

```ts
  it('sendEndOfDaySummary posts to /dashboard/send-summary with no body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'End of day summary generated and sent to owner@dumosrx.com' }),
    });

    const result = await apiClient.sendEndOfDaySummary();

    expect(result).toEqual({ message: 'End of day summary generated and sent to owner@dumosrx.com' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/dashboard/send-summary');
    expect(config.method).toBe('POST');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/fleet-stats-client.test.ts`
Expected: FAIL — `apiClient.sendEndOfDaySummary is not a function`.

- [ ] **Step 3: Implement the method**

In `client/lib/api/client.ts`, add after `getFleetStats`:

```ts
  async sendEndOfDaySummary() {
    return this.request<{ message: string }>("/dashboard/send-summary", {
      method: "POST",
    });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/fleet-stats-client.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add client/lib/api/client.ts client/__tests__/fleet-stats-client.test.ts
git commit -m "feat(client): add sendEndOfDaySummary API method"
```

---

### Task 4: Stats cards + cloud-storage meter component

**Files:**
- Create: `client/components/settings/store/fleet-stats-cards.tsx`

**Interfaces:**
- Consumes: `FleetStats["stats"]` (Task 2)
- Produces: `<FleetStatsCards stats={stats} />`, consumed by Task 7.

- [ ] **Step 1: Create the component**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FleetStats } from "@/lib/types/store";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(value);
}

export function FleetStatsCards({ stats }: { stats: FleetStats["stats"] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Fleet Sales</p>
            <h3 className="text-2xl font-bold">{formatCurrency(stats.total_sales.value)}</h3>
            <Badge variant="secondary">{stats.total_sales.growth}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Stores</p>
            <h3 className="text-2xl font-bold">{stats.stores_count}</h3>
            <Badge variant="secondary">{stats.last_sync === "Never" ? "Offline" : "Online"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock Value</p>
            <h3 className="text-2xl font-bold">{formatCurrency(stats.inventory_value.value)}</h3>
            <Badge variant="secondary">Live Stock</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fleet Customers</p>
            <h3 className="text-2xl font-bold">{stats.customers.value}</h3>
            <Badge variant="secondary">{stats.customers.growth}</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Cloud Storage</span>
            <span className="text-muted-foreground">
              {stats.cloud_storage.used_gb} GB / {stats.cloud_storage.limit_gb} GB ({stats.cloud_storage.percentage}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${stats.cloud_storage.percentage}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds (no consumer yet, verified as a standalone compile unit).

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/store/fleet-stats-cards.tsx
git commit -m "feat(client): add fleet stats cards and cloud-storage meter"
```

---

### Task 5: Stores table component

**Files:**
- Create: `client/components/settings/store/fleet-stats-table.tsx`

**Interfaces:**
- Consumes: `FleetStore[]` (Task 2's widened type)
- Produces: `<FleetStatsTable stores={stores} />`, consumed by Task 7.

- [ ] **Step 1: Create the component**

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FleetStore } from "@/lib/types/store";

export function FleetStatsTable({ stores }: { stores: FleetStore[] }) {
  if (stores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">No stores to show yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Store</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Sync</TableHead>
          <TableHead className="text-right">Total Sales</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stores.map((store) => (
          <TableRow key={store.id}>
            <TableCell>
              <div className="font-medium">{store.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{store.id}</div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${store.status === "online" ? "bg-green-500" : "bg-slate-400"}`}
                />
                <span className="capitalize text-sm">{store.status ?? "unknown"}</span>
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{store.lastSync ?? "—"}</TableCell>
            <TableCell className="text-right font-semibold">{store.sales ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

(Row click / drill-down is deliberately not implemented here, per the standing decision not to recreate the `store-details` view this migration is dropping — this table is informational only.)

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/store/fleet-stats-table.tsx
git commit -m "feat(client): add fleet stores summary table"
```

---

### Task 6: Daily-summary button + delayed-data banner

**Files:**
- Create: `client/components/settings/store/fleet-daily-summary.tsx`

**Interfaces:**
- Consumes: `useSubscriptionStatus()` (existing, from the prior Billing plan's `client/lib/hooks/use-billing.ts`), `apiClient.sendEndOfDaySummary()` (Task 3).
- Produces: `<FleetDailySummary />`, consumed by Task 7.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useSubscriptionStatus } from "@/lib/hooks/use-billing";
import { apiClient } from "@/lib/api/client";

export function FleetDailySummary() {
  const [sending, setSending] = useState(false);
  const { data: subStatus } = useSubscriptionStatus();

  const canSendSummary =
    subStatus?.features?.auto_backup ??
    (subStatus?.plan !== "starter" && subStatus?.plan !== "free");

  const syncInterval = subStatus?.limits?.sync_interval ?? 0;

  const handleSend = async () => {
    setSending(true);
    try {
      const response = await apiClient.sendEndOfDaySummary();
      toast.success(response.message || "Summary sent successfully!");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "This is a premium feature. Please upgrade your plan to access it.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {syncInterval > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg flex items-start gap-2 text-sm">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Dashboard data syncs every {syncInterval} minutes on your current plan. Upgrade for
            real-time sync.
          </span>
        </div>
      )}
      {canSendSummary && (
        <Button variant="outline" onClick={handleSend} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Send Daily Summary
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/store/fleet-daily-summary.tsx
git commit -m "feat(client): add daily-summary trigger and delayed-sync banner"
```

---

### Task 7: Wire Fleet Overview into the Store Profile tab

**Files:**
- Create: `client/components/settings/store/fleet-overview.tsx`
- Modify: `client/components/settings/store-settings.tsx`

**Interfaces:**
- Consumes: `useFleetStats()` (Task 2), `FleetStatsCards` (Task 4), `FleetStatsTable` (Task 5), `FleetDailySummary` (Task 6).

- [ ] **Step 1: Create the composing component**

```tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useFleetStats } from "@/lib/hooks/use-fleet-stats";
import { FleetStatsCards } from "./fleet-stats-cards";
import { FleetStatsTable } from "./fleet-stats-table";
import { FleetDailySummary } from "./fleet-daily-summary";

export function FleetOverview() {
  const { data, isLoading, isError } = useFleetStats();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Failed to load fleet overview — check your connection.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Overview</CardTitle>
        <CardDescription>A snapshot across every store on this account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FleetStatsCards stats={data.stats} />
        <FleetDailySummary />
        <FleetStatsTable stores={data.stores} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the Store Profile tab**

In `client/components/settings/store-settings.tsx`, add the import alongside the other `./store/*` imports:

```tsx
import { FleetOverview } from "./store/fleet-overview";
```

Render `<FleetOverview />` immediately before `<MultiStoreCard />`, so the overview appears above the fleet-management list.

- [ ] **Step 3: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds — this is the first point all of Tasks 2-6 compile and render together.

- [ ] **Step 4: Manual end-to-end verification**

Run: `cd client && npm run dev`, navigate to Settings > Store Profile.
Expected: Fleet Overview card renders above the existing store list, showing stats cards, cloud-storage meter, the daily-summary button (gated by plan) with its delayed-sync banner when applicable, and the stores table below.

- [ ] **Step 5: Commit**

```bash
git add client/components/settings/store/fleet-overview.tsx client/components/settings/store-settings.tsx
git commit -m "feat(client): wire fleet overview into Settings > Store Profile"
```
