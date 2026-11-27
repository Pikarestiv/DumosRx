<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Product;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/**
 * Enterprise storefront changes ship within the 15-minute run; Pro changes wait
 * for the daily run; a silent plan change is noticed through applied_plan.
 */
class StorefrontPlanRebuildScheduleTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->grantStoreUrlToEveryPlan();
        config([
            'dumos.github.token' => 'gh-test-token',
            'dumos.github.repo' => 'dumos/dumosrx',
            'dumos.storefront.rebuild_token' => null,
            'storefront_entitlements.plans.pro.max_online_products' => 3,
        ]);
        Http::fake(['api.github.com/*' => Http::response(null, 204)]);
    }

    /** @return array{0: User, 1: Store} */
    private function shop(string $slug, string $plan, ?string $applied = null): array
    {
        [$owner, $store] = $this->storefrontOwner($slug, $plan);
        $this->storefrontRow($owner, $store, ['applied_plan' => $applied ?? $plan]);

        return [$owner, $store];
    }

    private function clean(): void
    {
        DB::table('stores')->update(['storefront_dirty_at' => null]);
    }

    private function dirty(Store $store): void
    {
        DB::table('stores')->where('id', $store->id)->update(['storefront_dirty_at' => now()]);
    }

    private function isDirty(Store $store): bool
    {
        return DB::table('stores')->where('id', $store->id)->value('storefront_dirty_at') !== null;
    }

    public function test_the_quarter_hour_run_leaves_pro_only_changes_for_the_daily_run(): void
    {
        [, $pro] = $this->shop('pro-shop', 'pro');
        $this->clean();
        $this->dirty($pro);

        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();

        Http::assertNothingSent();
        $this->assertTrue($this->isDirty($pro));
    }

    public function test_an_enterprise_change_ships_now_and_carries_pending_pro_changes_with_it(): void
    {
        [, $pro] = $this->shop('pro-shop', 'pro');
        [, $enterprise] = $this->shop('enterprise-shop', 'enterprise');
        $this->clean();
        $this->dirty($pro);
        $this->dirty($enterprise);

        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();

        Http::assertSentCount(1);
        $this->assertFalse($this->isDirty($pro));
        $this->assertFalse($this->isDirty($enterprise));
    }

    public function test_the_daily_run_ships_pro_changes(): void
    {
        [, $pro] = $this->shop('pro-shop', 'pro');
        $this->clean();
        $this->dirty($pro);

        $this->artisan('storefront:rebuild-if-dirty', ['--include-scheduled' => true])->assertSuccessful();

        Http::assertSentCount(1);
        $this->assertFalse($this->isDirty($pro));
    }

    public function test_the_daily_run_is_scheduled_at_the_configured_lagos_time(): void
    {
        $daily = collect(app(Schedule::class)->events())
            ->first(fn ($event) => str_contains($event->command, 'storefront:rebuild-if-dirty --include-scheduled'));

        $this->assertNotNull($daily);
        $this->assertSame('0 3 * * *', $daily->expression);
        $this->assertSame('Africa/Lagos', $daily->timezone);
    }

    public function test_a_silent_downgrade_is_noticed_once_and_queues_the_store(): void
    {
        [$owner, $store] = $this->shop('downgraded', 'pro', applied: 'enterprise');
        $this->clean();

        $this->artisan('storefront:rebuild-if-dirty', ['--include-scheduled' => true])->assertSuccessful();

        $this->assertSame('pro', Storefront::where('user_id', $owner->id)->value('applied_plan'));
        Http::assertSentCount(1);

        $this->clean();
        $this->artisan('storefront:rebuild-if-dirty', ['--include-scheduled' => true])->assertSuccessful();
        $this->assertFalse($this->isDirty($store));
        Http::assertSentCount(1);
    }

    public function test_a_lapse_after_the_grace_period_is_noticed(): void
    {
        [$owner, $store] = $this->shop('lapsing', 'enterprise');
        $owner->subscriptions()->update(['end_date' => now()->subDays(10)]);
        $this->clean();

        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();

        $this->assertSame('free', Storefront::where('user_id', $owner->id)->value('applied_plan'));
        $this->assertTrue($this->isDirty($store));
    }

    public function test_a_downgrade_to_a_capped_plan_trims_the_listing_once(): void
    {
        [$owner, $store] = $this->shop('was-enterprise', 'pro', applied: 'enterprise');
        foreach (range(1, 5) as $i) {
            Product::create(['name' => "Item {$i}", 'selling_price' => 10, 'is_active' => true, 'user_id' => $owner->id, 'store_id' => $store->id]);
        }

        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();
        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();

        $this->assertSame(3, Product::where('store_id', $store->id)->where('show_online', true)->count());
        $this->assertSame(1, Notification::where('user_id', $owner->id)->count());
    }

    public function test_a_storefront_from_before_plans_mattered_is_recorded_without_a_rebuild(): void
    {
        [$owner, $store] = $this->storefrontOwner('legacy', 'enterprise');
        $this->storefrontRow($owner, $store);
        $this->clean();

        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();

        $this->assertSame('enterprise', Storefront::where('user_id', $owner->id)->value('applied_plan'));
        $this->assertFalse($this->isDirty($store));
        Http::assertNothingSent();
    }
}
