<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
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

    private function sale(string $cashierId, ?string $storeId): Sale
    {
        $sale = Sale::create([
            'cashier_id' => $cashierId,
            'subtotal' => 1000, 'total_amount' => 1000, 'amount_paid' => 1000,
            'payment_method' => 'cash', 'payment_status' => 'paid',
            'transaction_date' => now(),
        ]);
        $sale->store_id = $storeId;
        $sale->save();

        return $sale;
    }

    public function test_sales_reset_deletes_staff_rung_sales_not_just_the_owners_own(): void
    {
        $staff = $this->staffAdmin();
        $ownerSale = $this->sale($this->owner->id, $this->store->id);
        $staffSale = $this->sale($staff->id, $this->store->id);
        $legacyStaffSale = $this->sale($staff->id, null);

        $token = $staff->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/dashboard/reset', [
                'type' => 'sales',
                'password' => 'staff-password',
            ])
            ->assertStatus(200)
            ->assertJsonPath('status', 'success');

        $this->assertNull(Sale::find($ownerSale->id));
        $this->assertNull(Sale::find($staffSale->id));
        $this->assertNull(Sale::find($legacyStaffSale->id));
    }

    public function test_sales_reset_leaves_another_tenants_sales_alone(): void
    {
        $otherOwner = User::create([
            'first_name' => 'Other',
            'last_name' => 'Owner',
            'email' => 'other-sales-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $otherStore = Store::create([
            'user_id' => $otherOwner->id,
            'name' => 'Other Branch',
            'store_type' => 'pharmacy',
            'device_id' => 'test-device-'.uniqid(),
        ]);
        $foreignSale = $this->sale($otherOwner->id, $otherStore->id);
        $ownSale = $this->sale($this->owner->id, $this->store->id);

        $token = $this->owner->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/dashboard/reset', [
                'type' => 'sales',
                'password' => 'password',
            ])
            ->assertStatus(200);

        $this->assertNotNull(Sale::find($foreignSale->id));
        $this->assertNull(Sale::find($ownSale->id));
    }

    public function test_logs_reset_deletes_staff_activity_logs_too(): void
    {
        $staff = $this->staffAdmin();

        $ownerLog = ActivityLog::create([
            'user_id' => $this->owner->id,
            'action' => 'login',
            'description' => 'Owner logged in',
        ]);
        $staffLog = ActivityLog::create([
            'user_id' => $staff->id,
            'action' => 'login',
            'description' => 'Staff logged in',
        ]);

        $token = $staff->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/dashboard/reset', [
                'type' => 'logs',
                'password' => 'staff-password',
            ])
            ->assertStatus(200);

        $this->assertNull(ActivityLog::find($ownerLog->id));
        $this->assertNull(ActivityLog::find($staffLog->id));
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
