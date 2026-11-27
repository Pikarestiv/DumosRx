<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/** POST /app/storefront/rebuild: the owner's own "Rebuild now", an Enterprise entitlement. */
class StorefrontOwnerRebuildTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    private const URL = '/api/v1/app/storefront/rebuild';

    protected function setUp(): void
    {
        parent::setUp();
        $this->grantStoreUrlToEveryPlan();
        config(['dumos.github.token' => 'gh-test-token', 'dumos.github.repo' => 'dumos/dumosrx', 'dumos.storefront.rebuild_token' => null]);
        Http::fake(['api.github.com/*' => Http::response(null, 204)]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
        ]);
    }

    public function test_a_pro_owner_is_refused_and_nothing_is_dispatched(): void
    {
        [$owner] = $this->storefrontOwner('pro-shop', 'pro');

        $this->actingAs($owner)->postJson(self::URL)->assertForbidden()->assertJsonPath('code', 'UPGRADE_REQUIRED');

        Http::assertNothingSent();
    }

    public function test_an_enterprise_owner_rebuilds_every_storefront_now(): void
    {
        [$owner] = $this->storefrontOwner('enterprise-shop', 'enterprise');

        $this->actingAs($owner)->postJson(self::URL)->assertStatus(202);

        Http::assertSentCount(1);
        $this->assertSame($owner->id, ActivityLog::where('action', 'STOREFRONT_REBUILD_REQUESTED')->sole()->user_id);
    }

    public function test_a_super_admin_is_always_allowed(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin', 'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin', 'role_id' => Role::where('slug', 'super_admin')->first()?->id, 'is_active' => true,
        ]);

        $this->actingAs($admin)->postJson(self::URL)->assertStatus(202);
        Http::assertSentCount(1);
    }

    public function test_staff_of_an_enterprise_store_cannot_trigger_it(): void
    {
        [, $store] = $this->storefrontOwner('staffed', 'enterprise');
        $staff = User::create([
            'first_name' => 'Cashier', 'last_name' => 'One', 'email' => 'cashier@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'cashier', 'store_id' => $store->id,
        ]);

        $this->actingAs($staff)->postJson(self::URL)->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_it_is_rate_limited(): void
    {
        [$owner] = $this->storefrontOwner('eager', 'enterprise');

        foreach (range(1, 3) as $ignored) {
            $this->actingAs($owner)->postJson(self::URL)->assertStatus(202);
        }

        $this->actingAs($owner)->postJson(self::URL)->assertStatus(429);
        Http::assertSentCount(3);
    }

    public function test_an_unconfigured_server_says_so(): void
    {
        config(['dumos.github.token' => null]);
        [$owner] = $this->storefrontOwner('unconfigured', 'enterprise');

        $this->actingAs($owner)->postJson(self::URL)->assertStatus(422);
    }
}
