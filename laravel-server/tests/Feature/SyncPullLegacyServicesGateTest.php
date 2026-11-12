<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Bundles older than the services release are not served held carts holding a service. Rules: laravel-server/AGENTS.md, "Service POS & Sync Engine Scoping". */
class SyncPullLegacyServicesGateTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User', 'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Salon', 'slug' => 'salon', 'device_id' => 'WEB-SALON',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);
        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);
        $this->withoutMiddleware();

        DB::table('services')->insert([
            'id' => (string) Str::uuid(), 'store_id' => $this->store->id, 'name' => 'Haircut', 'price' => 1000,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->seedHeld('held-products', [['id' => 'p1', 'name' => 'Panadol', 'quantity' => 1]]);
        $this->seedHeld('held-service', [['id' => 'p1', 'quantity' => 1], ['id' => 's1', 'item_type' => 'service', 'quantity' => 1]]);
        $this->seedHeld('held-service-spaced', null, '[{"id": "s1", "item_type": "service", "quantity": 1}]');
    }

    private function seedHeld(string $notes, ?array $items, ?string $rawJson = null): void
    {
        DB::table('held_transactions')->insert([
            'id' => (string) Str::uuid(), 'store_id' => $this->store->id, 'items_json' => $rawJson ?? json_encode($items),
            'total_amount' => 100, 'notes' => $notes, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function pull(?string $appVersion): array
    {
        $headers = $appVersion === null ? [] : ['X-App-Version' => $appVersion];

        return $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => []], $headers)
            ->assertOk()
            ->json('changes');
    }

    public function test_a_legacy_bundle_is_served_only_held_carts_without_a_service(): void
    {
        $this->assertSame(['held-products'], array_column($this->pull('0.0.41')['held_transactions'], 'notes'));
        $this->assertSame(['held-products'], array_column($this->pull(null)['held_transactions'], 'notes'));
    }

    public function test_the_services_release_is_served_services_and_every_held_cart(): void
    {
        $changes = $this->pull('0.0.42');

        $this->assertCount(1, $changes['services']);
        $this->assertArrayHasKey('sale_services', $changes);
        $this->assertArrayHasKey('return_services', $changes);
        $notes = array_column($changes['held_transactions'], 'notes');
        sort($notes);
        $this->assertSame(['held-products', 'held-service', 'held-service-spaced'], $notes);
    }
}
