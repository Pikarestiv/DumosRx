<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\Storefront;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET/PUT /app/storefront-settings: the store owner's own control over the
 * storefront's look, details and languages.
 */
class StorefrontOwnerSettingsTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/app/storefront-settings';

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['custom_branding' => false, 'store_url' => true]],
                'enterprise' => ['features' => ['custom_branding' => true, 'store_url' => true]],
            ],
        ]);

        [$this->owner, $this->store] = $this->makeOwner('divamax', 'enterprise');

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    /**
     * @return array{0: User, 1: Store}
     */
    private function makeOwner(string $slug, string $plan, bool $allowed = true): array
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => ucfirst($slug),
            'email' => "{$slug}@dumosrx.com", 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => ucfirst($slug), 'store_slug' => $slug,
            'device_id' => "DEV-{$slug}", 'status' => 'Active', 'online_store_enabled' => true, 'store_type' => 'retail',
        ]);
        if ($allowed) {
            Storefront::create([
                'user_id' => $owner->id, 'slug' => $slug, 'name' => $store->name,
                'primary_store_id' => $store->id, 'owner_style_enabled' => true,
            ]);
        }
        Subscription::create([
            'user_id' => $owner->id, 'plan_name' => $plan, 'status' => 'active', 'license_key' => 'LIC-'.uniqid(),
            'start_date' => now()->subMonth(), 'end_date' => now()->addMonth(),
        ]);

        return [$owner, $store];
    }

    private function storefront(User $owner): ?Storefront
    {
        return Storefront::where('user_id', $owner->id)->first();
    }

    public function test_an_owner_reads_the_defaults_and_the_presets_they_may_choose(): void
    {
        $this->actingAs($this->owner)->getJson(self::URL)
            ->assertOk()
            ->assertJsonPath('allowed', true)
            ->assertJsonPath('theme', 'emerald')
            ->assertJsonPath('available_themes', ['workshop', 'clinic', 'studio'])
            ->assertJsonPath('locale', 'en')
            ->assertJsonPath('enabled_locales', ['en'])
            ->assertJsonPath('available_locales', ['en', 'fr'])
            ->assertJsonPath('accent', null)
            ->assertJsonPath('store_type', 'retail');
    }

    public function test_an_owner_saves_their_look_details_and_languages(): void
    {
        $this->actingAs($this->owner)->putJson(self::URL, [
            'theme' => 'studio', 'accent' => '#7a4252', 'tagline' => 'Ready for pickup.', 'whatsapp' => '+237 6 00 00 00 00',
            'pickup_minutes' => 20, 'opening_hours' => ['mon' => ['open' => '08:00', 'close' => '18:00']],
            'locale' => 'fr', 'enabled_locales' => ['fr', 'en'],
        ])->assertOk()->assertJsonPath('theme', 'studio')->assertJsonPath('locale', 'fr');

        $storefront = $this->storefront($this->owner);
        $this->assertSame('#7A4252', $storefront->accent);
        $this->assertSame(['fr', 'en'], $storefront->enabled_locales);
        $this->assertSame('18:00', $storefront->opening_hours['mon']['close']);
    }

    public function test_an_owner_change_queues_the_automatic_rebuild_because_they_cannot_click_the_button(): void
    {
        Store::query()->update(['storefront_dirty_at' => null]);

        $this->actingAs($this->owner)->putJson(self::URL, ['tagline' => 'Hello'])->assertOk();

        $this->assertNotNull($this->store->refresh()->storefront_dirty_at);
        $this->assertNotNull($this->storefront($this->owner)->style_dirty_at);
    }

    public function test_resending_the_current_values_changes_nothing_and_queues_nothing(): void
    {
        $this->actingAs($this->owner)->putJson(self::URL, ['tagline' => 'Same'])->assertOk();
        Store::query()->update(['storefront_dirty_at' => null]);
        Storefront::clearStyleDirty();

        $this->actingAs($this->owner)->putJson(self::URL, ['tagline' => 'Same'])->assertOk();

        $this->assertNull($this->store->refresh()->storefront_dirty_at);
        $this->assertNull($this->storefront($this->owner)->style_dirty_at);
    }

    public function test_an_owner_may_only_pick_a_preset_not_a_classic_accent_theme(): void
    {
        foreach (['navy', 'emerald', 'neon', ''] as $theme) {
            $this->actingAs($this->owner)->putJson(self::URL, ['theme' => $theme])->assertStatus(422)->assertJsonValidationErrors('theme');
        }
    }

    public function test_malformed_values_are_refused_and_nothing_is_written(): void
    {
        $bad = [
            ['accent' => 'red'], ['accent' => '#F2B705;}body{display:none'], ['tagline' => str_repeat('x', 141)],
            ['whatsapp' => 'call me'], ['pickup_minutes' => 0], ['locale' => 'de'], ['enabled_locales' => ['en', 'en']],
            ['enabled_locales' => ['xx']], ['opening_hours' => ['mon' => ['open' => '18:00', 'close' => '08:00']]],
        ];

        foreach ($bad as $payload) {
            $this->actingAs($this->owner)->putJson(self::URL, $payload)->assertStatus(422);
        }

        $this->assertNull($this->storefront($this->owner)?->accent);
        $this->assertNull($this->storefront($this->owner)?->tagline);
    }

    public function test_the_plan_must_include_custom_branding_to_save_but_not_to_read(): void
    {
        [$freeOwner] = $this->makeOwner('free-shop', 'free');

        $this->actingAs($freeOwner)->getJson(self::URL)->assertOk();
        $this->actingAs($freeOwner)->putJson(self::URL, ['tagline' => 'Nope'])->assertForbidden()->assertJsonPath('code', 'UPGRADE_REQUIRED');

        $this->assertNull($this->storefront($freeOwner)?->tagline);
    }

    public function test_staff_cannot_change_the_storefront_look(): void
    {
        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'Member', 'email' => 'staff@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'cashier', 'store_id' => $this->store->id,
        ]);

        $this->actingAs($staff)->getJson(self::URL)->assertOk()->assertExactJson(['allowed' => false]);
        $this->actingAs($staff)->putJson(self::URL, ['tagline' => 'Nope'])->assertForbidden();

        $this->assertNull($this->storefront($this->owner)?->tagline);
    }

    public function test_an_owner_can_only_ever_change_their_own_storefront(): void
    {
        [$rival, $rivalStore] = $this->makeOwner('rival', 'enterprise');

        $this->actingAs($rival)->putJson(self::URL, ['tagline' => 'Rival tagline', 'store_id' => $this->store->id, 'user_id' => $this->owner->id])->assertOk();

        $this->assertSame('Rival tagline', $this->storefront($rival)->tagline);
        $this->assertNull($this->storefront($this->owner)?->tagline);
        $this->assertNull(DB::table('stores')->where('id', $this->store->id)->value('storefront_dirty_at'));
        $this->assertNotNull($rivalStore->refresh()->storefront_dirty_at);
    }

    public function test_it_requires_a_signed_in_user(): void
    {
        $this->getJson(self::URL)->assertUnauthorized();
        $this->putJson(self::URL, ['tagline' => 'Hi'])->assertUnauthorized();
    }

    public function test_the_public_storefront_reports_the_chosen_language(): void
    {
        $this->actingAs($this->owner)->putJson(self::URL, ['locale' => 'fr', 'enabled_locales' => ['fr', 'en']])->assertOk();

        $this->getJson('/api/v1/storefront/divamax')
            ->assertOk()
            ->assertJsonPath('storefront.locale', 'fr')
            ->assertJsonPath('storefront.enabled_locales', ['fr', 'en']);
    }

    public function test_the_public_storefront_defaults_to_english_with_no_switch(): void
    {
        $this->getJson('/api/v1/storefront/divamax')
            ->assertOk()
            ->assertJsonPath('storefront.locale', 'en')
            ->assertJsonPath('storefront.enabled_locales', ['en']);
    }

    public function test_a_store_whose_super_admin_has_not_switched_it_on_sees_nothing_and_cannot_save(): void
    {
        [$locked] = $this->makeOwner('locked-shop', 'enterprise', allowed: false);
        Storefront::create(['user_id' => $locked->id, 'slug' => 'locked-shop', 'name' => 'Locked', 'tagline' => 'Admin set']);
        Store::query()->update(['storefront_dirty_at' => null]);

        $this->actingAs($locked)->getJson(self::URL)->assertOk()->assertExactJson(['allowed' => false]);
        $this->actingAs($locked)->putJson(self::URL, ['tagline' => 'Mine'])
            ->assertForbidden()->assertJsonPath('message', fn ($m) => str_contains($m, 'account manager'));

        $this->assertSame('Admin set', $this->storefront($locked)->tagline);
        $this->assertSame(0, Store::whereNotNull('storefront_dirty_at')->count());
    }

    public function test_an_owner_with_no_storefront_yet_is_not_allowed(): void
    {
        [$fresh] = $this->makeOwner('fresh-shop', 'enterprise', allowed: false);

        $this->actingAs($fresh)->getJson(self::URL)->assertOk()->assertExactJson(['allowed' => false]);
        $this->actingAs($fresh)->putJson(self::URL, ['tagline' => 'Hi'])->assertForbidden();
        $this->assertNull($this->storefront($fresh));
    }

    public function test_an_owner_cannot_switch_the_permission_on_for_themselves(): void
    {
        [$locked] = $this->makeOwner('self-grant', 'enterprise', allowed: false);
        Storefront::create(['user_id' => $locked->id, 'slug' => 'self-grant', 'name' => 'Self']);

        $this->actingAs($locked)->putJson(self::URL, ['owner_style_enabled' => true, 'tagline' => 'Mine'])->assertForbidden();
        $this->assertFalse((bool) $this->storefront($locked)->owner_style_enabled);

        $this->actingAs($this->owner)->putJson(self::URL, ['owner_style_enabled' => false])->assertOk();
        $this->assertTrue((bool) $this->storefront($this->owner)->owner_style_enabled);
    }
}
