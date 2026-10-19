<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\Concerns\CountsSyncedTableRows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A-284. See docs/FIXED_BUGS.md.
 */
class SyncPullSoftDeletedParentLineItemsTest extends TestCase
{
    use CountsSyncedTableRows;
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    /** @var array<string, string> */
    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Voided Sale Store',
            'store_slug' => 'voided-sale-'.uniqid(),
            'device_id' => 'WEB-VOIDED-SALE',
        ]);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        Schema::enableForeignKeyConstraints();

        $this->seedVoidedSaleAndReturn();
    }

    private function seedVoidedSaleAndReturn(): void
    {
        foreach (['product', 'batch', 'sale', 'sale_item', 'sale_item_batch', 'return', 'return_item'] as $key) {
            $this->ids[$key] = (string) Str::uuid();
        }

        $now = now();
        $deletedAt = $now->copy()->subMinute();

        DB::table('products')->insert([
            'id' => $this->ids['product'],
            'store_id' => $this->store->id,
            'name' => 'Sold Item',
            'selling_price' => 100,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        DB::table('stock_batches')->insert([
            'id' => $this->ids['batch'],
            'product_id' => $this->ids['product'],
            'batch_number' => 'B-1',
            'quantity' => 5,
            'cost_price' => 50,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        DB::table('sales')->insert([
            'id' => $this->ids['sale'],
            'store_id' => $this->store->id,
            'transaction_number' => 'TXN-VOID',
            'cashier_id' => $this->owner->id,
            'total_amount' => 100,
            'amount_paid' => 100,
            'payment_method' => 'cash',
            'created_at' => $now, 'updated_at' => $now,
            'deleted_at' => $deletedAt,
        ]);

        DB::table('sale_items')->insert([
            'id' => $this->ids['sale_item'],
            'sale_id' => $this->ids['sale'],
            'product_id' => $this->ids['product'],
            'stock_batch_id' => $this->ids['batch'],
            'quantity' => 1,
            'unit_price' => 100,
            'total_price' => 100,
            'cost_price' => 50,
            'created_at' => $now, 'updated_at' => $now,
            'deleted_at' => $deletedAt,
        ]);

        DB::table('sale_item_batches')->insert([
            'id' => $this->ids['sale_item_batch'],
            'sale_item_id' => $this->ids['sale_item'],
            'stock_batch_id' => $this->ids['batch'],
            'quantity' => 1,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        DB::table('returns')->insert([
            'id' => $this->ids['return'],
            'store_id' => $this->store->id,
            'sale_id' => $this->ids['sale'],
            'user_id' => $this->owner->id,
            'total_refunded' => 10,
            'created_at' => $now, 'updated_at' => $now,
            'deleted_at' => $deletedAt,
        ]);

        DB::table('return_items')->insert([
            'id' => $this->ids['return_item'],
            'return_id' => $this->ids['return'],
            'product_id' => $this->ids['product'],
            'quantity' => 1,
            'unit_price' => 100,
            'subtotal' => 100,
            'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    /** @return array<string, array<int, array<string, mixed>>> */
    private function pulledChanges(): array
    {
        return $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => []])
            ->assertOk()
            ->json('changes') ?? [];
    }

    public function test_line_items_of_a_voided_sale_are_delivered_by_the_pull(): void
    {
        $changes = $this->pulledChanges();

        $this->assertContains(
            $this->ids['sale_item'],
            array_column($changes['sale_items'] ?? [], 'id'),
            'a voided sale\'s items must be delivered, or a device can never learn of their delete'
        );

        $this->assertContains(
            $this->ids['sale_item_batch'],
            array_column($changes['sale_item_batches'] ?? [], 'id'),
            'and the batch allocations hanging off them'
        );

        $this->assertContains(
            $this->ids['return_item'],
            array_column($changes['return_items'] ?? [], 'id'),
            'same for a voided return\'s items'
        );
    }

    /**
     * The agreement instrument counts these three through a withTrashed()
     * parent, so a pull that scopes them any narrower reads as a permanent
     * device-behind verdict on every store holding a voided sale.
     */
    public function test_the_agreement_count_agrees_with_what_the_pull_delivers(): void
    {
        $changes = $this->pulledChanges();

        foreach (['sale_items', 'sale_item_batches', 'return_items'] as $table) {
            $this->assertSame(
                count($changes[$table] ?? []),
                $this->serverTableFingerprint($this->store->id, $table)['rows'] ?? null,
                "the agreement count and the pull must agree on {$table}"
            );
        }
    }
}
