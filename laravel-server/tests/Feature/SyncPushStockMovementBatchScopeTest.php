<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** A-280 and A-287: a stock movement may only name a batch in the session's scope. Rationale: laravel-server/AGENTS.md, "Stock batch deltas are store-scoped". */
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
                    'id' => 7,
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
        $this->assertMovementParkedAsForbidden($response);
    }

    /** A-287: the refusal is the whole movement's, carrying its queue id, so the device parks it visibly. */
    private function assertMovementParkedAsForbidden($response): void
    {
        $failed = collect($response->json('failed'));
        $this->assertCount(1, $failed);
        $this->assertSame('stock_movements', $failed[0]['table_name']);
        $this->assertSame(7, $failed[0]['id']);
        $this->assertSame('forbidden', $failed[0]['reason']);
        $this->assertSame(0, DB::table('stock_movements')->where('id', $failed[0]['record_id'])->count());
    }

    public function test_a_staff_sale_against_a_batch_whose_product_was_stamped_to_a_sibling_store_is_parked_whole()
    {
        $sibling = Store::create([
            'user_id' => $this->attackerOwner->id,
            'name' => 'Sibling Store',
            'slug' => 'sibling-store',
            'device_id' => 'WEB-SIBLING',
            'currency' => 'NGN',
        ]);
        $staff = User::create([
            'first_name' => 'Till',
            'last_name' => 'Staff',
            'email' => 'till-staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->attackerStore->id,
        ]);
        $this->seedBatch($sibling->id, $this->attackerOwner->id, 'mis-stamped-product', 'mis-stamped-batch', 40);

        $response = $this->pushMovement($staff, 'mis-stamped-batch', -5, 'mis-stamped-product');

        $response->assertStatus(200);
        $this->assertMovementParkedAsForbidden($response);
        $this->assertSame(40.0, (float) DB::table('stock_batches')->where('id', 'mis-stamped-batch')->value('quantity'));
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

    public function test_an_update_cannot_repoint_an_own_movement_at_another_stores_batch()
    {
        $this->seedBatch($this->attackerStore->id, $this->attackerOwner->id, 'own-product', 'own-batch', 40);
        $this->seedBatch($this->victimStore->id, $this->victimOwner->id, 'victim-product', 'victim-batch', 40);
        $this->pushMovement($this->attackerOwner, 'own-batch', -5, 'own-product')->assertJsonCount(0, 'failed');
        $movementId = DB::table('stock_movements')->value('id');

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'id' => 8,
                'table_name' => 'stock_movements',
                'operation' => 'UPDATE',
                'record_id' => $movementId,
                'payload' => ['id' => $movementId, 'stock_batch_id' => 'victim-batch', '_version' => 1],
            ]],
        ]);

        $response->assertJsonPath('failed.0.reason', 'forbidden');
        $this->assertSame('own-batch', DB::table('stock_movements')->where('id', $movementId)->value('stock_batch_id'));
    }

    public function test_the_delta_backstop_still_refuses_a_batch_outside_the_scope()
    {
        $this->seedBatch($this->victimStore->id, $this->victimOwner->id, 'victim-product', 'victim-batch', 40);
        $failed = [];

        $apply = new \ReflectionMethod(\App\Http\Controllers\Api\App\SyncController::class, 'applyStockBatchDeltas');
        $apply->invokeArgs(app(\App\Http\Controllers\Api\App\SyncController::class), [['victim-batch' => -25], &$failed, [$this->attackerStore->id]]);

        $this->assertSame('permission_denied', $failed[0]['reason'] ?? null);
        $this->assertSame(40.0, (float) DB::table('stock_batches')->where('id', 'victim-batch')->value('quantity'));
    }
}
