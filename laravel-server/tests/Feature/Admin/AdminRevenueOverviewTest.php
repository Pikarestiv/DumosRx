<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for GET /admin/marketing/revenue - the Marketing > Revenue tab
 * backing endpoint. See AdminRevenueService::getOverview(). Previously
 * PaymentTransaction rows had no admin-facing aggregation at all (the
 * dashboard's "Platform Revenue" stat sums Sale::total_amount, store
 * product sales, not subscription payments).
 */
class AdminRevenueOverviewTest extends TestCase
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

    private function makeTransaction(string $planName, string $provider, float $amount, string $status = 'success'): PaymentTransaction
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $subscription = Subscription::create([
            'user_id' => $owner->id,
            'plan_name' => strtolower($planName),
            'start_date' => now(),
            'end_date' => now()->addMonth(),
            'status' => 'active',
            'license_key' => 'DRX-'.uniqid(),
            'is_trial' => false,
        ]);

        return PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => $provider,
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => $amount,
            'currency' => 'NGN',
            'status' => $status,
            'metadata' => ['plan_name' => $planName],
        ]);
    }

    /** @test */
    public function it_aggregates_total_manual_and_automated_revenue()
    {
        $this->makeTransaction('Pro', 'bank_transfer', 8000);
        $this->makeTransaction('Starter', 'paystack', 5000);
        $this->makeTransaction('Enterprise', 'paystack', 15000);
        $this->makeTransaction('Pro', 'paystack', 8000, 'failed'); // excluded

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/marketing/revenue');

        $response->assertStatus(200);
        $response->assertJson([
            'total_revenue' => 28000,
            'manual_revenue' => 8000,
            'automated_revenue' => 20000,
        ]);

        $byPlan = $response->json('by_plan_tier');
        $this->assertEquals(8000, $byPlan['Pro']);
        $this->assertEquals(5000, $byPlan['Starter']);
        $this->assertEquals(15000, $byPlan['Enterprise']);

        $this->assertCount(3, $response->json('transactions.data'));
    }

    /** @test */
    public function provider_filter_narrows_the_transaction_list()
    {
        $this->makeTransaction('Pro', 'bank_transfer', 8000);
        $this->makeTransaction('Starter', 'paystack', 5000);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/marketing/revenue?provider=bank_transfer');

        $response->assertStatus(200);
        $txns = $response->json('transactions.data');
        $this->assertCount(1, $txns);
        $this->assertSame('bank_transfer', $txns[0]['provider']);
    }

    /** @test */
    public function non_super_admin_gets_403()
    {
        $caller = User::create([
            'first_name' => 'Regular',
            'last_name' => 'Owner',
            'email' => 'regular-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->actingAs($caller)
            ->getJson('/api/v1/admin/marketing/revenue');

        $response->assertStatus(403);
    }
}
