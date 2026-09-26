# Storefront Paystack Subaccounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a storefront collect real online payments that settle directly to the store owner's own bank account via a Paystack subaccount, with DumosRx taking a fixed, superadmin-editable percentage automatically at the point of payment.

**Architecture:** A new `PaystackSubaccountService` wraps Paystack's bank-list/resolve/subaccount/refund endpoints in the same plain-`Http`-call house style as `PaymentService`. Store owners onboard by entering bank details (never touching Paystack directly); DumosRx creates the subaccount server-side. `PaymentService::initializeTransaction()` gains an optional subaccount + currency parameter used only by the storefront checkout path. The platform fee lives in `SystemConfig`, editable by a superadmin, and propagates to every existing subaccount via a scheduled command mirroring `RebuildStorefrontIfDirty`'s dirty-flag pattern (no queue worker exists in production).

**Tech Stack:** Laravel 11 / PHP 8.2 (`laravel-server/`), Next.js/TypeScript (`client/` for owner-facing settings, `web/` for the customer-facing storefront + admin panel), Paystack HTTP API (no SDK).

**Spec:** `docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`

## Global Constraints

- Scope is exactly Paystack's own supported countries: Nigeria, Ghana, South Africa, Kenya, Rwanda, Côte d'Ivoire. No other country, no Flutterwave subaccount work.
- `percentage_charge` sent to Paystack is DumosRx's cut (the platform), not the store's share — confirmed against Paystack's docs.
- One global fee percentage in `SystemConfig` key `storefront_platform_fee_percentage`. No per-store rate.
- Never call `Mail::to()->queue()` or dispatch a queued job anywhere in this work — `laravel-server/AGENTS.md` confirms no queue worker runs in production. The fee-propagation job is a scheduled command with a dirty flag, exactly like `RebuildStorefrontIfDirty`.
- The full bank account number is never persisted beyond the in-flight create-subaccount call. Only `paystack_account_number_last4` (masked) is stored.
- `stores` is a synced table read by `client/`. Every new column needs the migration on the Laravel side AND the matching entry in `client/lib/db/schema.ts` + `SYNC_COLUMN_MIGRATIONS`, per the existing "synced column added only on one side" convention documented in `laravel-server/AGENTS.md`.
- Server-authoritative fields this feature writes directly to a store's row (subaccount code, bank snapshot) are never written to the client's local SQLite copy from client-side code. The client relies on the existing pull-sync cycle to bring them down, exactly like `status`/`storefront_dirty_at` already work — inventing a second, bypass write path risks a `_version` mismatch on the next push.
- `listBanks()`/`resolveAccount()` return an empty/`null` result on an unsupported country rather than fabricating one. The UI must render "can't verify automatically" rather than silently skip the notice.
- Money amounts sent to Paystack are in the provider's smallest currency unit — mirror the existing `(int) round($amount * 100)` conversion already in `PaymentService::initializePaystack()`.
- No Paystack Transfer/claw-back logic. A refund on an already-settled order comes out of DumosRx's own Paystack balance — confirmed accepted by the user as a v1 cost, not something to automate here.

## Review Focus

- A typo'd account number that Paystack's resolve check rejects must surface an inline form error and must never result in a subaccount being created against the wrong account (Task 4).
- A double-click or slow-network retry on "Connect payment account" must not create two subaccounts for the same store — the endpoint must be idempotent once `paystack_subaccount_code` is already set (Task 4).
- One store's Paystack API failure during the scheduled fee-rate sync must not abort the batch or affect any other store in the same run (Task 6).
- A non-Nigerian store's checkout must actually use that store's own currency when a subaccount is present, not the hardcoded NGN default `PaymentService`/`StorefrontController` use today (Task 7).
- Cancelling an order whose `paystack_reference` is null or empty (an `in_store`/`transfer` order routed through the same code path) must fall back to the existing log-and-notify behavior rather than calling Paystack's refund API with an empty reference (Task 8).

---

## Task 1: Schema — `stores` gains the Paystack subaccount columns

**Files:**
- Create: `laravel-server/database/migrations/2026_09_26_000002_add_paystack_subaccount_fields_to_stores.php`
- Modify: `laravel-server/app/Models/Store.php:24-70` (`$fillable`, `$casts`)
- Modify: `client/lib/db/schema.ts` (`stores` CREATE TABLE block)
- Modify: `client/lib/db/schema-migrations.ts:443-` (`stores` entry in `SYNC_COLUMN_MIGRATIONS`)
- Test: `laravel-server/tests/Feature/StoreModelPaystackFieldsTest.php`

**Interfaces:**
- Produces: `stores.paystack_subaccount_code` (nullable string), `stores.paystack_subaccount_country` (nullable string), `stores.paystack_bank_code` (nullable string), `stores.paystack_account_number_last4` (nullable string), `stores.paystack_fee_dirty_at` (nullable datetime). Every later task reads/writes these exact column names.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StoreModelPaystackFieldsTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_persists_paystack_subaccount_fields()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Paystack',
            'email' => 'paystack-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Paystack Test Store',
            'store_slug' => 'paystack-test-store',
            'device_id' => 'WEB-PAYSTACK-TEST',
            'paystack_subaccount_code' => 'ACCT_test123',
            'paystack_subaccount_country' => 'nigeria',
            'paystack_bank_code' => '044',
            'paystack_account_number_last4' => '1234',
        ]);

        $store->refresh();

        $this->assertSame('ACCT_test123', $store->paystack_subaccount_code);
        $this->assertSame('nigeria', $store->paystack_subaccount_country);
        $this->assertSame('044', $store->paystack_bank_code);
        $this->assertSame('1234', $store->paystack_account_number_last4);
        $this->assertNull($store->paystack_fee_dirty_at);
    }

    public function test_paystack_fee_dirty_at_is_not_mass_assignable()
    {
        // Mirrors storefront_dirty_at's existing convention: server-only
        // bookkeeping, never accepted from a client sync payload.
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Dirty',
            'email' => 'dirty-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Dirty Flag Store',
            'store_slug' => 'dirty-flag-store',
            'device_id' => 'WEB-DIRTY-TEST',
            'paystack_fee_dirty_at' => now(),
        ]);

        $this->assertNull($store->paystack_fee_dirty_at);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=StoreModelPaystackFieldsTest`
Expected: FAIL — `Unknown column 'paystack_subaccount_code'` (migration doesn't exist yet).

- [ ] **Step 3: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Client-side counterpart: client/lib/db/schema.ts and the ALTER TABLE in
 * client/lib/db/schema-migrations.ts's `stores` entry. See
 * docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md.
 *
 * paystack_account_number_last4 is deliberately the only account-number
 * fragment stored - the full number is only ever in flight during the
 * create-subaccount call, never persisted.
 *
 * paystack_fee_dirty_at mirrors storefront_dirty_at: stamped when the global
 * platform fee changes, cleared once this store's subaccount has been
 * updated to match (see SyncSubaccountFeeRates, Task 6).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (!Schema::hasColumn('stores', 'paystack_subaccount_code')) {
                $table->string('paystack_subaccount_code')->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_subaccount_country')) {
                $table->string('paystack_subaccount_country')->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_bank_code')) {
                $table->string('paystack_bank_code')->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_account_number_last4')) {
                $table->string('paystack_account_number_last4', 4)->nullable();
            }
            if (!Schema::hasColumn('stores', 'paystack_fee_dirty_at')) {
                $table->timestamp('paystack_fee_dirty_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            $table->dropColumn([
                'paystack_subaccount_code',
                'paystack_subaccount_country',
                'paystack_bank_code',
                'paystack_account_number_last4',
                'paystack_fee_dirty_at',
            ]);
        });
    }
};
```

- [ ] **Step 4: Add the columns to `Store::$fillable` and `$casts`**

In `app/Models/Store.php`, add to `$fillable` (after `'timezone',`):

```php
        'timezone',
        'paystack_subaccount_code',
        'paystack_subaccount_country',
        'paystack_bank_code',
        'paystack_account_number_last4',
    ];
```

Do **not** add `paystack_fee_dirty_at` to `$fillable` — it must only ever be set via a raw `DB::table('stores')->update(...)` call, exactly like `storefront_dirty_at`, per the second test above.

Add to `$casts` (after `'storefront_dirty_at' => 'datetime',`):

```php
        'storefront_dirty_at' => 'datetime',
        'paystack_fee_dirty_at' => 'datetime',
    ];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=StoreModelPaystackFieldsTest`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the client-side schema (fresh installs)**

In `client/lib/db/schema.ts`, inside the `stores` `CREATE TABLE IF NOT EXISTS` block, add near the other nullable TEXT columns:

```
  paystack_subaccount_code TEXT,
  paystack_subaccount_country TEXT,
  paystack_bank_code TEXT,
  paystack_account_number_last4 TEXT,
```

(`paystack_fee_dirty_at` is intentionally **not** added to the client schema — the client never reads or writes it; it exists only server-side for the fee-propagation job's own bookkeeping, same reasoning as why some server-only columns aren't mirrored. Confirm this against how `storefront_dirty_at` itself is *not* present in `client/lib/db/schema.ts` before writing this step — if `storefront_dirty_at` turns out to already be mirrored on the client for the dynamic-pull-column-list reason `laravel-server/AGENTS.md` mentions, mirror `paystack_fee_dirty_at` the same way for consistency instead of skipping it.)

- [ ] **Step 7: Add the client-side migration (existing installs)**

In `client/lib/db/schema-migrations.ts`, inside the `stores` entry's `columns` array, add:

```
      "paystack_subaccount_code TEXT",
      "paystack_subaccount_country TEXT",
      "paystack_bank_code TEXT",
      "paystack_account_number_last4 TEXT",
```

- [ ] **Step 8: Verify the client changes type-check and don't break existing tests**

Run: `cd client && npx tsc --noEmit && npx vitest run __tests__/schema*.test.ts 2>/dev/null; npx vitest run`
Expected: clean typecheck; full suite still green (these are additive, nullable columns with no default behavior change).

- [ ] **Step 9: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/database/migrations/2026_09_26_000002_add_paystack_subaccount_fields_to_stores.php \
        laravel-server/app/Models/Store.php \
        laravel-server/tests/Feature/StoreModelPaystackFieldsTest.php \
        client/lib/db/schema.ts client/lib/db/schema-migrations.ts
