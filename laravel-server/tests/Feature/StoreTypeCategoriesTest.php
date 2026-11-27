<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class StoreTypeCategoriesTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\BuildsStorefrontPlans;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class]);
    }

    public static function storeTypes(): array
    {
        return array_map(fn (string $type) => [$type], [
            'pharmacy', 'supermarket', 'grocery', 'general', 'beauty', 'hardware',
            'fashion', 'electronics', 'auto_parts', 'stationery', 'agro', 'other',
        ]);
    }

    #[DataProvider('storeTypes')]
    public function test_registration_accepts_every_store_type(string $type): void
    {
        $this->postJson('/api/v1/register', $this->registration($type))->assertStatus(201);

        $this->assertDatabaseHas('stores', ['name' => "Store {$type}", 'store_type' => $type]);
    }

    public function test_registration_rejects_an_unknown_store_type(): void
    {
        $this->postJson('/api/v1/register', $this->registration('florist'))
            ->assertStatus(422)
            ->assertJsonValidationErrors('store_type');
    }

    public function test_registration_without_a_store_type_still_creates_a_pharmacy_for_old_clients(): void
    {
        $payload = $this->registration('pharmacy');
        unset($payload['store_type']);

        $this->postJson('/api/v1/register', $payload)->assertStatus(201);

        $this->assertDatabaseHas('stores', ['name' => 'Store pharmacy', 'store_type' => 'pharmacy']);
    }

    #[DataProvider('storeTypes')]
    public function test_store_update_accepts_every_store_type(string $type): void
    {
        [$owner, $store] = $this->ownerWithStore();

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/v1/stores/{$store->id}", ['name' => 'Renamed', 'store_type' => $type])
            ->assertOk();

        $this->assertSame($type, $store->fresh()->store_type);
    }

    public function test_store_update_still_accepts_the_legacy_retail_value(): void
    {
        [$owner, $store] = $this->ownerWithStore();

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/v1/stores/{$store->id}", ['name' => 'Renamed', 'store_type' => 'retail'])
            ->assertOk();

        $this->assertSame('retail', $store->fresh()->store_type);
    }

    public function test_store_update_rejects_an_unknown_store_type_and_keeps_the_old_one(): void
    {
        [$owner, $store] = $this->ownerWithStore();

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/v1/stores/{$store->id}", ['name' => 'Renamed', 'store_type' => 'florist'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('store_type');

        $this->assertSame('pharmacy', $store->fresh()->store_type);
    }

    public function test_storefront_reports_an_unknown_stored_store_type_as_general(): void
    {
        [, $store] = $this->ownerWithStore();
        DB::table('stores')->where('id', $store->id)->update(['store_type' => 'florist']);
        $this->storefrontFor($store);

        $this->getJson('/api/v1/storefront/type-test')
            ->assertOk()
            ->assertJsonPath('store.store_type', 'general');
    }

    public function test_storefront_reports_a_new_store_type_unchanged(): void
    {
        [, $store] = $this->ownerWithStore();
        $store->update(['store_type' => 'hardware']);
        $this->storefrontFor($store);

        $this->getJson('/api/v1/storefront/type-test')
            ->assertOk()
            ->assertJsonPath('store.store_type', 'hardware');
    }

    private function registration(string $type): array
    {
        return [
            'first_name' => 'New',
            'last_name' => 'Owner',
            'email' => "owner-{$type}@dumosrx.com",
            'password' => 'password123',
            'store_name' => "Store {$type}",
            'store_type' => $type,
        ];
    }

    /** @return array{0: User, 1: Store} */
    private function ownerWithStore(): array
    {
        $owner = User::create([
            'first_name' => 'Type',
            'last_name' => 'Owner',
            'email' => 'type-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'is_active' => true,
        ]);
        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Type Store',
            'store_slug' => 'type-store',
            'online_store_enabled' => true,
            'currency' => 'NGN',
            'device_id' => 'DEVICE-TYPE-01',
        ]);
        $owner->update(['store_id' => $store->id]);

        return [$owner, $store];
    }

    private function storefrontFor(Store $store): void
    {
        $this->grantEveryStorefrontEntitlementToEveryPlan();
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
        ]);
        Storefront::create([
            'user_id' => $store->user_id,
            'slug' => 'type-test',
            'name' => 'Type Test',
            'theme' => 'emerald',
            'primary_store_id' => $store->id,
        ]);
    }
}
