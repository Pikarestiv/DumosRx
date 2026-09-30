<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminStoreService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * End-to-end coverage for A-74: suspending a store through the real admin
 * service must actually take effect on every surface that reads
 * stores.status, and must do so whichever casing the column holds.
 */
class StoreSuspensionEnforcementTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['store_url' => true, 'cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'suspend-super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->owner = User::create([
            'first_name' => 'Suspend', 'last_name' => 'Owner',
            'email' => 'suspend-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Suspendable Pharmacy',
            'store_slug' => 'suspendable',
            'device_id' => 'SUSPEND-1',
            'status' => 'Active',
            'online_store_enabled' => true,
        ]);
    }

    private function suspend(): void
    {
        \Illuminate\Support\Facades\Auth::login($this->superAdmin);
        app(AdminStoreService::class)->suspendStore($this->store->id, 'Terms violation');
        \Illuminate\Support\Facades\Auth::logout();
        $this->store->refresh();
    }

    private function unsuspend(): void
    {
        \Illuminate\Support\Facades\Auth::login($this->superAdmin);
        app(AdminStoreService::class)->unsuspendStore($this->store->id);
        \Illuminate\Support\Facades\Auth::logout();
        $this->store->refresh();
    }

    /**
     * Pins the stored value itself, not just behaviour: SQLite (tests) is
     * case-sensitive on `!=`/`=` where MySQL (production) is not, so a
     * behaviour-only assertion can pass here for the wrong reason.
     * 'Suspended'/'Active' is the canonical stored form, because `client/`'s
     * licensing manager and `web/`'s admin badges both compare it exactly.
     */
    public function test_the_admin_service_writes_the_canonical_stored_status_value()
    {
        $this->suspend();

        $this->assertSame('Suspended', $this->store->getRawOriginal('status'));
    }

    public function test_suspending_through_the_admin_service_makes_the_storefront_403()
    {
        $this->suspend();

        $this->getJson('/api/v1/storefront/suspendable')->assertStatus(403);
        $this->postJson('/api/v1/storefront/suspendable/checkout/initialize', [
            'customer_name' => 'Jane', 'customer_phone' => '08000000000', 'items' => [],
        ])->assertStatus(403);
        $this->postJson('/api/v1/storefront/suspendable/checkout', [
            'customer_name' => 'Jane', 'customer_phone' => '08000000000',
            'payment_method' => 'in_store', 'items' => [],
        ])->assertStatus(403);
    }

    public function test_suspending_through_the_admin_service_stamps_storefront_dirty_at()
    {
        $this->assertNull($this->store->storefront_dirty_at);

        $this->suspend();

        $this->assertNotNull($this->store->storefront_dirty_at);
    }

    public function test_suspending_through_the_admin_service_drops_the_store_from_the_slug_list()
    {
        $this->suspend();

        $response = $this->getJson('/api/v1/storefront-slugs');

        $response->assertStatus(200);
        $this->assertNotContains('suspendable', $response->json('slugs'));
    }

    /**
     * Rows written by anything other than AdminStoreService (a manual DB
     * correction, an older writer) may hold either casing, so every read
     * site must be casing-agnostic rather than relying on the writer alone.
     */
    public function test_a_lower_case_suspended_value_is_still_enforced_everywhere()
    {
        \Illuminate\Support\Facades\DB::table('stores')
            ->where('id', $this->store->id)
            ->update(['status' => 'suspended']);

        $this->getJson('/api/v1/storefront/suspendable')->assertStatus(403);
        $this->assertNotContains('suspendable', $this->getJson('/api/v1/storefront-slugs')->json('slugs'));
    }

    public function test_unsuspending_restores_the_storefront()
    {
        $this->suspend();

        $this->unsuspend();

        $this->assertSame('Active', $this->store->getRawOriginal('status'));
        $this->getJson('/api/v1/storefront/suspendable')->assertStatus(200);
    }

    public function test_check_account_status_blocks_a_suspended_store_in_either_casing()
    {
        foreach (['suspended', 'Suspended'] as $value) {
            \Illuminate\Support\Facades\DB::table('stores')
                ->where('id', $this->store->id)
                ->update(['status' => $value]);

            $response = $this->actingAs($this->owner)->getJson('/api/v1/app/sync/counts');

            $response->assertStatus(403);
            $response->assertJson(['message' => 'ACCOUNT_SUSPENDED']);
        }
    }
}
