<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-280. `applyStockBatchDeltas()` moved quantity on whatever
 * `stock_batch_id` a pushed `stock_movements` row named, with no join to the
 * owning store — and the movement itself always authorizes, because
 * `normalizePushPayload()` backfills its `store_id` from the session.
 * Rationale in laravel-server/AGENTS.md, "Stock batch deltas are store-scoped".
 */
class SyncPushStockMovementBatchScopeTest extends TestCase
{
    use RefreshDatabase;

    private User $victimOwner;

    private Store $victimStore;

    private User $attackerOwner;

    private Store $attackerStore;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        [$this->victimOwner, $this->victimStore] = $this->makeTenant('victim');
        [$this->attackerOwner, $this->attackerStore] = $this->makeTenant('attacker');

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    private function makeTenant(string $slug): array
    {
        $owner = User::create([
            'first_name' => ucfirst($slug),
            'last_name' => 'Owner',
            'email' => $slug.'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $store = Store::create([
            'user_id' => $owner->id,
            'name' => ucfirst($slug).' Store',
            'slug' => $slug.'-store',
            'device_id' => 'WEB-'.strtoupper($slug),
            'currency' => 'NGN',
        ]);
        $owner->update(['store_id' => $store->id]);

        return [$owner, $store];
    }

    private function seedBatch(string $storeId, string $userId, string $productId, string $batchId, float $quantity): void
    {
        DB::table('products')->insert([
            'id' => $productId,
            'store_id' => $storeId,
            'user_id' => $userId,
            'name' => 'Painkillers',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'product_id' => $productId,
            'batch_number' => 'B-'.substr($batchId, 0, 6),
            'quantity' => $quantity,
            'cost_price' => 100,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function pushMovement(User $as, string $batchId, float $quantity, ?string $productId = null)
    {
        $movementId = 'movement-'.uniqid();

        return $this->actingAs($as)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => $movementId,
                    'payload' => [
                        'id' => $movementId,
                        'stock_batch_id' => $batchId,
                        'product_id' => $productId,
                        'quantity' => $quantity,
                        'movement_type' => 'sale',
                        'performed_by' => $as->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ]);
    }

    public function test_a_movement_naming_another_stores_batch_does_not_move_its_quantity()
    {
        $this->seedBatch(
            $this->victimStore->id,
            $this->victimOwner->id,
            'victim-product',
            'victim-batch',
            40,
        );

        $response = $this->pushMovement($this->attackerOwner, 'victim-batch', -25, 'victim-product');

        $response->assertStatus(200);
        $this->assertSame(
            40.0,
            (float) DB::table('stock_batches')->where('id', 'victim-batch')->value('quantity'),
            "A push from one store must not move another store's batch quantity.",
        );
        $this->assertSame(
            'permission_denied',
            collect($response->json('failed'))
                ->firstWhere('record_id', 'victim-batch')['reason'] ?? null,
            'The refused delta must be reported, not silently dropped.',
        );
    }

    public function test_a_movement_against_the_callers_own_batch_still_applies()
    {
        $this->seedBatch(
            $this->attackerStore->id,
            $this->attackerOwner->id,
            'own-product',
            'own-batch',
            40,
        );

        $this->pushMovement($this->attackerOwner, 'own-batch', -25, 'own-product')
            ->assertStatus(200)
            ->assertJsonCount(0, 'failed');

        $this->assertSame(
            15.0,
            (float) DB::table('stock_batches')->where('id', 'own-batch')->value('quantity'),
        );
    }

    /**
     * Deliberate and pre-existing: a batch that does not exist is logged and
     * skipped, never refused — it may still arrive later in the same backlog.
     * Asserted as "no ownership refusal" rather than "no failure at all"
     * because the movement's own foreign key rejects a dangling batch id
     * first, which is a different, pre-existing outcome.
     */
    public function test_a_movement_naming_a_batch_that_does_not_exist_is_not_refused_for_ownership()
    {
        $response = $this->pushMovement($this->attackerOwner, 'batch-not-here-yet', -5, 'own-product');

        $response->assertStatus(200);
        $this->assertNull(
            collect($response->json('failed'))
                ->firstWhere('reason', 'permission_denied'),
            'An unresolvable batch id must not be treated as a cross-tenant write.',
        );
    }

    public function test_a_super_admin_is_not_scoped_out_of_any_stores_batch()
    {
        $this->seedBatch(
            $this->victimStore->id,
            $this->victimOwner->id,
            'victim-product',
            'victim-batch',
            40,
        );

        $superAdmin = User::create([
            'first_name' => 'Platform',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $this->pushMovement($superAdmin, 'victim-batch', -25, 'victim-product')
            ->assertStatus(200)
            ->assertJsonCount(0, 'failed');

        $this->assertSame(
            15.0,
            (float) DB::table('stock_batches')->where('id', 'victim-batch')->value('quantity'),
        );
    }
}