git commit -m "feat: add Paystack subaccount columns to stores (both sides)"
```

---

## Task 2: `PaystackSubaccountService` — bank list, resolve, create, update fee, refund

**Files:**
- Create: `laravel-server/app/Services/Payment/PaystackSubaccountService.php`
- Test: `laravel-server/tests/Feature/PaystackSubaccountServiceTest.php`

**Interfaces:**
- Consumes: `config('payment.paystack.secret_key')` (already defined in `config/payment.php`).
- Produces (used by Tasks 4, 6, 8):
  - `listBanks(string $countryCode): array` — returns `[]` on any non-2xx response or a country Paystack's bank-list endpoint doesn't recognize.
  - `resolveAccount(string $accountNumber, string $bankCode, string $countryCode): ?array` — returns `['account_number' => string, 'account_name' => string]` or `null`.
  - `createSubaccount(string $businessName, string $bankCode, string $accountNumber, float $percentageCharge): string` — returns the Paystack `subaccount_code`; throws `\Exception` with the raw provider message on failure (caller logs, never echoes raw to an unauthenticated caller — there is none here, this is owner-authenticated).
  - `updateSubaccountFee(string $subaccountCode, float $percentageCharge): void` — throws on failure.
  - `refund(string $reference, ?int $amountInSubunit = null): array` — returns `['success' => bool, 'message' => string]`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Services\Payment\PaystackSubaccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaystackSubaccountServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payment.paystack.secret_key' => 'sk_test_fake']);
    }

    public function test_list_banks_returns_the_bank_array_on_success()
    {
        Http::fake([
            'api.paystack.co/bank*' => Http::response([
                'status' => true,
                'data' => [
                    ['name' => 'GTBank', 'code' => '058'],
                    ['name' => 'Access Bank', 'code' => '044'],
                ],
            ], 200),
        ]);

        $banks = (new PaystackSubaccountService())->listBanks('nigeria');

        $this->assertCount(2, $banks);
        $this->assertSame('058', $banks[0]['code']);
    }

    public function test_list_banks_returns_empty_array_on_failure_rather_than_throwing()
    {
        Http::fake(['api.paystack.co/bank*' => Http::response([], 500)]);

        $banks = (new PaystackSubaccountService())->listBanks('rwanda');

        $this->assertSame([], $banks);
    }

    public function test_resolve_account_returns_resolved_name_on_success()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_number' => '0123456789', 'account_name' => 'JANE M DOE'],
            ], 200),
        ]);

        $resolved = (new PaystackSubaccountService())->resolveAccount('0123456789', '058', 'nigeria');

        $this->assertSame('JANE M DOE', $resolved['account_name']);
    }

    public function test_resolve_account_returns_null_on_failure_rather_than_throwing()
    {
        Http::fake(['api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422)]);

        $resolved = (new PaystackSubaccountService())->resolveAccount('0000000000', '058', 'nigeria');

        $this->assertNull($resolved);
    }

    public function test_create_subaccount_returns_the_subaccount_code()
    {
        Http::fake([
            'api.paystack.co/subaccount' => Http::response([
                'status' => true,
                'data' => ['subaccount_code' => 'ACCT_abc123'],
            ], 200),
        ]);

        $code = (new PaystackSubaccountService())->createSubaccount(
            'Jane\'s Pharmacy', '058', '0123456789', 2.0,
        );

        $this->assertSame('ACCT_abc123', $code);
        Http::assertSent(function ($request) {
            return $request['percentage_charge'] === 2.0
                && $request['settlement_bank'] === '058'
                && $request['account_number'] === '0123456789';
        });
    }

    public function test_create_subaccount_throws_on_a_provider_error()
    {
        Http::fake(['api.paystack.co/subaccount' => Http::response(['message' => 'Invalid account number'], 400)]);

        $this->expectException(\Exception::class);

        (new PaystackSubaccountService())->createSubaccount('Bad Store', '058', '0000000000', 2.0);
    }

    public function test_update_subaccount_fee_sends_the_new_percentage()
    {
        Http::fake(['api.paystack.co/subaccount/ACCT_abc123' => Http::response(['status' => true], 200)]);

        (new PaystackSubaccountService())->updateSubaccountFee('ACCT_abc123', 3.5);

        Http::assertSent(fn ($request) => $request['percentage_charge'] === 3.5);
    }

    public function test_refund_returns_success_on_a_successful_refund()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refund has been queued for processing'], 200)]);

        $result = (new PaystackSubaccountService())->refund('DRX-REF-1');

        $this->assertTrue($result['success']);
    }

    public function test_refund_returns_failure_on_a_provider_error()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => false, 'message' => 'Transaction already refunded'], 400)]);

        $result = (new PaystackSubaccountService())->refund('DRX-REF-1');

        $this->assertFalse($result['success']);
        $this->assertSame('Transaction already refunded', $result['message']);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=PaystackSubaccountServiceTest`
Expected: FAIL — class `PaystackSubaccountService` doesn't exist.

- [ ] **Step 3: Write the service**

```php
<?php

namespace App\Services\Payment;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Wraps the Paystack endpoints a store's online-payment subaccount needs:
 * looking up banks, resolving an account number to a name, creating the
 * subaccount, updating its platform-fee percentage, and refunding a
 * transaction. Same house style as PaymentService - plain Http calls, no
 * SDK - deliberately kept separate from it since PaymentService is about
 * charging a customer, this is about paying a store owner.
 *
 * percentage_charge on Paystack's subaccount API is the percentage the MAIN
 * (platform) account receives, not the subaccount's share - confirmed
 * against Paystack's docs before building this.
 */
class PaystackSubaccountService
{
    protected string $secretKey;

    /**
     * Paystack's documented `country` values for GET /bank. Rwanda and Côte
     * d'Ivoire are supported countries for Paystack generally but not
     * confirmed for this specific endpoint - listBanks() below degrades to
     * [] for them rather than guessing at an unconfirmed value, and the
     * onboarding UI (Task 4) falls back to a plain text bank-name field when
     * this returns empty.
     */
    private const BANK_LIST_COUNTRIES = ['nigeria', 'ghana', 'kenya', 'south africa'];

    public function __construct()
    {
        $this->secretKey = (string) config('payment.paystack.secret_key');
    }

    public function listBanks(string $countryCode): array
    {
        if (!in_array($countryCode, self::BANK_LIST_COUNTRIES, true)) {
            return [];
        }

        try {
            $response = Http::withToken($this->secretKey)
                ->get('https://api.paystack.co/bank', ['country' => $countryCode]);
        } catch (\Throwable $e) {
            Log::warning('Paystack listBanks failed: ' . $e->getMessage());
            return [];
        }

        if (!$response->successful()) {
            return [];
        }

        return $response->json('data', []);
    }

    public function resolveAccount(string $accountNumber, string $bankCode, string $countryCode): ?array
    {
        try {
            $response = Http::withToken($this->secretKey)
                ->get('https://api.paystack.co/bank/resolve', [
                    'account_number' => $accountNumber,
                    'bank_code' => $bankCode,
                ]);
        } catch (\Throwable $e) {
            Log::warning('Paystack resolveAccount failed: ' . $e->getMessage());
            return null;
        }

        if (!$response->successful()) {
            return null;
        }

        $data = $response->json('data');
        if (!is_array($data) || empty($data['account_name'])) {
            return null;
        }

        return $data;
    }

    public function createSubaccount(
        string $businessName,
        string $bankCode,
        string $accountNumber,
        float $percentageCharge,
    ): string {
        $response = Http::withToken($this->secretKey)
            ->post('https://api.paystack.co/subaccount', [
                'business_name' => $businessName,
                'settlement_bank' => $bankCode,
                'account_number' => $accountNumber,
                'percentage_charge' => $percentageCharge,
            ]);

        if (!$response->successful()) {
            throw new \Exception('Paystack subaccount creation failed: ' . $response->body());
        }

        $code = $response->json('data.subaccount_code');
        if (!$code) {
            throw new \Exception('Paystack subaccount creation returned no subaccount_code.');
        }

        return $code;
    }

    public function updateSubaccountFee(string $subaccountCode, float $percentageCharge): void
    {
        $response = Http::withToken($this->secretKey)
            ->put("https://api.paystack.co/subaccount/{$subaccountCode}", [
                'percentage_charge' => $percentageCharge,
            ]);

        if (!$response->successful()) {
            throw new \Exception('Paystack subaccount fee update failed: ' . $response->body());
        }
    }

    /**
     * @param ?int $amountInSubunit Omit for a full refund; Paystack refuses
     *   an amount greater than the original transaction.
     */
    public function refund(string $reference, ?int $amountInSubunit = null): array
    {
        $payload = ['transaction' => $reference];
        if ($amountInSubunit !== null) {
            $payload['amount'] = $amountInSubunit;
        }

        try {
            $response = Http::withToken($this->secretKey)
                ->post('https://api.paystack.co/refund', $payload);
        } catch (\Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }

        $body = $response->json();

        return [
            'success' => $response->successful() && ($body['status'] ?? false),
            'message' => $body['message'] ?? ($response->successful() ? 'Refund processed' : 'Refund failed'),
        ];
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=PaystackSubaccountServiceTest`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/app/Services/Payment/PaystackSubaccountService.php \
        laravel-server/tests/Feature/PaystackSubaccountServiceTest.php
