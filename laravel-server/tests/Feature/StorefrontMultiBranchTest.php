<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontMultiBranchTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Store $branchLekki;
    private Store $branchIkeja;
    private Storefront $storefront;

    protected function setUp(): void
    {
        parent::setUp();

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'enterprise' => ['features' => ['store_url' => true]],
                'free' => ['features' => ['store_url' => true]],
            ],
        ]);

        $this->owner = User::create([
            'first_name' => 'Nest',
            'last_name' => 'Owner',
            'email' => 'nest-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Subscription::create([
            'user_id' => $this->owner->id,
            'plan_name' => 'enterprise',
            'status' => 'active',
            'license_key' => 'LIC-'.uniqid(),
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
        ]);

        $this->branchLekki = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Nest Pharmacy Lekki',
            'store_slug' => 'nest-lekki',
            'online_store_enabled' => true,
            'location' => 'Lekki Phase 1',
            'address' => '10 Admiralty Way, Lekki',
            'phone' => '08011111111',
            'currency' => 'NGN',
            'device_id' => 'DEVICE-LEKKI-01',
        ]);

        $this->branchIkeja = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Nest Pharmacy Ikeja',
            'store_slug' => 'nest-ikeja',
            'online_store_enabled' => true,
            'location' => 'Ikeja GRA',
            'address' => '25 Isaac John St, Ikeja',
            'phone' => '08022222222',
            'currency' => 'NGN',
            'device_id' => 'DEVICE-IKEJA-01',
        ]);

        $this->storefront = Storefront::create([
            'user_id' => $this->owner->id,
            'slug' => 'nestpharmacy',
            'name' => 'Nest Pharmacy Group',
            'headline' => 'Your Trusted Neighborhood Pharmacy',
            'about' => 'Providing quality healthcare services across Lagos.',
            'theme' => 'emerald',
            'primary_store_id' => $this->branchLekki->id,
        ]);
    }

    public function test_storefront_lists_all_owner_branches_and_defaults_to_primary(): void
    {
        $response = $this->getJson('/api/v1/storefront/nestpharmacy');

        $response->assertOk()
            ->assertJsonPath('storefront.slug', 'nestpharmacy')
            ->assertJsonPath('storefront.name', 'Nest Pharmacy Group')
            ->assertJsonPath('selected_branch.id', $this->branchLekki->id)
            ->assertJsonPath('selected_branch.name', 'Nest Pharmacy Lekki')
            ->assertJsonCount(2, 'branches');

        $branches = collect($response->json('branches'));
        $this->assertTrue($branches->contains('name', 'Nest Pharmacy Lekki'));
        $this->assertTrue($branches->contains('name', 'Nest Pharmacy Ikeja'));
    }

    public function test_branch_query_parameter_switches_active_branch(): void
    {
        $response = $this->getJson('/api/v1/storefront/nestpharmacy?branch='.$this->branchIkeja->id);

        $response->assertOk()
            ->assertJsonPath('selected_branch.id', $this->branchIkeja->id)
            ->assertJsonPath('selected_branch.name', 'Nest Pharmacy Ikeja')
            ->assertJsonPath('store.id', $this->branchIkeja->id);
    }

    public function test_storefront_reports_the_selected_branch_store_type(): void
    {
        $this->branchIkeja->update(['store_type' => 'retail']);

        $this->getJson('/api/v1/storefront/nestpharmacy')
            ->assertOk()
            ->assertJsonPath('store.store_type', 'pharmacy');

        $this->getJson('/api/v1/storefront/nestpharmacy?branch='.$this->branchIkeja->id)
            ->assertOk()
            ->assertJsonPath('store.store_type', 'retail')
            ->assertJsonPath('selected_branch.store_type', 'retail');
    }

    public function test_legacy_store_slug_resolves_via_alias_and_preselects_that_branch(): void
    {
        $response = $this->getJson('/api/v1/storefront/nest-ikeja');

        $response->assertOk()
            ->assertJsonPath('selected_branch.id', $this->branchIkeja->id)
            ->assertJsonPath('store.name', 'Nest Pharmacy Ikeja')
            ->assertJsonCount(2, 'branches');
    }

    public function test_branch_scoping_isolates_product_catalog(): void
    {
        $prodLekki = Product::create([
            'user_id' => $this->owner->id,
            'store_id' => $this->branchLekki->id,
            'name' => 'Lekki Only Vitamin C',
            'selling_price' => 1500,
            'show_online' => true,
            'is_active' => true,
            'is_controlled' => false,
        ]);

        $prodIkeja = Product::create([
            'user_id' => $this->owner->id,
            'store_id' => $this->branchIkeja->id,
            'name' => 'Ikeja Only Paracetamol',
            'selling_price' => 500,
            'show_online' => true,
            'is_active' => true,
            'is_controlled' => false,
        ]);

        // Default primary (Lekki) should see Lekki product, not Ikeja
        $resLekki = $this->getJson('/api/v1/storefront/nestpharmacy/products');
        $resLekki->assertOk()
            ->assertJsonFragment(['name' => 'Lekki Only Vitamin C'])
            ->assertJsonMissing(['name' => 'Ikeja Only Paracetamol']);

        // Explicit Ikeja query should see Ikeja product, not Lekki
        $resIkeja = $this->getJson('/api/v1/storefront/nestpharmacy/products?branch='.$this->branchIkeja->id);
        $resIkeja->assertOk()
            ->assertJsonFragment(['name' => 'Ikeja Only Paracetamol'])
            ->assertJsonMissing(['name' => 'Lekki Only Vitamin C']);
    }

    public function test_checkout_on_specific_branch_places_order_at_that_branch(): void
    {
        $product = Product::create([
            'user_id' => $this->owner->id,
            'store_id' => $this->branchIkeja->id,
            'name' => 'Ikeja Amoxicillin',
            'selling_price' => 2000,
            'show_online' => true,
            'is_active' => true,
            'is_controlled' => false,
        ]);

        StockBatch::create([
            'store_id' => $this->branchIkeja->id,
            'product_id' => $product->id,
            'quantity' => 10,
            'batch_number' => 'B-IKEJA-01',
            'expiry_date' => now()->addYear(),
        ]);

        $payload = [
            'branch_id' => $this->branchIkeja->id,
            'customer_name' => 'John Doe',
            'customer_phone' => '08099999999',
            'customer_address' => 'Ikeja GRA, Lagos',
            'payment_method' => 'in_store',
            'items' => [
                [
                    'product_id' => $product->id,
                    'quantity' => 2,
                ],
            ],
        ];

        $res = $this->postJson('/api/v1/storefront/nestpharmacy/checkout', $payload);
        $res->assertCreated()
            ->assertJsonPath('order.store_id', $this->branchIkeja->id)
            ->assertJsonPath('order.total_amount', '4000.00');
    }
}
