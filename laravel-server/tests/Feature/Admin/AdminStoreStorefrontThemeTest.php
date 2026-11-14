<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * PUT /admin/stores/{id}/storefront/theme - super admin only, validated
 * against App\Support\StorefrontThemes::IDS.
 */
class AdminStoreStorefrontThemeTest extends TestCase
{
    use RefreshDatabase;

    protected Store $store;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);

        $this->store = $this->makeStore('Corner Pharmacy', 'corner-pharmacy');

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function a_super_admin_sets_the_theme_and_the_public_storefront_returns_it(): void
    {
        $this->actingAs($this->userWithRole('super_admin'))
            ->putJson($this->url(), ['theme' => 'navy'])
            ->assertOk()
            ->assertJson(['theme' => 'navy']);

        $this->assertSame('navy', Storefront::where('user_id', $this->owner->id)->value('theme'));
        $this->assertTrue(ActivityLog::where('action', 'STOREFRONT_THEME_CHANGED')->exists());

        $this->actingAs($this->userWithRole('super_admin'))
            ->getJson("/api/v1/admin/stores/{$this->store->id}")
            ->assertOk()
            ->assertJsonPath('storefront.theme', 'navy');
    }

    #[Test]
    public function a_style_preset_can_be_assigned_as_the_theme(): void
    {
        foreach (['workshop', 'clinic', 'studio'] as $preset) {
            $this->actingAs($this->userWithRole('super_admin'))
                ->putJson($this->url(), ['theme' => $preset])
                ->assertOk()
                ->assertJson(['theme' => $preset]);
        }

        $this->assertSame('studio', Storefront::where('user_id', $this->owner->id)->value('theme'));
    }

    #[Test]
    public function changing_the_theme_marks_every_published_branch_for_rebuild_but_not_unpublished_ones(): void
    {
        $branch = $this->makeStore('Corner Pharmacy Lekki', 'corner-lekki');
        $unpublished = $this->makeStore('Corner Pharmacy Draft', 'corner-draft', false);
        $otherOwnerStore = Store::create([
            'user_id' => $this->userWithRole('store_owner')->id,
            'name' => 'Rival', 'store_slug' => 'rival', 'device_id' => 'TEST-'.uniqid(),
            'status' => 'Active', 'online_store_enabled' => true,
        ]);
        Store::query()->update(['storefront_dirty_at' => null]);

        $this->actingAs($this->userWithRole('super_admin'))
            ->putJson($this->url(), ['theme' => 'rose'])
            ->assertOk();

        $this->assertNotNull($this->store->refresh()->storefront_dirty_at);
        $this->assertNotNull($branch->refresh()->storefront_dirty_at);
        $this->assertNull($unpublished->refresh()->storefront_dirty_at);
        $this->assertNull($otherOwnerStore->refresh()->storefront_dirty_at);
    }

    #[Test]
    public function re_sending_the_current_theme_does_not_queue_a_rebuild(): void
    {
        Storefront::create([
            'user_id' => $this->owner->id, 'slug' => 'corner-pharmacy', 'name' => 'Corner',
            'primary_store_id' => $this->store->id, 'theme' => 'forest',
        ]);
        Store::query()->update(['storefront_dirty_at' => null]);

        $this->actingAs($this->userWithRole('super_admin'))
            ->putJson($this->url(), ['theme' => 'forest'])
            ->assertOk()
            ->assertJson(['theme' => 'forest']);

        $this->assertNull($this->store->refresh()->storefront_dirty_at);
        $this->assertFalse(ActivityLog::where('action', 'STOREFRONT_THEME_CHANGED')->exists());
    }

    #[Test]
    public function a_theme_outside_the_allow_list_is_refused(): void
    {
        foreach (['neon', '', 'EMERALD', 'navy;', null] as $bad) {
            $this->actingAs($this->userWithRole('super_admin'))
                ->putJson($this->url(), ['theme' => $bad])
                ->assertStatus(422)
                ->assertJsonValidationErrors('theme');
        }

        $this->assertFalse(Storefront::where('user_id', $this->owner->id)->exists());
    }

    #[Test]
    public function a_store_with_no_slug_and_no_storefront_is_refused_rather_than_failing(): void
    {
        $this->store->update(['store_slug' => null]);

        $this->actingAs($this->userWithRole('super_admin'))
            ->putJson($this->url(), ['theme' => 'navy'])
            ->assertStatus(422);

        $this->assertFalse(Storefront::where('user_id', $this->owner->id)->exists());
    }

    #[Test]
    public function only_a_super_admin_may_choose_a_theme(): void
    {
        foreach (['platform_admin', 'agent', 'store_owner'] as $role) {
            $this->actingAs($this->userWithRole($role))
                ->putJson($this->url(), ['theme' => 'navy'])
                ->assertForbidden();
        }

        $this->assertFalse(Storefront::where('user_id', $this->owner->id)->exists());
    }

    #[Test]
    public function an_unknown_store_is_not_found(): void
    {
        $this->actingAs($this->userWithRole('super_admin'))
            ->putJson('/api/v1/admin/stores/00000000-0000-0000-0000-000000000000/storefront/theme', ['theme' => 'navy'])
            ->assertStatus(404);
    }

    private function url(): string
    {
        return "/api/v1/admin/stores/{$this->store->id}/storefront/theme";
    }

    private function makeStore(string $name, string $slug, bool $published = true): Store
    {
        return Store::create([
            'user_id' => $this->owner->id,
            'name' => $name,
            'store_slug' => $slug,
            'device_id' => 'TEST-'.uniqid(),
            'status' => 'Active',
            'online_store_enabled' => $published,
        ]);
    }

    private function userWithRole(string $roleSlug): User
    {
        $role = Role::where('slug', $roleSlug)->first();

        return User::create([
            'first_name' => 'Test', 'last_name' => ucfirst($roleSlug),
            'email' => $roleSlug.'-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => $roleSlug, 'role_id' => $role?->id, 'is_active' => true,
        ]);
    }
}