git commit -m "feat: add PaystackSubaccountService (bank list, resolve, create, fee update, refund)"
```

---

## Task 3: `PaymentService` — subaccount + currency on initialize, provider-agnostic refund

**Files:**
- Modify: `laravel-server/app/Services/Payment/PaymentService.php`
- Test: `laravel-server/tests/Feature/PaymentServiceSubaccountTest.php`

**Interfaces:**
- Consumes: `PaystackSubaccountService::refund()` (Task 2).
- Produces (used by Task 7, 8): `initializeTransaction($amount, $email, $metadata = [], ?string $callbackUrl = null, ?string $subaccount = null, ?string $currency = null)`; `refundTransaction(string $reference, string $provider, ?int $amountInSubunit = null): array`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Services\Payment\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaymentServiceSubaccountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'payment.paystack.secret_key' => 'sk_test_fake',
            'system.subscription_plans' => ['enable_paystack' => true, 'enable_flutterwave' => false],
        ]);
    }

    public function test_initialize_transaction_passes_subaccount_and_currency_to_paystack_when_given()
    {
        Http::fake([
            'api.paystack.co/transaction/initialize' => Http::response([
                'status' => true,
                'data' => ['reference' => 'ref_1', 'authorization_url' => 'https://paystack.com/pay/ref_1'],
            ], 200),
        ]);

        (new PaymentService())->initializeTransaction(
            1000, 'customer@example.com', [], null, 'ACCT_store123', 'KES',
        );

        Http::assertSent(function ($request) {
            return ($request['subaccount'] ?? null) === 'ACCT_store123'
                && ($request['currency'] ?? null) === 'KES';
        });
    }

    public function test_initialize_transaction_omits_subaccount_and_currency_when_not_given()
    {
        // The subscription flow's existing call sites pass neither - must
        // not regress into always sending them.
        Http::fake([
            'api.paystack.co/transaction/initialize' => Http::response([
                'status' => true,
                'data' => ['reference' => 'ref_2', 'authorization_url' => 'https://paystack.com/pay/ref_2'],
            ], 200),
        ]);

        (new PaymentService())->initializeTransaction(1000, 'customer@example.com');

        Http::assertSent(function ($request) {
            return !array_key_exists('subaccount', $request->data())
                && !array_key_exists('currency', $request->data());
        });
    }

    public function test_refund_transaction_delegates_to_paystack_subaccount_service_for_paystack()
    {
        Http::fake([
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refunded'], 200),
        ]);

        $result = (new PaymentService())->refundTransaction('ref_1', 'paystack');

        $this->assertTrue($result['success']);
    }

    public function test_refund_transaction_returns_failure_for_flutterwave_with_no_refund_support()
    {
        // Flutterwave refund is genuinely out of scope for this pass - this
        // pins that it fails closed (a clear failure result) rather than
        // silently doing nothing while reporting success.
        $result = (new PaymentService())->refundTransaction('tx_ref_1', 'flutterwave');

        $this->assertFalse($result['success']);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=PaymentServiceSubaccountTest`
Expected: FAIL — `initializeTransaction()` doesn't accept 5th/6th args; `refundTransaction()` doesn't exist.

- [ ] **Step 3: Modify `PaymentService`**

Change the `initializeTransaction` signature and body:

```php
    public function initializeTransaction($amount, $email, $metadata = [], ?string $callbackUrl = null, ?string $subaccount = null, ?string $currency = null)
    {
        $systemConfig = \App\Models\SystemConfig::getVal('subscription_plans', []);
        $paystackEnabled = $systemConfig['enable_paystack'] ?? true;
        $flutterwaveEnabled = $systemConfig['enable_flutterwave'] ?? true;

        if (!$paystackEnabled && !$flutterwaveEnabled) {
            throw new \Exception("No payment gateways are currently enabled by the administrator.");
        }

        if ($paystackEnabled && !$flutterwaveEnabled) {
            return $this->initializePaystack($amount, $email, $metadata, $callbackUrl, $subaccount, $currency);
        }

        if (!$paystackEnabled && $flutterwaveEnabled) {
            return $this->initializeFlutterwave($amount, $email, $metadata, $callbackUrl);
        }

        try {
            return $this->initializePaystack($amount, $email, $metadata, $callbackUrl, $subaccount, $currency);
        } catch (\Exception $e) {
            Log::warning("Paystack initialization failed, falling back to Flutterwave: " . $e->getMessage());
            try {
                return $this->initializeFlutterwave($amount, $email, $metadata, $callbackUrl);
            } catch (\Exception $fe) {
                Log::error("Both payment gateways failed: " . $fe->getMessage());
                throw new \Exception("Unable to initialize payment gateway. Please try again later.");
            }
        }
    }
```

Change `initializePaystack`:

```php
    protected function initializePaystack($amount, $email, $metadata, ?string $callbackUrl = null, ?string $subaccount = null, ?string $currency = null)
    {
        $payload = [
            'amount' => (int) round($amount * 100),
            'email' => $email,
            'metadata' => $metadata,
            'callback_url' => $callbackUrl ?? (config('app.frontend_url') . '/dashboard/subscription/verify'),
        ];

        // Only ever set by the storefront checkout path (Task 7) - the
        // subscription flow's call sites pass neither, and must keep
        // charging DumosRx's own main account exactly as today.
        if ($subaccount !== null) {
            $payload['subaccount'] = $subaccount;
        }
        if ($currency !== null) {
            $payload['currency'] = $currency;
        }

        $response = Http::withToken($this->paystackKey)
            ->post('https://api.paystack.co/transaction/initialize', $payload);

        if (!$response->successful()) {
            throw new \Exception("Paystack Error: " . $response->body());
        }

        $data = $response->json();

        return [
            'provider' => 'paystack',
            'reference' => $data['data']['reference'],
            'checkout_url' => $data['data']['authorization_url']
        ];
    }
```

Add a new public method (near `verifyTransaction`):

```php
    /**
     * Provider-agnostic refund, dispatched the same way verifyTransaction()
     * already dispatches by provider. Flutterwave refund is out of scope for
     * this pass (no storefront checkout reaches Flutterwave today) - fails
     * closed with success=false rather than silently no-opping.
     */
    public function refundTransaction(string $reference, string $provider, ?int $amountInSubunit = null): array
    {
        if ($provider === 'paystack') {
            return app(\App\Services\Payment\PaystackSubaccountService::class)
                ->refund($reference, $amountInSubunit);
        }

        return ['success' => false, 'message' => "Refunds are not supported for provider '{$provider}'."];
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=PaymentServiceSubaccountTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full existing payment/subscription test suite to confirm no regression**

Run: `cd laravel-server && php artisan test --filter=Subscription`
Expected: all previously-passing subscription tests still pass — the new params are optional and default to the old behavior.

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/app/Services/Payment/PaymentService.php \
        laravel-server/tests/Feature/PaymentServiceSubaccountTest.php
git commit -m "feat: PaymentService supports a Paystack subaccount/currency and provider-agnostic refunds"
```

---

## Task 4: Onboarding endpoints — banks, resolve, create payment account

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/Web/StoreController.php`
- Modify: `laravel-server/routes/api.php` (near the existing `stores/check-slug` route)
- Test: `laravel-server/tests/Feature/StorePaymentAccountControllerTest.php`

**Interfaces:**
- Consumes: `PaystackSubaccountService` (Task 2), `SystemConfig::getVal('storefront_platform_fee_percentage', 2.0)` (Task 5 defines the key; use the literal default `2.0` here until Task 5 lands, since this task must be independently testable first).
- Produces: `GET /stores/{id}/payment-banks?country=`, `POST /stores/{id}/payment-account/resolve`, `POST /stores/{id}/payment-account`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StorePaymentAccountControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Payment',
            'email' => 'payment-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Payment Store',
            'store_slug' => 'payment-store', 'device_id' => 'WEB-PAYMENT',
        ]);
    }

    public function test_payment_banks_returns_the_bank_list_for_a_supported_country()
    {
        Http::fake([
            'api.paystack.co/bank*' => Http::response([
                'status' => true,
                'data' => [['name' => 'GTBank', 'code' => '058']],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->getJson("/api/v1/stores/{$this->store->id}/payment-banks?country=nigeria");

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'banks');
    }

    public function test_payment_account_resolve_returns_the_resolved_name()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_number' => '0123456789', 'account_name' => 'JANE M DOE'],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account/resolve", [
                'account_number' => '0123456789',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['account_name' => 'JANE M DOE']);
    }

    public function test_payment_account_resolve_returns_null_account_name_when_unverifiable()
    {
        Http::fake(['api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422)]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account/resolve", [
                'account_number' => '0000000000',
                'bank_code' => '058',
                'country' => 'rwanda',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['account_name' => null]);
    }

    public function test_creating_a_payment_account_stores_the_subaccount_code_and_masked_number()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response([
                'status' => true,
                'data' => ['account_number' => '0123456789', 'account_name' => 'JANE M DOE'],
            ], 200),
            'api.paystack.co/subaccount' => Http::response([
                'status' => true,
                'data' => ['subaccount_code' => 'ACCT_new123'],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0123456789',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertSame('ACCT_new123', $this->store->paystack_subaccount_code);
        $this->assertSame('nigeria', $this->store->paystack_subaccount_country);
        $this->assertSame('058', $this->store->paystack_bank_code);
        $this->assertSame('6789', $this->store->paystack_account_number_last4);
    }

    public function test_creating_a_payment_account_rejects_an_unresolvable_account_without_confirmation()
    {
        Http::fake([
            'api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422),
            'api.paystack.co/subaccount' => Http::response(['status' => true, 'data' => ['subaccount_code' => 'ACCT_should_not_be_called']], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0000000000',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(422);
        Http::assertNotSent(fn ($request) => $request->url() === 'https://api.paystack.co/subaccount');
        $this->store->refresh();
        $this->assertNull($this->store->paystack_subaccount_code);
    }

    public function test_creating_a_payment_account_allows_an_unresolvable_country_with_explicit_confirmation()
    {
        Http::fake([
            // A country resolveAccount() genuinely can't verify (e.g.
            // Rwanda) - null is a normal outcome here, not a rejection.
            'api.paystack.co/bank/resolve*' => Http::response(['status' => false], 422),
            'api.paystack.co/subaccount' => Http::response([
                'status' => true,
                'data' => ['subaccount_code' => 'ACCT_rwanda123'],
            ], 200),
        ]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '1234567',
                'bank_code' => '007',
                'country' => 'rwanda',
                'confirmed_unverifiable' => true,
            ]);

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertSame('ACCT_rwanda123', $this->store->paystack_subaccount_code);
    }

    public function test_creating_a_payment_account_is_idempotent_once_already_connected()
    {
        Http::fake(['api.paystack.co/subaccount' => Http::response([
            'status' => true, 'data' => ['subaccount_code' => 'ACCT_should_not_be_called'],
        ], 200)]);

        $this->store->update(['paystack_subaccount_code' => 'ACCT_existing']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0123456789',
                'bank_code' => '058',
                'country' => 'nigeria',
            ]);

        $response->assertStatus(409);
        Http::assertNothingSent();
        $this->store->refresh();
        $this->assertSame('ACCT_existing', $this->store->paystack_subaccount_code);
    }

    public function test_a_staff_member_cannot_configure_another_owners_store_payment_account()
    {
        $otherOwner = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'other-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->actingAs($otherOwner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '0123456789', 'bank_code' => '058', 'country' => 'nigeria',
            ]);

        $response->assertStatus(404);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=StorePaymentAccountControllerTest`
