<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Support\StorefrontThemes;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/** GET/PUT /admin/storefront/pro-presets: which presets Pro storefronts may use, and what a change would move. */
class AdminStorefrontProPresetsTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    private const URL = '/api/v1/admin/storefront/pro-presets';

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->grantStoreUrlToEveryPlan();
        $this->admin = $this->adminWithRole('super_admin');

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function adminWithRole(string $slug): User
    {
        return User::create([
            'first_name' => 'Admin', 'last_name' => ucfirst($slug), 'email' => "{$slug}-".uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => $slug, 'role_id' => Role::where('slug', $slug)->first()?->id, 'is_active' => true,
        ]);
    }

    private function shopOn(string $slug, ?string $plan, string $theme): Store
    {
        [$owner, $store] = $this->storefrontOwner($slug, $plan);
        $this->storefrontRow($owner, $store, ['theme' => $theme]);
        DB::table('stores')->update(['storefront_dirty_at' => null]);

        return $store;
    }

    public function test_the_impact_counts_only_stores_effectively_on_pro_using_each_preset(): void
    {
        $this->shopOn('pro-clinic', 'pro', 'clinic');
        $this->shopOn('pro-clinic-two', 'pro', 'clinic');
        $this->shopOn('enterprise-clinic', 'enterprise', 'clinic');
        $this->shopOn('starter-clinic', 'starter', 'clinic');
        $this->shopOn('pro-classic', 'pro', 'navy');
        [$lapsed, $lapsedStore] = $this->storefrontOwner('lapsed-to-pro', null);
        $this->subscribe($lapsed, 'enterprise', now()->subDays(30));
        $this->subscribe($lapsed, 'pro');
        $this->storefrontRow($lapsed, $lapsedStore, ['theme' => 'market']);

        $response = $this->actingAs($this->admin)->getJson(self::URL)->assertOk()
            ->assertJsonPath('allowed', ['workshop', 'clinic', 'market'])
            ->assertJsonPath('default', ['workshop', 'clinic', 'market'])
            ->assertJsonPath('presets', StorefrontThemes::PRESET_IDS);

        $this->assertSame(
            ['workshop' => 0, 'clinic' => 2, 'studio' => 0, 'market' => 1, 'boutique' => 0, 'grove' => 0],
            $response->json('affected'),
        );
    }

    public function test_an_admin_list_replaces_the_default_for_pro_stores(): void
    {
        $this->actingAs($this->admin)->putJson(self::URL, ['presets' => ['studio', 'grove']])->assertOk()
            ->assertJsonPath('allowed', ['studio', 'grove']);

        $this->assertSame(['studio', 'grove'], SystemConfig::getVal('storefront.pro_allowed_presets'));
        $this->getJson('/api/v1/system-configs/subscription_plans')
            ->assertJsonPath('data.storefront_entitlements.pro.allowed_presets', ['studio', 'grove'])
            ->assertJsonPath('data.storefront_entitlements.enterprise.allowed_presets', StorefrontThemes::PRESET_IDS);
    }

    public function test_removing_a_preset_falls_pro_stores_back_marks_them_dirty_and_logs_the_count(): void
    {
        $affected = $this->shopOn('clinic-shop', 'pro', 'clinic');
        $enterprise = $this->shopOn('clinic-enterprise', 'enterprise', 'clinic');
        $untouched = $this->shopOn('market-shop', 'pro', 'market');

        $this->actingAs($this->admin)->putJson(self::URL, ['presets' => ['market', 'workshop']])->assertOk()
            ->assertJsonPath('stores_switched', 1);

        $this->getJson('/api/v1/storefront/clinic-shop')->assertJsonPath('storefront.theme', 'workshop');
        $this->assertSame('clinic', DB::table('storefronts')->where('user_id', $affected->user_id)->value('theme'));
        $this->assertNotNull($affected->refresh()->storefront_dirty_at);
        $this->assertNull($enterprise->refresh()->storefront_dirty_at);
        $this->assertNull($untouched->refresh()->storefront_dirty_at);

        $log = ActivityLog::where('action', 'STOREFRONT_PRO_PRESETS_CHANGED')->sole();
        $this->assertSame($this->admin->id, $log->user_id);
        $this->assertSame(['workshop', 'clinic', 'market'], $log->properties['old']);
        $this->assertSame(['workshop', 'market'], $log->properties['new']);
        $this->assertSame(1, $log->properties['stores_affected']);
    }

    public function test_adding_a_preset_moves_no_store_and_is_still_logged(): void
    {
        $this->shopOn('clinic-shop', 'pro', 'clinic');

        $this->actingAs($this->admin)->putJson(self::URL, ['presets' => ['workshop', 'clinic', 'market', 'grove']])->assertOk()
            ->assertJsonPath('stores_switched', 0);

        $this->assertSame(0, Store::whereNotNull('storefront_dirty_at')->count());
        $this->assertSame(0, ActivityLog::where('action', 'STOREFRONT_PRO_PRESETS_CHANGED')->sole()->properties['stores_affected']);
    }

    public function test_the_list_must_name_at_least_one_known_preset(): void
    {
        foreach ([['presets' => []], ['presets' => ['workshop', 'neon']], ['presets' => ['navy']], ['presets' => 'workshop'], []] as $payload) {
            $this->actingAs($this->admin)->putJson(self::URL, $payload)->assertStatus(422);
        }

        $this->assertNull(SystemConfig::getVal('storefront.pro_allowed_presets'));
        $this->assertSame(0, ActivityLog::where('action', 'STOREFRONT_PRO_PRESETS_CHANGED')->count());
    }

    public function test_the_generic_config_endpoint_cannot_write_the_preset_list_around_the_log(): void
    {
        $this->actingAs($this->admin)->putJson('/api/v1/admin/system-configs/storefront.pro_allowed_presets', ['value' => ['grove']])
            ->assertStatus(422);

        $this->assertNull(SystemConfig::getVal('storefront.pro_allowed_presets'));
    }

    public function test_only_a_super_admin_may_read_or_change_the_list(): void
    {
        $platformAdmin = $this->adminWithRole('platform_admin');

        $this->actingAs($platformAdmin)->getJson(self::URL)->assertForbidden();
        $this->actingAs($platformAdmin)->putJson(self::URL, ['presets' => ['grove']])->assertForbidden();
        $this->assertNull(SystemConfig::getVal('storefront.pro_allowed_presets'));
    }

    public function test_saving_the_plans_never_stores_the_computed_entitlements(): void
    {
        $plans = $this->getJson('/api/v1/system-configs/subscription_plans')->json('data');
        $this->assertArrayHasKey('storefront_entitlements', $plans);
        $plans['tiers']['pro']['price_monthly'] = 8000;
        $plans['tiers']['pro']['price_yearly'] = 80000;
        $plans['tiers']['pro']['active'] = true;
        foreach (['free', 'starter', 'enterprise'] as $tier) {
            $plans['tiers'][$tier] += ['price_monthly' => 0, 'price_yearly' => 0, 'active' => false];
        }

        $this->actingAs($this->admin)->putJson('/api/v1/admin/system-configs/subscription_plans', ['value' => $plans])->assertOk();

        $this->assertArrayNotHasKey('storefront_entitlements', SystemConfig::getVal('subscription_plans'));
    }
}
