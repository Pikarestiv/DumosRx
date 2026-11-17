<?php

namespace Tests\Feature;

use App\Models\OnlineOrder;
use App\Models\Store;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class OnlineOrderItemServiceIdMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_11_17_000001_add_service_id_to_online_order_items_table.php');
    }

    private function line(string $orderId, ?string $productId, ?string $serviceId): string
    {
        $id = (string) Str::uuid();
        DB::table('online_order_items')->insert([
            'id' => $id, 'online_order_id' => $orderId, 'product_id' => $productId, 'service_id' => $serviceId,
            'quantity' => 1, 'unit_price' => 100, 'subtotal' => 100, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_rolling_back_drops_booked_service_lines_and_makes_product_id_required_again(): void
    {
        $owner = User::create(['first_name' => 'O', 'last_name' => 'O', 'email' => 'mig@dumosrx.com', 'password' => bcrypt('x'), 'role' => 'store_owner']);
        $store = Store::create(['user_id' => $owner->id, 'name' => 'S', 'store_slug' => 's-mig', 'device_id' => 'DEV-MIG']);
        $order = OnlineOrder::create([
            'store_id' => $store->id, 'customer_name' => 'A', 'customer_phone' => '1', 'total_amount' => 200,
            'payment_method' => 'in_store', 'payment_status' => 'pending', 'order_status' => 'pending',
        ]);
        $productLine = $this->line($order->id, (string) Str::uuid(), null);
        $this->line($order->id, null, (string) Str::uuid());

        $this->migration()->down();

        $this->assertFalse(Schema::hasColumn('online_order_items', 'service_id'));
        $this->assertSame([$productLine], DB::table('online_order_items')->pluck('id')->all());
        $this->expectException(QueryException::class);
        DB::table('online_order_items')->insert([
            'id' => (string) Str::uuid(), 'online_order_id' => $order->id, 'product_id' => null,
            'quantity' => 1, 'unit_price' => 1, 'subtotal' => 1,
        ]);
    }

    public function test_up_keeps_product_id_a_uuid_column_that_now_accepts_null(): void
    {
        $column = collect(Schema::getColumns('online_order_items'))->firstWhere('name', 'product_id');

        $this->assertTrue($column['nullable']);
        $this->assertSame(collect(Schema::getColumns('online_order_items'))->firstWhere('name', 'online_order_id')['type'], $column['type']);
    }
}