Expected: FAIL — routes don't exist (404 on all, wrong status for the not-found assertions too since routing itself 404s Laravel's own way, not the controller's).

- [ ] **Step 3: Add the three methods to `StoreController`**

Add near `checkSlug`:

```php
    #[OA\Get(
        path: '/stores/{store}/payment-banks',
        summary: "List banks for a country, for the store's online-payment setup",
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'country', in: 'query', required: true, schema: new OA\Schema(type: 'string', enum: ['nigeria', 'ghana', 'kenya', 'south africa', 'rwanda', 'cote d\'ivoire'])),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Bank list (empty for a country this Paystack endpoint doesn\'t cover - the client falls back to a free-text bank name field)', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'banks', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function paymentBanks(Request $request, $id, \App\Services\Payment\PaystackSubaccountService $paystack)
    {
        $request->user()->stores()->findOrFail($id);

        $validated = $request->validate(['country' => 'required|string']);

        return response()->json(['banks' => $paystack->listBanks($validated['country'])]);
    }

    #[OA\Post(
        path: '/stores/{store}/payment-account/resolve',
        summary: 'Resolve a bank account number to a name, where Paystack supports it for the given country',
        description: 'Returns account_name: null (not an error) when the country/bank combination can\'t be verified automatically - the client must show that as "we can\'t verify this, please double check" rather than skip the notice.',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['account_number', 'bank_code', 'country'],
            properties: [
                new OA\Property(property: 'account_number', type: 'string'),
                new OA\Property(property: 'bank_code', type: 'string'),
                new OA\Property(property: 'country', type: 'string'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Resolution result', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'account_name', type: 'string', nullable: true),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function resolvePaymentAccount(Request $request, $id, \App\Services\Payment\PaystackSubaccountService $paystack)
    {
        $request->user()->stores()->findOrFail($id);

        $validated = $request->validate([
            'account_number' => 'required|string',
            'bank_code' => 'required|string',
            'country' => 'required|string',
        ]);

        $resolved = $paystack->resolveAccount($validated['account_number'], $validated['bank_code'], $validated['country']);

        return response()->json(['account_name' => $resolved['account_name'] ?? null]);
    }

    #[OA\Post(
        path: '/stores/{store}/payment-account',
        summary: 'Create the store\'s Paystack subaccount for online payment',
        description: 'Idempotent once a subaccount already exists (409, no Paystack call made) - a store changing banks is a "contact support" path, not this endpoint. Re-resolves the account server-side before creating it (never trusts a client-sent "I checked" flag alone); a country resolveAccount() genuinely can\'t verify requires confirmed_unverifiable: true instead. The full account number is never persisted; only the last 4 digits are stored for display.',
        tags: ['Stores'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'store', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['account_number', 'bank_code', 'country'],
            properties: [
                new OA\Property(property: 'account_number', type: 'string'),
                new OA\Property(property: 'bank_code', type: 'string'),
                new OA\Property(property: 'country', type: 'string'),
                new OA\Property(property: 'confirmed_unverifiable', type: 'boolean', description: 'Required (true) when this country/bank can\'t be auto-verified and the owner has double-checked the details themselves.'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Connected', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 409, description: 'This store already has a payment account connected'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Paystack rejected the account details'),
        ],
    )]
    public function createPaymentAccount(Request $request, $id, \App\Services\Payment\PaystackSubaccountService $paystack)
    {
        $store = $request->user()->stores()->findOrFail($id);

        if ($store->paystack_subaccount_code) {
            return response()->json(['message' => 'This store already has a payment account connected.'], 409);
        }

        $validated = $request->validate([
            'account_number' => 'required|string',
            'bank_code' => 'required|string',
            'country' => 'required|string',
            'confirmed_unverifiable' => 'sometimes|boolean',
        ]);

        // Re-resolve server-side rather than trusting a client-sent "I
        // checked" flag alone: a bypassed/buggy client must not be able to
        // create a subaccount against a typo'd account with no check at
        // all. A country/bank this endpoint can verify MUST resolve to a
        // name before proceeding; a country it can't (resolveAccount()
        // returning null because Paystack itself has no resolver for it,
        // not because the account is wrong) requires the explicit
        // confirmation flag instead.
        $resolved = $paystack->resolveAccount($validated['account_number'], $validated['bank_code'], $validated['country']);
        if (!$resolved && !($validated['confirmed_unverifiable'] ?? false)) {
            return response()->json([
                'message' => 'Could not verify this account. Please double-check the details, or confirm you\'ve checked them yourself if this country can\'t be verified automatically.',
            ], 422);
        }

        $feePercentage = (float) \App\Models\SystemConfig::getVal('storefront_platform_fee_percentage', 2.0);

        try {
            $code = $paystack->createSubaccount(
                $store->name,
                $validated['bank_code'],
                $validated['account_number'],
                $feePercentage,
            );
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Paystack subaccount creation failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Could not connect this bank account. Please double-check the details and try again.',
            ], 422);
        }

        $store->update([
            'paystack_subaccount_code' => $code,
            'paystack_subaccount_country' => $validated['country'],
            'paystack_bank_code' => $validated['bank_code'],
            'paystack_account_number_last4' => substr($validated['account_number'], -4),
        ]);

        return response()->json(['message' => 'Payment account connected.']);
    }
```

- [ ] **Step 4: Register the routes**

In `routes/api.php`, near `Route::get('stores/check-slug', ...)`:

```php
    Route::get('stores/{store}/payment-banks', [StoreController::class, 'paymentBanks']);
    Route::post('stores/{store}/payment-account/resolve', [StoreController::class, 'resolvePaymentAccount']);
    Route::post('stores/{store}/payment-account', [StoreController::class, 'createPaymentAccount']);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=StorePaymentAccountControllerTest`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/app/Http/Controllers/Api/Web/StoreController.php \
        laravel-server/routes/api.php \
        laravel-server/tests/Feature/StorePaymentAccountControllerTest.php
git commit -m "feat: store-owner endpoints to connect a Paystack subaccount"
```

---

## Task 5: Superadmin-editable platform fee percentage

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/SystemConfigController.php`
- Test: `laravel-server/tests/Feature/StorefrontFeeConfigTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SystemConfig` key `storefront_platform_fee_percentage`; every store with a non-null `paystack_subaccount_code` gets `paystack_fee_dirty_at` stamped whenever this key changes. Task 6 consumes the dirty flag.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontFeeConfigTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_set_the_platform_fee_percentage()
    {
        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super-admin@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $response = $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/storefront_platform_fee_percentage', ['value' => 3.5]);

        $response->assertStatus(200);
        $this->assertEquals(3.5, SystemConfig::getVal('storefront_platform_fee_percentage'));
    }

    public function test_setting_the_fee_rejects_a_value_outside_zero_to_fifty()
    {
        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin2',
            'email' => 'super-admin-2@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $response = $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/storefront_platform_fee_percentage', ['value' => 75]);

        $response->assertStatus(422);
    }

    public function test_changing_the_fee_marks_every_subaccount_having_store_dirty()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Fee',
            'email' => 'fee-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $withSubaccount = Store::create([
            'user_id' => $owner->id, 'name' => 'Has Subaccount',
            'store_slug' => 'has-subaccount', 'device_id' => 'WEB-FEE-1',
            'paystack_subaccount_code' => 'ACCT_1',
        ]);
        $withoutSubaccount = Store::create([
            'user_id' => $owner->id, 'name' => 'No Subaccount',
            'store_slug' => 'no-subaccount', 'device_id' => 'WEB-FEE-2',
        ]);

        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin3',
            'email' => 'super-admin-3@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/storefront_platform_fee_percentage', ['value' => 4]);

        $this->assertNotNull($withSubaccount->refresh()->paystack_fee_dirty_at);
        $this->assertNull($withoutSubaccount->refresh()->paystack_fee_dirty_at);
    }

    public function test_updating_an_unrelated_config_key_does_not_dirty_any_store()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Unrelated',
            'email' => 'unrelated-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Unrelated Store',
            'store_slug' => 'unrelated-store', 'device_id' => 'WEB-UNRELATED',
            'paystack_subaccount_code' => 'ACCT_2',
        ]);

        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin4',
            'email' => 'super-admin-4@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/social_links', ['value' => ['twitter' => 'https://x.com/dumosrx']]);

        $this->assertNull($store->refresh()->paystack_fee_dirty_at);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=StorefrontFeeConfigTest`
Expected: FAIL on the value-range test (no validation yet) and the dirty-flag tests (nothing stamps the flag yet). The plain set test may already pass since the endpoint accepts arbitrary keys — that's fine, TDD still verifies the two it should catch.

- [ ] **Step 3: Modify `SystemConfigController::update()`**

```php
    public function update(Request $request, $key)
    {
        $validated = $request->validate([
            'value' => 'present'
        ]);

        if ($key === 'subscription_plans') {
            $this->validatePlanPricing($request);
        }

        // The one platform-wide commission rate on every storefront sale.
        // Capped well below 100 - this is a fee on top of the store's own
        // price, not a share of it, and a runaway value here is a config
        // typo, not a legitimate rate.
        if ($key === 'storefront_platform_fee_percentage') {
            $request->validate([
                'value' => 'required|numeric|min:0|max:50',
            ]);
        }

        $config = SystemConfig::setVal($key, $validated['value']);

        // Existing subaccounts were created with whatever rate was in effect
        // at the time (Paystack bakes percentage_charge in at creation, not
        // per-transaction) - dirty them so SyncSubaccountFeeRates picks the
        // new rate up, mirroring Store::boot()'s storefront_dirty_at pattern.
        if ($key === 'storefront_platform_fee_percentage') {
            DB::table('stores')
                ->whereNotNull('paystack_subaccount_code')
                ->update(['paystack_fee_dirty_at' => now()]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Configuration updated successfully',
            'data' => $config->value
        ]);
    }
