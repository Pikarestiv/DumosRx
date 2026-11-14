<?php

namespace Tests\Feature;

use App\Http\Resources\StorefrontProductResource;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProductImageSyncTest extends TestCase
{
    use RefreshDatabase;

    private const KEY = 'stores/s/products/p/11111111-1111-1111-1111-111111111111.webp';

    private User $owner;

    private Store $store;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A', 'store_slug' => 'store-a', 'device_id' => 'WEB-A',
        ]);
        $this->product = Product::create([
            'name' => 'panadol', 'selling_price' => 100, 'user_id' => $this->owner->id,
            'store_id' => $this->store->id, 'image_key' => self::KEY,
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);
        config(['product_images.enabled' => true, 'product_images.public_base_url' => 'https://img.example.test/']);

        $this->withoutMiddleware();
    }

    private function pushProductUpdate(array $fields): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'changes' => [[
                'table_name' => 'products', 'operation' => 'UPDATE', 'record_id' => $this->product->id,
                'payload' => ['id' => $this->product->id, '_version' => $this->product->fresh()->_version] + $fields,
            ]],
        ], ['X-Store-Id' => $this->store->id])->assertOk();
    }

    public function test_pull_exposes_image_key_on_products(): void
    {
        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/pull', ['last_synced' => []], ['X-Store-Id' => $this->store->id]);

        $response->assertOk();
        $row = collect($response->json('changes.products'))->firstWhere('id', $this->product->id);
        $this->assertSame(self::KEY, $row['image_key']);
    }

    public function test_a_pushed_image_key_is_ignored_but_the_rest_of_the_edit_applies(): void
    {
        $this->pushProductUpdate(['name' => 'panadol extra', 'image_key' => 'stores/other/products/x/forged.webp']);

        $fresh = $this->product->fresh();
        $this->assertSame('panadol extra', $fresh->name);
        $this->assertSame(self::KEY, $fresh->image_key);
    }

    public function test_a_pushed_null_image_key_from_a_stale_whole_row_requeue_does_not_clear_it(): void
    {
        $this->pushProductUpdate(['selling_price' => 150, 'image_key' => null]);

        $this->assertSame(self::KEY, $this->product->fresh()->image_key);
    }

    public function test_storefront_resource_derives_the_public_url(): void
    {
        $data = (new StorefrontProductResource($this->product))->toArray(new Request);

        $this->assertSame('https://img.example.test/'.self::KEY, $data['image_url']);
    }

    public function test_storefront_resource_hides_the_url_while_the_feature_is_off(): void
    {
        config(['product_images.enabled' => false]);

        $data = (new StorefrontProductResource($this->product))->toArray(new Request);

        $this->assertNull($data['image_url']);
    }

    public function test_storefront_resource_reports_null_for_a_product_without_an_image(): void
    {
        DB::table('products')->where('id', $this->product->id)->update(['image_key' => null]);

        $data = (new StorefrontProductResource($this->product->fresh()))->toArray(new Request);

        $this->assertNull($data['image_url']);
    }

    public function test_changing_the_image_marks_a_publishing_storefront_dirty(): void
    {
        DB::table('stores')->where('id', $this->store->id)->update(['online_store_enabled' => true, 'storefront_dirty_at' => null]);

        $this->product->forceFill(['image_key' => null])->save();

        $this->assertNotNull($this->store->fresh()->storefront_dirty_at);
    }
}
