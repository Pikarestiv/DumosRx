<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for the admin "activate paid plan" action - the non-trial
 * counterpart of grant-trial, for subscriptions paid outside the automated
 * checkout flow (e.g. bank transfer). See AdminStoreService::activatePaidPlan
 * / AdminUserService::activatePaidPlan.
 */
class AdminActivatePaidPlanTest extends TestCase
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

    private function makeStoreOwner(): array
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
            'name' => 'Test Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        return [$owner, $store];
    }

    /** @test */
    public function super_admin_can_activate_a_paid_plan_for_a_store()
    {
        [$owner, $store] = $this->makeStoreOwner();

        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$store->id}/activate-plan", [
                'plan' => 'pro',
                'billing_cycle' => 'monthly',
                'amount' => 8000,
                'reference' => 'GTB-REF-123',
            ]);

        $response->assertStatus(200);

        $subscription = Subscription::where('user_id', $owner->id)->first();
        $this->assertNotNull($subscription);
        $this->assertSame('pro', $subscription->plan_name);
        $this->assertFalse($subscription->is_trial);
        $this->assertStringStartsWith('DRX-', $subscription->license_key);
        $this->assertStringNotContainsString('TRIAL', $subscription->license_key);

        $transaction = PaymentTransaction::where('subscription_id', $subscription->id)->first();
        $this->assertNotNull($transaction);
        $this->assertSame('bank_transfer', $transaction->provider);
        $this->assertSame('GTB-REF-123', $transaction->provider_reference);
        $this->assertEquals(8000, $transaction->amount);
        $this->assertSame('completed', $transaction->status);
    }

    /** @test */
    public function super_admin_can_activate_a_paid_plan_for_a_user()
    {
        [$owner] = $this->makeStoreOwner();

        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/users/{$owner->id}/activate-plan", [
                'plan' => 'enterprise',
                'billing_cycle' => 'yearly',
                'amount' => 150000,
            ]);

        $response->assertStatus(200);

        $subscription = Subscription::where('user_id', $owner->id)->first();
        $this->assertSame('enterprise', $subscription->plan_name);
        $this->assertFalse($subscription->is_trial);
        $this->assertTrue($subscription->end_date->greaterThan(now()->addMonths(11)));
    }

    /** @test */
    public function non_super_admin_gets_403()
    {
        [, $store] = $this->makeStoreOwner();

        $caller = User::create([
            'first_name' => 'Regular',
            'last_name' => 'Owner',
            'email' => 'regular-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->actingAs($caller)
            ->postJson("/api/v1/admin/stores/{$store->id}/activate-plan", [
                'plan' => 'pro',
                'billing_cycle' => 'monthly',
                'amount' => 8000,
            ]);

        $response->assertStatus(403);
    }

    /** @test */
    public function invalid_billing_cycle_is_rejected()
    {
        [, $store] = $this->makeStoreOwner();

        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$store->id}/activate-plan", [
                'plan' => 'pro',
                'billing_cycle' => 'weekly',
                'amount' => 8000,
            ]);

        $response->assertStatus(422);
    }
}
