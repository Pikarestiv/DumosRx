<?php

namespace Tests\Feature\Admin;

use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Covers the fleet search matching on device id, and the business /
 * operational metrics AdminStoreMetricsService adds to GET
 * /admin/stores/{id}.
 */
class AdminStoreSearchAndMetricsTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->owner = User::create([
            'first_name' => 'Ada', 'last_name' => 'Owner',
            'email' => 'ada@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Pikarestiv Stores',
            'device_id' => 'DESKTOP-9QK3ZLA',
            'currency' => 'NGN',
            'last_sync_at' => now()->subHour(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function recordSale(float $amount, ?string $createdAt = null): Sale
    {
        $sale = Sale::create([
            'transaction_number' => 'TXN-'.uniqid(),
            'cashier_id' => $this->owner->id,
            'subtotal' => $amount,
            'total_amount' => $amount,
            'payment_method' => 'cash',
            'payment_status' => 'completed',
            'amount_paid' => $amount,
        ]);

        DB::table('sales')->where('id', $sale->id)->update(array_filter([
            'store_id' => $this->store->id,
            'created_at' => $createdAt,
        ]));

        return $sale;
    }

    #[Test]
    public function searching_by_device_id_surfaces_the_owning_store()
    {
        $other = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Another Branch',
            'device_id' => 'DESKTOP-OTHER',
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores?search=9QK3ZLA');

        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($this->store->id, $ids);
        $this->assertNotContains($other->id, $ids);
    }

    #[Test]
    public function the_fleet_row_carries_the_device_id_it_can_be_searched_by()
    {
        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores');

        $this->assertSame('DESKTOP-9QK3ZLA', $response->json('data.0.device_id'));
        $this->assertFalse($response->json('data.0.is_archived'));
    }

    #[Test]
    public function searching_by_name_or_owner_email_still_works()
    {
        $byName = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores?search=Pikarestiv');
        $this->assertCount(1, $byName->json('data'));

        $byEmail = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores?search=ada@dumosrx.com');
        $this->assertCount(1, $byEmail->json('data'));
    }

    #[Test]
    public function business_metrics_report_revenue_volume_and_average_order_value()
    {
        $this->recordSale(1000);
        $this->recordSale(3000);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);

        $this->assertSame(2, $response->json('business_metrics.order_count'));
        $this->assertEquals(4000, $response->json('business_metrics.revenue_raw'));
        $this->assertEquals(2000, $response->json('business_metrics.average_order_value_raw'));
        $this->assertSame('₦2,000', $response->json('business_metrics.average_order_value'));
        $this->assertSame(1, $response->json('business_metrics.active_days'));
    }

    #[Test]
    public function business_metrics_report_growth_against_the_previous_window()
    {
        $this->recordSale(1000, now()->subDays(45)->toDateTimeString());
        $this->recordSale(2000);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $this->assertSame(30, $response->json('business_metrics.window_days'));
        $this->assertSame(1, $response->json('business_metrics.orders_last_window'));
        $this->assertEquals(100.0, $response->json('business_metrics.revenue_growth_pct'));
        $this->assertCount(6, $response->json('business_metrics.monthly_trend'));
    }

    #[Test]
    public function operational_metrics_report_staff_devices_inventory_and_last_active()
    {
        User::create([
            'first_name' => 'Sales', 'last_name' => 'Staff',
            'email' => 'staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        DB::table('products')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'name' => 'Paracetamol',
            'store_id' => $this->store->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);

        $this->assertSame(1, $response->json('operational_metrics.staff_count'));
        $this->assertSame('DESKTOP-9QK3ZLA', $response->json('operational_metrics.device_id'));
        $this->assertSame(1, $response->json('operational_metrics.device_count'));
        $this->assertSame(1, $response->json('operational_metrics.inventory.products'));
        $this->assertSame('Healthy', $response->json('operational_metrics.sync_health'));
        $this->assertNotNull($response->json('operational_metrics.last_active_at'));
    }

    #[Test]
    public function metrics_are_zeroed_rather_than_absent_for_a_store_with_no_activity()
    {
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $this->assertSame(0, $response->json('business_metrics.order_count'));
        $this->assertSame('₦0', $response->json('business_metrics.average_order_value'));
        $this->assertSame(0, $response->json('business_metrics.active_days'));
        $this->assertSame(0, $response->json('operational_metrics.inventory.products'));
        $this->assertSame(0, $response->json('operational_metrics.stock_activity.movements'));
    }
}
