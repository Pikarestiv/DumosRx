<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for the "View Billing History" store-fleet action, which was a
 * client-only toast stub (`handleViewBilling` in
 * web/app/admin/stores/page.tsx) — it called no API at all. The only
 * existing billing-history endpoint, SubscriptionController::billingHistory
 * (`GET subscription/billing-history`), is store-owner self-service: it
 * scopes strictly to Auth::id(), the currently-authenticated user, so it's
 * unusable by a superadmin viewing an arbitrary other store's billing.
 *
 * Fix: a new admin-scoped endpoint, `GET admin/stores/{id}/billing-history`
 * (AdminController::billingHistory -> AdminService::getBillingHistoryForStore),
 * reusing the identical PaymentTransaction query but scoped to the
 * requested store's owner (Store::user_id) instead of the authenticated
 * user, gated by the same super_admin role check every other AdminController
 * endpoint uses.
 */
class AdminStoreBillingHistoryTest extends TestCase
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

    private function makeStoreOwnerWithTransaction(): array
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Billed Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $subscription = Subscription::create([
            'user_id' => $owner->id,
            'plan_name' => 'pro',
            'start_date' => now(),
            'end_date' => now()->addYear(),
            'status' => 'active',
            'license_key' => 'LIC-'.uniqid(),
            'is_trial' => false,
        ]);

        $transaction = PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => 'paystack',
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => 25000,
            'currency' => 'NGN',
            'status' => 'success',
            'metadata' => ['plan_name' => 'Pro'],
        ]);

        return [$owner, $store, $transaction];
    }

    /** @test */
    public function super_admin_can_fetch_billing_history_for_any_store()
    {
        [$owner, $store, $transaction] = $this->makeStoreOwnerWithTransaction();

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/stores/{$store->id}/billing-history");

        $response->assertStatus(200);
        $response->assertJson([
            'store_id' => $store->id,
            'store_name' => 'Billed Pharmacy',
        ]);

        $txns = $response->json('transactions');
        $this->assertCount(1, $txns);
        $this->assertSame($transaction->id, $txns[0]['id']);
        $this->assertSame('Success', $txns[0]['status']);
        $this->assertSame('₦25,000', $txns[0]['amount']);
    }

    /** @test */
    public function non_super_admin_gets_403()
    {
        [, $store] = $this->makeStoreOwnerWithTransaction();

        $storeOwnerCaller = User::create([
            'first_name' => 'Regular',
            'last_name' => 'Owner',
            'email' => 'regular-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->actingAs($storeOwnerCaller)
            ->getJson("/api/v1/admin/stores/{$store->id}/billing-history");

        $response->assertStatus(403);
    }

    /** @test */
    public function nonexistent_store_404s()
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/00000000-0000-0000-0000-000000000000/billing-history');

        $response->assertStatus(404);
    }

    /** @test */
    public function a_store_with_no_transactions_returns_an_empty_list_not_an_error()
    {
        $owner = User::create([
            'first_name' => 'Quiet',
            'last_name' => 'Owner',
            'email' => 'quiet-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Never Billed Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson("/api/v1/admin/stores/{$store->id}/billing-history");

        $response->assertStatus(200);
        $this->assertCount(0, $response->json('transactions'));
    }
}
