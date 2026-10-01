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

    /**
     * A-86: both admin revenue helpers read `sales` through DB::table(), so
     * they miss the SoftDeletes global scope the store owner's own dashboard
     * inherits. A voided/reset sale must be excluded from every admin figure
     * too, or the two surfaces quote different revenue for the same store.
     */
    #[Test]
    public function soft_deleted_sales_are_excluded_from_the_store_detail_metrics()
    {
        $this->recordSale(1000);
        $voided = $this->recordSale(3000);

        $voided->delete();

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);

        $this->assertSame(1, $response->json('business_metrics.order_count'));
        $this->assertEquals(1000, $response->json('business_metrics.revenue_raw'));
        $this->assertEquals(1000, $response->json('business_metrics.average_order_value_raw'));
    }

    #[Test]
    public function soft_deleted_sales_are_excluded_from_the_fleet_list_revenue()
    {
        $this->recordSale(1000);
        $this->recordSale(3000)->delete();

        $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/stores');

        $response->assertStatus(200);

        $row = collect($response->json('data'))->firstWhere('id', $this->store->id);
        $this->assertSame('₦1,000', $row['revenue']);
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

    /**
     * A clock-skewed offline POS device can push a created_at that is
     * genuinely in the future (SyncController trusts the client's
     * timestamp verbatim). "Last active" must never display a future time.
     */
    #[Test]
    public function last_active_is_clamped_to_now_when_a_synced_record_is_timestamped_in_the_future()
    {
        $this->store->forceFill(['last_sync_at' => now()->addHours(6)])->save();

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);

        $lastActiveAt = \Illuminate\Support\Carbon::parse($response->json('operational_metrics.last_active_at'));
        $this->assertTrue($lastActiveAt->lessThanOrEqualTo(now()));
        $this->assertStringNotContainsString('from now', $response->json('operational_metrics.last_active_human'));

        $this->assertStringNotContainsString('from now', $response->json('sync.last_sync_human'));
    }

    #[Test]
    public function operational_metrics_report_the_stores_total_stock_value()
    {
        $productId = (string) \Illuminate\Support\Str::uuid();
        DB::table('products')->insert([
            'id' => $productId,
            'name' => 'Paracetamol',
            'store_id' => $this->store->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('stock_batches')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'product_id' => $productId,
            'store_id' => $this->store->id,
            'user_id' => $this->owner->id,
            'batch_number' => 'B-1',
            'quantity' => 10,
            'cost_price' => 250,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $this->assertEquals(2500, $response->json('operational_metrics.stock_value_raw'));
        $this->assertSame('₦2,500', $response->json('counts.stock_value'));
    }

    /**
     * stock_batches.store_id is not authoritative (frequently null/stale on
     * real data) — the sync engine itself scopes stock_batches via
     * product_id -> products.store_id (see SyncController's own comment on
     * this). A batch with a null/wrong store_id must still count toward its
     * product's store value, the same way it still counts for that store on
     * pull().
     */
    #[Test]
    public function stock_value_counts_a_batch_even_when_its_own_store_id_is_missing(): void
    {
        $productId = (string) \Illuminate\Support\Str::uuid();
        DB::table('products')->insert([
            'id' => $productId,
            'name' => 'Amoxicillin',
            'store_id' => $this->store->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('stock_batches')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'product_id' => $productId,
            'store_id' => null,
            'user_id' => $this->owner->id,
            'batch_number' => 'B-2',
            'quantity' => 100,
            'cost_price' => 300,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $this->assertEquals(30000, $response->json('operational_metrics.stock_value_raw'));
    }

    #[Test]
    public function trading_days_are_counted_against_the_stores_own_calendar_day()
    {
        $this->store->forceFill(['timezone' => 'Pacific/Auckland'])->save();

        // Both stamps land on 2026-03-01 in UTC, but straddle midnight in
        // Auckland (UTC+13 in March): 23:00 on the 1st and 01:00 on the 2nd.
        $this->recordSale(1000, '2026-03-01 10:00:00');
        $this->recordSale(1500, '2026-03-01 12:00:00');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $this->assertSame(2, $response->json('business_metrics.order_count'));
        $this->assertSame(2, $response->json('business_metrics.active_days'));
    }

    #[Test]
    public function active_sessions_ignore_expired_and_impersonation_tokens()
    {
        $this->owner->createToken('Desktop App');
        $this->owner->createToken('Impersonation Token');

        $expired = $this->owner->createToken('Old Laptop');
        DB::table('personal_access_tokens')
            ->where('id', $expired->accessToken->id)
            ->update(['expires_at' => now()->subDay()]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores/'.$this->store->id);

        $response->assertStatus(200);
        $this->assertSame(1, $response->json('operational_metrics.active_sessions'));
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