```

Add `use Illuminate\Support\Facades\DB;` to the top of the file if not already present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=StorefrontFeeConfigTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the existing SystemConfigController tests to confirm no regression**

Run: `cd laravel-server && php artisan test --filter=SystemConfig`
Expected: all previously-passing tests (including `subscription_plans` pricing validation) still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/app/Http/Controllers/Api/SystemConfigController.php \
        laravel-server/tests/Feature/StorefrontFeeConfigTest.php
git commit -m "feat: superadmin-editable storefront platform fee, dirties every subaccount on change"
```

---

## Task 6: `SyncSubaccountFeeRates` scheduled command

**Files:**
- Create: `laravel-server/app/Console/Commands/SyncSubaccountFeeRates.php`
- Modify: `laravel-server/routes/console.php`
- Test: `laravel-server/tests/Feature/SyncSubaccountFeeRatesTest.php`

**Interfaces:**
- Consumes: `PaystackSubaccountService::updateSubaccountFee()` (Task 2), `AdminAlertService::send()` (existing).
- Produces: `php artisan storefront:sync-subaccount-fees` (name matches the existing `storefront:rebuild-if-dirty` naming convention).

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SyncSubaccountFeeRatesTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Sync',
            'email' => 'sync-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    private function makeDirtyStore(string $slug, string $subaccountCode): Store
    {
        return Store::create([
            'user_id' => $this->owner->id, 'name' => "Store {$slug}",
            'store_slug' => $slug, 'device_id' => "WEB-{$slug}",
            'paystack_subaccount_code' => $subaccountCode,
            'paystack_fee_dirty_at' => now(),
        ]);
    }

    public function test_a_dirty_store_gets_its_fee_updated_and_flag_cleared()
    {
        Http::fake(['api.paystack.co/subaccount/*' => Http::response(['status' => true], 200)]);
        \App\Models\SystemConfig::setVal('storefront_platform_fee_percentage', 3.0);
        $store = $this->makeDirtyStore('sync-a', 'ACCT_a');

        $this->artisan('storefront:sync-subaccount-fees')->assertExitCode(0);

        $this->assertNull($store->refresh()->paystack_fee_dirty_at);
        Http::assertSent(fn ($request) => $request['percentage_charge'] === 3.0);
    }

    public function test_a_failure_on_one_store_does_not_abort_the_batch_or_affect_other_stores()
    {
        \App\Models\SystemConfig::setVal('storefront_platform_fee_percentage', 3.0);
        $failing = $this->makeDirtyStore('sync-fail', 'ACCT_fail');
        $succeeding = $this->makeDirtyStore('sync-ok', 'ACCT_ok');

        Http::fake([
            'api.paystack.co/subaccount/ACCT_fail' => Http::response(['message' => 'Subaccount not found'], 404),
            'api.paystack.co/subaccount/ACCT_ok' => Http::response(['status' => true], 200),
        ]);

        $this->artisan('storefront:sync-subaccount-fees')->assertExitCode(0);

        $this->assertNotNull($failing->refresh()->paystack_fee_dirty_at, 'Failed store should remain dirty for retry.');
        $this->assertNull($succeeding->refresh()->paystack_fee_dirty_at, 'A sibling failure must not block a working store.');
    }

    public function test_a_store_with_no_subaccount_is_never_touched()
    {
        \App\Models\SystemConfig::setVal('storefront_platform_fee_percentage', 3.0);
        $store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'No Subaccount',
            'store_slug' => 'sync-none', 'device_id' => 'WEB-SYNC-NONE',
        ]);

        Http::fake();

        $this->artisan('storefront:sync-subaccount-fees')->assertExitCode(0);

        Http::assertNothingSent();
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=SyncSubaccountFeeRatesTest`
Expected: FAIL — command doesn't exist.

- [ ] **Step 3: Write the command**

```php
<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Services\Payment\PaystackSubaccountService;
use App\Services\AdminAlertService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Propagates a changed storefront_platform_fee_percentage to every existing
 * subaccount - Paystack bakes percentage_charge in at subaccount-creation
 * time, so a superadmin editing the platform-wide rate does nothing to
 * subaccounts that already exist unless something calls the update-fee
 * endpoint per store. Mirrors RebuildStorefrontIfDirty's dirty-flag/schedule
 * shape exactly: no queue worker runs in production, so this must not be a
 * queued job.
 */
class SyncSubaccountFeeRates extends Command
{
    /** After this many consecutive failures for one store, escalate via
     * AdminAlertService rather than retrying silently forever. */
    private const FAILURE_ALERT_THRESHOLD = 5;

    protected $signature = 'storefront:sync-subaccount-fees';

    protected $description = 'Push the current platform fee percentage to every store whose Paystack subaccount is out of date.';

    public function handle(PaystackSubaccountService $paystack, AdminAlertService $alerts)
    {
        $feePercentage = (float) \App\Models\SystemConfig::getVal('storefront_platform_fee_percentage', 2.0);

        $dirtyStores = Store::whereNotNull('paystack_subaccount_code')
            ->whereNotNull('paystack_fee_dirty_at')
            ->get();

        if ($dirtyStores->isEmpty()) {
            $this->info('No subaccounts need a fee update.');
            return;
        }

        foreach ($dirtyStores as $store) {
            try {
                $paystack->updateSubaccountFee($store->paystack_subaccount_code, $feePercentage);

                DB::table('stores')->where('id', $store->id)->update(['paystack_fee_dirty_at' => null]);

                $failureCountKey = "subaccount_fee_failures:{$store->id}";
                \App\Models\SystemConfig::setVal($failureCountKey, null);
            } catch (\Throwable $e) {
                Log::warning("Failed to sync Paystack fee for store {$store->id}: " . $e->getMessage());

                $failureCountKey = "subaccount_fee_failures:{$store->id}";
                $failures = (int) \App\Models\SystemConfig::getVal($failureCountKey, 0) + 1;
                \App\Models\SystemConfig::setVal($failureCountKey, $failures);

                if ($failures >= self::FAILURE_ALERT_THRESHOLD) {
                    $alerts->send(
                        'Storefront subaccount fee sync repeatedly failing',
                        ["Store {$store->id} ({$store->name}) has failed {$failures} consecutive fee-sync attempts. Last error: " . $e->getMessage()],
                    );
                }
                // Deliberately left dirty - retried next scheduled run.
            }
        }

        $this->info("Fee sync attempted for {$dirtyStores->count()} store(s).");
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=SyncSubaccountFeeRatesTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the schedule**

In `routes/console.php`, add near the existing `storefront:rebuild-if-dirty` line:

```php
Schedule::command('storefront:sync-subaccount-fees')->everyFifteenMinutes();
```

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/app/Console/Commands/SyncSubaccountFeeRates.php \
        laravel-server/routes/console.php \
        laravel-server/tests/Feature/SyncSubaccountFeeRatesTest.php
git commit -m "feat: scheduled command propagates a changed platform fee to every subaccount"
```

---

## Task 7: `StorefrontController` — gate + wire the subaccount and currency into checkout

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/Public/StorefrontController.php`
- Test: `laravel-server/tests/Feature/StorefrontControllerTest.php` (add to the existing file)

**Interfaces:**
- Consumes: `PaymentService::initializeTransaction()`'s new `$subaccount`/`$currency` params (Task 3).
- Produces: `show()`'s response gains `online_payment_available: bool`; `initializeCheckout()` passes the store's subaccount code and currency when present, and rejects `payment_method: paystack` with the existing "cannot be paid for online" 422 when absent.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/StorefrontControllerTest.php`:

```php
    public function test_show_reports_online_payment_unavailable_when_the_store_has_no_subaccount()
    {
        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $response->assertJson(['online_payment_available' => false]);
    }

    public function test_show_reports_online_payment_available_when_the_store_has_a_subaccount()
    {
        $this->storeA->update(['paystack_subaccount_code' => 'ACCT_available']);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $response->assertJson(['online_payment_available' => true]);
    }

    public function test_initialize_checkout_uses_the_stores_own_currency_and_subaccount()
    {
        $this->storeA->update([
            'paystack_subaccount_code' => 'ACCT_kenya',
            'currency' => 'KES',
        ]);
        $product = $this->purchasableProduct(['selling_price' => 500]);

        \Illuminate\Support\Facades\Http::fake([
            'api.paystack.co/transaction/initialize' => \Illuminate\Support\Facades\Http::response([
                'status' => true,
                'data' => ['reference' => 'ref_kenya', 'authorization_url' => 'https://paystack.com/pay/ref_kenya'],
            ], 200),
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout/initialize', [
            'customer_email' => 'kenyan-customer@example.com',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(200);
        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            return ($request['subaccount'] ?? null) === 'ACCT_kenya'
                && ($request['currency'] ?? null) === 'KES';
        });
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=StorefrontControllerTest`
Expected: FAIL — `online_payment_available` isn't in the response yet; the initialize test's `Http::assertSent` fails since neither `subaccount` nor `currency` is passed today.

- [ ] **Step 3: Modify `show()`**

Add the flag to the response array (inside the existing `'store' => [...]` block is wrong — it belongs at the top level, alongside `products`):

```php
        return response()->json([
            'store' => [
                'id' => $store->id,
                'name' => $store->name,
                'location' => $store->location,
                'address' => $store->address,
                'phone' => $store->phone,
                'email' => $store->email,
                'logo_url' => $store->logo_url,
            ],
            'products' => StorefrontProductResource::collection($products),
            'online_payment_available' => (bool) $store->paystack_subaccount_code,
        ]);
```

- [ ] **Step 4: Modify `initializeCheckout()`**

Find the call to `$paymentService->initializeTransaction(...)` inside `initializeCheckout()` and change it to pass the store's subaccount and currency:

```php
        try {
            $payment = $paymentService->initializeTransaction(
                $totalAmount,
                $validated['customer_email'],
                [
                    'purpose' => 'storefront_order',
                    'store_id' => $store->id,
                    'store_slug' => $store->store_slug,
                ],
                config('app.frontend_url') . "/store/{$store->store_slug}/checkout",
                $store->paystack_subaccount_code,
                $store->paystack_subaccount_code ? strtoupper((string) $store->currency) : null,
            );
```

Immediately before that call, add the gate so a store with no subaccount never reaches Paystack at all:

```php
        if (!$store->paystack_subaccount_code) {
            return response()->json([
                'success' => false,
                'message' => 'This store cannot accept online payments yet.',
            ], 422);
        }
```

(Place this check right after the existing `if ($totalAmount <= 0) { ... }` block, before the `try { ... }`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=StorefrontControllerTest`
Expected: PASS (all existing tests plus the 3 new ones — re-run the full file, not just the new tests, since this task edits shared methods every existing storefront test also exercises).

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/app/Http/Controllers/Api/Public/StorefrontController.php \
        laravel-server/tests/Feature/StorefrontControllerTest.php
git commit -m "feat: gate storefront Paystack checkout on a connected subaccount, use the store's own currency"
```

---

## Task 8: Real refund on a cancelled, already-paid order

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/OnlineOrderController.php`
- Test: `laravel-server/tests/Feature/OnlineOrderControllerTest.php` (add to the existing file)

**Interfaces:**
- Consumes: `PaymentService::refundTransaction()` (Task 3).
- Produces: `flagRefundRequired()` is replaced by `refundOrFlag()`, called from the same `cancelled && payment_status === 'paid'` branch in `fulfill()`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Feature/OnlineOrderControllerTest.php`:

```php
    public function test_cancelling_a_paid_paystack_order_calls_the_refund_api()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refunded'], 200)]);

        $order = $this->paidOnlineOrder(['payment_method' => 'paystack', 'paystack_reference' => 'ref_to_refund']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(200);
        Http::assertSent(fn ($request) => $request['transaction'] === 'ref_to_refund');
    }

    public function test_a_failed_refund_falls_back_to_the_log_and_notify_flag()
    {
        Http::fake(['api.paystack.co/refund' => Http::response(['status' => false, 'message' => 'Already refunded'], 400)]);

        $order = $this->paidOnlineOrder(['payment_method' => 'paystack', 'paystack_reference' => 'ref_fail']);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->owner->id,
            'title' => 'Refund required',
        ]);
    }

    public function test_cancelling_a_paid_order_with_no_reference_falls_back_to_the_flag_without_calling_paystack()
    {
        Http::fake();

        // An in_store/transfer order marked paid has no paystack_reference at
        // all - must never reach the refund API with an empty one.
        $order = $this->paidOnlineOrder(['payment_method' => 'in_store', 'paystack_reference' => null]);

        $response = $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$order->id}/fulfill", ['status' => 'cancelled']);

        $response->assertStatus(200);
        Http::assertNothingSent();
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->owner->id,
            'title' => 'Refund required',
        ]);
    }
