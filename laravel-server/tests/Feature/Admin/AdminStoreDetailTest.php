<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Covers GET /admin/stores/{id}, the single-store payload behind the admin
 * panel's Store Details page (which replaced the old ViewStoreDialog and
 * needs far more than the paginated fleet list row carries).
 */
class AdminStoreDetailTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

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

        $this->owner = User::create([
            'first_name' => 'Ada',
            'last_name' => 'Owner',
            'email' => 'ada@dumosrx.com',
            'phone' => '08000000000',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Pikarestiv Stores',
            'device_id' => 'TEST-DEVICE',
            'store_slug' => 'pikarestiv',
            'address' => '12 Market Road',
            'phone' => '08011111111',
            'currency' => 'NGN',
            'timezone' => 'Africa/Lagos',
            'online_store_enabled' => true,
            'auto_sync_enabled' => true,
            'last_sync_at' => now()->subHours(3),
            'paystack_subaccount_code' => 'ACCT_test123',
            'paystack_account_number_last4' => '4321',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function it_returns_the_store_profile_and_its_owner()
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);

        $this->assertSame($this->store->id, $response->json('id'));
        $this->assertSame('Pikarestiv Stores', $response->json('name'));
        $this->assertSame('pikarestiv', $response->json('store_slug'));
        $this->assertSame('12 Market Road', $response->json('address'));
        $this->assertSame('Africa/Lagos', $response->json('timezone'));
        $this->assertSame($this->owner->id, $response->json('owner.id'));
        $this->assertSame('Ada Owner', $response->json('owner.name'));
        $this->assertSame('ada@dumosrx.com', $response->json('owner.email'));
    }

    #[Test]
    public function it_reports_the_owners_current_subscription()
    {
        Subscription::create([
            'user_id' => $this->owner->id,
            'plan_name' => 'professional',
            'start_date' => now()->subDays(5),
            'end_date' => now()->addDays(25),
            'status' => 'active',
            'is_trial' => true,
            'license_key' => 'DRX-TEST-KEY',
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $this->assertSame('professional', $response->json('subscription.plan'));
        $this->assertSame('active', $response->json('subscription.status'));
        $this->assertTrue($response->json('subscription.is_trial'));
        $this->assertSame(25, $response->json('subscription.days_remaining'));
    }

    #[Test]
    public function it_reports_sync_storefront_and_payment_configuration()
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $this->assertTrue($response->json('sync.auto_sync_enabled'));
        $this->assertNotNull($response->json('sync.last_sync_at'));
        $this->assertSame('TEST-DEVICE', $response->json('sync.device_id'));
        $this->assertTrue($response->json('storefront.online_store_enabled'));
        $this->assertSame('pikarestiv', $response->json('storefront.store_slug'));
        $this->assertTrue($response->json('payments.paystack_connected'));
        $this->assertSame('4321', $response->json('payments.account_number_last4'));
    }

    #[Test]
    public function it_counts_the_stores_staff()
    {
        User::create([
            'first_name' => 'Staff',
            'last_name' => 'One',
            'email' => 'staff1@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);
        User::create([
            'first_name' => 'Staff',
            'last_name' => 'Two',
            'email' => 'staff2@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'manager',
            'store_id' => $this->store->id,
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $this->assertSame(2, $response->json('counts.staff'));
    }

    #[Test]
    public function it_returns_recent_activity_scoped_to_this_store()
    {
        ActivityLog::create([
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'action' => 'LOGIN',
            'description' => 'Owner logged in',
            'status' => 'success',
        ]);

        $otherStore = Store::create([
            'user_id' => $this->superAdmin->id,
            'name' => 'Other Store',
            'device_id' => 'OTHER-DEVICE',
        ]);
        ActivityLog::create([
            'user_id' => $this->superAdmin->id,
            'store_id' => $otherStore->id,
            'action' => 'LOGIN',
            'description' => 'Somebody else logged in',
            'status' => 'success',
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $activity = $response->json('recent_activity');
        $this->assertCount(1, $activity);
        $this->assertSame('Owner logged in', $activity[0]['description']);
    }

    #[Test]
    public function it_404s_for_a_store_that_does_not_exist()
    {
        $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/does-not-exist')
            ->assertStatus(404);
    }

    #[Test]
    public function it_is_closed_to_non_super_admin_accounts()
    {
        $this->actingAs($this->owner)
            ->getJson('/api/v1/admin/stores/'.$this->store->id)
            ->assertForbidden();
    }
}
