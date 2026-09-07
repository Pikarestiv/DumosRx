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
            'subtotal' => 5000, 'total_amount' => 5000, 'amount_paid' => 5000,
            'payment_method' => 'cash', 'payment_status' => 'paid',
            'transaction_date' => now(),
        ]);

        // Yesterday: must NOT count toward today_sales.
        $oldSale = Sale::create([
            'cashier_id' => $this->user->id,
            'subtotal' => 9000, 'total_amount' => 9000, 'amount_paid' => 9000,
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
