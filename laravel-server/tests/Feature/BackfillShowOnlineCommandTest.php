<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BackfillShowOnlineCommandTest extends TestCase
{
    use RefreshDatabase;

    private const OLD_STAMP = '2026-10-01 08:00:00';

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Backfill',
            'email' => 'backfill-'.uniqid().'@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Backfill Store',
            'store_slug' => 'backfill-store', 'device_id' => 'DRX-BACKFILL',
            'online_store_enabled' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function hiddenProduct(array $attrs = []): string
    {
        $product = Product::create(array_merge([
            'name' => 'ITEM '.uniqid(),
            'selling_price' => 100,
            'is_active' => true,
            'is_controlled' => false,
            'show_online' => false,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
        ], $attrs));

        DB::table('products')->where('id', $product->id)
            ->update(['updated_at' => self::OLD_STAMP, '_version' => 4]);
        DB::table('stores')->update(['storefront_dirty_at' => null]);

        return $product->id;
    }

    private function row(string $id): object
    {
        return DB::table('products')->where('id', $id)->first();
    }

    public function test_a_new_product_is_shown_online_by_default(): void
    {
        $product = Product::create([
            'name' => 'Default', 'selling_price' => 100,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);

        $this->assertTrue((bool) $this->row($product->id)->show_online);
        $this->assertNotNull(DB::table('stores')->where('id', $this->store->id)->value('storefront_dirty_at'));
    }

    public function test_a_raw_insert_without_show_online_defaults_to_shown(): void
    {
        DB::table('products')->insert([
            'id' => 'raw-insert', 'name' => 'Raw', 'selling_price' => 100,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);

        $this->assertTrue((bool) $this->row('raw-insert')->show_online);
    }

    public function test_it_shows_active_uncontrolled_live_products_only(): void
    {
        $eligible = $this->hiddenProduct();
        $controlled = $this->hiddenProduct(['is_controlled' => true]);
        $inactive = $this->hiddenProduct(['is_active' => false]);
        $trashed = $this->hiddenProduct();
        DB::table('products')->where('id', $trashed)->update(['deleted_at' => self::OLD_STAMP]);

        $this->artisan('products:backfill-show-online')
            ->expectsOutputToContain('Updated 1 product(s)')
            ->assertSuccessful();

        $this->assertTrue((bool) $this->row($eligible)->show_online);
        $this->assertFalse((bool) $this->row($controlled)->show_online);
        $this->assertFalse((bool) $this->row($inactive)->show_online);
        $this->assertFalse((bool) $this->row($trashed)->show_online);
    }

    public function test_it_leaves_version_untouched_and_moves_updated_at_forward_in_utc(): void
    {
        $id = $this->hiddenProduct();
        Carbon::setTestNow(Carbon::parse('2026-11-02 12:34:56', 'UTC'));

        $this->artisan('products:backfill-show-online')->assertSuccessful();

        $row = $this->row($id);
        $this->assertSame(4, (int) $row->_version);
        $this->assertSame('2026-11-02 12:34:56', Carbon::parse($row->updated_at)->format('Y-m-d H:i:s'));
        $this->assertTrue(Carbon::parse($row->updated_at)->gt(Carbon::parse(self::OLD_STAMP)));
    }

    public function test_it_stamps_the_storefront_dirty_once_it_has_written(): void
    {
        $this->hiddenProduct();

        $this->artisan('products:backfill-show-online')->assertSuccessful();

        $this->assertNotNull(DB::table('stores')->where('id', $this->store->id)->value('storefront_dirty_at'));
    }

    public function test_a_dry_run_counts_and_writes_nothing(): void
    {
        $id = $this->hiddenProduct();

        $this->artisan('products:backfill-show-online', ['--dry-run' => true])
            ->expectsOutputToContain('DRY RUN')
            ->expectsOutputToContain('Would update 1 product(s)')
            ->assertSuccessful();

        $row = $this->row($id);
        $this->assertFalse((bool) $row->show_online);
        $this->assertSame(self::OLD_STAMP, Carbon::parse($row->updated_at)->format('Y-m-d H:i:s'));
        $this->assertNull(DB::table('stores')->where('id', $this->store->id)->value('storefront_dirty_at'));
    }

    public function test_it_walks_more_than_one_chunk(): void
    {
        $ids = [];
        for ($i = 0; $i < 3; $i++) {
            $ids[] = $this->hiddenProduct();
        }

        $this->artisan('products:backfill-show-online', ['--chunk' => 2])
            ->expectsOutputToContain('Updated 3 product(s)')
            ->assertSuccessful();

        foreach ($ids as $id) {
            $this->assertTrue((bool) $this->row($id)->show_online);
        }
    }
}
