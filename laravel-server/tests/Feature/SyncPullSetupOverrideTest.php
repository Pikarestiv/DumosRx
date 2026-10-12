<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The `setup=1` + stores-only override exists so the client's privileged
 * subscription-status pull can bypass the cloud_sync gate without handing a
 * free-tier account a full sync. It identified that call by shape alone — a
 * `last_synced` map naming only `stores` — which the REAL setup sync also
 * matches, because `syncSubscriptionStatus()` stamps `_sync_state.stores`
 * (sync-engine/index.ts) before onboarding's main pull runs
 * (app/setup/use-onboarding.ts). On a fresh device `stores` is then the only
 * stamped window, so the main setup pull was narrowed to `['stores']` and
 * `users` was never sent. Onboarding reported "Synchronization finished, but
 * no staff accounts were found" and routed a real store owner to
 * registration, which would have created a duplicate admin identity.
 *
 * The two calls ARE distinguishable: the privileged one sends `stores: ""`,
 * a real sync always sends a timestamp.
 */
class SyncPullSetupOverrideTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Favour', 'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Divamax',
            'store_slug' => 'divamax',
            'device_id' => 'WEB-ONE',
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        Schema::enableForeignKeyConstraints();
    }

    private function pull(array $lastSynced, bool $setup)
    {
        return $this->actingAs($this->owner)->postJson(
            '/api/v1/app/sync/pull' . ($setup ? '?setup=1' : ''),
            ['last_synced' => $lastSynced],
        );
    }

    #[Test]
    public function a_setup_sync_whose_only_stamped_window_is_stores_still_receives_users(): void
    {
        $response = $this->pull(['stores' => '2026-10-12T09:00:00Z'], true);

        $response->assertOk();
        $changes = $response->json('changes');

        $this->assertArrayHasKey('users', $changes, 'the owner account must be pulled');
        $this->assertNotEmpty($changes['users']);
        $this->assertSame(
            $this->owner->id,
            $changes['users'][0]['id'],
            'the store owner is the account onboarding looks for',
        );
    }

    #[Test]
    public function the_privileged_subscription_status_pull_is_still_narrowed_to_stores(): void
    {
        $response = $this->pull(['stores' => ''], true);

        $response->assertOk();
        $changes = $response->json('changes');

        $this->assertArrayHasKey('stores', $changes);
        $this->assertArrayNotHasKey('users', $changes, 'the gate bypass must not widen');
        $this->assertArrayNotHasKey('products', $changes);
    }

    #[Test]
    public function an_ordinary_sync_is_unaffected(): void
    {
        $response = $this->pull(['stores' => '2026-10-12T09:00:00Z'], false);

        $response->assertOk();
        $this->assertArrayHasKey('users', $response->json('changes'));
    }
}
