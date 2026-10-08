<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminCatalogStandardizeTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected Store $storeA;

    protected Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->storeA = $this->makeStore('Store A');
        $this->storeB = $this->makeStore('Store B');

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeStore(string $name): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'name' => $name,
            'user_id' => $owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);
    }

    private function makeBlankProduct(Store $store, string $name): Product
    {
        return Product::create([
            'store_id' => $store->id,
            'name' => $name,
            'generic_name' => null,
            'manufacturer' => '',
            'selling_price' => 100,
            'user_id' => $store->user_id,
            'is_active' => true,
        ]);
    }

    #[Test]
    public function a_dry_run_writes_nothing_but_reports_the_count(): void
    {
        $product = $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $originalUpdatedAt = $product->updated_at;

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/products/standardize', ['dry_run' => true]);

        $response->assertOk()
            ->assertJsonPath('dry_run', true);

        $this->assertGreaterThan(0, $response->json('count'));

        $fresh = $product->fresh();
        $this->assertNull($fresh->generic_name);
        $this->assertSame('', $fresh->manufacturer);
        $this->assertEquals($originalUpdatedAt, $fresh->updated_at);
    }

    #[Test]
    public function the_dry_run_count_matches_what_the_real_run_affects(): void
    {
        $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $this->makeBlankProduct($this->storeB, 'Ibuprofen');

        $dry = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/products/standardize', ['dry_run' => true])
            ->json('count');

        $real = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/products/standardize', ['dry_run' => false])
            ->json('count');

        $this->assertSame($dry, $real);
    }

    #[Test]
    public function a_real_run_backfills_both_blank_fields(): void
    {
        $product = $this->makeBlankProduct($this->storeA, 'Paracetamol');

        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/products/standardize', ['dry_run' => false])
            ->assertOk();

        $fresh = $product->fresh();
        $this->assertSame('General', $fresh->generic_name);
        $this->assertSame('Unknown', $fresh->manufacturer);
    }

    #[Test]
    public function it_leaves_populated_fields_alone(): void
    {
        $product = Product::create([
            'store_id' => $this->storeA->id,
            'name' => 'Amoxicillin',
            'generic_name' => 'Amoxicillin trihydrate',
            'manufacturer' => 'Emzor',
            'selling_price' => 100,
            'user_id' => $this->storeA->user_id,
            'is_active' => true,
        ]);
        $originalUpdatedAt = $product->updated_at;

        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/products/standardize', ['dry_run' => false])
            ->assertOk();

        $fresh = $product->fresh();
        $this->assertSame('Amoxicillin trihydrate', $fresh->generic_name);
        $this->assertSame('Emzor', $fresh->manufacturer);
        $this->assertEquals($originalUpdatedAt, $fresh->updated_at);
    }

    #[Test]
    public function a_scoped_run_touches_only_the_named_store(): void
    {
        $inScope = $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $outOfScope = $this->makeBlankProduct($this->storeB, 'Ibuprofen');

        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/products/standardize', [
                'dry_run' => false,
                'store_id' => $this->storeA->id,
            ])
            ->assertOk()
            ->assertJsonPath('store_id', $this->storeA->id);

        $this->assertSame('General', $inScope->fresh()->generic_name);
        $this->assertSame('Unknown', $inScope->fresh()->manufacturer);
        $this->assertNull($outOfScope->fresh()->generic_name);
        $this->assertSame('', $outOfScope->fresh()->manufacturer);
    }

    #[Test]
    public function an_unscoped_run_is_cross_tenant(): void
    {
        $a = $this->makeBlankProduct($this->storeA, 'Paracetamol');
        $b = $this->makeBlankProduct($this->storeB, 'Ibuprofen');

        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/products/standardize', ['dry_run' => false])
            ->assertOk();

        $this->assertSame('General', $a->fresh()->generic_name);
        $this->assertSame('Unknown', $a->fresh()->manufacturer);
        $this->assertSame('General', $b->fresh()->generic_name);
        $this->assertSame('Unknown', $b->fresh()->manufacturer);
    }

    #[Test]
    public function it_rejects_a_non_super_admin(): void
    {
        $platformAdmin = User::create([
            'first_name' => 'Platform',
            'last_name' => 'Admin',
            'email' => 'platform@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);

        $product = $this->makeBlankProduct($this->storeA, 'Paracetamol');

        $this->actingAs($platformAdmin)
            ->postJson('/api/v1/admin/products/standardize', ['dry_run' => false])
            ->assertForbidden();

        $this->assertNull($product->fresh()->generic_name);
    }
}
