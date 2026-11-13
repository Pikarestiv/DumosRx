<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardRecentTransactionServicesTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_recent_transaction_lists_its_service_lines_beside_its_product_lines(): void
    {
        $owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner', 'email' => 'svc-owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create(['user_id' => $owner->id, 'name' => 'Spa', 'device_id' => 'dev-'.uniqid()]);
        $owner->update(['store_id' => $store->id]);
        $productId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $productId, 'store_id' => $store->id, 'user_id' => $owner->id, 'name' => 'Body Lotion',
            'selling_price' => 3000, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $saleId = (string) Str::uuid();
        DB::table('sales')->insert([
            'id' => $saleId, 'store_id' => $store->id, 'transaction_number' => 'TXN-MIX', 'cashier_id' => $owner->id,
            'total_amount' => 18000, 'amount_paid' => 18000, 'payment_method' => 'cash', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('sale_items')->insert([
            'id' => (string) Str::uuid(), 'sale_id' => $saleId, 'product_id' => $productId, 'quantity' => 1,
            'unit_price' => 3000, 'total_price' => 3000, 'cost_price' => 2000, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('sale_services')->insert([
            'id' => (string) Str::uuid(), 'sale_id' => $saleId, 'service_name' => 'Deep Tissue Massage', 'quantity' => 1,
            'unit_price' => 15000, 'total_price' => 15000, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('sale_services')->insert([
            'id' => (string) Str::uuid(), 'sale_id' => $saleId, 'service_name' => 'Voided Facial', 'quantity' => 1,
            'unit_price' => 5000, 'total_price' => 5000, 'created_at' => now(), 'updated_at' => now(), 'deleted_at' => now(),
        ]);
        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class, \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class, \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $response = $this->actingAs($owner)->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(200);
        $items = collect($response->json('stores.0.recent_transactions.0.items'));
        $this->assertEqualsCanonicalizing(['Body Lotion', 'Deep Tissue Massage'], $items->pluck('medicine_name')->all());
        $service = $items->firstWhere('medicine_name', 'Deep Tissue Massage');
        $this->assertSame('service', $service['item_type']);
        $this->assertEquals(15000, $service['total_price']);
        $this->assertSame('product', $items->firstWhere('medicine_name', 'Body Lotion')['item_type']);
    }
}
