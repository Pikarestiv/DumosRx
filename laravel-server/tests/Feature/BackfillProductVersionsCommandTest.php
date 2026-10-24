<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-245's backfill half. Rationale and retirement condition in
 * laravel-server/AGENTS.md, "A raw update on a synced table must move
 * _version".
 */
class BackfillProductVersionsCommandTest extends TestCase
{
    use RefreshDatabase;

    private Store $storeA;

    private Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner-'.uniqid().'@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $owner->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'DRX-A',
        ]);
        $this->storeB = Store::create([
            'user_id' => $owner->id, 'name' => 'Store B',
            'store_slug' => 'store-b', 'device_id' => 'DRX-B',
        ]);
    }

    private function product(string $storeId, string $updatedAt, int $version = 7): Product
    {
        $product = new Product;
        $product->name = 'ITEM '.uniqid();
        $product->store_id = $storeId;
        $product->selling_price = 100;
        $product->save();

        DB::table('products')->where('id', $product->id)
            ->update(['updated_at' => $updatedAt, '_version' => $version]);

        return $product;
    }

    private function version(Product $product): int
    {
        return (int) DB::table('products')->where('id', $product->id)->value('_version');
    }

    public function test_a_dry_run_names_the_database_and_writes_nothing(): void
    {
        $product = $this->product($this->storeA->id, '2026-10-12 09:00:00');

        $this->artisan('sync:backfill-product-versions', ['--since' => '2026-10-12 00:00:00'])
            ->expectsOutputToContain(config('database.connections.'.config('database.default').'.database') ?: ':memory:')
            ->expectsOutputToContain('DRY RUN')
            ->assertSuccessful();

        $this->assertSame(7, $this->version($product));
    }

    public function test_apply_bumps_every_product_updated_in_the_window(): void
    {
        $inside = $this->product($this->storeA->id, '2026-10-12 09:00:00');
        $before = $this->product($this->storeA->id, '2026-10-11 09:00:00');
        $after = $this->product($this->storeA->id, '2026-10-13 09:00:00');

        $this->artisan('sync:backfill-product-versions', [
            '--since' => '2026-10-12 00:00:00',
            '--until' => '2026-10-12 23:59:59',
            '--apply' => true,
        ])->assertSuccessful();

        $this->assertSame(8, $this->version($inside));
        $this->assertSame(7, $this->version($before));
        $this->assertSame(7, $this->version($after));
    }

    public function test_the_store_option_limits_the_backfill_to_one_store(): void
    {
        $a = $this->product($this->storeA->id, '2026-10-12 09:00:00');
        $b = $this->product($this->storeB->id, '2026-10-12 09:00:00');

        $this->artisan('sync:backfill-product-versions', [
            '--since' => '2026-10-12 00:00:00',
            '--store' => $this->storeA->id,
            '--apply' => true,
        ])->assertSuccessful();

        $this->assertSame(8, $this->version($a));
        $this->assertSame(7, $this->version($b));
    }

    public function test_it_refuses_to_run_without_a_window(): void
    {
        $product = $this->product($this->storeA->id, '2026-10-12 09:00:00');

        $this->artisan('sync:backfill-product-versions', ['--apply' => true])
            ->assertFailed();

        $this->assertSame(7, $this->version($product));
    }

    public function test_a_null_version_becomes_one_rather_than_staying_null(): void
    {
        $product = $this->product($this->storeA->id, '2026-10-12 09:00:00');

        if (! $this->nullVersionIsStorable($product)) {
            $this->markTestSkipped('products._version is NOT NULL on this schema.');
        }

        $this->artisan('sync:backfill-product-versions', [
            '--since' => '2026-10-12 00:00:00',
            '--apply' => true,
        ])->assertSuccessful();

        $this->assertSame(1, $this->version($product));
    }

    private function nullVersionIsStorable(Product $product): bool
    {
        try {
            DB::table('products')->where('id', $product->id)->update(['_version' => null]);
        } catch (\Throwable) {
            return false;
        }

        return DB::table('products')->where('id', $product->id)->value('_version') === null;
    }
}
