<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * PUT /admin/stores/{id}/storefront/settings and POST /admin/storefront/rebuild:
 * the super-admin controls for a storefront's accent, details and manual rebuild.
 */
class AdminStorefrontSettingsAndRebuildTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);
        config([
            'dumos.github.token' => 'gh-test-token',
            'dumos.github.repo' => 'dumos/dumosrx',
            'dumos.storefront.rebuild_token' => null,
        ]);

        $this->owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Divamax', 'store_slug' => 'divamax',
            'device_id' => 'TEST-'.uniqid(), 'status' => 'Active', 'online_store_enabled' => true,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function settingsUrl(): string
    {
        return "/api/v1/admin/stores/{$this->store->id}/storefront/settings";
    }

    private function admin(string $roleSlug = 'super_admin'): User
    {
        return User::create([
            'first_name' => 'Test', 'last_name' => ucfirst($roleSlug),
            'email' => $roleSlug.'-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => $roleSlug, 'role_id' => Role::where('slug', $roleSlug)->first()?->id, 'is_active' => true,
        ]);
    }

    private function storefront(): ?Storefront
    {
        return Storefront::where('user_id', $this->owner->id)->first();
    }

    #[Test]
    public function a_super_admin_saves_the_accent_and_store_details_and_the_public_storefront_returns_them(): void
    {
        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['store_url' => true]]]]);
        $hours = ['mon' => ['open' => '08:00', 'close' => '18:00'], 'sun' => null];

        $this->actingAs($this->admin())
            ->putJson($this->settingsUrl(), [
                'accent' => '#f2b705', 'tagline' => 'Wiring, lighting, done.', 'whatsapp' => '+237 6 00 00 00 00',
                'pickup_minutes' => 20, 'opening_hours' => $hours,
            ])
            ->assertOk();

        $this->assertSame('#F2B705', $this->storefront()->accent);
        $this->assertNotNull($this->storefront()->style_dirty_at);
        $this->assertTrue(ActivityLog::where('action', 'STOREFRONT_SETTINGS_CHANGED')->exists());

        $this->getJson('/api/v1/storefront/divamax')
            ->assertOk()
            ->assertJsonPath('storefront.accent', '#F2B705')
            ->assertJsonPath('storefront.tagline', 'Wiring, lighting, done.')
            ->assertJsonPath('storefront.pickup_minutes', 20)
            ->assertJsonPath('storefront.opening_hours.mon.close', '18:00')
            ->assertJsonPath('storefront.opening_hours.sun', null);
    }

    #[Test]
    public function a_super_admin_sets_the_default_language_and_the_enabled_switch_languages(): void
    {
        $this->actingAs($this->admin())
            ->putJson($this->settingsUrl(), ['locale' => 'fr', 'enabled_locales' => ['fr', 'en']])
            ->assertOk();

        $this->assertSame('fr', $this->storefront()->locale);
        $this->assertSame(['fr', 'en'], $this->storefront()->enabled_locales);

        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['locale' => 'de'])->assertStatus(422);
        $this->actingAs($this->admin())
            ->getJson("/api/v1/admin/stores/{$this->store->id}")
            ->assertJsonPath('storefront.locale', 'fr')
            ->assertJsonPath('storefront.enabled_locales', ['fr', 'en']);
    }

    #[Test]
    public function the_store_detail_payload_carries_the_settings_and_the_pending_flag(): void
    {
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Hello'])->assertOk();

        $this->actingAs($this->admin())
            ->getJson("/api/v1/admin/stores/{$this->store->id}")
            ->assertOk()
            ->assertJsonPath('storefront.tagline', 'Hello')
            ->assertJsonPath('storefront.pending_rebuild', true);
    }

    #[Test]
    public function settings_changes_never_dirty_a_store_so_the_scheduler_does_not_rebuild_on_its_own(): void
    {
        Store::query()->update(['storefront_dirty_at' => null]);

        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['accent' => '#0F6B58'])->assertOk();

        $this->assertNull($this->store->refresh()->storefront_dirty_at);
    }

    #[Test]
    public function a_partial_update_leaves_the_other_settings_alone_and_null_clears_one(): void
    {
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Keep me', 'pickup_minutes' => 30])->assertOk();
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['pickup_minutes' => null])->assertOk();

        $this->assertSame('Keep me', $this->storefront()->tagline);
        $this->assertNull($this->storefront()->pickup_minutes);
    }

    #[Test]
    public function re_sending_unchanged_settings_neither_logs_nor_flags_a_rebuild(): void
    {
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Same'])->assertOk();
        Storefront::clearStyleDirty();
        ActivityLog::query()->delete();

        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Same'])->assertOk();

        $this->assertNull($this->storefront()->style_dirty_at);
        $this->assertFalse(ActivityLog::where('action', 'STOREFRONT_SETTINGS_CHANGED')->exists());
    }

    #[Test]
    public function malformed_values_are_refused_and_nothing_is_written(): void
    {
        $bad = [
            ['accent' => 'red'], ['accent' => '#fff'], ['accent' => '#F2B705;}body{display:none'],
            ['tagline' => str_repeat('x', 141)], ['whatsapp' => 'call me'], ['pickup_minutes' => 0], ['pickup_minutes' => 2000],
            ['opening_hours' => ['funday' => ['open' => '08:00', 'close' => '18:00']]],
            ['opening_hours' => ['mon' => ['open' => '18:00', 'close' => '08:00']]],
            ['opening_hours' => ['mon' => ['open' => '8am', 'close' => '6pm']]],
            ['opening_hours' => ['mon' => ['open' => '25:00', 'close' => '26:00']]],
        ];

        foreach ($bad as $payload) {
            $this->actingAs($this->admin())->putJson($this->settingsUrl(), $payload)->assertStatus(422);
        }

        $this->assertNull($this->storefront());
    }

    #[Test]
    public function only_a_super_admin_may_change_settings_or_rebuild(): void
    {
        Http::fake();

        foreach (['platform_admin', 'agent', 'store_owner'] as $role) {
            $this->actingAs($this->admin($role))->putJson($this->settingsUrl(), ['tagline' => 'Nope'])->assertForbidden();
            $this->actingAs($this->admin($role))->postJson('/api/v1/admin/storefront/rebuild')->assertForbidden();
        }

        $this->assertNull($this->storefront());
        Http::assertNothingSent();
    }

    #[Test]
    public function a_store_with_no_slug_and_no_storefront_is_refused_rather_than_failing(): void
    {
        $this->store->update(['store_slug' => null]);

        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Hi'])->assertStatus(422);
    }

    #[Test]
    public function the_rebuild_button_dispatches_to_github_and_clears_the_pending_flags_when_no_confirmation_is_configured(): void
    {
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Ship me'])->assertOk();

        $this->actingAs($this->admin())->postJson('/api/v1/admin/storefront/rebuild')->assertStatus(202);

        Http::assertSent(fn ($request) => $request->url() === 'https://api.github.com/repos/dumos/dumosrx/dispatches'
            && $request['event_type'] === 'storefront-changed'
            && $request->hasHeader('Authorization', 'Bearer gh-test-token'));
        $this->assertNull($this->storefront()->style_dirty_at);
        $this->assertTrue(ActivityLog::where('action', 'STOREFRONT_REBUILD_REQUESTED')->exists());
    }

    #[Test]
    public function with_a_confirmation_token_the_pending_flag_survives_until_the_deploy_reports_back(): void
    {
        config(['dumos.storefront.rebuild_token' => 'secret']);
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Ship me'])->assertOk();

        $this->actingAs($this->admin())->postJson('/api/v1/admin/storefront/rebuild')->assertStatus(202);

        $this->assertNotNull($this->storefront()->style_dirty_at);
        $this->assertNotNull(SystemConfig::getVal('storefront_rebuild_requested_at'));

        $this->postJson('/api/v1/internal/storefront/rebuild-complete', [], ['X-Storefront-Rebuild-Token' => 'secret'])->assertOk();

        $this->assertNull($this->storefront()->style_dirty_at);
    }

    #[Test]
    public function a_style_change_made_during_the_build_stays_pending_after_the_deploy_confirms(): void
    {
        config(['dumos.storefront.rebuild_token' => 'secret']);
        Http::fake(['api.github.com/*' => Http::response([], 204)]);
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Before'])->assertOk();
        $this->actingAs($this->admin())->postJson('/api/v1/admin/storefront/rebuild')->assertStatus(202);

        $this->travel(1)->minutes();
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'During the build'])->assertOk();
        $this->postJson('/api/v1/internal/storefront/rebuild-complete', [], ['X-Storefront-Rebuild-Token' => 'secret'])->assertOk();

        $this->assertNotNull($this->storefront()->style_dirty_at);
    }

    #[Test]
    public function a_refused_dispatch_reports_bad_gateway_and_leaves_the_flags_pending(): void
    {
        Http::fake(['api.github.com/*' => Http::response(['message' => 'Bad credentials'], 401)]);
        $this->actingAs($this->admin())->putJson($this->settingsUrl(), ['tagline' => 'Ship me'])->assertOk();

        $this->actingAs($this->admin())->postJson('/api/v1/admin/storefront/rebuild')->assertStatus(502);

        $this->assertNotNull($this->storefront()->style_dirty_at);
        $this->assertFalse(ActivityLog::where('action', 'STOREFRONT_REBUILD_REQUESTED')->exists());
    }

    #[Test]
    public function a_server_without_github_credentials_says_so_instead_of_pretending(): void
    {
        config(['dumos.github.token' => null]);
        Http::fake();

        $this->actingAs($this->admin())->postJson('/api/v1/admin/storefront/rebuild')->assertStatus(503);

        Http::assertNothingSent();
    }
}
