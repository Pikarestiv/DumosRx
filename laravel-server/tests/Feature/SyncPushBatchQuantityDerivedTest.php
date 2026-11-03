<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/** A-217: the server derives a batch's quantity as MAX(0, Σlog), as the client does. Rules: laravel-server/AGENTS.md, "A batch's quantity is derived from its log". */
class SyncPushBatchQuantityDerivedTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    private string $productId;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();
        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Nest', 'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Nest', 'slug' => 'nest-'.uniqid(), 'device_id' => 'WEB-NEST', 'currency' => 'NGN',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);
        $this->withoutMiddleware();

        $this->productId = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $this->productId, 'store_id' => $this->store->id, 'user_id' => $this->owner->id, 'name' => 'Gluformin',
            'selling_price' => 100, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function seedBatch(int $stored): string
    {
        $id = (string) Str::uuid();
        DB::table('stock_batches')->insert([
            'id' => $id, 'product_id' => $this->productId, 'store_id' => $this->store->id, 'batch_number' => 'B-'.substr($id, 0, 4),
            'quantity' => $stored, 'cost_price' => 50, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function movement(string $batchId, int $quantity): array
    {
        $id = (string) Str::uuid();

        return [
            'table_name' => 'stock_movements', 'operation' => 'INSERT', 'record_id' => $id,
            'payload' => [
                'id' => $id, 'stock_batch_id' => $batchId, 'product_id' => $this->productId, 'store_id' => $this->store->id,
                'quantity' => $quantity, 'movement_type' => $quantity > 0 ? 'purchase' : 'sale', 'performed_by' => $this->owner->id,
                'created_at' => now()->toDateTimeString(), 'updated_at' => now()->toDateTimeString(),
            ],
        ];
    }

    private function push(array ...$changes): void
    {
        foreach ($changes as $i => &$change) {
            $change['id'] = $i + 1;
        }
        $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => $changes])
            ->assertStatus(200)
            ->assertJsonPath('failed', []);
    }

    private function stored(string $batchId): int
    {
        return (int) DB::table('stock_batches')->where('id', $batchId)->value('quantity');
    }

    public function test_an_oversell_and_a_later_count_in_separate_pushes_agree_with_the_clients_floor_over_the_log(): void
    {
        $batch = $this->seedBatch(0);
        $this->push($this->movement($batch, 4));
        $this->push($this->movement($batch, -6));

        $this->push($this->movement($batch, 2));

        $this->assertSame(0, $this->stored($batch), 'MAX(0, 4 - 6 + 2) is 0; a per-push floor reads 2.');
    }

    public function test_a_drifted_server_figure_is_rebuilt_from_the_log_the_next_time_the_batch_moves(): void
    {
        $batch = $this->seedBatch(0);
        $this->push($this->movement($batch, 10));
        DB::table('stock_batches')->where('id', $batch)->update(['quantity' => 7]);

        $this->push($this->movement($batch, -1));

        $this->assertSame(9, $this->stored($batch));
    }

    public function test_a_legacy_batch_whose_stock_was_never_logged_is_patched_not_rebuilt(): void
    {
        $legacy = $this->seedBatch(100);

        $this->push($this->movement($legacy, -5));

        $this->assertSame(95, $this->stored($legacy));
    }

    public function test_the_carve_out_is_judged_against_the_log_before_this_push(): void
    {
        $legacy = $this->seedBatch(100);

        $this->push($this->movement($legacy, 200), $this->movement($legacy, -150));

        $this->assertSame(150, $this->stored($legacy));
    }

    public function test_a_batch_pushed_with_its_stock_holds_its_inbound(): void
    {
        $batchId = (string) Str::uuid();
        $this->push(
            ['table_name' => 'stock_batches', 'operation' => 'INSERT', 'record_id' => $batchId, 'payload' => [
                'id' => $batchId, 'product_id' => $this->productId, 'store_id' => $this->store->id, 'batch_number' => 'NEW',
                'quantity' => 999, 'cost_price' => 50, 'created_at' => now()->toDateTimeString(), 'updated_at' => now()->toDateTimeString(),
            ]],
            $this->movement($batchId, 12),
            $this->movement($batchId, -2),
        );

        $this->assertSame(10, $this->stored($batchId));
    }

    public function test_an_oversell_never_writes_a_negative_quantity(): void
    {
        $batch = $this->seedBatch(0);
        $this->push($this->movement($batch, 3));

        $this->push($this->movement($batch, -8));

        $this->assertSame(0, $this->stored($batch));
    }

    public function test_a_log_holding_another_stores_movements_is_patched_not_rebuilt(): void
    {
        $batch = $this->seedBatch(0);
        $this->push($this->movement($batch, 40));
        DB::table('stock_movements')->insert([
            'id' => (string) Str::uuid(), 'product_id' => $this->productId, 'stock_batch_id' => $batch, 'store_id' => (string) Str::uuid(),
            'movement_type' => 'sale', 'quantity' => -25, 'performed_by' => $this->owner->id, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->push($this->movement($batch, -1));

        $this->assertSame(39, $this->stored($batch), 'A movement A-280 refused to apply must not be rebuilt back in.');
    }

    public function test_a_push_locks_every_batch_its_movements_touch_once_in_id_order(): void
    {
        $first = $this->seedBatch(0);
        $second = $this->seedBatch(0);
        DB::enableQueryLog();

        $this->push($this->movement($second, 3), $this->movement($first, 2));

        $locks = collect(DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'from "stock_batches" where "id" in'))->values();
        DB::disableQueryLog();
        $this->assertCount(1, $locks);
        $expected = [$first, $second];
        sort($expected);
        $this->assertSame($expected, $locks[0]['bindings']);
    }
}
