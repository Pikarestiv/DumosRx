<?php

namespace Tests\Feature;

use App\Models\Service;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontServicesTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Storefront $storefront;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['store_url' => true]]]]);
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'One', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $owner->id, 'name' => 'Salon', 'store_slug' => 'salon', 'device_id' => 'DEV-1', 'online_store_enabled' => true,
        ]);
        $this->storefront = Storefront::create([
            'user_id' => $owner->id, 'slug' => 'salon', 'name' => 'Salon', 'primary_store_id' => $this->store->id,
        ]);
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    }

    private function service(array $attrs = []): Service
    {
        return Service::create(array_merge(['store_id' => $this->store->id, 'name' => 'Braiding', 'price' => 15000, 'category' => 'Hair'], $attrs));
    }

    public function test_services_are_hidden_until_the_store_switches_them_on(): void
    {
        $this->service();

        $this->getJson('/api/v1/storefront/salon/services')->assertOk()->assertExactJson(['data' => []]);
        $this->getJson('/api/v1/storefront/salon')->assertJsonPath('storefront.show_services', false);
    }

    public function test_only_active_services_of_that_store_are_listed_once_switched_on(): void
    {
        $this->storefront->update(['show_services' => true]);
        $this->service(['name' => 'Braiding']);
        $this->service(['name' => 'Retired cut', 'is_active' => false]);
        $other = Store::create(['user_id' => $this->store->user_id, 'name' => 'Other', 'device_id' => 'DEV-2']);
        $this->service(['name' => 'Elsewhere', 'store_id' => $other->id]);

        $this->getJson('/api/v1/storefront/salon/services')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Braiding')
            ->assertJsonPath('data.0.price', 15000);
    }

    public function test_an_unpublished_store_has_no_services_endpoint(): void
    {
        $this->store->update(['online_store_enabled' => false]);

        $this->getJson('/api/v1/storefront/salon/services')->assertNotFound();
    }
}
