# Android Home-Screen Widget (Glance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Android home-screen widget showing today's sales (single-store or fleet-wide) plus low-stock/expiring-item counts, tappable through into the app, kept fresh via app-foreground sync and a WorkManager background refresh.

**Architecture:** "App writes, widget reads." The existing TS/React layer owns all auth and networking; it fetches a new slim backend endpoint and writes a small JSON snapshot into Android `SharedPreferences` via new Tauri commands. A native Jetpack Glance widget only ever reads that local snapshot — no networking or auth logic lives in Kotlin except the WorkManager background job, which authenticates with a token mirrored (at login/logout) into `EncryptedSharedPreferences`, since the app's own `localStorage` token is inside WebView-internal storage and unreachable from native code (confirmed by spike).

**Tech Stack:** Laravel (PHP) backend, Next.js/React + TypeScript client, Tauri 2 (Rust) native bridge, Kotlin/Jetpack Glance/WorkManager on Android.

**Spec:** `docs/superpowers/specs/2026-09-07-android-glance-widget-design.md`

## Global Constraints

- Android only — no iOS work (spec Non-goals).
- Widget is a cloud-linked-account feature (`isCloudLinked`); unlinked devices show a setup prompt, never stale/zero data (spec Gating).
- No push/FCM — refresh is periodic (~30 min, Android's practical floor) or app-triggered only (spec Non-goals, confirmed no FCM infra exists).
- `src-tauri/gen/android` is git-tracked; custom Kotlin lives as sibling files to `MainActivity.kt`, outside the CLI-managed `generated/` subfolder (confirmed safe by spike).
- Empty counts (0 low-stock, 0 expiring) are hidden rows, not "0 items" rows — matches this repo's empty-state design convention.
- All currency formatting happens server-side/TS-side; native Kotlin never reimplements currency formatting — it displays pre-formatted strings.

**Canonical widget snapshot schema** (produced by TS in Task 3, written natively in Tasks 6 & 8, read in Task 9) — every task below refers back to this exact shape:

```json
{
  "linked": true,
  "updatedAtEpochMs": 1731000000000,
  "fleet": {
    "todaySalesFormatted": "₦142,500.00",
    "lowStockCount": 5,
    "expiringCount": 2
  },
  "stores": [
    {
      "id": "b3f1...",
      "name": "Main Branch",
      "todaySalesFormatted": "₦80,000.00",
      "lowStockCount": 3,
      "expiringCount": 1
    }
  ]
}
```

When `linked` is `false`, only `{ "linked": false, "updatedAtEpochMs": ... }` is present — `fleet`/`stores` are omitted.

---

## Task 1: Backend — `/dashboard/widget-snapshot` endpoint

**Files:**
- Modify: `laravel-server/app/Services/Web/DashboardService.php`
- Modify: `laravel-server/app/Http/Controllers/Api/Web/DashboardController.php`
- Modify: `laravel-server/routes/api.php` (or wherever `dashboard/stats` is registered — find via `grep -rn "dashboard/stats" laravel-server/routes`)
- Test: `laravel-server/tests/Feature/DashboardWidgetSnapshotTest.php`

**Interfaces:**
- Produces: `GET /dashboard/widget-snapshot` (Sanctum-authenticated), JSON:
  ```json
  {
    "fleet": { "today_sales_formatted": "₦142,500.00", "low_stock_alerts": 5, "expiring_items": 2 },
    "stores": [
      { "id": "...", "name": "Main Branch", "today_sales_formatted": "₦80,000.00", "low_stock_alerts": 3, "expiring_items": 1 }
    ]
  }
  ```
  (snake_case, matching this codebase's existing `/dashboard/stats` JSON convention — Task 3 converts to the camelCase widget schema client-side.)

This is a **new, dedicated endpoint** rather than adding fields to `/dashboard/stats` as the design spec originally sketched — it lets both the TS foreground-sync path (Task 7) and the native WorkManager worker (Task 8) consume the exact same shape without either one reshaping a bigger general-purpose payload, avoiding duplicate transform logic in two languages. `/dashboard/stats` itself is untouched.

- [ ] **Step 1: Find the existing route registration for `/dashboard/stats`**

Run: `grep -rn "dashboard/stats\|dashboard/summary" laravel-server/routes/api.php`

Note the exact line/group (likely inside a `Route::middleware('auth:sanctum')->group(...)` block) — the new route goes next to it.

- [ ] **Step 2: Write the failing tests**

Create `laravel-server/tests/Feature/DashboardWidgetSnapshotTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DashboardWidgetSnapshotTest extends TestCase
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

    public function test_widget_snapshot_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/dashboard/widget-snapshot');
        $response->assertStatus(401);
    }

    public function test_widget_snapshot_returns_shape_with_no_stores(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/widget-snapshot');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'fleet' => ['today_sales_formatted', 'low_stock_alerts', 'expiring_items'],
            'stores',
        ]);
        $response->assertJsonPath('fleet.low_stock_alerts', 0);
        $response->assertJsonCount(0, 'stores');
    }

    public function test_widget_snapshot_only_counts_todays_sales_not_older_ones(): void
    {
        $store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Main Branch',
            'store_type' => 'pharmacy',
            'device_id' => 'test-device-'.uniqid(),
        ]);

        // Today: counts.
        Sale::create([
            'cashier_id' => $this->user->id,
            'subtotal' => 5000, 'total_amount' => 5000,
            'payment_method' => 'cash', 'payment_status' => 'paid',
            'transaction_date' => now(),
        ]);

        // Yesterday: must NOT count toward today_sales.
        $oldSale = Sale::create([
            'cashier_id' => $this->user->id,
            'subtotal' => 9000, 'total_amount' => 9000,
            'payment_method' => 'cash', 'payment_status' => 'paid',
            'transaction_date' => now()->subDay(),
        ]);
        $oldSale->created_at = Carbon::yesterday();
        $oldSale->save();

        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/widget-snapshot');

        $response->assertStatus(200);
        $response->assertJsonPath('fleet.today_sales_formatted', '₦5,000.00');
        $response->assertJsonPath('stores.0.today_sales_formatted', '₦5,000.00');
    }

    public function test_widget_snapshot_includes_low_stock_and_expiring_counts_per_store(): void
    {
        $store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Main Branch',
            'store_type' => 'pharmacy',
            'device_id' => 'test-device-'.uniqid(),
        ]);

        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/widget-snapshot');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'stores');
        $response->assertJsonPath('stores.0.id', $store->id);
        $response->assertJsonPath('stores.0.name', 'Main Branch');
        $response->assertJsonStructure(['stores' => [['low_stock_alerts', 'expiring_items']]]);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=DashboardWidgetSnapshotTest`
Expected: FAIL — route `dashboard/widget-snapshot` doesn't exist (404s), or method doesn't exist.

- [ ] **Step 3: Add `getWidgetSnapshot()` to `DashboardService`**

In `laravel-server/app/Services/Web/DashboardService.php`, add a new public method (place it right after `getStats()`, around line 452, reusing the same per-store `$cashierIds` grouping pattern already established in `getStats()`):

```php
    public function getWidgetSnapshot($user)
    {
        $userId = $user->id;

        $storeIds = Store::where('user_id', $userId)->pluck('id')->toArray();
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($userId)->toArray();

        $todayFleetSales = 0;
        try {
            $todayFleetSales = (float) Sale::whereIn('cashier_id', $userIds)
                ->whereDate('created_at', now()->toDateString())
                ->sum('total_amount');
        } catch (\Exception $e) {
            Log::error('DashboardService::getWidgetSnapshot [FleetSales]: '.$e->getMessage());
        }

        $userStores = collect([]);
        try {
            if (Schema::hasTable('stores')) {
                $userStores = Store::where('user_id', $userId)->get();
            }
        } catch (\Exception $e) {
            Log::error('DashboardService::getWidgetSnapshot [Stores]: '.$e->getMessage());
        }

        $storesCount = $userStores->count();
        $fleetLowStock = 0;
        $fleetExpiring = 0;

        $stores = $userStores->map(function ($store) use ($storesCount, $userId, &$fleetLowStock, &$fleetExpiring) {
            $storeStaffIds = User::where('store_id', $store->id)->pluck('id')->toArray();
            $cashierIds = $storeStaffIds;
            if ($storesCount === 1) {
                $cashierIds[] = $userId;
            }
            $cashierIds = array_unique($cashierIds);

            $todayStoreSales = (float) Sale::whereIn('cashier_id', $cashierIds)
                ->whereDate('created_at', now()->toDateString())
                ->sum('total_amount');

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

            $fleetLowStock += $lowStock;
            $fleetExpiring += $expiringItems;

            return [
                'id' => $store->id,
                'name' => $store->name,
                'today_sales_formatted' => '₦'.number_format($todayStoreSales, 2),
                'low_stock_alerts' => $lowStock,
                'expiring_items' => $expiringItems,
            ];
        })->values();

        return [
            'fleet' => [
                'today_sales_formatted' => '₦'.number_format($todayFleetSales, 2),
                'low_stock_alerts' => $fleetLowStock,
                'expiring_items' => $fleetExpiring,
            ],
            'stores' => $stores,
        ];
    }
```

- [ ] **Step 4: Add the controller action**

In `laravel-server/app/Http/Controllers/Api/Web/DashboardController.php`, add after the existing `stats()` method:

```php
    #[OA\Get(
        path: '/dashboard/widget-snapshot',
        summary: "Slim today's-sales + alert counts for the Android home-screen widget",
        tags: ['Dashboard'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Widget snapshot', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function widgetSnapshot(Request $request)
    {
        try {
            $data = $this->dashboardService->getWidgetSnapshot($request->user());
            return response()->json($data);
        } catch (\Exception $e) {
            Log::critical("Dashboard Widget Snapshot Error: " . $e->getMessage());
            return response()->json([
                'error' => 'Internal Server Error',
                'message' => $e->getMessage()
            ], 500);
        }
    }
```

- [ ] **Step 5: Register the route**

In `laravel-server/routes/api.php`, next to the existing `dashboard/stats` route registration found in Step 1, add:

```php
Route::get('/dashboard/widget-snapshot', [DashboardController::class, 'widgetSnapshot']);
```

(inside the same `auth:sanctum` middleware group as `dashboard/stats` — match indentation/placement exactly to what Step 1 found.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=DashboardWidgetSnapshotTest`
Expected: PASS, all 4 tests green.

- [ ] **Step 7: Commit**

```bash
cd laravel-server
git add app/Services/Web/DashboardService.php app/Http/Controllers/Api/Web/DashboardController.php routes/api.php tests/Feature/DashboardWidgetSnapshotTest.php
git commit -m "feat: add /dashboard/widget-snapshot endpoint for Android widget"
```

---

## Task 2: Frontend — TS type + API client method for the new endpoint

**Files:**
- Modify: `client/lib/types/store.ts`
- Modify: `client/lib/api/client-fleet-billing.ts`
- Modify: `client/lib/query-keys.ts`

**Interfaces:**
- Consumes: `GET /dashboard/widget-snapshot` response shape from Task 1.
- Produces: `WidgetSnapshotResponse` type; `apiClient.getWidgetSnapshot(): Promise<WidgetSnapshotResponse>`; `queryKeys.fleet.widgetSnapshot()`.

- [ ] **Step 1: Add the type**

In `client/lib/types/store.ts`, next to the existing `FleetStats` interface (line 38), add:

```typescript
export interface WidgetSnapshotStoreEntry {
  id: string;
  name: string;
  today_sales_formatted: string;
  low_stock_alerts: number;
  expiring_items: number;
}

export interface WidgetSnapshotResponse {
  fleet: {
    today_sales_formatted: string;
    low_stock_alerts: number;
    expiring_items: number;
  };
  stores: WidgetSnapshotStoreEntry[];
}
```

- [ ] **Step 2: Add the client method**

In `client/lib/api/client-fleet-billing.ts`, add the import and method next to `getFleetStats()`:

```typescript
import type { StoreOption, FleetStore, FleetStorePayload, FleetStats, WidgetSnapshotResponse } from "@/lib/types/store";
```

```typescript
  async getWidgetSnapshot() {
    return this.request<WidgetSnapshotResponse>("/dashboard/widget-snapshot");
  }
```

- [ ] **Step 3: Add the query key**

In `client/lib/query-keys.ts`, next to `stats: () => resource(["fleetStats"] as const, [])` (line 234), add:

```typescript
    widgetSnapshot: () => resource(["widgetSnapshot"] as const, []),
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd client
git add lib/types/store.ts lib/api/client-fleet-billing.ts lib/query-keys.ts
git commit -m "feat: add WidgetSnapshotResponse type and API client method"
```

---

## Task 3: Frontend — pure `buildWidgetSnapshotPayload()` function

**Files:**
- Create: `client/lib/utils/widget-snapshot.ts`
- Test: `client/__tests__/widget-snapshot-payload.test.ts`

**Interfaces:**
- Consumes: `WidgetSnapshotResponse` (Task 2).
- Produces: `buildWidgetSnapshotPayload(response: WidgetSnapshotResponse | null, isCloudLinked: boolean, nowMs: number): WidgetSnapshotPayload`, and the `WidgetSnapshotPayload` type — this is the exact JSON shape defined in "Canonical widget snapshot schema" above. Used by Task 7 (TS writer) and mirrored by the native Worker in Task 8.

This is pure, dependency-free logic (no `fetch`, no Tauri) — fully unit-testable, matching this codebase's pattern of extracting testable logic into `lib/utils/*` (see `client/lib/utils/post-restore-notice.ts` / its test for precedent).

- [ ] **Step 1: Write the failing tests**

Create `client/__tests__/widget-snapshot-payload.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildWidgetSnapshotPayload } from "@/lib/utils/widget-snapshot";
import type { WidgetSnapshotResponse } from "@/lib/types/store";

const SAMPLE: WidgetSnapshotResponse = {
  fleet: { today_sales_formatted: "₦142,500.00", low_stock_alerts: 5, expiring_items: 2 },
  stores: [
    { id: "s1", name: "Main Branch", today_sales_formatted: "₦80,000.00", low_stock_alerts: 3, expiring_items: 1 },
  ],
};

describe("buildWidgetSnapshotPayload", () => {
  it("returns a linked:false payload when the account isn't cloud-linked, regardless of response data", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, false, 1000);
    expect(payload).toEqual({ linked: false, updatedAtEpochMs: 1000 });
  });

  it("returns a linked:false payload when there's no response yet, even if cloud-linked", () => {
    const payload = buildWidgetSnapshotPayload(null, true, 1000);
    expect(payload).toEqual({ linked: false, updatedAtEpochMs: 1000 });
  });

  it("maps the fleet block to camelCase when linked", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, true, 1000);
    expect(payload.linked).toBe(true);
    if (payload.linked) {
      expect(payload.fleet).toEqual({
        todaySalesFormatted: "₦142,500.00",
        lowStockCount: 5,
        expiringCount: 2,
      });
    }
  });

  it("maps each store entry to camelCase when linked", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, true, 1000);
    expect(payload.linked).toBe(true);
    if (payload.linked) {
      expect(payload.stores).toEqual([
        { id: "s1", name: "Main Branch", todaySalesFormatted: "₦80,000.00", lowStockCount: 3, expiringCount: 1 },
      ]);
    }
  });

  it("carries the provided timestamp through unchanged", () => {
    const payload = buildWidgetSnapshotPayload(SAMPLE, true, 1731000000000);
    expect(payload.updatedAtEpochMs).toBe(1731000000000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run __tests__/widget-snapshot-payload.test.ts`
Expected: FAIL — `@/lib/utils/widget-snapshot` doesn't exist.

- [ ] **Step 3: Write the implementation**

Create `client/lib/utils/widget-snapshot.ts`:

```typescript
import type { WidgetSnapshotResponse } from "@/lib/types/store";

export interface WidgetSnapshotStorePayload {
  id: string;
  name: string;
  todaySalesFormatted: string;
  lowStockCount: number;
  expiringCount: number;
}

export type WidgetSnapshotPayload =
  | { linked: false; updatedAtEpochMs: number }
  | {
      linked: true;
      updatedAtEpochMs: number;
      fleet: { todaySalesFormatted: string; lowStockCount: number; expiringCount: number };
      stores: WidgetSnapshotStorePayload[];
    };

/**
 * Converts the backend's snake_case /dashboard/widget-snapshot response into
 * the camelCase JSON written to native Android storage (see the "Canonical
 * widget snapshot schema" in the implementation plan) - the single shape
 * shared by the app's foreground writer and the WorkManager background
 * writer, so the Glance widget never needs to know which one produced it.
 */
export function buildWidgetSnapshotPayload(
  response: WidgetSnapshotResponse | null,
  isCloudLinked: boolean,
  nowMs: number,
): WidgetSnapshotPayload {
  if (!isCloudLinked || !response) {
    return { linked: false, updatedAtEpochMs: nowMs };
  }

  return {
    linked: true,
    updatedAtEpochMs: nowMs,
    fleet: {
      todaySalesFormatted: response.fleet.today_sales_formatted,
      lowStockCount: response.fleet.low_stock_alerts,
      expiringCount: response.fleet.expiring_items,
    },
    stores: response.stores.map((store) => ({
      id: store.id,
      name: store.name,
      todaySalesFormatted: store.today_sales_formatted,
      lowStockCount: store.low_stock_alerts,
      expiringCount: store.expiring_items,
    })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run __tests__/widget-snapshot-payload.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
cd client
git add lib/utils/widget-snapshot.ts __tests__/widget-snapshot-payload.test.ts
git commit -m "feat: add buildWidgetSnapshotPayload pure transform"
```

---

## Task 4: Rust + Kotlin — token mirroring bridge

**Files:**
- Modify: `client/src-tauri/src/lib.rs`
- Create: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/TokenStore.kt`
- Modify: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`
- Modify: `client/src-tauri/gen/android/app/build.gradle.kts`

**Interfaces:**
- Produces: Rust commands `mirror_auth_token(token: String)` and `clear_mirrored_auth_token()`, registered in `invoke_handler`. Kotlin `TokenStore.save(context, token)` / `TokenStore.load(context): String?` / `TokenStore.clear(context)` — `load()` is what Task 8's WorkManager `Worker` calls.

No automated test is practical here (this is a native platform bridge with no JVM/Rust test harness set up in this repo) — verification is a full `tauri android build` plus the manual check in Step 6, matching how the spike itself was validated.

- [ ] **Step 1: Add the `security-crypto` dependency**

In `client/src-tauri/gen/android/app/build.gradle.kts`, inside the `dependencies { ... }` block (after `implementation("androidx.core:core-splashscreen:1.0.1")`), add:

```kotlin
    implementation("androidx.security:security-crypto:1.1.0")
```

- [ ] **Step 2: Write `TokenStore.kt`**

Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/TokenStore.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Mirrors the app's Sanctum auth token into encrypted native storage.
 *
 * The app's own copy lives in localStorage, which under Tauri's Android
 * WebView is backed by the WebView engine's internal storage - unreachable
 * from a WorkManager Worker. This is the only other place the token is
 * allowed to live, kept in sync via MainActivity.mirrorAuthToken /
 * clearMirroredAuthToken, called from client/lib/api/token-manager.ts on
 * every login/logout. See docs/superpowers/specs/2026-09-07-android-glance-widget-design.md.
 */
object TokenStore {
    private const val PREFS_NAME = "dumosrx_widget_auth"
    private const val KEY_TOKEN = "mirrored_token"

    private fun prefs(context: Context) =
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    fun save(context: Context, token: String) {
        prefs(context).edit().putString(KEY_TOKEN, token).apply()
    }

    fun load(context: Context): String? =
        prefs(context).getString(KEY_TOKEN, null)

    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_TOKEN).apply()
    }
}
```

- [ ] **Step 3: Add methods to `MainActivity.kt`**

In `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`, add the import and two methods next to `setNavigationBarLight`:

```kotlin
import com.dumostech.dumosrx.widget.TokenStore
```

```kotlin
  // Called from Rust (mirror_auth_token) on every login/token refresh, so
  // the WorkManager background refresh (RefreshWorker) can authenticate
  // without touching WebView-internal localStorage.
  fun mirrorAuthToken(token: String) {
    TokenStore.save(applicationContext, token)
  }

  // Called from Rust (clear_mirrored_auth_token) on logout.
  fun clearMirroredAuthToken() {
    TokenStore.clear(applicationContext)
  }
```

- [ ] **Step 4: Add the Rust commands**

In `client/src-tauri/src/lib.rs`, add after `set_nav_bar_light` (after line 24):

```rust
#[cfg(target_os = "android")]
#[tauri::command]
fn mirror_auth_token(window: tauri::WebviewWindow, token: String) {
  use jni::objects::JValue;

  let _ = window.with_webview(move |webview| {
    webview.jni_handle().exec(move |env, activity, _webview| {
      let jtoken = match env.new_string(&token) {
        Ok(s) => s,
        Err(e) => {
          log::error!("Failed to build JNI string for token mirror: {:?}", e);
          return;
        }
      };
      if let Err(e) = env.call_method(
        activity,
        "mirrorAuthToken",
        "(Ljava/lang/String;)V",
        &[JValue::Object(&jtoken)],
      ) {
        log::error!("Failed to mirror auth token: {:?}", e);
      }
    });
  });
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn mirror_auth_token(token: String) {
  let _ = token;
}

#[cfg(target_os = "android")]
#[tauri::command]
fn clear_mirrored_auth_token(window: tauri::WebviewWindow) {
  let _ = window.with_webview(move |webview| {
    webview.jni_handle().exec(move |env, activity, _webview| {
      if let Err(e) = env.call_method(activity, "clearMirroredAuthToken", "()V", &[]) {
        log::error!("Failed to clear mirrored auth token: {:?}", e);
      }
    });
  });
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn clear_mirrored_auth_token() {}
```

- [ ] **Step 5: Register the commands**

In `client/src-tauri/src/lib.rs`, update the `invoke_handler` call (line 51):

```rust
    .invoke_handler(tauri::generate_handler![set_nav_bar_light, mirror_auth_token, clear_mirrored_auth_token])
```

- [ ] **Step 6: Build and manually verify**

Run: `cd client && JAVA_HOME=/opt/homebrew/opt/openjdk@17 npx tauri android build --debug --target aarch64`
Expected: build succeeds (same command the spike validated).

Then confirm the new methods compiled in, the same way the spike verified the widget class:

```bash
APK="$(pwd)/client/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
CHECK_DIR=$(mktemp -d)
unzip -o "$APK" "*.dex" -d "$CHECK_DIR" >/dev/null
for f in "$CHECK_DIR"/*.dex; do strings "$f" | grep -q "TokenStore" && echo "found in $f"; done
rm -rf "$CHECK_DIR"
```

(run from the repo root — `$(pwd)` picks up wherever your worktree is checked out, avoiding a hardcoded path)
Expected: `TokenStore` found in at least one dex file.

- [ ] **Step 7: Commit**

```bash
git add client/src-tauri/src/lib.rs client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/TokenStore.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt client/src-tauri/gen/android/app/build.gradle.kts
git commit -m "feat: add token mirroring bridge for Android widget background refresh"
```

---

## Task 5: Frontend — wire `token-manager.ts` to the mirroring bridge

**Files:**
- Create: `client/lib/native/widget-bridge.ts`
- Modify: `client/lib/api/token-manager.ts`
- Test: `client/__tests__/widget-bridge-token-mirror.test.ts`

**Interfaces:**
- Consumes: Rust commands `mirror_auth_token`/`clear_mirrored_auth_token` (Task 4), `isTauri()` from `@/lib/db` (already exported per `client/lib/db/index.ts`).
- Produces: `mirrorAuthToken(token: string): Promise<void>` and `clearMirroredAuthToken(): Promise<void>` in `client/lib/native/widget-bridge.ts`, called by `setToken`/`clearToken` in `token-manager.ts`. Task 6 adds a third function (`writeWidgetSnapshot`) to this same file.

- [ ] **Step 1: Write the failing test**

Create `client/__tests__/widget-bridge-token-mirror.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock("@/lib/db", () => ({ isTauri: () => true }));

describe("widget-bridge token mirroring", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    localStorage.clear();
  });

  it("setToken invokes mirror_auth_token with the new token when running under Tauri", async () => {
    const { setToken } = await import("@/lib/api/token-manager");
    setToken("abc123");
    // setToken doesn't await the mirror call (fire-and-forget), so flush microtasks.
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledWith("mirror_auth_token", { token: "abc123" });
  });

  it("clearToken invokes clear_mirrored_auth_token", async () => {
    const { clearToken } = await import("@/lib/api/token-manager");
    clearToken();
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledWith("clear_mirrored_auth_token", undefined);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/widget-bridge-token-mirror.test.ts`
Expected: FAIL — `@/lib/native/widget-bridge` doesn't exist, or `token-manager.ts` doesn't call `invoke`.

- [ ] **Step 3: Create the bridge module**

Create `client/lib/native/widget-bridge.ts`:

```typescript
import { isTauri } from "@/lib/db";

async function invokeIfTauri(command: string, args?: Record<string, unknown>): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke(command, args);
}

export async function mirrorAuthToken(token: string): Promise<void> {
  await invokeIfTauri("mirror_auth_token", { token });
}

export async function clearMirroredAuthToken(): Promise<void> {
  await invokeIfTauri("clear_mirrored_auth_token");
}
```

- [ ] **Step 4: Wire it into `token-manager.ts`**

In `client/lib/api/token-manager.ts`, add the import at the top:

```typescript
import { mirrorAuthToken, clearMirroredAuthToken } from "@/lib/native/widget-bridge";
```

Modify `setToken` (currently lines 16-23) to call it after dispatching the existing event:

```typescript
export const setToken = (newToken: string) => {
  token = newToken;
  if (typeof window !== "undefined") {
    localStorage.setItem("auth_token", newToken);
    localStorage.setItem("auth_token_issued_at", Date.now().toString());
    window.dispatchEvent(new Event("auth_token_set"));
    void mirrorAuthToken(newToken);
  }
};
```

Modify `clearToken` (currently lines 25-32):

```typescript
export const clearToken = () => {
  token = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_token_issued_at");
    window.dispatchEvent(new Event("auth_token_cleared"));
    void clearMirroredAuthToken();
  }
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/widget-bridge-token-mirror.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 6: Typecheck the whole client**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd client
git add lib/native/widget-bridge.ts lib/api/token-manager.ts __tests__/widget-bridge-token-mirror.test.ts
git commit -m "feat: mirror auth token to native storage on set/clear"
```

---

## Task 6: Rust + Kotlin — `write_widget_snapshot` command

**Files:**
- Create: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetSnapshotStore.kt`
- Modify: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`
- Modify: `client/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: the canonical snapshot JSON string (Task 3's `WidgetSnapshotPayload`, `JSON.stringify`-ed).
- Produces: Rust command `write_widget_snapshot(snapshot_json: String)`. Kotlin `WidgetSnapshotStore.write(context, json)` / `WidgetSnapshotStore.read(context): String?` — `read()` is what Task 9's Glance widget calls; `write()` is called by both this command (app-triggered) and Task 8's `RefreshWorker` (background-triggered), so both writers converge on one storage location.

This snapshot data isn't secret (it's the same numbers already visible in the app UI), so plain `SharedPreferences` is used, not `EncryptedSharedPreferences` — no reason to pay the encryption cost here.

- [ ] **Step 1: Write `WidgetSnapshotStore.kt`**

Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetSnapshotStore.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context

/**
 * Shared storage for the widget data snapshot (see the "Canonical widget
 * snapshot schema" in docs/superpowers/plans/2026-09-07-android-glance-widget.md).
 * Written by two independent producers - the app's foreground sync
 * (MainActivity.writeWidgetSnapshot, called from Rust) and RefreshWorker's
 * background fetch - and read only by DumosRxWidgetProvider. Neither writer
 * needs to know about the other; they just converge on this one key.
 */
object WidgetSnapshotStore {
    private const val PREFS_NAME = "dumosrx_widget_data"
    private const val KEY_SNAPSHOT = "snapshot_json"

    fun write(context: Context, snapshotJson: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SNAPSHOT, snapshotJson)
            .apply()
    }

    fun read(context: Context): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SNAPSHOT, null)
}
```

- [ ] **Step 2: Add the method to `MainActivity.kt`**

In `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`, update the import line added in Task 4 and add the method:

```kotlin
import com.dumostech.dumosrx.widget.TokenStore
import com.dumostech.dumosrx.widget.WidgetSnapshotStore
import com.dumostech.dumosrx.widget.DumosRxWidgetProvider
```

```kotlin
  // Called from Rust (write_widget_snapshot) whenever the app finishes a
  // successful widget-snapshot fetch (see use-widget-snapshot-sync.ts).
  fun writeWidgetSnapshot(snapshotJson: String) {
    WidgetSnapshotStore.write(applicationContext, snapshotJson)
    DumosRxWidgetProvider.requestUpdateAll(applicationContext)
  }
```

(The `DumosRxWidgetProvider.requestUpdateAll` call and its import will not resolve yet — `DumosRxWidgetProvider` is created in Task 9. That's expected for this task; Step 3's build check below only compiles the Rust/JNI side against a temporary stub, per the note in Step 3.)

- [ ] **Step 3: Add a temporary stub so this task builds standalone**

Since `DumosRxWidgetProvider` doesn't exist until Task 9, add a minimal stub now so this task's build check (Step 5) passes in isolation. Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetProvider.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context

// Stub for Task 6 - replaced with the real Glance AppWidgetProvider in Task 9.
object DumosRxWidgetProvider {
    fun requestUpdateAll(context: Context) {
        // no-op until Task 9
    }
}
```

(Task 9 will replace this whole file with the real `AppWidgetProvider` class and move `requestUpdateAll` onto it as a companion-object method with the same signature, so `MainActivity.kt`'s call site from Step 2 doesn't need to change.)

- [ ] **Step 4: Add the Rust command**

In `client/src-tauri/src/lib.rs`, add after `clear_mirrored_auth_token`:

```rust
#[cfg(target_os = "android")]
#[tauri::command]
fn write_widget_snapshot(window: tauri::WebviewWindow, snapshot_json: String) {
  use jni::objects::JValue;

  let _ = window.with_webview(move |webview| {
    webview.jni_handle().exec(move |env, activity, _webview| {
      let jjson = match env.new_string(&snapshot_json) {
        Ok(s) => s,
        Err(e) => {
          log::error!("Failed to build JNI string for widget snapshot: {:?}", e);
          return;
        }
      };
      if let Err(e) = env.call_method(
        activity,
        "writeWidgetSnapshot",
        "(Ljava/lang/String;)V",
        &[JValue::Object(&jjson)],
      ) {
        log::error!("Failed to write widget snapshot: {:?}", e);
      }
    });
  });
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn write_widget_snapshot(snapshot_json: String) {
  let _ = snapshot_json;
}
```

Update `invoke_handler` (same line as Task 4 Step 5):

```rust
    .invoke_handler(tauri::generate_handler![set_nav_bar_light, mirror_auth_token, clear_mirrored_auth_token, write_widget_snapshot])
```

- [ ] **Step 5: Build and verify**

Run: `cd client && JAVA_HOME=/opt/homebrew/opt/openjdk@17 npx tauri android build --debug --target aarch64`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/src-tauri/src/lib.rs client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetSnapshotStore.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetProvider.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt
git commit -m "feat: add write_widget_snapshot bridge command"
```

---

## Task 7: Frontend — `useWidgetSnapshotSync` hook

**Files:**
- Create: `client/lib/hooks/use-widget-snapshot-sync.ts`
- Modify: `client/lib/native/widget-bridge.ts`
- Test: `client/__tests__/use-widget-snapshot-sync.test.ts`

**Interfaces:**
- Consumes: `apiClient.getWidgetSnapshot()` (Task 2), `buildWidgetSnapshotPayload()` (Task 3), `useAuth().isCloudLinked` (existing).
- Produces: `useWidgetSnapshotSync()` — a hook with no return value, mounted once near the app root (wired in Task 11 alongside the deep-link listener), that fetches and writes the snapshot on mount and whenever the query is invalidated by a successful sync.

- [ ] **Step 1: Add `writeWidgetSnapshot` to the bridge module**

In `client/lib/native/widget-bridge.ts`, add:

```typescript
export async function writeWidgetSnapshot(snapshotJson: string): Promise<void> {
  await invokeIfTauri("write_widget_snapshot", { snapshotJson });
}
```

- [ ] **Step 2: Write the failing test**

Create `client/__tests__/use-widget-snapshot-sync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const getWidgetSnapshotMock = vi.fn();
const writeWidgetSnapshotMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: { getWidgetSnapshot: (...a: unknown[]) => getWidgetSnapshotMock(...a) },
}));
vi.mock("@/lib/native/widget-bridge", () => ({
  writeWidgetSnapshot: (...a: unknown[]) => writeWidgetSnapshotMock(...a),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isCloudLinked: true }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useWidgetSnapshotSync", () => {
  beforeEach(() => {
    getWidgetSnapshotMock.mockReset();
    writeWidgetSnapshotMock.mockReset();
  });

  it("fetches the snapshot and writes it to native storage on mount when cloud-linked", async () => {
    getWidgetSnapshotMock.mockResolvedValue({
      fleet: { today_sales_formatted: "₦0.00", low_stock_alerts: 0, expiring_items: 0 },
      stores: [],
    });
    const { useWidgetSnapshotSync } = await import("@/lib/hooks/use-widget-snapshot-sync");

    renderHook(() => useWidgetSnapshotSync(), { wrapper });

    await waitFor(() => expect(writeWidgetSnapshotMock).toHaveBeenCalledTimes(1));
    const [jsonArg] = writeWidgetSnapshotMock.mock.calls[0];
    const parsed = JSON.parse(jsonArg);
    expect(parsed.linked).toBe(true);
    expect(parsed.fleet.lowStockCount).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/use-widget-snapshot-sync.test.ts`
Expected: FAIL — `@/lib/hooks/use-widget-snapshot-sync` doesn't exist.

- [ ] **Step 4: Write the hook**

Create `client/lib/hooks/use-widget-snapshot-sync.ts`:

```typescript
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/context/auth-context";
import { writeWidgetSnapshot } from "@/lib/native/widget-bridge";
import { buildWidgetSnapshotPayload } from "@/lib/utils/widget-snapshot";

/**
 * Keeps the Android widget's local data snapshot fresh whenever the app is
 * open: fetches /dashboard/widget-snapshot and writes the result to native
 * storage. Mounted once near the app root (see use-widget-deeplink.ts for
 * the sibling hook it's wired alongside). The WorkManager background job
 * (RefreshWorker, native) covers refreshes while the app isn't open.
 */
export function useWidgetSnapshotSync() {
  const { isCloudLinked } = useAuth();

  const { data, dataUpdatedAt } = useQuery({
    ...queryKeys.fleet.widgetSnapshot(),
    queryFn: () => apiClient.getWidgetSnapshot(),
    enabled: isCloudLinked,
  });

  useEffect(() => {
    const payload = buildWidgetSnapshotPayload(data ?? null, isCloudLinked, Date.now());
    void writeWidgetSnapshot(JSON.stringify(payload));
    // dataUpdatedAt changes on every successful refetch even if `data` is
    // referentially different each time, which is what should retrigger this.
  }, [data, isCloudLinked, dataUpdatedAt]);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/use-widget-snapshot-sync.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd client
git add lib/native/widget-bridge.ts lib/hooks/use-widget-snapshot-sync.ts __tests__/use-widget-snapshot-sync.test.ts
git commit -m "feat: add useWidgetSnapshotSync hook"
```

(This hook is mounted into the app tree in Task 11, alongside the deep-link listener, to keep provider wiring in one place.)

---

## Task 8: Kotlin — `RefreshWorker` (WorkManager background refresh)

**Files:**
- Create: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/RefreshWorker.kt`
- Create: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetRefreshScheduler.kt`
- Modify: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`
- Modify: `client/src-tauri/gen/android/app/build.gradle.kts`
- Modify: `client/src-tauri/gen/android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: `TokenStore.load()` (Task 4), `WidgetSnapshotStore.write()` (Task 6). Hits the same `GET /dashboard/widget-snapshot` endpoint as Task 2's TS client, but via a raw `HttpURLConnection` — no Retrofit/OkHttp dependency added, since this is a single GET request with one header.
- Produces: `WidgetRefreshScheduler.schedulePeriodic(context)`, called once from `MainActivity.onCreate`.

The JSON reshaping here (snake_case backend response → camelCase snapshot schema) intentionally duplicates Task 3's `buildWidgetSnapshotPayload` logic in Kotlin — there's no way to share TS code with a native background Worker. Both sides are tested against the same fixture data in this task's verification step to catch drift.

- [ ] **Step 1: Add the `work-runtime-ktx` dependency**

In `client/src-tauri/gen/android/app/build.gradle.kts`, add to `dependencies { ... }`:

```kotlin
    implementation("androidx.work:work-runtime-ktx:2.10.0")
```

- [ ] **Step 2: Write `RefreshWorker.kt`**

Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/RefreshWorker.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Background counterpart to use-widget-snapshot-sync.ts: runs on a
 * WorkManager schedule (see WidgetRefreshScheduler) so the widget stays
 * roughly fresh even when the app isn't open. Authenticates with the token
 * mirrored into TokenStore at login (the app's own localStorage token is
 * unreachable here - see the design spec's Risks section).
 */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        // Same host resolution the TS API client uses
        // (client/lib/api/base-client.ts) - kept in sync manually since a
        // Worker can't import TS config.
        private const val API_BASE_URL = "https://api.dumosrx.com/api/v1"
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val token = TokenStore.load(applicationContext) ?: run {
            WidgetSnapshotStore.write(applicationContext, unlinkedSnapshotJson())
            return@withContext Result.success()
        }

        try {
            val connection = URL("$API_BASE_URL/dashboard/widget-snapshot").openConnection() as HttpURLConnection
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000

            if (connection.responseCode != 200) {
                connection.disconnect()
                return@withContext Result.retry()
            }

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            WidgetSnapshotStore.write(applicationContext, reshapeToSnapshotJson(body))
            DumosRxWidgetProvider.requestUpdateAll(applicationContext)
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private fun unlinkedSnapshotJson(): String =
        JSONObject()
            .put("linked", false)
            .put("updatedAtEpochMs", System.currentTimeMillis())
            .toString()

    /** Mirrors buildWidgetSnapshotPayload() in client/lib/utils/widget-snapshot.ts - keep both in sync if the schema changes. */
    private fun reshapeToSnapshotJson(rawBody: String): String {
        val raw = JSONObject(rawBody)
        val fleetIn = raw.getJSONObject("fleet")
        val fleetOut = JSONObject()
            .put("todaySalesFormatted", fleetIn.getString("today_sales_formatted"))
            .put("lowStockCount", fleetIn.getInt("low_stock_alerts"))
            .put("expiringCount", fleetIn.getInt("expiring_items"))

        val storesIn = raw.getJSONArray("stores")
        val storesOut = JSONArray()
        for (i in 0 until storesIn.length()) {
            val s = storesIn.getJSONObject(i)
            storesOut.put(
                JSONObject()
                    .put("id", s.getString("id"))
                    .put("name", s.getString("name"))
                    .put("todaySalesFormatted", s.getString("today_sales_formatted"))
                    .put("lowStockCount", s.getInt("low_stock_alerts"))
                    .put("expiringCount", s.getInt("expiring_items")),
            )
        }

        return JSONObject()
            .put("linked", true)
            .put("updatedAtEpochMs", System.currentTimeMillis())
            .put("fleet", fleetOut)
            .put("stores", storesOut)
            .toString()
    }
}
```

- [ ] **Step 3: Write `WidgetRefreshScheduler.kt`**

Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetRefreshScheduler.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Constraints
import java.util.concurrent.TimeUnit

object WidgetRefreshScheduler {
    private const val WORK_NAME = "dumosrx_widget_refresh"

    fun schedulePeriodic(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}
```

- [ ] **Step 4: Wire it into `MainActivity.onCreate`**

In `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`, add the import and call it in `onCreate` (after `super.onCreate(savedInstanceState)`):

```kotlin
import com.dumostech.dumosrx.widget.WidgetRefreshScheduler
```

```kotlin
  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    WidgetRefreshScheduler.schedulePeriodic(applicationContext)
  }
```

- [ ] **Step 5: Build and verify**

Run: `cd client && JAVA_HOME=/opt/homebrew/opt/openjdk@17 npx tauri android build --debug --target aarch64`
Expected: build succeeds.

- [ ] **Step 6: Manual verification of the reshape logic**

This is the one place native Kotlin duplicates TS logic — verify both sides agree using the same fixture from Task 1's `test_widget_snapshot_includes_low_stock_and_expiring_counts_per_store`. Install the debug APK on an emulator, force the worker to run immediately (bypassing the 30-min schedule), and inspect the written snapshot:

```bash
adb shell cmd jobscheduler run -f com.dumostech.dumosrx $(adb shell dumpsys jobscheduler | grep -A1 "dumosrx_widget_refresh" | grep -oE 'JOB #[0-9]+/[a-z0-9]+: [0-9]+' | grep -oE '[0-9]+$' | head -1)
adb shell run-as com.dumostech.dumosrx cat /data/data/com.dumostech.dumosrx/shared_prefs/dumosrx_widget_data.xml
```
Expected: the `snapshot_json` value's `fleet`/`stores` fields match the field names and value types from Task 3's `WidgetSnapshotPayload` type exactly (`todaySalesFormatted`, `lowStockCount`, `expiringCount`, same nesting).

- [ ] **Step 7: Commit**

```bash
git add client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/RefreshWorker.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetRefreshScheduler.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt client/src-tauri/gen/android/app/build.gradle.kts
git commit -m "feat: add WorkManager periodic background refresh for widget"
```

---

## Task 9: Kotlin — Glance widget UI

**Files:**
- Modify: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetProvider.kt` (replaces Task 6's stub)
- Create: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetConfigStore.kt` (stub — replaced by Task 10)
- Create: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetContent.kt`
- Modify: `client/src-tauri/gen/android/app/build.gradle.kts`
- Modify: `client/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Create: `client/src-tauri/gen/android/app/src/main/res/xml/dumosrx_widget_info.xml`
- Create: `client/src-tauri/gen/android/app/src/main/res/drawable/ic_widget_preview.xml`

**Interfaces:**
- Consumes: `WidgetSnapshotStore.read()` (Task 6), per-instance config via this task's own `WidgetConfigStore` stub (`read()` always returns fleet mode — Task 10 replaces the file with the real per-appWidgetId-backed implementation, same `WidgetMode`/`WidgetConfig`/`read()` signature, so `DumosRxWidgetContent.kt`'s call site here needs no changes).
- Produces: `DumosRxWidgetProvider.requestUpdateAll(context)` (companion-object method, same signature as Task 6's stub — `MainActivity.kt`'s existing call site needs no changes).

- [ ] **Step 1: Add Glance/Compose dependencies and enable Compose**

In `client/src-tauri/gen/android/app/build.gradle.kts`:

Add to the `plugins { ... }` block at the top of the file:

```kotlin
    id("org.jetbrains.kotlin.plugin.compose") version "1.9.25"
```

Add inside the `android { ... }` block:

```kotlin
    buildFeatures {
        compose = true
    }
```

Add to `dependencies { ... }`:

```kotlin
    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
```

- [ ] **Step 2: Write the layout XML fallback + preview drawable**

Glance widgets still need a minimal `initialLayout` for the widget picker preview and an app-widget-provider XML. Create `client/src-tauri/gen/android/app/src/main/res/drawable/ic_widget_preview.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#000000"
        android:pathData="M3,3h18v18H3z" />
</vector>
```

Create `client/src-tauri/gen/android/app/src/main/res/xml/dumosrx_widget_info.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="110dp"
    android:targetCellWidth="3"
    android:targetCellHeight="2"
    android:updatePeriodMillis="0"
    android:previewIcon="@drawable/ic_widget_preview"
    android:configure="com.dumostech.dumosrx.widget.DumosRxWidgetConfigureActivity"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
```

(`updatePeriodMillis="0"` because Glance widgets are updated explicitly via `requestUpdateAll`/`update` from `WidgetSnapshotStore` writers, not the OS's own periodic mechanism — that's what Tasks 6 and 8 already call. `android:configure` points at Task 10's configuration Activity; until Task 10 exists, remove this line or the manifest reference will fail to resolve — see Step 6's note.)

- [ ] **Step 3: Write a `WidgetConfigStore.kt` stub**

`DumosRxWidgetContent.kt` (next step) needs to read per-widget-instance config, but the real per-appWidgetId-backed store isn't built until Task 10. Create a fleet-only stub now with the exact API surface Task 10 will replace it with, so this task builds and behaves correctly (fleet mode only) standalone:

Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetConfigStore.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context

enum class WidgetMode { FLEET, STORE }

data class WidgetConfig(
    val mode: WidgetMode,
    val storeId: String?,
    val storeName: String?,
)

// Stub for Task 9 - always fleet mode. Replaced in Task 10 with a real
// per-appWidgetId-backed implementation (same read() signature, so
// DumosRxWidgetContent.kt's call site doesn't change).
object WidgetConfigStore {
    fun read(context: Context, appWidgetId: Int): WidgetConfig =
        WidgetConfig(mode = WidgetMode.FLEET, storeId = null, storeName = null)
}
```

- [ ] **Step 4: Write `DumosRxWidgetContent.kt`**

Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetContent.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.FontWeight
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private const val STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000L // 6 hours, per design spec

/**
 * The widget's actual rendering, separated from DumosRxWidgetProvider so it
 * can be reasoned about (and eventually previewed/tested) independent of
 * the AppWidgetProvider plumbing. Reads WidgetSnapshotStore + this
 * instance's WidgetConfigStore entry; renders every state from the design
 * spec's "Widget content & states" section.
 */
@Composable
fun DumosRxWidgetContent(context: Context, appWidgetId: Int) {
    val snapshotJson = WidgetSnapshotStore.read(context)
    val config = WidgetConfigStore.read(context, appWidgetId)

    if (snapshotJson == null) {
        UnlinkedState()
        return
    }

    val snapshot = JSONObject(snapshotJson)
    if (!snapshot.optBoolean("linked", false)) {
        UnlinkedState()
        return
    }

    val scope = if (config.mode == WidgetMode.STORE && config.storeId != null) {
        findStore(snapshot, config.storeId)
    } else {
        snapshot.getJSONObject("fleet")
    }

    if (scope == null) {
        UnlinkedState()
        return
    }

    val headerLabel = if (config.mode == WidgetMode.STORE) config.storeName ?: "Store" else "All stores"
    val updatedAtMs = snapshot.optLong("updatedAtEpochMs", 0L)
    val isStale = updatedAtMs > 0 && (System.currentTimeMillis() - updatedAtMs) > STALE_THRESHOLD_MS

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .padding(12.dp)
            .background(ColorProvider(day = androidx.compose.ui.graphics.Color.White, night = androidx.compose.ui.graphics.Color.Black))
            .clickable(actionStartActivity<com.dumostech.dumosrx.MainActivity>()),
    ) {
        Text(text = headerLabel, style = TextStyle(fontWeight = FontWeight.Bold))
        Text(text = scope.optString("todaySalesFormatted", "-"), style = TextStyle(fontWeight = FontWeight.Bold))

        val lowStock = scope.optInt("lowStockCount", 0)
        if (lowStock > 0) {
            Text(text = "$lowStock items low stock")
        }

        val expiring = scope.optInt("expiringCount", 0)
        if (expiring > 0) {
            Text(text = "$expiring batches expiring soon")
        }

        Text(
            text = if (isStale) "Updated a while ago - open app to refresh" else formatUpdatedAt(updatedAtMs),
            style = TextStyle(color = ColorProvider(day = androidx.compose.ui.graphics.Color.Gray, night = androidx.compose.ui.graphics.Color.LightGray)),
        )
    }
}

@Composable
private fun UnlinkedState() {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .padding(12.dp)
            .clickable(actionStartActivity<com.dumostech.dumosrx.MainActivity>()),
    ) {
        Text(text = "Open DumosRx to connect your account", style = TextStyle(fontWeight = FontWeight.Bold))
    }
}

private fun findStore(snapshot: JSONObject, storeId: String): JSONObject? {
    val stores = snapshot.optJSONArray("stores") ?: return null
    for (i in 0 until stores.length()) {
        val store = stores.getJSONObject(i)
        if (store.optString("id") == storeId) return store
    }
    return null
}

private fun formatUpdatedAt(updatedAtMs: Long): String {
    if (updatedAtMs <= 0L) return "Updated just now"
    val minutesAgo = TimeUnit.MILLISECONDS.toMinutes(System.currentTimeMillis() - updatedAtMs)
    return when {
        minutesAgo < 1 -> "Updated just now"
        minutesAgo < 60 -> "Updated ${minutesAgo}m ago"
        else -> "Updated ${minutesAgo / 60}h ago"
    }
}
```

- [ ] **Step 5: Replace the Task 6 stub with the real `DumosRxWidgetProvider`**

Overwrite `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetProvider.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import kotlinx.coroutines.runBlocking

class DumosRxWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val manager = GlanceAppWidgetManager(context)
        val appWidgetId = manager.getAppWidgetId(id)
        provideContent { DumosRxWidgetContent(context, appWidgetId) }
    }
}

class DumosRxWidgetProvider : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DumosRxWidget()

    companion object {
        fun requestUpdateAll(context: Context) {
            runBlocking { DumosRxWidget().updateAll(context) }
        }
    }
}
```

- [ ] **Step 6: Register the receiver in the manifest**

In `client/src-tauri/gen/android/app/src/main/AndroidManifest.xml`, add before the `<provider>` block (the same spot the spike used):

```xml
        <receiver
            android:name=".widget.DumosRxWidgetProvider"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/dumosrx_widget_info" />
        </receiver>
```

Since Task 10 (the configure Activity referenced in `dumosrx_widget_info.xml`'s `android:configure`) hasn't landed yet, temporarily remove the `android:configure="..."` line from `dumosrx_widget_info.xml` for this task's build check, and restore it in Task 10 once the Activity exists. Note this explicitly in this task's commit message so it isn't missed.

- [ ] **Step 7: Build and verify**

Run: `cd client && JAVA_HOME=/opt/homebrew/opt/openjdk@17 npx tauri android build --debug --target aarch64`
Expected: build succeeds.

- [ ] **Step 8: Manual visual verification**

Install on an emulator, add the widget to the home screen, and confirm each state by manipulating `WidgetSnapshotStore` directly via adb:

```bash
adb install -r client/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

# Unlinked state
adb shell run-as com.dumostech.dumosrx sh -c 'echo "{\"linked\":false,\"updatedAtEpochMs\":0}" > /data/data/com.dumostech.dumosrx/shared_prefs/dumosrx_widget_data.xml' 2>/dev/null || echo "adjust via app UI instead - direct XML write may not match SharedPreferences format"
```
(SharedPreferences' on-disk XML format makes direct `adb shell` writes fragile — the more reliable path is running the app once with a live cloud-linked session so `useWidgetSnapshotSync` writes a real snapshot, then confirming the widget updates to show it, and confirming the "Updated Xm ago" footer.)
Expected: widget shows sales figure, low-stock/expiring rows appear only when their counts are > 0, tapping the widget opens `MainActivity`.

- [ ] **Step 9: Commit**

```bash
git add client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetProvider.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetConfigStore.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetContent.kt client/src-tauri/gen/android/app/build.gradle.kts client/src-tauri/gen/android/app/src/main/AndroidManifest.xml client/src-tauri/gen/android/app/src/main/res/xml/dumosrx_widget_info.xml client/src-tauri/gen/android/app/src/main/res/drawable/ic_widget_preview.xml
git commit -m "feat: add Glance widget UI rendering all snapshot states

android:configure temporarily omitted from dumosrx_widget_info.xml -
restored in the next task once DumosRxWidgetConfigureActivity exists."
```

---

## Task 10: Kotlin — widget configuration Activity (store picker)

**Files:**
- Modify: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetConfigStore.kt` (replaces Task 9's fleet-only stub with the real per-appWidgetId-backed store)
- Create: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetConfigureActivity.kt`
- Create: `client/src-tauri/gen/android/app/src/main/res/layout/activity_widget_configure.xml`
- Modify: `client/src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Modify: `client/src-tauri/gen/android/app/src/main/res/xml/dumosrx_widget_info.xml`

**Interfaces:**
- Produces: `WidgetConfigStore.read(context, appWidgetId): WidgetConfig` / `.write(context, appWidgetId, mode, storeId, storeName)` (same `read()` signature as Task 9's stub — `DumosRxWidgetContent.kt`'s call site doesn't change), and the `WidgetMode` enum / `WidgetConfig` data class Task 9's `DumosRxWidgetContent` already imports and calls.

- [ ] **Step 1: Replace the stub with the real `WidgetConfigStore.kt`**

Overwrite `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetConfigStore.kt` (Task 9's stub always returned fleet mode; this replaces it with the real per-appWidgetId-backed implementation):

```kotlin
package com.dumostech.dumosrx.widget

import android.content.Context

enum class WidgetMode { FLEET, STORE }

data class WidgetConfig(
    val mode: WidgetMode,
    val storeId: String?,
    val storeName: String?,
)

/** Per-widget-instance config (single-store vs fleet-wide), set once at
 * add-time via DumosRxWidgetConfigureActivity. Keyed by appWidgetId since a
 * user can add multiple widget instances with different scopes. */
object WidgetConfigStore {
    private const val PREFS_NAME = "dumosrx_widget_config"

    fun write(context: Context, appWidgetId: Int, mode: WidgetMode, storeId: String?, storeName: String?) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString("mode_$appWidgetId", mode.name)
            .putString("storeId_$appWidgetId", storeId)
            .putString("storeName_$appWidgetId", storeName)
            .apply()
    }

    fun read(context: Context, appWidgetId: Int): WidgetConfig {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val modeName = prefs.getString("mode_$appWidgetId", WidgetMode.FLEET.name)
        return WidgetConfig(
            mode = runCatching { WidgetMode.valueOf(modeName ?: WidgetMode.FLEET.name) }.getOrDefault(WidgetMode.FLEET),
            storeId = prefs.getString("storeId_$appWidgetId", null),
            storeName = prefs.getString("storeName_$appWidgetId", null),
        )
    }

    fun clear(context: Context, appWidgetId: Int) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove("mode_$appWidgetId")
            .remove("storeId_$appWidgetId")
            .remove("storeName_$appWidgetId")
            .apply()
    }
}
```

- [ ] **Step 2: Write the configure layout**

Create `client/src-tauri/gen/android/app/src/main/res/layout/activity_widget_configure.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Choose what this widget shows"
        android:textStyle="bold"
        android:textSize="18sp"
        android:paddingBottom="16dp" />

    <RadioGroup
        android:id="@+id/widget_scope_group"
        android:layout_width="match_parent"
        android:layout_height="wrap_content">

        <RadioButton
            android:id="@+id/widget_scope_fleet"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="All stores"
            android:checked="true" />

        <!-- Per-store radio buttons are added programmatically in
             DumosRxWidgetConfigureActivity, one per store the account owns. -->
    </RadioGroup>

    <Button
        android:id="@+id/widget_scope_confirm"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="24dp"
        android:text="Add widget" />
</LinearLayout>
```

- [ ] **Step 3: Write the configure Activity**

Create `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetConfigureActivity.kt`:

```kotlin
package com.dumostech.dumosrx.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.RadioButton
import android.widget.RadioGroup
import com.dumostech.dumosrx.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * Shown once when a widget instance is first added to the home screen.
 * Lets the owner pick "all stores" or one specific store; stored per
 * appWidgetId in WidgetConfigStore. Reconfiguring later means removing and
 * re-adding the widget - the standard Android pattern (see the design
 * spec's "Widget reconfiguration UX" open question).
 */
class DumosRxWidgetConfigureActivity : Activity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(Activity.RESULT_CANCELED)
        setContentView(R.layout.activity_widget_configure)

        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val group = findViewById<RadioGroup>(R.id.widget_scope_group)
        val stores = readStoresFromSnapshot()
        val storeButtonIds = mutableMapOf<Int, JSONObject>()

        stores.forEach { store ->
            val button = RadioButton(this).apply { text = store.getString("name") }
            group.addView(button)
            storeButtonIds[button.id] = store
        }

        findViewById<android.widget.Button>(R.id.widget_scope_confirm).setOnClickListener {
            val checkedId = group.checkedRadioButtonId
            val selectedStore = storeButtonIds[checkedId]

            if (selectedStore != null) {
                WidgetConfigStore.write(
                    this, appWidgetId, WidgetMode.STORE,
                    selectedStore.getString("id"), selectedStore.getString("name"),
                )
            } else {
                WidgetConfigStore.write(this, appWidgetId, WidgetMode.FLEET, null, null)
            }

            DumosRxWidgetProvider.requestUpdateAll(applicationContext)

            val resultValue = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            setResult(Activity.RESULT_OK, resultValue)
            finish()
        }
    }

    private fun readStoresFromSnapshot(): List<JSONObject> {
        val json = WidgetSnapshotStore.read(applicationContext) ?: return emptyList()
        val snapshot = JSONObject(json)
        if (!snapshot.optBoolean("linked", false)) return emptyList()
        val storesArray: JSONArray = snapshot.optJSONArray("stores") ?: JSONArray()
        return (0 until storesArray.length()).map { storesArray.getJSONObject(it) }
    }
}
```

- [ ] **Step 4: Register the Activity in the manifest and restore `android:configure`**

In `client/src-tauri/gen/android/app/src/main/AndroidManifest.xml`, add inside `<application>`, after the `<receiver>` block from Task 9:

```xml
        <activity
            android:name=".widget.DumosRxWidgetConfigureActivity"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_CONFIGURE" />
            </intent-filter>
        </activity>
```

In `client/src-tauri/gen/android/app/src/main/res/xml/dumosrx_widget_info.xml`, restore the line removed in Task 9 Step 6:

```xml
    android:configure="com.dumostech.dumosrx.widget.DumosRxWidgetConfigureActivity"
```

- [ ] **Step 5: Build and verify**

Run: `cd client && JAVA_HOME=/opt/homebrew/opt/openjdk@17 npx tauri android build --debug --target aarch64`
Expected: build succeeds.

- [ ] **Step 6: Manual verification**

Install on an emulator (cloud-linked session, so a real snapshot with ≥1 store exists), long-press the home screen, add the DumosRx widget, and confirm the configuration screen appears listing "All stores" plus one radio button per real store, and that picking one produces a widget scoped to that store (compare its sales figure against the in-app dashboard for that store).

- [ ] **Step 7: Commit**

```bash
git add client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/WidgetConfigStore.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetConfigureActivity.kt client/src-tauri/gen/android/app/src/main/res/layout/activity_widget_configure.xml client/src-tauri/gen/android/app/src/main/AndroidManifest.xml client/src-tauri/gen/android/app/src/main/res/xml/dumosrx_widget_info.xml
git commit -m "feat: add widget configuration Activity for single-store vs fleet mode"
```

---

## Task 11: Tap-through deep link + provider wiring

**Files:**
- Modify: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`
- Modify: `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetContent.kt`
- Create: `client/lib/hooks/use-widget-deeplink.ts`
- Modify: a root client provider file (find via Step 1)
- Test: `client/__tests__/use-widget-deeplink.test.ts`

**Interfaces:**
- Consumes: a native DOM `CustomEvent` named `widget-deeplink` dispatched on `window` from Kotlin (see Step 7 — `WryActivity.onWebViewCreate` is the only available hook to reach the WebView, since `TauriActivity`/`WryActivity`'s own WebView field is private; no new Rust command needed, this stays entirely native-side + a DOM event), Next.js `useRouter()` from `next/navigation`.
- Produces: tapping a widget alert row navigates the running app to that alert's screen (e.g. `/inventory/catalog` for low stock).

- [ ] **Step 1: Find the app's root client provider file**

Run: `grep -rln "QueryClientProvider" client/app client/components --include="*.tsx" | grep -i provider`

This is where `useWidgetSnapshotSync()` (Task 7) and the new `useWidgetDeeplink()` both get mounted — one line each, no new provider component needed since they're side-effect-only hooks.

- [ ] **Step 2: Write the failing test**

Create `client/__tests__/use-widget-deeplink.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("useWidgetDeeplink", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("routes to the path carried by a widget-deeplink CustomEvent's detail", async () => {
    const { useWidgetDeeplink } = await import("@/lib/hooks/use-widget-deeplink");
    renderHook(() => useWidgetDeeplink());

    window.dispatchEvent(
      new CustomEvent("widget-deeplink", { detail: "/inventory/catalog?filter=low_stock" }),
    );

    expect(pushMock).toHaveBeenCalledWith("/inventory/catalog?filter=low_stock");
  });

  it("ignores events with a non-string detail", async () => {
    const { useWidgetDeeplink } = await import("@/lib/hooks/use-widget-deeplink");
    renderHook(() => useWidgetDeeplink());

    window.dispatchEvent(new CustomEvent("widget-deeplink", { detail: 42 }));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", async () => {
    const { useWidgetDeeplink } = await import("@/lib/hooks/use-widget-deeplink");
    const { unmount } = renderHook(() => useWidgetDeeplink());
    unmount();

    window.dispatchEvent(
      new CustomEvent("widget-deeplink", { detail: "/inventory/catalog?filter=low_stock" }),
    );

    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/use-widget-deeplink.test.ts`
Expected: FAIL — `@/lib/hooks/use-widget-deeplink` doesn't exist.

- [ ] **Step 4: Write the hook**

Create `client/lib/hooks/use-widget-deeplink.ts`:

```typescript
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for a native "widget-deeplink" DOM CustomEvent, dispatched via
 * MainActivity's captured WebView reference (WryActivity.onWebViewCreate ->
 * evaluateJavascript) when the user taps a widget alert row - see
 * DumosRxWidgetContent.kt's PendingIntents and MainActivity.onNewIntent.
 * Routes the already-running app there. There's no Tauri event round-trip:
 * TauriActivity/WryActivity keep their WebView field private, so the
 * simplest reachable path from Kotlin is evaluateJavascript dispatching a
 * plain DOM event, not Tauri's Rust-mediated event system. Mounted once
 * near the app root, alongside useWidgetSnapshotSync.
 */
export function useWidgetDeeplink() {
  const router = useRouter();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail === "string") {
        router.push(detail);
      }
    };

    window.addEventListener("widget-deeplink", handler);
    return () => window.removeEventListener("widget-deeplink", handler);
  }, [router]);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/use-widget-deeplink.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 6: Mount both hooks in the root provider**

In the file found by Step 1, add:

```typescript
import { useWidgetSnapshotSync } from "@/lib/hooks/use-widget-snapshot-sync";
import { useWidgetDeeplink } from "@/lib/hooks/use-widget-deeplink";
```

and inside the root provider component's body (alongside other top-level hooks already called there):

```typescript
  useWidgetSnapshotSync();
  useWidgetDeeplink();
```

- [ ] **Step 7: Capture the WebView, add `onNewIntent` handling, and dispatch via `evaluateJavascript`**

`TauriActivity`/`WryActivity` keep their WebView field (`mWebView`) private, so there's no getter to call into from `MainActivity`. The one available extension point is `WryActivity.onWebViewCreate(webView: WebView)` (`generated/WryActivity.kt:56`, `open fun`, called once when Tauri sets up the WebView) — override it to capture a reference, then use the standard `WebView.evaluateJavascript()` API to dispatch a DOM `CustomEvent`, matching what `useWidgetDeeplink` (Step 4) listens for. No Rust command needed for this direction at all — this is a purely native, synchronous WebView API, unlike the Rust→Kotlin JNI calls used elsewhere in this file for the opposite direction.

Two delivery cases need separate handling, since Android only calls one of `onCreate`/`onNewIntent` per launch (this Activity is `launchMode="singleTask"`, confirmed in `AndroidManifest.xml`):
- **Warm tap** (app's task already exists): Android calls `onNewIntent` directly — the WebView and its JS listener are already up, so dispatch immediately.
- **Cold tap** (app not running): Android calls `onCreate` with the intent, but the WebView doesn't exist yet at that point (it's created asynchronously by Tauri) and the React app's `useWidgetDeeplink` listener won't be mounted the instant the page starts loading either. Store the path in `pendingDeeplinkPath` in `onCreate`, then dispatch it after `onWebViewCreate` fires, with a short delay to give the page a chance to finish loading and mount its listeners. This delay is a pragmatic heuristic, not a guarantee — Task 11's Step 11 manual verification is where its reliability gets confirmed against a real cold start; increase `COLD_START_DISPATCH_DELAY_MS` if taps are missed in practice.

In `client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`:

```kotlin
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import org.json.JSONObject
```

```kotlin
class MainActivity : TauriActivity() {
  companion object {
    const val EXTRA_WIDGET_DEEPLINK = "widget_deeplink"
    private const val COLD_START_DISPATCH_DELAY_MS = 800L
  }

  private var capturedWebView: WebView? = null
  private var pendingDeeplinkPath: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    WidgetRefreshScheduler.schedulePeriodic(applicationContext)
    intent?.getStringExtra(EXTRA_WIDGET_DEEPLINK)?.let { pendingDeeplinkPath = it }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    intent.getStringExtra(EXTRA_WIDGET_DEEPLINK)?.let { path -> dispatchDeeplinkEvent(path) }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    capturedWebView = webView

    pendingDeeplinkPath?.let { path ->
      pendingDeeplinkPath = null
      Handler(Looper.getMainLooper()).postDelayed({ dispatchDeeplinkEvent(path) }, COLD_START_DISPATCH_DELAY_MS)
    }
  }

  private fun dispatchDeeplinkEvent(path: String) {
    // JSONObject.quote() both quotes and escapes the string, so it's safe
    // to splice directly into the JS snippet below.
    val jsLiteral = JSONObject.quote(path)
    runOnUiThread {
      capturedWebView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('widget-deeplink', { detail: $jsLiteral }))",
        null,
      )
    }
  }

  // ... setNavigationBarLight, mirrorAuthToken, clearMirroredAuthToken,
  // writeWidgetSnapshot from earlier tasks stay unchanged below this point.
}
```

- [ ] **Step 8: Wire PendingIntents in the widget content**

In Task 9's version of `DumosRxWidgetContent.kt`, the low-stock and expiring `Text` rows have no `clickable` modifier at all — only the outer `Column` does, via a bare `actionStartActivity<MainActivity>()` that opens the app with no extras. Replace those two `Text(...)` calls (find them by their `"$lowStock items low stock"` / `"$expiring batches expiring soon"` text) with intent-carrying versions that add a per-row `clickable` modifier of their own:

Add these two imports (`actionStartActivity` is already imported by Task 9 — don't duplicate it):

```kotlin
import android.content.Intent
import com.dumostech.dumosrx.MainActivity
```

```kotlin
        val lowStock = scope.optInt("lowStockCount", 0)
        if (lowStock > 0) {
            Text(
                text = "$lowStock items low stock",
                modifier = GlanceModifier.clickable(
                    actionStartActivity(
                        Intent(context, MainActivity::class.java)
                            .putExtra(MainActivity.EXTRA_WIDGET_DEEPLINK, "/inventory/catalog?filter=low_stock"),
                    ),
                ),
            )
        }

        val expiring = scope.optInt("expiringCount", 0)
        if (expiring > 0) {
            Text(
                text = "$expiring batches expiring soon",
                modifier = GlanceModifier.clickable(
                    actionStartActivity(
                        Intent(context, MainActivity::class.java)
                            .putExtra(MainActivity.EXTRA_WIDGET_DEEPLINK, "/inventory/catalog?filter=expiring"),
                    ),
                ),
            )
        }
```

- [ ] **Step 9: Build and verify**

Run: `cd client && JAVA_HOME=/opt/homebrew/opt/openjdk@17 npx tauri android build --debug --target aarch64`
Expected: build succeeds.

- [ ] **Step 10: Typecheck the client**

Run: `cd client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Manual end-to-end verification**

Install the debug APK on an emulator with a widget already added and low-stock items present. Tap the "N items low stock" row. Expected: the app opens (or comes to foreground if already running) directly on the inventory catalog, filtered to low stock.

- [ ] **Step 12: Commit**

```bash
git add client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/MainActivity.kt client/src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/DumosRxWidgetContent.kt client/lib/hooks/use-widget-deeplink.ts __tests__/use-widget-deeplink.test.ts
# also add the root provider file found in Step 1
git commit -m "feat: wire widget tap-through deep linking into the app"
```

---

## Task 12: Full end-to-end verification checklist

**Files:** none (verification only).

- [ ] **Step 1: Full clean build**

Run: `cd client && JAVA_HOME=/opt/homebrew/opt/openjdk@17 npx tauri android build --debug --target aarch64`
Expected: succeeds with no warnings introduced by this feature's code (pre-existing warnings from generated Tauri code are fine).

- [ ] **Step 2: Run the full test suite**

Run: `cd client && npx vitest run` and `cd laravel-server && php artisan test`
Expected: all tests pass, including every test added across Tasks 1, 3, 5, 7, 11.

- [ ] **Step 3: Install and manually walk every widget state on an emulator**

- Fresh install, no cloud link: add widget → shows "Open DumosRx to connect your account", tapping opens the app.
- Log in / link cloud account, open the app once: widget updates to show real sales + alert counts within a few seconds (via `useWidgetSnapshotSync`'s mount-time fetch).
- Add a second widget instance in single-store mode via the configure screen: its figures differ from the fleet-mode widget and match that store's in-app dashboard.
- Force a WorkManager run (`adb shell cmd jobscheduler run -f ...`, per Task 8 Step 6) with the app fully closed: snapshot's `updatedAtEpochMs` advances.
- Manually age the snapshot past 6 hours (edit `updatedAtEpochMs` via the same `adb shell run-as` route used in Task 8) and confirm the widget's footer switches to the stale-warning copy/style.
- Tap the low-stock and expiring rows: app opens directly to the filtered inventory view.
- Log out: widget reverts to the unlinked state (confirms `clearMirroredAuthToken` + `clearToken`'s effect on the next `useWidgetSnapshotSync` write).

- [ ] **Step 4: Update the spec status**

In `docs/superpowers/specs/2026-09-07-android-glance-widget-design.md`, change the `**Status:**` line to `Implemented`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-07-android-glance-widget-design.md
git commit -m "docs: mark Android widget spec as implemented"
```
