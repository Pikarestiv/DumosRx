<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/** A Pro storefront lists at most max_online_products; the sync push enforces it without touching POS inventory. */
class StorefrontOnlineListingCapTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    private const CAP = 3;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        config(['storefront_entitlements.plans.pro.max_online_products' => self::CAP]);
        SystemConfig::setVal('subscription_plans', ['tiers' => collect(['pro', 'enterprise'])->mapWithKeys(fn ($plan) => [
            $plan => ['features' => ['store_url' => true, 'cloud_sync' => true], 'limits' => ['stores' => -1]],
        ])->all()]);
        [$this->owner, $this->store] = $this->storefrontOwner('capped', 'pro');

        $this->withoutMiddleware();
    }

    private function product(bool $listed = true, ?Store $store = null): Product
    {
        return Product::create([
            'name' => 'Item '.Str::random(5), 'selling_price' => 100, 'is_active' => true, 'show_online' => $listed,
            'user_id' => $this->owner->id, 'store_id' => ($store ?? $this->store)->id,
        ]);
    }

    private function push(string $operation, string $id, array $payload, ?Store $store = null)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'changes' => [['table_name' => 'products', 'operation' => $operation, 'record_id' => $id, 'payload' => ['id' => $id, ...$payload]]],
        ], ['X-Store-Id' => ($store ?? $this->store)->id])->assertOk();
    }

    private function insert(bool $listed, ?Store $store = null): Product
    {
        $id = (string) Str::uuid();
        $this->push('INSERT', $id, [
            'name' => 'New '.$id, 'selling_price' => 50, 'is_active' => 1, 'show_online' => $listed ? 1 : 0,
            'user_id' => $this->owner->id, 'store_id' => ($store ?? $this->store)->id,
        ], $store);

        return Product::findOrFail($id);
    }

    private function fillToCap(): void
    {
        foreach (range(1, self::CAP) as $ignored) {
            $this->product();
        }
    }

    public function test_a_new_product_is_listed_while_there_is_room(): void
    {
        $this->product();

        $this->assertTrue($this->insert(true)->show_online);
    }

    public function test_a_new_listed_product_past_the_cap_is_kept_off_the_storefront_and_versioned_for_the_till(): void
    {
        $this->fillToCap();

        $created = $this->insert(true);

        $this->assertFalse($created->show_online);
        $this->assertGreaterThan(1, $created->_version);
        $this->assertSame(self::CAP, Product::where('store_id', $this->store->id)->where('show_online', true)->count());
    }

    public function test_turning_a_product_on_past_the_cap_is_refused_and_the_till_pulls_it_back_off(): void
    {
        $this->fillToCap();
        $hidden = $this->product(listed: false);
        $version = $hidden->_version;

        $response = $this->push('UPDATE', $hidden->id, ['show_online' => 1, 'name' => 'Renamed', '_version' => $version]);

        $fresh = $hidden->fresh();
        $this->assertFalse($fresh->show_online);
        $this->assertSame('Renamed', $fresh->name);
        $this->assertGreaterThan($response->json('versions.products.'.$hidden->id), $fresh->_version);
    }

    public function test_an_already_listed_product_keeps_its_place_when_edited_at_the_cap(): void
    {
        $this->fillToCap();
        $listed = Product::where('store_id', $this->store->id)->first();

        $this->push('UPDATE', $listed->id, ['selling_price' => 999, 'show_online' => 1, '_version' => $listed->_version]);

        $this->assertTrue($listed->fresh()->show_online);
        $this->assertSame('999.00', $listed->fresh()->selling_price);
    }

    public function test_turning_one_off_frees_a_slot_for_another(): void
    {
        $this->fillToCap();
        $hidden = $this->product(listed: false);
        $leaving = Product::where('store_id', $this->store->id)->where('show_online', true)->first();

        $this->push('UPDATE', $leaving->id, ['show_online' => 0, '_version' => $leaving->_version]);
        $this->push('UPDATE', $hidden->id, ['show_online' => 1, '_version' => $hidden->_version]);

        $this->assertTrue($hidden->fresh()->show_online);
    }

    public function test_hidden_pos_inventory_never_counts_toward_the_cap(): void
    {
        foreach (range(1, 10) as $ignored) {
            $this->product(listed: false);
        }

        $this->assertTrue($this->insert(true)->show_online);
        $this->assertFalse($this->insert(false)->show_online);
        $this->assertSame(12, Product::where('store_id', $this->store->id)->count());
    }

    public function test_the_cap_is_per_store(): void
    {
        $this->fillToCap();
        $branch = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Branch', 'device_id' => 'DEV-branch', 'status' => 'Active', 'online_store_enabled' => true,
        ]);

        $this->assertTrue($this->insert(true, $branch)->show_online);
    }

    public function test_enterprise_has_no_cap(): void
    {
        $this->owner->subscriptions()->update(['plan_name' => 'enterprise']);
        $this->fillToCap();

        $this->assertTrue($this->insert(true)->show_online);
    }

    public function test_a_pro_store_whose_storefront_is_off_is_not_capped(): void
    {
        $this->store->update(['online_store_enabled' => false]);
        $this->fillToCap();

        $this->assertTrue($this->insert(true)->show_online);
    }
}