```

Add the shared `paidOnlineOrder()` helper to the test class if one doesn't already exist near the top of the file (check the existing `flagRefundRequired`-era tests added in the storefront-fix round first — reuse that fixture helper if it's already there under a different name rather than creating a duplicate).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=OnlineOrderControllerTest`
Expected: FAIL — no Paystack call is made today; `flagRefundRequired()` only logs/notifies.

- [ ] **Step 3: Replace `flagRefundRequired()` with `refundOrFlag()`**

```php
    /**
     * Cancelling an order whose money was already taken leaves an
     * obligation behind. Refund via Paystack when there's a reference to
     * refund; otherwise (in_store/transfer, or Paystack itself rejecting the
     * refund) fall back to the log-and-notify flag rather than pretending
     * it's handled. See docs/superpowers/specs/2026-09-26-storefront-
     * paystack-subaccounts-design.md - a refund on an already-settled
     * subaccount transaction comes out of DumosRx's own Paystack balance,
     * accepted as a v1 cost rather than clawed back.
     */
    private function refundOrFlag(OnlineOrder $order, string $storeId, \App\Services\Payment\PaymentService $paymentService): void
    {
        if ($order->payment_method === 'paystack' && $order->paystack_reference) {
            $result = $paymentService->refundTransaction($order->paystack_reference, 'paystack');

            if ($result['success']) {
                $this->notifyStore($order, $storeId, 'Refunded', "Online order #{$order->id} ({$order->total_amount}) was refunded to {$order->customer_name}.");
                return;
            }

            Log::warning('Paystack refund failed for cancelled online order', [
                'online_order_id' => $order->id,
                'paystack_reference' => $order->paystack_reference,
                'message' => $result['message'],
            ]);
        }

        $this->flagRefundRequired($order, $storeId);
    }

    private function notifyStore(OnlineOrder $order, string $storeId, string $title, string $message): void
    {
        $storeUserIds = User::where('store_id', $storeId)
            ->orWhereIn('id', Store::where('id', $storeId)->select('user_id'))
            ->pluck('id');

        Notification::bulkCreateFor($storeUserIds, [
            'title' => $title,
            'message' => $message,
            'type' => 'online_order',
        ]);
    }

    private function flagRefundRequired(OnlineOrder $order, string $storeId): void
    {
        Log::warning('Cancelled online order requires a refund', [
            'online_order_id' => $order->id,
            'store_id' => $storeId,
            'payment_method' => $order->payment_method,
            'paystack_reference' => $order->paystack_reference,
            'total_amount' => (string) $order->total_amount,
        ]);

        $this->notifyStore(
            $order,
            $storeId,
            'Refund required',
            "Cancelled online order #{$order->id} was already paid ({$order->total_amount}). Refund {$order->customer_name} manually.",
        );
    }
```

