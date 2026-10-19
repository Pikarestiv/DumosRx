<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A-248. A product stamped with a store its own stock never belonged to.
 * `stock_movements` is pulled by its own `store_id` and `stock_batches`
 * through its product's, so the mis-stamp delivers one and withholds the
 * other and the device's deferred stock delta can never resolve. See
 * docs/KNOWN_BUGS.md A-248 and laravel-server/AGENTS.md.
 */
class RepairProductStoreStampTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $correctStore;

    private Store $wrongStore;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = $this->makeOwner('nest');
        $this->correctStore = $this->makeStore($this->owner, 'Nest Pharmacy');
        $this->wrongStore = $this->makeStore($this->owner, 'Agidi');

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => [
                'features' => ['cloud_sync' => true],
                'limits' => ['stores' => -1],
            ]],
        ]);

        $this->withoutMiddleware();

        Schema::enableForeignKeyConstraints();
    }

    private function makeOwner(string $tag): User
    {
        return User::create([
            'first_name' => 'Owner',
            'last_name' => $tag,
            'email' => "owner-{$tag}-".uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    private function makeStore(User $owner, string $name): Store
    {
        return Store::create([
            'user_id' => $owner->id,
            'name' => $name,
            'store_slug' => Str::slug($name).'-'.uniqid(),
            'device_id' => 'WEB-'.strtoupper(Str::slug($name)),
        ]);
    }

    private function insertProduct(string $storeId, string $name = 'swibetic card', int $version = 12): string
    {
        $id = (string) Str::uuid();

        DB::table('products')->insert([
            'id' => $id,
            'user_id' => $this->owner->id,
            'store_id' => $storeId,
            'name' => $name,
            '_version' => $version,
            'created_at' => '2026-09-25 09:03:09',
            'updated_at' => '2026-10-08 17:33:24',
        ]);

        return $id;
    }

    /** Returns the batch id. */
    private function insertBatchWithMovement(string $productId, ?string $storeId, int $quantity = 14): string
    {
        $batchId = (string) Str::uuid();
        $now = '2026-09-25 09:03:09';

        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'product_id' => $productId,
            'store_id' => $storeId,
            'quantity' => $quantity,
            'batch_number' => 'B-'.substr($batchId, 0, 4),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('stock_movements')->insert([
            'id' => (string) Str::uuid(),
            'product_id' => $productId,
            'stock_batch_id' => $batchId,
            'store_id' => $storeId,
            'movement_type' => 'purchase',
            'quantity' => $quantity,
            'performed_by' => $this->owner->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $batchId;
    }

    private function productRow(string $id): object
    {
        return DB::table('products')->where('id', $id)->first();
    }

    /** @return array<int, string> */
    private function pulledBatchIds(string $storeId): array
    {
        $changes = $this->actingAs($this->owner)
            ->withHeader('X-Store-Id', $storeId)
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => []])
            ->assertOk()
            ->json('changes');

        return array_column($changes['stock_batches'] ?? [], 'id');
    }

    public function test_a_misstamped_product_is_attributed_to_the_store_its_stock_belongs_to(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id);
        $this->insertBatchWithMovement($productId, $this->correctStore->id);

        $this->artisan('sync:repair-product-store-stamps --apply')
            ->expectsConfirmation('Write these moves?', 'yes')
            ->expectsOutputToContain('Repairable: 1')
            ->assertSuccessful();

        $this->assertSame($this->correctStore->id, $this->productRow($productId)->store_id);
    }

    /**
     * The point of the whole repair: the batch the correct store's devices
     * could never be sent, because it is pulled through its product.
     */
    public function test_the_batch_becomes_pullable_for_the_correct_store(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id);
        $batchId = $this->insertBatchWithMovement($productId, $this->correctStore->id);

        $this->assertNotContains(
            $batchId,
            $this->pulledBatchIds($this->correctStore->id),
            'a batch whose product is stamped with another store cannot be pulled at all'
        );

        $this->artisan('sync:repair-product-store-stamps --apply')
            ->expectsConfirmation('Write these moves?', 'yes')
            ->assertSuccessful();

        $this->assertContains($batchId, $this->pulledBatchIds($this->correctStore->id));
    }

    public function test_a_product_whose_evidence_is_contradictory_is_reported_and_left_alone(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id, 'contradictory item');
        $this->insertBatchWithMovement($productId, $this->correctStore->id);
        $this->insertBatchWithMovement($productId, $this->wrongStore->id);

        $this->artisan('sync:repair-product-store-stamps')
            ->expectsOutputToContain('CONTRADICTORY')
            ->expectsOutputToContain('Repairable: 0')
            ->expectsOutputToContain('Contradictory: 1')
            ->assertSuccessful();

        $this->assertSame($this->wrongStore->id, $this->productRow($productId)->store_id);
    }

    public function test_evidence_pointing_at_another_tenant_is_refused(): void
    {
        $stranger = $this->makeOwner('stranger');
        $strangerStore = $this->makeStore($stranger, 'Stranger Pharmacy');

        $productId = $this->insertProduct($this->wrongStore->id, 'cross tenant item');
        $this->insertBatchWithMovement($productId, $strangerStore->id);

        $this->artisan('sync:repair-product-store-stamps')
            ->expectsOutputToContain('ANOTHER TENANT')
            ->expectsOutputToContain('Repairable: 0')
            ->assertSuccessful();

        $this->assertSame($this->wrongStore->id, $this->productRow($productId)->store_id);
    }

    public function test_the_repair_moves_the_version_and_the_timestamp(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id);
        $this->insertBatchWithMovement($productId, $this->correctStore->id);

        $this->artisan('sync:repair-product-store-stamps --apply')
            ->expectsConfirmation('Write these moves?', 'yes')
            ->assertSuccessful();

        $after = $this->productRow($productId);

        $this->assertSame(13, (int) $after->_version);
        $this->assertTrue(
            $after->updated_at > '2026-10-08 17:33:24',
            'a device holding the pre-repair copy must not be able to revert it (A-245/A-277)'
        );
    }

    public function test_the_dry_run_writes_nothing(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id);
        $this->insertBatchWithMovement($productId, $this->correctStore->id);

        $this->artisan('sync:repair-product-store-stamps')
            ->expectsOutputToContain('DRY RUN')
            ->expectsOutputToContain('Repairable: 1')
            ->assertSuccessful();

        $after = $this->productRow($productId);
        $this->assertSame($this->wrongStore->id, $after->store_id);
        $this->assertSame(12, (int) $after->_version);
    }

    public function test_declining_the_warning_writes_nothing(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id);
        $this->insertBatchWithMovement($productId, $this->correctStore->id);

        $this->artisan('sync:repair-product-store-stamps --apply')
            ->expectsConfirmation('Write these moves?', 'no')
            ->assertSuccessful();

        $this->assertSame($this->wrongStore->id, $this->productRow($productId)->store_id);
    }

    public function test_the_losing_stores_devices_are_warned_before_anything_is_written(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id);
        $this->insertBatchWithMovement($productId, $this->correctStore->id);

        $this->artisan('sync:repair-product-store-stamps --apply')
            ->expectsOutputToContain('no tombstone')
            ->expectsOutputToContain('Agidi')
            ->expectsConfirmation('Write these moves?', 'no')
            ->assertSuccessful();
    }

    public function test_a_second_run_has_nothing_left_to_repair(): void
    {
        $productId = $this->insertProduct($this->wrongStore->id);
        $this->insertBatchWithMovement($productId, $this->correctStore->id);

        $this->artisan('sync:repair-product-store-stamps --apply')
            ->expectsConfirmation('Write these moves?', 'yes')
            ->assertSuccessful();

        $this->artisan('sync:repair-product-store-stamps --apply')
            ->expectsOutputToContain('No product disagrees')
            ->assertSuccessful();

        $this->assertSame(13, (int) $this->productRow($productId)->_version);
    }

    public function test_the_store_option_limits_the_repair_to_one_proposed_store(): void
    {
        $elsewhere = $this->makeStore($this->owner, 'Third Branch');

        $mine = $this->insertProduct($this->wrongStore->id, 'belongs to nest');
        $this->insertBatchWithMovement($mine, $this->correctStore->id);

        $other = $this->insertProduct($this->wrongStore->id, 'belongs to third');
        $this->insertBatchWithMovement($other, $elsewhere->id);

        $this->artisan("sync:repair-product-store-stamps --apply --store={$elsewhere->id}")
            ->expectsConfirmation('Write these moves?', 'yes')
            ->assertSuccessful();

        $this->assertSame($this->wrongStore->id, $this->productRow($mine)->store_id);
        $this->assertSame($elsewhere->id, $this->productRow($other)->store_id);
    }

    public function test_the_database_it_will_write_to_is_named_before_anything_else(): void
    {
        $this->artisan('sync:repair-product-store-stamps')
            ->expectsOutputToContain('Database:')
            ->assertSuccessful();
    }
}
