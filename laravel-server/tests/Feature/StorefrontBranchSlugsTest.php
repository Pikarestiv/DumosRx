<?php

namespace Tests\Feature;

use App\Exceptions\StoreActionBlockedException;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminStoreStorefrontService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontBranchSlugsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $primary;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['store_url' => true]]]]);
        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'One', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->primary = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Nest Amawbia', 'store_slug' => 'nestpharmacy', 'device_id' => 'DEV-1', 'online_store_enabled' => true,
        ]);
        Storefront::create(['user_id' => $this->owner->id, 'slug' => 'nestpharmacy', 'name' => 'Nest Pharmacy', 'primary_store_id' => $this->primary->id]);
        $this->actingAs($this->owner);
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
    }

    private function enableBranch(string $name): Store
    {
        $store = Store::create(['user_id' => $this->owner->id, 'name' => $name, 'device_id' => 'DEV-'.uniqid()]);
        app(AdminStoreStorefrontService::class)->setEnabled($store->id, true);

        return $store->refresh();
    }

    public function test_a_second_store_is_enabled_as_a_branch_without_its_own_address(): void
    {
        $agidi = $this->enableBranch('Nest Agidi');

        $this->assertTrue((bool) $agidi->online_store_enabled);
        $this->assertNull($agidi->store_slug);
    }

    public function test_a_first_store_still_needs_an_address(): void
    {
        $other = User::create(['first_name' => 'O', 'last_name' => 'Two', 'email' => 'two@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner']);
        $lonely = Store::create(['user_id' => $other->id, 'name' => 'Lonely', 'device_id' => 'DEV-9']);

        $this->expectException(StoreActionBlockedException::class);
        app(AdminStoreStorefrontService::class)->setEnabled($lonely->id, true);
    }

    public function test_branch_slugs_come_from_the_store_name_and_are_unique_within_the_account(): void
    {
        $first = $this->enableBranch('Nest Agidi');
        $second = $this->enableBranch('Nest Agidi');
        $reserved = $this->enableBranch('Catalog');

        $slugs = \App\Models\StorefrontBranch::whereIn('store_id', [$first->id, $second->id, $reserved->id])->pluck('slug', 'store_id');

        $this->assertSame('nest-agidi', $slugs[$first->id]);
        $this->assertSame('nest-agidi-2', $slugs[$second->id]);
        $this->assertSame('catalog-2', $slugs[$reserved->id]);
    }

    public function test_the_storefront_lists_branch_slugs_and_serves_the_branch_a_slug_names(): void
    {
        $agidi = $this->enableBranch('Nest Agidi');

        $response = $this->getJson('/api/v1/storefront/nestpharmacy?branch=nest-agidi')->assertOk();

        $response->assertJsonPath('selected_branch.id', $agidi->id);
        $this->assertEqualsCanonicalizing(['nest-amawbia', 'nest-agidi'], collect($response->json('branches'))->pluck('slug')->all());
    }

    public function test_an_unknown_branch_slug_falls_back_to_the_primary_store(): void
    {
        $this->enableBranch('Nest Agidi');

        $this->getJson('/api/v1/storefront/nestpharmacy?branch=nowhere')->assertOk()->assertJsonPath('selected_branch.id', $this->primary->id);
    }

    public function test_the_slug_list_names_branches_only_for_storefronts_with_two_or_more(): void
    {
        $this->getJson('/api/v1/storefront-slugs')->assertOk()->assertExactJson(['slugs' => ['nestpharmacy'], 'branches' => []]);

        $this->enableBranch('Nest Agidi');

        $this->getJson('/api/v1/storefront-slugs')->assertOk()->assertJsonPath('branches.nestpharmacy', fn ($slugs) => collect($slugs)->sort()->values()->all() === ['nest-agidi', 'nest-amawbia']);
    }

    public function test_a_single_branch_storefront_returns_payers_to_the_brand_checkout(): void
    {
        $this->assertSame('/s/nestpharmacy/checkout', app(\App\Services\Storefront\StorefrontBranchSlugs::class)->checkoutPath($this->primary));
    }

    public function test_paystack_returns_a_branch_payer_to_that_branchs_checkout_even_without_a_store_address(): void
    {
        $agidi = $this->enableBranch('Nest Agidi');

        $slugs = app(\App\Services\Storefront\StorefrontBranchSlugs::class);

        $this->assertSame('/s/nestpharmacy/nest-agidi/checkout', $slugs->checkoutPath($agidi));
        $this->assertSame('/s/nestpharmacy/nest-amawbia/checkout', $slugs->checkoutPath($this->primary));
    }
}