Update the call site in `fulfill()` (the existing `if ($validated['status'] === 'cancelled' && $order->payment_status === 'paid')` block) to call `$this->refundOrFlag($order, $storeId, $paymentService);` instead of `$this->flagRefundRequired($order, $storeId);` — inject `\App\Services\Payment\PaymentService $paymentService` as a new parameter on `fulfill(Request $request, $id, ...)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=OnlineOrderControllerTest`
Expected: PASS (all existing tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add laravel-server/app/Http/Controllers/Api/OnlineOrderController.php \
        laravel-server/tests/Feature/OnlineOrderControllerTest.php
git commit -m "feat: cancelling a paid Paystack order issues a real refund, falls back to the flag on failure"
```

---

## Task 9: Client — owner-facing "Online Payments" settings panel

**Files:**
- Create: `client/components/settings/store/online-payments-section.tsx`
- Modify: `client/lib/api/client-fleet-billing.ts` (new methods)
- Modify: wherever `StoreProfileSection`/`BusinessInformationCard` are composed into the settings page (check `client/app/settings/*` or the parent settings component that renders `store-profile-section.tsx` today, and add the new section alongside it)
- Test: `client/__tests__/online-payments-section.test.tsx`

**Interfaces:**
- Consumes: the three endpoints from Task 4.
- Produces: a settings panel the owner uses once per store; on success, calls `sync()` from `client/lib/db/sync-engine/index.ts` to pull the freshly-written `stores` row rather than writing the new fields to local SQLite directly (per the Global Constraints note on server-authoritative fields).

- [ ] **Step 1: Add the three client methods**

In `client/lib/api/client-fleet-billing.ts`, near `checkStoreSlug`:

```ts
  async getPaymentBanks(storeId: string, country: string) {
    return this.request<{ banks: { name: string; code: string }[] }>(
      `/stores/${storeId}/payment-banks?country=${encodeURIComponent(country)}`,
    );
  }

  async resolvePaymentAccount(storeId: string, payload: { account_number: string; bank_code: string; country: string }) {
    return this.request<{ account_name: string | null }>(`/stores/${storeId}/payment-account/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async createPaymentAccount(storeId: string, payload: { account_number: string; bank_code: string; country: string }) {
    return this.request<{ message: string }>(`/stores/${storeId}/payment-account`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
```

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnlinePaymentsSection } from "@/components/settings/store/online-payments-section";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getPaymentBanks: vi.fn(async () => ({ banks: [{ name: "GTBank", code: "058" }] })),
    resolvePaymentAccount: vi.fn(async () => ({ account_name: "JANE M DOE" })),
    createPaymentAccount: vi.fn(async () => ({ message: "Payment account connected." })),
  },
}));

vi.mock("@/lib/db/sync-engine/index", () => ({
  sync: vi.fn(async () => undefined),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("OnlinePaymentsSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the account name before allowing the owner to confirm and connect", async () => {
    const user = userEvent.setup();
    render(<OnlinePaymentsSection storeId="store-1" storeName="Jane's Pharmacy" />, { wrapper });

    await user.selectOptions(await screen.findByLabelText(/country/i), "nigeria");
    await user.selectOptions(await screen.findByLabelText(/bank/i), "058");
    await user.type(screen.getByLabelText(/account number/i), "0123456789");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    expect(await screen.findByText(/JANE M DOE/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /connect/i }));

    const { apiClient } = await import("@/lib/api/client");
    await waitFor(() => expect(apiClient.createPaymentAccount).toHaveBeenCalledWith("store-1", {
      account_number: "0123456789",
      bank_code: "058",
      country: "nigeria",
    }));

    const { sync } = await import("@/lib/db/sync-engine/index");
    await waitFor(() => expect(sync).toHaveBeenCalled());
  });

  it("shows an unverified notice and requires an extra confirmation when resolution returns no name", async () => {
    const { apiClient } = await import("@/lib/api/client");
    vi.mocked(apiClient.resolvePaymentAccount).mockResolvedValueOnce({ account_name: null });

    const user = userEvent.setup();
    render(<OnlinePaymentsSection storeId="store-1" storeName="Jane's Pharmacy" />, { wrapper });

    await user.selectOptions(await screen.findByLabelText(/country/i), "rwanda");
    await user.type(screen.getByLabelText(/account number/i), "9999999999");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    expect(await screen.findByText(/can.t verify this automatically/i)).toBeInTheDocument();

    const connectButton = screen.getByRole("button", { name: /connect/i });
    expect(connectButton).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /double.checked/i }));
    expect(connectButton).toBeEnabled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/online-payments-section.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { sync } from "@/lib/db/sync-engine/index";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

/** Paystack's own six supported countries - see docs/superpowers/specs/
 * 2026-09-26-storefront-paystack-subaccounts-design.md. Not every country
 * on this list is confirmed to support the bank-list/resolve endpoints; the
 * component degrades to a free-text bank field and skips verification when
 * they return nothing, rather than pretending they always work. */
const SUPPORTED_COUNTRIES = [
  { value: "nigeria", label: "Nigeria" },
  { value: "ghana", label: "Ghana" },
  { value: "south africa", label: "South Africa" },
  { value: "kenya", label: "Kenya" },
  { value: "rwanda", label: "Rwanda" },
  { value: "cote d'ivoire", label: "Côte d'Ivoire" },
];

interface OnlinePaymentsSectionProps {
  storeId: string;
  storeName: string;
}

export function OnlinePaymentsSection({ storeId }: OnlinePaymentsSectionProps) {
  const [country, setCountry] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [manualBankName, setManualBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolveAttempted, setResolveAttempted] = useState(false);
  const [confirmedUnverifiable, setConfirmedUnverifiable] = useState(false);

  const { data: banksData } = useQuery({
    queryKey: ["payment-banks", storeId, country],
    queryFn: () => apiClient.getPaymentBanks(storeId, country),
    enabled: !!country,
  });
  const banks = banksData?.banks ?? [];

  const resolveMutation = useMutation({
    mutationFn: () =>
      apiClient.resolvePaymentAccount(storeId, {
        account_number: accountNumber,
        bank_code: bankCode || manualBankName,
        country,
      }),
    onSuccess: (data) => {
      setResolvedName(data.account_name);
      setResolveAttempted(true);
    },
  });

  const connectMutation = useMutation({
    mutationFn: () =>
      apiClient.createPaymentAccount(storeId, {
        account_number: accountNumber,
        bank_code: bankCode || manualBankName,
        country,
      }),
    onSuccess: async () => {
      toast.success("Payment account connected.");
      await sync();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not connect this bank account.");
    },
  });

  const isUnverifiable = resolveAttempted && !resolvedName;
  const canConnect = resolveAttempted && (resolvedName !== null || confirmedUnverifiable);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Online Payments</CardTitle>
        <CardDescription>
          Connect a bank account so customers can pay online — the money goes
          straight to this account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="op-country">Country</Label>
          <select
            id="op-country"
            aria-label="Country"
            className="w-full border rounded-md p-2"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setResolveAttempted(false);
              setResolvedName(null);
            }}
          >
            <option value="">Select country</option>
            {SUPPORTED_COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {banks.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="op-bank">Bank</Label>
            <select
              id="op-bank"
              aria-label="Bank"
              className="w-full border rounded-md p-2"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
            >
              <option value="">Select bank</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : country ? (
          <div className="space-y-2">
            <Label htmlFor="op-bank-name">Bank name</Label>
            <Input
              id="op-bank-name"
              aria-label="Bank name"
              value={manualBankName}
              onChange={(e) => setManualBankName(e.target.value)}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="op-account-number">Account number</Label>
          <Input
            id="op-account-number"
            aria-label="Account number"
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value);
              setResolveAttempted(false);
              setResolvedName(null);
            }}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={!country || !accountNumber || resolveMutation.isPending}
          onClick={() => resolveMutation.mutate()}
        >
          Verify account
        </Button>

        {resolveAttempted && resolvedName && (
          <p className="text-sm text-emerald-600">Pay to: {resolvedName}</p>
        )}

        {isUnverifiable && (
          <div className="space-y-2">
            <p className="text-sm text-amber-600">
              We can&apos;t verify this automatically — please double-check the
              details.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                aria-label="I have double-checked these details"
                checked={confirmedUnverifiable}
                onCheckedChange={(checked) => setConfirmedUnverifiable(checked === true)}
              />
              I have double-checked these details
            </label>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          disabled={!canConnect || connectMutation.isPending}
          onClick={() => connectMutation.mutate()}
        >
          Connect
        </Button>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/online-payments-section.test.tsx`
Expected: PASS (2 tests). If the `Checkbox`/`select` component APIs differ from what's assumed here, adjust the test and component to whatever `client/components/ui/checkbox.tsx` and the rest of this settings area's existing `<select>`-vs-custom-`Select`-component convention actually is — check `store-profile-section.tsx` for which one it already uses and match it, rather than introducing a second dropdown pattern into the same settings page.

- [ ] **Step 6: Wire the section into the settings page**

Find where `client/components/settings/store/store-profile-section.tsx` is rendered (its parent settings page/tab component) and add `<OnlinePaymentsSection storeId={storeProfile.id} storeName={storeProfile.name} />` alongside it, gated the same way `online_store_enabled`'s own settings are gated (only shown once a store exists — check the parent for the exact existing gate and match it).

- [ ] **Step 7: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/api/client-fleet-billing.ts \
        client/components/settings/store/online-payments-section.tsx \
        client/__tests__/online-payments-section.test.tsx
# add the settings-page file you modified in Step 6
git commit -m "feat: owner-facing Online Payments settings panel"
```

---

## Task 10: Web — checkout form Paystack option + return handling

**Files:**
- Modify: `web/components/storefront/checkout-form.tsx`
- Test: `web/__tests__/checkout-form.test.tsx` (create if no such test file exists for this component yet — check first)

**Interfaces:**
- Consumes: `POST /storefront/{slug}/checkout/initialize` (existing), `POST /storefront/{slug}/checkout` with `payment_method: "paystack"` + `paystack_reference` (existing backend contract, now reachable), `online_payment_available` from `GET /storefront/{slug}` (Task 7).

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutForm } from "@/components/storefront/checkout-form";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { products: [], online_payment_available: true } })),
    post: vi.fn(async (url: string) => {
      if (url.includes("/checkout/initialize")) {
        return { data: { payment_url: "https://paystack.com/pay/ref_1", transaction_reference: "ref_1" } };
      }
      return { data: { order: { id: "order-1" } } };
    }),
  },
}));

vi.mock("@/lib/store/use-cart-store", () => ({
  useCart: () => ({
    items: [{ id: "p1", name: "Panadol", price: 500, quantity: 2 }],
    getTotal: () => 1000,
    clearCart: vi.fn(),
  }),
  useCartStore: { getState: () => ({ carts: { "store-1": [{ id: "p1", price: 500, quantity: 2 }] }, reconcilePrices: vi.fn() }) },
}));

// jsdom has no real navigation - assert on window.location.href being set
// instead of actually following it.
const locationAssign = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: { assign: locationAssign, href: "" },
    writable: true,
  });
});

describe("CheckoutForm - Paystack", () => {
  it("offers a Paystack option when the store has online payment available", async () => {
    render(<CheckoutForm storeSlug="store-1" />);

    expect(await screen.findByLabelText(/pay online/i)).toBeInTheDocument();
  });

  it("initializes a Paystack session and redirects to the payment URL on submit", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm storeSlug="store-1" />);

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/phone number/i), "08000000000");
    await user.click(await screen.findByLabelText(/pay online/i));
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /place order/i }));

    const { apiClient } = await import("@/lib/api/base-client");
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/storefront/store-1/checkout/initialize",
        expect.objectContaining({ customer_email: "jane@example.com" }),
      ),
    );
    await waitFor(() => expect(window.location.href).toBe("https://paystack.com/pay/ref_1"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run __tests__/checkout-form.test.tsx`
Expected: FAIL — no "Pay online" option exists yet.

- [ ] **Step 3: Modify `checkout-form.tsx`**

Add state for the online-payment availability flag (read from the same reprice fetch that already runs in the existing `useEffect`) and an email field, plus a third radio:

```tsx
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false);
```

Inside the existing `repriceCart` function, after `const { data } = await apiClient.get<...>(...)`, capture the flag:

```tsx
        const { data } = await apiClient.get<{ products: StorefrontProduct[]; online_payment_available?: boolean }>(
          `/storefront/${storeSlug}`
        );
        if (cancelled) return;

        setOnlinePaymentAvailable(!!data.online_payment_available);
```

Add `customer_email` to `formData`'s initial state:

```tsx
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    customer_email: "",
    payment_method: "in_store", // transfer, in_store, paystack
  });
