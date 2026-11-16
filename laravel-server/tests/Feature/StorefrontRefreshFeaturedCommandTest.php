<?php

namespace Tests\Feature;

use App\Console\Commands\RebuildStorefrontIfDirty;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class StorefrontRefreshFeaturedCommandTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    private Store $quietStore;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'dumos.github.token' => 'gh-test-token',
            'dumos.github.repo' => 'dumos/dumosrx',
            'dumos.storefront.rebuild_token' => 'rebuild-secret',
            'dumos.storefront.rebuild_confirmation_timeout' => 45,
        ]);
        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
        ]);

        $this->owner = $this->owner('busy');
        $this->store = $this->publishedStore($this->owner, 'busy-store');
        $this->quietStore = $this->publishedStore($this->owner('quiet'), 'quiet-store');

        foreach (['Aspirin', 'Bandage', 'Cetirizine'] as $name) {
            $this->product($this->store, $name);
            $this->product($this->quietStore, $name);
        }

        $this->artisan('storefront:refresh-featured')->assertSuccessful();
        $this->clearDirtyFlags();
    }

    private function owner(string $tag): User
    {
        return User::create([
            'first_name' => 'Owner', 'last_name' => ucfirst($tag),
            'email' => "{$tag}-featured@dumosrx.com", 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    private function publishedStore(User $owner, string $slug): Store
    {
        return Store::create([
            'user_id' => $owner->id, 'name' => $slug,
            'store_slug' => $slug, 'device_id' => 'WEB-'.$slug,
            'online_store_enabled' => true,
        ]);
    }

    private function product(Store $store, string $name): Product
    {
        return Product::create([
            'name' => $name, 'selling_price' => 100, 'is_active' => true,
            'user_id' => $store->user_id, 'store_id' => $store->id,
        ]);
    }

    private function sell(Store $store, string $productName, int $units): void
    {
        $product = Product::where('store_id', $store->id)->where('name', $productName)->firstOrFail();
        $sale = Sale::create([
            'cashier_id' => $store->user_id, 'store_id' => $store->id,
            'subtotal' => $units * 100, 'total_amount' => $units * 100, 'amount_paid' => $units * 100,
            'payment_method' => 'cash', 'payment_status' => 'completed',
            'transaction_date' => now()->subHour(),
        ]);
        SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => $product->id,
            'quantity' => $units, 'unit_price' => 100, 'total_price' => $units * 100,
        ]);
    }

    private function clearDirtyFlags(): void
    {
        DB::table('stores')->update(['storefront_dirty_at' => null]);
    }

    private function dirtyAt(Store $store): ?string
    {
        return DB::table('stores')->where('id', $store->id)->value('storefront_dirty_at');
    }

    public function test_a_quiet_night_marks_no_storefront_dirty(): void
    {
        $this->artisan('storefront:refresh-featured')->assertSuccessful();

        $this->assertSame(0, DB::table('stores')->whereNotNull('storefront_dirty_at')->count());
    }

    public function test_only_a_store_whose_featured_products_changed_is_marked_dirty(): void
    {
        $this->sell($this->store, 'Cetirizine', 4);

        $this->artisan('storefront:refresh-featured')->assertSuccessful();

        $this->assertNotNull($this->dirtyAt($this->store));
        $this->assertNull($this->dirtyAt($this->quietStore));
    }

    public function test_a_second_run_with_no_new_sales_marks_nothing_again(): void
    {
        $this->sell($this->store, 'Cetirizine', 4);
        $this->artisan('storefront:refresh-featured')->assertSuccessful();
        $this->clearDirtyFlags();

        $this->artisan('storefront:refresh-featured')->assertSuccessful();

        $this->assertSame(0, DB::table('stores')->whereNotNull('storefront_dirty_at')->count());
    }

    public function test_a_store_without_a_published_storefront_is_never_marked(): void
    {
        $unpublished = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Back Office',
            'device_id' => 'WEB-BACK', 'online_store_enabled' => false,
        ]);
        $this->product($unpublished, 'Zinc');
        $this->sell($unpublished, 'Zinc', 9);

        $this->artisan('storefront:refresh-featured')->assertSuccessful();

        $this->assertNull($this->dirtyAt($unpublished));
    }

    public function test_a_change_found_while_a_rebuild_is_unconfirmed_waits_for_the_next_rebuild(): void
    {
        Http::fake(['api.github.com/*' => Http::response(null, 204)]);
        DB::table('stores')->where('id', $this->quietStore->id)->update(['storefront_dirty_at' => now()]);
        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();
        Http::assertSentCount(1);

        $this->travel(5)->minutes();
        $this->sell($this->store, 'Cetirizine', 4);
        $this->artisan('storefront:refresh-featured')->assertSuccessful();
        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();
        Http::assertSentCount(1);

        $this->withHeader('X-Storefront-Rebuild-Token', 'rebuild-secret')
            ->postJson('/api/v1/internal/storefront/rebuild-complete')
            ->assertOk();

        $this->assertNull($this->dirtyAt($this->quietStore));
        $this->assertNotNull($this->dirtyAt($this->store));
        $this->assertNull(SystemConfig::getVal(RebuildStorefrontIfDirty::REQUESTED_AT_KEY));
    }

    public function test_the_refresh_is_scheduled_nightly_at_23_00_lagos_time_without_overlap(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn (Event $event) => str_contains((string) $event->command, 'storefront:refresh-featured'));

        $this->assertCount(1, $events);
        $event = $events->first();
        $this->assertSame('0 23 * * *', $event->expression);
        $this->assertSame('Africa/Lagos', $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
    }
}
