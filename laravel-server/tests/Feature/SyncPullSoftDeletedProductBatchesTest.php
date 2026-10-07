<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A-176, second cause. `pull()` sends soft-deleted products and — because
 * `stock_movements` is scoped by `store_id` — their movements too. But
 * `applyPullTenantScope()` scoped `stock_batches` through `Product::query()`,
 * which carries Product's soft-delete global scope, so the batches those
 * movements reference were never sent.
 *
 * The client defers a movement's delta until its batch arrives. For a
 * soft-deleted product the batch never arrives and never can, so the delta is
 * pending forever and that device's on-hand quantity stays understated — one
 * of the reasons a single store reports different stock on different devices.
 * A full resync cannot help: it re-runs the same scoping.
 */
class SyncPullSoftDeletedProductBatchesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Batch Scope Store',
            'store_slug' => 'batch-scope-'.uniqid(),
            'device_id' => 'WEB-BATCH-SCOPE',
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    /** @return array{0: string, 1: string} product id and batch id */
    private function softDeletedProductWithStock(): array
    {
        $productId = (string) Str::uuid();
        $batchId = (string) Str::uuid();
        $now = now()->format('Y-m-d H:i:s');

        DB::table('products')->insert([
            'id' => $productId,
            'store_id' => $this->store->id,
            'name' => 'Discontinued Item',
            'created_at' => $now,
            'updated_at' => $now,
            'deleted_at' => $now,
        ]);

        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'product_id' => $productId,
            'quantity' => 12,
            'batch_number' => 'B-OLD',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('stock_movements')->insert([
            'id' => (string) Str::uuid(),
            'stock_batch_id' => $batchId,
            'product_id' => $productId,
            'store_id' => $this->store->id,
            'movement_type' => 'purchase',
            'quantity' => 12,
            'performed_by' => $this->owner->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return [$productId, $batchId];
    }

    private function pull(): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => []]);
    }

    public function test_a_soft_deleted_products_batches_are_pulled_alongside_its_movements(): void
    {
        [$productId, $batchId] = $this->softDeletedProductWithStock();

        $response = $this->pull()->assertOk();
        $changes = $response->json('changes');

        $movementBatchIds = array_column($changes['stock_movements'] ?? [], 'stock_batch_id');
        $batchIds = array_column($changes['stock_batches'] ?? [], 'id');

        $this->assertContains($batchId, $movementBatchIds, 'the movement is sent');
        $this->assertContains(
            $batchId,
            $batchIds,
            'its batch must be sent too, or the client defers that delta forever'
        );
    }

    /** The product itself is already sent; the batch must not be the odd one out. */
    public function test_the_soft_deleted_product_itself_is_still_pulled(): void
    {
        [$productId] = $this->softDeletedProductWithStock();

        $changes = $this->pull()->assertOk()->json('changes');

        $this->assertContains($productId, array_column($changes['products'] ?? [], 'id'));
    }

    /**
     * counts() deliberately mirrors the pull scoping so a device never looks
     * permanently "behind" by rows pull can't deliver. Widening one without
     * the other reintroduces exactly that.
     */
    public function test_the_health_count_agrees_with_what_pull_delivers(): void
    {
        [, $batchId] = $this->softDeletedProductWithStock();

        $delivered = count($this->pull()->assertOk()->json('changes.stock_batches') ?? []);

        $counts = $this->actingAs($this->owner)
            ->getJson('/api/v1/app/sync/counts')->assertOk()->json();

        $this->assertSame(
            $delivered,
            $counts['counts']['stock_batches'] ?? $counts['stock_batches'] ?? null,
            'the health count and the pull must agree'
        );
    }
}
