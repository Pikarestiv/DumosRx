<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardResetScopingTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Branch',
            'store_type' => 'pharmacy',
            'device_id' => 'test-device-'.uniqid(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function staffAdmin(): User
    {
        return User::create([
            'first_name' => 'Staff',
            'last_name' => 'Admin',
            'email' => 'staff-admin@dumosrx.com',
            'password' => bcrypt('staff-password'),
            'role' => 'admin',
            'store_id' => $this->store->id,
        ]);
    }

    private function seedTenantData(): void
    {
        Product::create([
            'name' => 'Panadol',
            'selling_price' => 100,
            'user_id' => $this->owner->id,
            'is_active' => true,
        ]);

        Customer::create([
            'first_name' => 'Walk-in',
            'last_name' => 'Regular',
            'user_id' => $this->owner->id,
        ]);
    }

    public function test_staff_admin_reset_actually_deletes_the_tenant_owners_data(): void
    {
        $this->seedTenantData();
        $staff = $this->staffAdmin();
        $token = $staff->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/dashboard/reset', [
                'type' => 'inventories',
                'password' => 'staff-password',
            ]);

        $response->assertStatus(200);
        $response->assertJsonPath('status', 'success');

        $this->assertSame(0, Product::where('user_id', $this->owner->id)->count());
    }

    public function test_staff_admin_reset_of_customers_deletes_the_tenant_owners_customers(): void
    {
        $this->seedTenantData();
        $staff = $this->staffAdmin();
        $token = $staff->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/dashboard/reset', [
                'type' => 'customers',
                'password' => 'staff-password',
            ])
            ->assertStatus(200);

        $this->assertSame(0, Customer::where('user_id', $this->owner->id)->count());
    }

    public function test_owner_reset_still_deletes_their_own_data(): void
    {
        $this->seedTenantData();
        $token = $this->owner->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/dashboard/reset', [
                'type' => 'inventories',
                'password' => 'password',
            ])
            ->assertStatus(200);

        $this->assertSame(0, Product::where('user_id', $this->owner->id)->count());
    }

    public function test_reset_does_not_touch_another_tenants_data(): void
    {
        $this->seedTenantData();

        $otherOwner = User::create([
            'first_name' => 'Other',
            'last_name' => 'Owner',
            'email' => 'other-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        Product::create([
            'name' => 'Ibuprofen',
            'selling_price' => 200,
            'user_id' => $otherOwner->id,
            'is_active' => true,
        ]);

        $staff = $this->staffAdmin();
        $token = $staff->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/dashboard/reset', [
                'type' => 'inventories',
                'password' => 'staff-password',
            ])
            ->assertStatus(200);

        $this->assertSame(1, Product::where('user_id', $otherOwner->id)->count());
    }
}
