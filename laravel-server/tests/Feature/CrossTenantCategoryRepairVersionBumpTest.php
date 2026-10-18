<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Sync\CrossTenantCategoryRepairService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-245. Rationale in laravel-server/AGENTS.md, "A raw update on a synced
 * table must move _version".
 */
class CrossTenantCategoryRepairVersionBumpTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $storeA;

    private Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner-'.uniqid().'@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'owner-'.uniqid().'@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'DRX-A', 'currency' => 'NGN',
        ]);
        $this->storeB = Store::create([
            'user_id' => $ownerB->id, 'name' => 'Store B',
            'store_slug' => 'store-b', 'device_id' => 'DRX-B', 'currency' => 'NGN',
        ]);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => [
                'features' => ['cloud_sync' => true],
                'limits' => ['stores' => -1],
            ]],
        ]);

        $this->withoutMiddleware();
    }

    private function category(string $name, ?string $storeId): Category
    {
        $category = new Category();
        $category->name = $name;
        $category->store_id = $storeId;
        $category->is_active = true;
        $category->save();

        return $category;
    }

    private function product(?string $storeId, ?string $categoryId): Product
    {
        $product = new Product();
        $product->name = 'PARACETAMOL';
        $product->store_id = $storeId;
        $product->category_id = $categoryId;
        $product->selling_price = 100;
        $product->save();

        return $product;
    }

    private function pushStaleCopy(Product $product, string $staleCategoryId, int $version)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'products',
                'operation' => 'UPDATE',
                'record_id' => $product->id,
                'payload' => [
                    'id' => $product->id,
                    'name' => 'PARACETAMOL',
                    'store_id' => $this->storeA->id,
                    'category_id' => $staleCategoryId,
                    'selling_price' => 100,
                    '_version' => $version,
                    '_synced' => 0,
                    'updated_at' => now()->toDateTimeString(),
                ],
            ]],
        ]);
    }

    public function test_a_stale_equal_version_push_cannot_revert_the_repair(): void
    {
        $foreign = $this->category('drugs', $this->storeB->id);
        $product = $this->product($this->storeA->id, $foreign->id);
        $versionDevicesHold = (int) $product->refresh()->_version;

        app(CrossTenantCategoryRepairService::class)->apply();
        $repairedCategoryId = $product->refresh()->category_id;
        $this->assertNotSame($foreign->id, $repairedCategoryId);

        $response = $this->pushStaleCopy($product, $foreign->id, $versionDevicesHold);
        $response->assertStatus(200);

        $this->assertSame(
            $repairedCategoryId,
            DB::table('products')->where('id', $product->id)->value('category_id'),
            'A device still holding the pre-repair version must not write its stale category back.',
        );
        $response->assertJsonCount(1, 'failed');
    }

    public function test_the_repair_moves_the_version_forward(): void
    {
        $foreign = $this->category('drugs', $this->storeB->id);
        $product = $this->product($this->storeA->id, $foreign->id);
        $before = (int) $product->refresh()->_version;

        app(CrossTenantCategoryRepairService::class)->apply();

        $this->assertSame($before + 1, (int) $product->refresh()->_version);
    }

    public function test_a_dry_run_leaves_the_version_alone(): void
    {
        $foreign = $this->category('drugs', $this->storeB->id);
        $product = $this->product($this->storeA->id, $foreign->id);
        $before = (int) $product->refresh()->_version;

        app(CrossTenantCategoryRepairService::class)->preview();

        $this->assertSame($before, (int) $product->refresh()->_version);
    }
}
