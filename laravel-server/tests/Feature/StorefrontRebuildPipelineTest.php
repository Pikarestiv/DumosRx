<?php

namespace Tests\Feature;

use App\Console\Commands\RebuildStorefrontIfDirty;
use App\Models\Product;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The storefront rebuild loop end to end, minus GitHub itself:
 * Product/Store changes stamp storefront_dirty_at, the scheduled command
 * dispatches at most one rebuild, and the flags survive until the deploy
 * confirms. Both halves used to be wrong (docs/STOREFRONT_REVIEW.md,
 * SF-P2-2/SF-P2-3): only online_store_enabled/store_slug dirtied anything, and
 * the flags were cleared the instant GitHub accepted the dispatch, so a failed
 * build lost the pending rebuild permanently.
 */
class StorefrontRebuildPipelineTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'dumos.github.token' => 'gh-test-token',
            'dumos.github.repo' => 'dumos/dumosrx',
            'dumos.storefront.rebuild_token' => 'rebuild-secret',
            'dumos.storefront.rebuild_confirmation_timeout' => 45,
        ]);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Rebuild',
            'email' => 'rebuild-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Rebuild Store',
            'store_slug' => 'rebuild-store', 'device_id' => 'WEB-REBUILD',
            'online_store_enabled' => true,
        ]);

        $this->clearDirtyFlags();
    }

    private function clearDirtyFlags(): void
    {
        DB::table('stores')->update(['storefront_dirty_at' => null]);
    }

    private function dirtyAt(): ?string
    {
        return DB::table('stores')->where('id', $this->store->id)->value('storefront_dirty_at');
    }

    private function makeProduct(array $attrs = []): Product
    {
        return Product::create(array_merge([
            'name' => 'Paracetamol',
            'selling_price' => 100,
            'is_active' => true,
            'show_online' => true,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
        ], $attrs));
    }

    public function test_creating_a_product_shown_online_dirties_the_storefront()
    {
        $this->makeProduct();

        $this->assertNotNull($this->dirtyAt());
    }

    public function test_creating_a_product_hidden_from_the_storefront_does_not_dirty_it()
    {
        $this->makeProduct(['show_online' => false]);

        $this->assertNull($this->dirtyAt());
    }

    public function test_a_price_change_dirties_the_storefront()
    {
        $product = $this->makeProduct();
        $this->clearDirtyFlags();

        $product->update(['selling_price' => 250]);

        $this->assertNotNull($this->dirtyAt());
    }

    public function test_an_unpublished_field_change_does_not_dirty_the_storefront()
    {
        $product = $this->makeProduct();
        $this->clearDirtyFlags();

        $product->update(['reorder_level' => 42]);

        $this->assertNull($this->dirtyAt());
    }

    public function test_deleting_a_published_product_dirties_the_storefront()
    {
        $product = $this->makeProduct();
        $this->clearDirtyFlags();

        $product->delete();

        $this->assertNotNull($this->dirtyAt());
    }

    public function test_a_product_change_does_not_dirty_a_store_with_no_online_store()
    {
        $offlineOwner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Offline',
            'email' => 'rebuild-offline@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $offlineStore = Store::create([
            'user_id' => $offlineOwner->id, 'name' => 'Offline Store',
            'device_id' => 'WEB-OFFLINE', 'online_store_enabled' => false,
        ]);
        $this->clearDirtyFlags();

        Product::create([
            'name' => 'Offline product', 'selling_price' => 100, 'is_active' => true,
            'show_online' => true, 'user_id' => $offlineOwner->id, 'store_id' => $offlineStore->id,
        ]);

        $this->assertNull(
            DB::table('stores')->where('id', $offlineStore->id)->value('storefront_dirty_at'),
        );
    }

    public function test_the_command_keeps_the_flags_dirty_until_the_deploy_confirms()
    {
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->makeProduct();

        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);

        $this->assertNotNull($this->dirtyAt(), 'The flag was cleared on dispatch acceptance.');
        $this->assertNotNull(SystemConfig::getVal(RebuildStorefrontIfDirty::REQUESTED_AT_KEY));
    }

    public function test_the_command_does_not_dispatch_again_while_a_rebuild_is_unconfirmed()
    {
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->makeProduct();

        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);
        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);

        Http::assertSentCount(1);
    }

    public function test_the_command_re_dispatches_once_an_unconfirmed_rebuild_has_timed_out()
    {
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->makeProduct();

        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);

        SystemConfig::setVal(
            RebuildStorefrontIfDirty::REQUESTED_AT_KEY,
            now()->subHours(2)->toIso8601String(),
        );

        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);

        Http::assertSentCount(2);
    }

    public function test_the_command_falls_back_to_clearing_on_dispatch_when_no_token_is_configured()
    {
        config(['dumos.storefront.rebuild_token' => null]);
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->makeProduct();

        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);

        $this->assertNull($this->dirtyAt());
    }

    public function test_the_callback_clears_flags_dirtied_before_the_rebuild_was_requested()
    {
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->makeProduct();
        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);

        $response = $this->withHeaders(['X-Storefront-Rebuild-Token' => 'rebuild-secret'])
            ->postJson('/api/v1/internal/storefront/rebuild-complete');

        $response->assertStatus(200);
        $response->assertJsonPath('cleared', 1);
        $this->assertNull($this->dirtyAt());
        $this->assertNull(SystemConfig::getVal(RebuildStorefrontIfDirty::REQUESTED_AT_KEY));
    }

    public function test_the_callback_leaves_changes_made_during_the_build_dirty()
    {
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $product = $this->makeProduct();
        $this->artisan('storefront:rebuild-if-dirty')->assertExitCode(0);

        // A change landing after the dispatch didn't make it into the build
        // that is now reporting success, so it must survive the callback.
        $this->travel(5)->minutes();
        $product->update(['selling_price' => 999]);

        $this->withHeaders(['X-Storefront-Rebuild-Token' => 'rebuild-secret'])
            ->postJson('/api/v1/internal/storefront/rebuild-complete')
            ->assertStatus(200);

        $this->assertNotNull($this->dirtyAt());
    }

    public function test_the_callback_rejects_a_wrong_token()
    {
        $this->withHeaders(['X-Storefront-Rebuild-Token' => 'not-the-secret'])
            ->postJson('/api/v1/internal/storefront/rebuild-complete')
            ->assertStatus(401);
    }

    public function test_the_callback_rejects_a_missing_token()
    {
        $this->postJson('/api/v1/internal/storefront/rebuild-complete')->assertStatus(401);
    }

    public function test_the_callback_is_unavailable_when_no_token_is_configured()
    {
        config(['dumos.storefront.rebuild_token' => null]);

        $this->postJson('/api/v1/internal/storefront/rebuild-complete')->assertStatus(503);
    }
}
