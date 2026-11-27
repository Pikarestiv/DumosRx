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
    use \Tests\Concerns\BuildsStorefrontPlans;

    private User $owner;

    private Store $primary;

    protected function setUp(): void
    {
        parent::setUp();
        $this->grantEveryStorefrontEntitlementToEveryPlan();

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

    public function test_paystack_returns_a_payer_to_the_page_they_started_from(): void
    {
        $agidi = $this->enableBranch('Nest Agidi');
        $slugs = app(\App\Services\Storefront\StorefrontBranchSlugs::class);

        $this->assertSame('/s/nestpharmacy/checkout', $slugs->checkoutPath($this->primary));
        $this->assertSame('/s/nestpharmacy/nest-agidi/checkout', $slugs->checkoutPath($agidi, 'nest-agidi'));
        $this->assertSame('/s/nestpharmacy/checkout', $slugs->checkoutPath($agidi, 'someone-elses-slug'));
        $this->assertSame('/s/nestpharmacy/checkout', $slugs->checkoutPath($agidi, 'nest-amawbia'));
    }

    public function test_checkout_refuses_a_branch_that_does_not_exist_with_a_clear_message_instead_of_charging_the_primary(): void
    {
        $this->enableBranch('Nest Agidi');
        $payload = ['customer_name' => 'A', 'customer_phone' => '1', 'payment_method' => 'in_store', 'items' => [['product_id' => 'x', 'quantity' => 1]]];

        $this->postJson('/api/v1/storefront/nestpharmacy/checkout', $payload + ['branch_id' => 'old-branch'])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'no longer available'));
        $this->postJson('/api/v1/storefront/nestpharmacy/checkout/initialize', ['customer_email' => 'a@b.test', 'items' => $payload['items'], 'branch_id' => 'old-branch'])->assertStatus(422);
    }

    public function test_two_stores_with_the_same_name_get_different_slugs(): void
    {
        $first = $this->enableBranch('Main');
        $second = $this->enableBranch('Main');

        $slugs = app(\App\Services\Storefront\StorefrontBranchSlugs::class);
        $this->assertNotSame($slugs->ensure($first), $slugs->ensure($second));
    }

    public function test_a_release_whose_migration_has_not_run_yet_does_not_break_the_public_storefront(): void
    {
        \Illuminate\Support\Facades\Schema::drop('storefront_branches');

        $this->getJson('/api/v1/storefront/nestpharmacy')->assertOk()->assertJsonPath('branches.0.slug', 'nest-amawbia');
        $this->getJson('/api/v1/storefront-slugs')->assertOk();
    }

    public function test_the_migrations_backfill_reserves_the_same_page_names_as_the_runtime_check(): void
    {
        $migration = file_get_contents(database_path('migrations/2026_11_17_000001_create_storefront_branches_table.php'));
        preg_match('/RESERVED = \\[([^\\]]*)\\]/', $migration, $found);
        preg_match_all("/'([a-z]+)'/", $found[1], $names);

        $this->assertEqualsCanonicalizing(\App\Services\Storefront\StorefrontBranchSlugs::RESERVED, $names[1]);
    }

    public function test_a_slug_collision_during_allocation_is_retried_with_a_fresh_slug(): void
    {
        $first = $this->enableBranch('Main');
        $second = Store::create(['user_id' => $this->owner->id, 'name' => 'Main', 'device_id' => 'DEV-M2']);

        $racing = new class(app(\App\Services\Storefront\StorefrontBranchSlugs::class)) extends \App\Services\Storefront\StorefrontBranchSlugs
        {
            private int $calls = 0;

            public function __construct(private \App\Services\Storefront\StorefrontBranchSlugs $real) {}

            protected function uniqueSlug(Store $store): string
            {
                return $this->calls++ === 0 ? 'main' : parent::uniqueSlug($store);
            }
        };

        $this->assertSame('main-2', $racing->ensure($second));
        $this->assertSame('main', app(\App\Services\Storefront\StorefrontBranchSlugs::class)->ensure($first));
    }

    public function test_a_branch_store_slug_alias_still_resolves_when_sent_as_the_branch_id(): void
    {
        $alias = Store::create(['user_id' => $this->owner->id, 'name' => 'Alias', 'store_slug' => 'alias-store', 'device_id' => 'DEV-A', 'online_store_enabled' => true]);

        $this->getJson('/api/v1/storefront/nestpharmacy?branch=alias-store')->assertOk()->assertJsonPath('selected_branch.id', $alias->id);
    }
}
