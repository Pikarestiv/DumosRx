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
 * A-288. The device backfills `store_id` on its own legacy rows; the server
 * never did, and `NULL` matches neither `where('store_id', ...)` nor
 * `whereIn('store_id', ...)`, so those rows are invisible to the sync engine
 * in both directions. See docs/FIXED_BUGS.md.
 */
class BackfillStoreIdTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    private User $multiStoreOwner;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = $this->makeOwner('single');
        $this->store = $this->makeStore($this->owner, 'single-store');

        $this->multiStoreOwner = $this->makeOwner('multi');
        $this->makeStore($this->multiStoreOwner, 'multi-one');
        $this->makeStore($this->multiStoreOwner, 'multi-two');

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

    private function makeStore(User $owner, string $tag): Store
    {
        return Store::create([
            'user_id' => $owner->id,
            'name' => "Store {$tag}",
            'store_slug' => $tag.'-'.uniqid(),
            'device_id' => 'WEB-'.strtoupper($tag),
        ]);
    }

    private function insertProduct(?string $userId, ?string $storeId = null): string
    {
        $id = (string) Str::uuid();
        $now = now()->format('Y-m-d H:i:s');

        DB::table('products')->insert([
            'id' => $id,
            'user_id' => $userId,
            'store_id' => $storeId,
            'name' => 'legacy item',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $id;
    }

    private function insertMovement(string $productId): string
    {
        $id = (string) Str::uuid();
        $batchId = (string) Str::uuid();
        $now = now()->format('Y-m-d H:i:s');

        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'product_id' => $productId,
            'quantity' => 5,
            'batch_number' => 'B-LEGACY',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('stock_movements')->insert([
            'id' => $id,
            'product_id' => $productId,
            'stock_batch_id' => $batchId,
            'movement_type' => 'purchase',
            'quantity' => 5,
            'performed_by' => $this->owner->id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $id;
    }

    private function storeIdOf(string $table, string $id): ?string
    {
        return DB::table($table)->where('id', $id)->value('store_id');
    }

    public function test_a_null_row_is_attributed_to_its_owners_only_store(): void
    {
        $productId = $this->insertProduct($this->owner->id);

        $this->artisan('sync:backfill-store-ids --apply')->assertSuccessful();

        $this->assertSame($this->store->id, $this->storeIdOf('products', $productId));
    }

    public function test_an_attributed_row_becomes_visible_to_pull(): void
    {
        $productId = $this->insertProduct($this->owner->id);

        $before = $this->pulledProductIds();
        $this->assertNotContains($productId, $before, 'a NULL store_id row cannot be pulled at all');

        $this->artisan('sync:backfill-store-ids --apply')->assertSuccessful();

        $this->assertContains($productId, $this->pulledProductIds());
    }

    public function test_a_row_whose_owner_owns_several_stores_is_left_null_and_counted(): void
    {
        $ambiguous = $this->insertProduct($this->multiStoreOwner->id);
        $orphan = $this->insertProduct(null);

        $this->artisan('sync:backfill-store-ids --apply')
            ->expectsOutputToContain('products: 2 unattributable, 0 attributed')
            ->assertSuccessful();

        $this->assertNull($this->storeIdOf('products', $ambiguous));
        $this->assertNull($this->storeIdOf('products', $orphan));
    }

    public function test_the_dry_run_writes_nothing(): void
    {
        $productId = $this->insertProduct($this->owner->id);

        $this->artisan('sync:backfill-store-ids')
            ->expectsOutputToContain('DRY RUN')
            ->expectsOutputToContain('products: 0 unattributable, 1 attributed')
            ->assertSuccessful();

        $this->assertNull($this->storeIdOf('products', $productId));
    }

    public function test_a_child_row_is_attributed_through_a_parent_filled_in_the_same_run(): void
    {
        $productId = $this->insertProduct($this->owner->id);
        $movementId = $this->insertMovement($productId);

        $this->artisan('sync:backfill-store-ids --apply')->assertSuccessful();

        $this->assertSame($this->store->id, $this->storeIdOf('stock_movements', $movementId));
    }

    /**
     * The dry run must forecast what --apply will do, which for a chained
     * table means resolving through a parent that --apply would have filled
     * first but a dry run leaves NULL.
     */
    public function test_the_dry_run_forecasts_a_chained_row_the_same_as_apply(): void
    {
        $productId = $this->insertProduct($this->owner->id);
        $this->insertMovement($productId);

        $this->artisan('sync:backfill-store-ids')
            ->expectsOutputToContain('stock_movements: 0 unattributable, 1 attributed')
            ->assertSuccessful();
    }

    /**
     * Forward protection: a table the cloud counts by its own `store_id`
     * column is one the pull filters the same way, so adding one without a
     * backfill entry reintroduces A-288 for it.
     */
    public function test_every_directly_scoped_agreement_table_has_a_derivation(): void
    {
        $parentScoped = ['stock_batches', 'sale_items', 'sale_item_batches', 'prescription_items', 'return_items', 'purchase_order_items'];
        $notNullable = ['permission_groups'];

        $agreement = (new \ReflectionClass(\App\Services\Admin\Concerns\CountsSyncedTableRows::class))
            ->getConstant('AGREEMENT_TABLES');

        $derivations = array_keys(
            (new \ReflectionClass(\App\Console\Commands\BackfillStoreIds::class))->getConstant('DERIVATIONS')
        );

        foreach (array_diff($agreement, $parentScoped, $notNullable) as $table) {
            $this->assertContains(
                $table,
                $derivations,
                "{$table} is counted and pulled by its own store_id but has no backfill derivation"
            );
        }
    }

    public function test_a_second_run_has_nothing_left_to_attribute(): void
    {
        $this->insertProduct($this->owner->id);

        $this->artisan('sync:backfill-store-ids --apply')->assertSuccessful();

        $this->artisan('sync:backfill-store-ids --apply')
            ->expectsOutputToContain('Nothing to attribute')
            ->assertSuccessful();
    }

    public function test_the_store_option_leaves_another_stores_rows_alone(): void
    {
        $mine = $this->insertProduct($this->owner->id);
        $otherOwner = $this->makeOwner('other');
        $otherStore = $this->makeStore($otherOwner, 'other-store');
        $theirs = $this->insertProduct($otherOwner->id);

        $this->artisan("sync:backfill-store-ids --apply --store={$otherStore->id}")->assertSuccessful();

        $this->assertNull($this->storeIdOf('products', $mine));
        $this->assertSame($otherStore->id, $this->storeIdOf('products', $theirs));
    }

    public function test_the_database_it_will_write_to_is_named_before_anything_else(): void
    {
        $this->artisan('sync:backfill-store-ids')
            ->expectsOutputToContain('Database:')
            ->assertSuccessful();
    }

    /** @return array<int, string> */
    private function pulledProductIds(): array
    {
        $changes = $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => []])
            ->assertOk()
            ->json('changes');

        return array_column($changes['products'] ?? [], 'id');
    }
}
