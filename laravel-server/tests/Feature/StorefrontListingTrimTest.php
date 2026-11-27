<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Product;
use App\Models\Role;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/**
 * When the online cap starts applying to a store listing more than it allows,
 * the most popular products stay listed once and the owner is told.
 */
class StorefrontListingTrimTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    private const CAP = 3;

    protected User $owner;

    protected Store $store;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->grantStoreUrlToEveryPlan();
        config(['storefront_entitlements.plans.pro.max_online_products' => self::CAP]);
        [$this->owner, $this->store] = $this->storefrontOwner('trimmed', 'pro', ['online_store_enabled' => false]);
        $this->admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin', 'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin', 'role_id' => Role::where('slug', 'super_admin')->first()?->id, 'is_active' => true,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function product(string $name, bool $listed = true): Product
    {
        return Product::create([
            'name' => $name, 'selling_price' => 100, 'is_active' => true, 'show_online' => $listed,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
    }

    private function sell(Product $product, int $units, int $daysAgo = 1, array $sale = [], bool $itemDeleted = false, bool $voided = false): void
    {
        $row = Sale::create([
            'cashier_id' => $this->owner->id, 'store_id' => $this->store->id, 'subtotal' => 100, 'total_amount' => 100,
            'amount_paid' => 100, 'payment_method' => 'cash', 'payment_status' => 'completed',
            'transaction_date' => now()->subDays($daysAgo), ...$sale,
        ]);
        $item = SaleItem::create(['sale_id' => $row->id, 'product_id' => $product->id, 'quantity' => $units, 'unit_price' => 100, 'total_price' => 100 * $units]);
        if ($itemDeleted) {
            $item->delete();
        }
        if ($voided) {
            $row->delete();
        }
    }

    private function switchOn(?Store $store = null)
    {
        return $this->actingAs($this->admin)->putJson('/api/v1/admin/stores/'.($store ?? $this->store)->id.'/storefront', ['enabled' => true])->assertOk();
    }

    /** @return array<int, string> */
    private function listedNames(): array
    {
        return Product::where('store_id', $this->store->id)->where('show_online', true)->orderBy('name')->pluck('name')->all();
    }

    public function test_switching_a_pro_storefront_on_keeps_the_best_sellers_and_tells_the_owner(): void
    {
        $products = collect(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])->mapWithKeys(fn ($name) => [$name => $this->product($name)]);
        $this->sell($products['Echo'], 40);
        $this->sell($products['Bravo'], 25);
        $this->sell($products['Delta'], 10);
        $this->sell($products['Alpha'], 2);
        $versionBefore = $products['Charlie']->_version;

        $this->switchOn();

        $this->assertSame(['Bravo', 'Delta', 'Echo'], $this->listedNames());
        $this->assertGreaterThan($versionBefore, $products['Charlie']->fresh()->_version);
        $this->assertNotNull($this->store->refresh()->storefront_dirty_at);
        $notice = Notification::where('user_id', $this->owner->id)->sole();
        $this->assertStringContainsString('2 products', $notice->message);
        $this->assertStringContainsString('3', $notice->message);
    }

    public function test_equal_sales_go_to_the_most_recent_sale_then_to_the_name(): void
    {
        $recent = $this->product('Zulu recent');
        $older = $this->product('Alpha older');
        $neverA = $this->product('Mike never');
        $neverB = $this->product('Kilo never');
        $this->sell($recent, 5, daysAgo: 2);
        $this->sell($older, 5, daysAgo: 20);

        $this->switchOn();

        $this->assertSame(['Alpha older', 'Kilo never', 'Zulu recent'], $this->listedNames());
        $this->assertFalse($neverA->fresh()->show_online);
        $this->assertTrue($neverB->fresh()->show_online);
    }

    public function test_only_real_sales_in_the_last_ninety_days_count(): void
    {
        $old = $this->product('Old favourite');
        $voided = $this->product('Voided');
        $refunded = $this->product('Refunded');
        $deletedLine = $this->product('Deleted line');
        $current = $this->product('Current');
        $slow = $this->product('Slow');
        $this->sell($old, 500, daysAgo: 120);
        $this->sell($voided, 500, voided: true);
        $this->sell($refunded, 500, sale: ['payment_status' => 'refunded']);
        $this->sell($deletedLine, 500, itemDeleted: true);
        $this->sell($current, 3);
        $this->sell($slow, 1, daysAgo: 60);

        $this->switchOn();

        $this->assertSame(['Current', 'Old favourite', 'Slow'], $this->listedNames());
    }

    public function test_the_trim_touches_only_show_online_never_pos_inventory(): void
    {
        foreach (range(1, 5) as $i) {
            $product = $this->product("Item {$i}");
            StockBatch::create([
                'product_id' => $product->id, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
                'batch_number' => "B{$i}", 'quantity' => 10, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
            ]);
        }

        $this->switchOn();

        $this->assertSame(5, Product::where('store_id', $this->store->id)->where('is_active', true)->count());
        $this->assertSame(50.0, (float) StockBatch::where('store_id', $this->store->id)->sum('quantity'));
        $this->assertCount(self::CAP, $this->listedNames());
    }

    public function test_it_runs_once_and_never_re_trims_a_store_that_fits(): void
    {
        foreach (range(1, 5) as $i) {
            $this->product("Item {$i}");
        }
        $this->switchOn();
        $this->actingAs($this->admin)->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => false])->assertOk();
        $this->switchOn();

        $this->assertCount(self::CAP, $this->listedNames());
        $this->assertSame(1, Notification::where('user_id', $this->owner->id)->count());
    }

    public function test_switching_on_a_store_within_the_cap_or_on_enterprise_changes_nothing(): void
    {
        foreach (range(1, 5) as $i) {
            $this->product("Item {$i}");
        }
        $this->owner->subscriptions()->update(['plan_name' => 'enterprise']);

        $this->switchOn();

        $this->assertCount(5, $this->listedNames());
        $this->assertSame(0, Notification::count());
    }

    public function test_an_ordinary_save_of_a_live_pro_store_does_not_trim(): void
    {
        $this->store->update(['online_store_enabled' => true]);
        foreach (range(1, 5) as $i) {
            $this->product("Item {$i}");
        }

        $this->store->update(['name' => 'Renamed shop']);
        $this->switchOn();

        $this->assertCount(5, $this->listedNames());
    }
}