```

Add the third radio inside the existing payment-method grid, right after the `transfer` `Label`:

```tsx
                  {onlinePaymentAvailable && (
                    <Label
                      htmlFor="paystack"
                      className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${formData.payment_method === 'paystack' ? 'border-primary' : 'border-muted bg-popover'}`}
                      onClick={() => handleMethodChange('paystack')}
                    >
                      <input type="radio" id="paystack" name="payment_method" value="paystack" className="sr-only" checked={formData.payment_method === 'paystack'} onChange={() => handleMethodChange('paystack')} />
                      Pay Online
                    </Label>
                  )}
```

Add an email field, shown only when `paystack` is selected (Paystack requires it; the other two methods don't collect it today):

```tsx
                {formData.payment_method === 'paystack' && (
                  <div className="space-y-2">
                    <Label htmlFor="customer_email">Email *</Label>
                    <Input
                      id="customer_email"
                      name="customer_email"
                      type="email"
                      required
                      value={formData.customer_email}
                      onChange={handleInputChange}
                    />
                  </div>
                )}
```

Change `handleSubmit` to branch on `payment_method`:

```tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (!formData.customer_name || !formData.customer_phone) {
      toast.error("Please fill in required fields");
      return;
    }

    if (formData.payment_method === 'paystack' && !formData.customer_email) {
      toast.error("Email is required to pay online");
      return;
    }

    setLoading(true);

    try {
      const items = cart.items.map(item => ({ product_id: item.id, quantity: item.quantity }));

      if (formData.payment_method === 'paystack') {
        const { data } = await apiClient.post<{ payment_url: string }>(
          `/storefront/${storeSlug}/checkout/initialize`,
          { customer_email: formData.customer_email, items },
        );
        window.location.href = data.payment_url;
        return;
      }

      const payload = { ...formData, items };
      await apiClient.post(`/storefront/${storeSlug}/checkout`, payload);

      toast.success("Order placed successfully!");
      cart.clearCart();
      router.push(`/store/${storeSlug}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run __tests__/checkout-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add web/components/storefront/checkout-form.tsx web/__tests__/checkout-form.test.tsx
git commit -m "feat: storefront checkout offers Pay Online when the store has a connected subaccount"
```

---

## Task 11: Web — read the Paystack return params and confirm the order

**Files:**
- Modify: `web/components/storefront/checkout-form.tsx`
- Test: `web/__tests__/checkout-form-return.test.tsx`

**Interfaces:**
- Consumes: `useSearchParams()` from `next/navigation` (client-side only — this route is a static export, so query params only exist post-hydration in the browser, never at build time).
- Produces: on mount, if `?reference=`/`?trxref=` is present, calls `POST /storefront/{slug}/checkout` with `payment_method: "paystack"` and `paystack_reference`, using whatever cart/contact details were persisted before the redirect to Paystack (persist `formData` + cart to the existing per-slug cart store, or to `sessionStorage` keyed by slug, before `window.location.href = data.payment_url` in Task 10 — add that persistence as part of this task).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CheckoutForm } from "@/components/storefront/checkout-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("reference=ref_1&trxref=ref_1"),
}));

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { products: [], online_payment_available: true } })),
    post: vi.fn(async () => ({ data: { order: { id: "order-confirmed-1" } } })),
  },
}));

describe("CheckoutForm - Paystack return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem(
      "dumos_pending_checkout_store-1",
      JSON.stringify({
        formData: { customer_name: "Jane Doe", customer_phone: "08000000000", customer_address: "", customer_email: "jane@example.com", payment_method: "paystack" },
        items: [{ product_id: "p1", quantity: 2 }],
      }),
    );
  });

  it("confirms the order automatically when returning from Paystack with a reference", async () => {
    render(<CheckoutForm storeSlug="store-1" />);

    const { apiClient } = await import("@/lib/api/base-client");
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/storefront/store-1/checkout",
        expect.objectContaining({ payment_method: "paystack", paystack_reference: "ref_1" }),
      ),
    );
    expect(await screen.findByText(/order placed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/checkout-form-return.test.tsx`
Expected: FAIL — no return handling exists yet.

- [ ] **Step 3: Add persistence before redirect (Task 10's `paystack` branch) and confirmation-on-return**

In the `paystack` branch inside `handleSubmit` (from Task 10), persist before redirecting:

```tsx
      if (formData.payment_method === 'paystack') {
        sessionStorage.setItem(
          `dumos_pending_checkout_${storeSlug}`,
          JSON.stringify({ formData, items }),
        );
        const { data } = await apiClient.post<{ payment_url: string }>(
          `/storefront/${storeSlug}/checkout/initialize`,
          { customer_email: formData.customer_email, items },
        );
        window.location.href = data.payment_url;
        return;
      }
```

Add the return-handling effect near the top of the component, alongside the existing reprice effect:

```tsx
  const searchParams = useSearchParams();

  useEffect(() => {
    const reference = searchParams.get('reference') ?? searchParams.get('trxref');
    if (!reference) return;

    const pendingRaw = sessionStorage.getItem(`dumos_pending_checkout_${storeSlug}`);
    if (!pendingRaw) return;

    let pending: { formData: typeof formData; items: { product_id: string; quantity: number }[] };
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      return;
    }

    setLoading(true);
    apiClient
      .post(`/storefront/${storeSlug}/checkout`, {
        ...pending.formData,
        items: pending.items,
        payment_method: 'paystack',
        paystack_reference: reference,
      })
      .then(() => {
        sessionStorage.removeItem(`dumos_pending_checkout_${storeSlug}`);
        toast.success("Order placed successfully!");
        cart.clearCart();
        router.push(`/store/${storeSlug}`);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not confirm your payment. Contact the store with reference " + reference + ".");
      })
      .finally(() => setLoading(false));
    // Runs once on mount for a given reference - deliberately not
    // re-running on formData/cart changes, which would resubmit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, storeSlug]);
```

Add `import { useSearchParams } from "next/navigation";` to the existing `next/navigation` import line.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/checkout-form-return.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full web test suite and typecheck**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: clean typecheck, full suite green (including Task 10's tests, still passing).

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add web/components/storefront/checkout-form.tsx web/__tests__/checkout-form-return.test.tsx
git commit -m "feat: confirm a storefront order automatically on return from Paystack"
```

---

## Task 12: Web — admin settings card for the platform fee

**Files:**
- Modify: `web/components/admin/views/subscription-config-tab.tsx`
- Test: `web/__tests__/subscription-config-tab-fee.test.tsx`

**Interfaces:**
- Consumes: `useSystemConfig('storefront_platform_fee_percentage')` / `useUpdateSystemConfigMutation()` (existing generic hooks — no new hook needed).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubscriptionConfigTab } from "@/components/admin/views/subscription-config-tab";

vi.mock("@/lib/api/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/hooks")>("@/lib/api/hooks");
  return {
    ...actual,
    useSystemConfig: (key: string) => {
      if (key === "storefront_platform_fee_percentage") {
        return { data: 2, isLoading: false, isError: false, refetch: vi.fn() };
      }
      return actual.useSystemConfig(key);
    },
    useUpdateSystemConfigMutation: () => ({ mutateAsync: vi.fn(async () => undefined), isPending: false }),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("SubscriptionConfigTab - storefront fee", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the current storefront platform fee and saves a change", async () => {
    render(<SubscriptionConfigTab />, { wrapper });

    const feeInput = await screen.findByLabelText(/storefront commission/i);
    expect(feeInput).toHaveValue(2);

    const user = userEvent.setup();
    await user.clear(feeInput);
    await user.type(feeInput, "3.5");
    await user.click(screen.getByRole("button", { name: /save storefront commission/i }));

    const { useUpdateSystemConfigMutation } = await import("@/lib/api/hooks");
    const mutation = useUpdateSystemConfigMutation();
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledWith({
      key: "storefront_platform_fee_percentage",
      value: 3.5,
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/subscription-config-tab-fee.test.tsx`
Expected: FAIL — no such field in the component yet.

- [ ] **Step 3: Add a self-contained card to `SubscriptionConfigTab`**

Add near the top of the component's other hooks (after the existing `useSystemConfig`/`useUpdateSystemConfigMutation` calls for `subscription_plans`/`social_links`):

```tsx
  const { data: storefrontFeeData } = useSystemConfig("storefront_platform_fee_percentage");
  const storefrontFee = typeof storefrontFeeData === "number" ? storefrontFeeData : 2;
  const [localStorefrontFee, setLocalStorefrontFee] = useState(storefrontFee);
  const updateStorefrontFeeMutation = useUpdateSystemConfigMutation();
```

(Keep this state separate from the `subscription_plans` blob's own `config`/`setConfig` — it is a different `SystemConfig` key with its own save action, not a field to merge into the pricing save button.)

Add a new `Card` in the JSX, after the existing "Manual Payment Configuration" section:

```tsx
      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader>
          <CardTitle>Storefront Commission</CardTitle>
          <CardDescription>
            The percentage DumosRx keeps from every online storefront sale.
            Changing this updates every store that already has a connected
            payment account, not just new ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="storefront-commission">Storefront Commission (%)</Label>
            <Input
              id="storefront-commission"
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={localStorefrontFee}
              onChange={(e) => setLocalStorefrontFee(Number(e.target.value))}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={async () => {
              await updateStorefrontFeeMutation.mutateAsync({
                key: "storefront_platform_fee_percentage",
                value: localStorefrontFee,
              });
              toast.success("Storefront commission updated.");
            }}
            disabled={updateStorefrontFeeMutation.isPending}
          >
            Save Storefront Commission
          </Button>
        </CardFooter>
      </Card>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/subscription-config-tab-fee.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full web suite and typecheck**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: clean, all green.

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add web/components/admin/views/subscription-config-tab.tsx web/__tests__/subscription-config-tab-fee.test.tsx
git commit -m "feat: superadmin settings card for the storefront platform commission"
```

---

## Task 13: End-to-end verification and doc updates

**Files:**
- Modify: `docs/KNOWN_BUGS.md` (remove SF-P1-2, it's now closed)
- Modify: `docs/FIXED_BUGS.md` (add the closing entry)
- Modify: `docs/STOREFRONT_REVIEW.md` (mark SF-P1-2's status as fixed, not deferred)
- Modify: `laravel-server/AGENTS.md`, `client/AGENTS.md`, `web/AGENTS.md` as needed for the new architecture (subaccount onboarding, fee propagation, refund path) — per the standing doc-maintenance rule in `.agents/AGENTS.md`.

- [ ] **Step 1: Run every affected test suite in full**

```bash
cd laravel-server && php artisan test
cd ../client && npx tsc --noEmit && npx vitest run
cd ../web && npx tsc --noEmit && npx vitest run
```

Expected: all green, no regressions anywhere in either app.

- [ ] **Step 2: Manual smoke test against a local stack**

Following `laravel-server/AGENTS.md`'s and `web/AGENTS.md`'s existing local-dev instructions: run `php artisan serve`, seed a store, use the new settings panel in `client/` (`npm run dev`) to connect a fake/sandbox Paystack subaccount (Paystack provides test bank numbers that resolve successfully — use one of those, never a real account), then open that store's storefront in `web/` and place a real sandbox-mode Paystack test payment through to confirmation. This is the one part of this plan that cannot be verified by automated tests alone (real redirect + real Paystack test-mode checkout page) — do not skip it.

- [ ] **Step 3: Update the documentation**

Move the `SF-P1-2` entry from `docs/KNOWN_BUGS.md` to `docs/FIXED_BUGS.md`, following that file's existing per-date section format (see the `## 2026-09-26` section added by the prior storefront-fix round for the exact style). Update `docs/STOREFRONT_REVIEW.md`'s SF-P1-2 `Status:` line from "deferred" to "fixed — see docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md". Add a short section to `laravel-server/AGENTS.md` documenting: the subaccount onboarding flow, `percentage_charge` semantics, the fee-propagation job's existence and cadence, and the accepted refund-cost decision (no claw-back). Add a corresponding note to `client/AGENTS.md` (the new settings panel, and the "never write server-authoritative Paystack fields locally, rely on pull sync" rule) and to `web/AGENTS.md` (the new checkout radio and return-param handling).

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add docs/KNOWN_BUGS.md docs/FIXED_BUGS.md docs/STOREFRONT_REVIEW.md \
        laravel-server/AGENTS.md client/AGENTS.md web/AGENTS.md
git commit -m "docs: close SF-P1-2, document the Paystack subaccount architecture"
```
