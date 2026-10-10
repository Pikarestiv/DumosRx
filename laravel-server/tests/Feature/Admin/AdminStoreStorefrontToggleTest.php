<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * PUT /admin/stores/{id}/storefront - the store detail page's storefront
 * switch. Gated on manage_account_status, the same permission that governs
 * suspending a store (which also takes the storefront offline).
 */
class AdminStoreStorefrontToggleTest extends TestCase
{
    use RefreshDatabase;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);

        $this->store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Corner Pharmacy',
            'store_slug' => 'corner-pharmacy',
            'device_id' => 'TEST-'.uniqid(),
            'status' => 'Active',
            'online_store_enabled' => false,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function publishing_sets_the_flag_and_marks_the_storefront_for_rebuild(): void
    {
        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => true])
            ->assertOk()
            ->assertJson(['online_store_enabled' => true]);

        $this->store->refresh();
        $this->assertTrue((bool) $this->store->online_store_enabled);
        $this->assertNotNull($this->store->storefront_dirty_at);
    }

    #[Test]
    public function unpublishing_clears_the_flag_and_is_recorded_in_the_activity_log(): void
    {
        $this->store->update(['online_store_enabled' => true]);

        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => false])
            ->assertOk()
            ->assertJson(['online_store_enabled' => false]);

        $this->assertFalse((bool) $this->store->refresh()->online_store_enabled);
        $this->assertTrue(ActivityLog::where('action', 'STOREFRONT_UNPUBLISHED')->exists());
    }

    /**
     * The public endpoints require a slug, so publishing without one would
     * report "Published" for a page that resolves to nothing.
     */
    #[Test]
    public function publishing_a_store_with_no_slug_is_refused(): void
    {
        $this->store->update(['store_slug' => null]);

        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => true])
            ->assertStatus(422);

        $this->assertFalse((bool) $this->store->refresh()->online_store_enabled);
    }

    #[Test]
    public function the_toggle_can_set_the_slug_so_a_slugless_store_becomes_publishable(): void
    {
        $this->store->update(['store_slug' => null]);

        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", [
                'enabled' => true,
                'store_slug' => 'Corner Pharmacy Ikeja',
            ])
            ->assertOk()
            ->assertJson(['online_store_enabled' => true, 'store_slug' => 'corner-pharmacy-ikeja']);

        $this->store->refresh();
        $this->assertSame('corner-pharmacy-ikeja', $this->store->store_slug);
        $this->assertTrue((bool) $this->store->online_store_enabled);
    }

    /**
     * The slug is a public URL, so a collision would serve one store's
     * storefront at another's address. DB-unique across archived rows too, so
     * the check has to see trashed stores.
     */
    #[Test]
    public function a_slug_another_store_already_holds_is_refused(): void
    {
        $other = Store::create([
            'user_id' => $this->store->user_id,
            'name' => 'Rival Pharmacy',
            'store_slug' => 'rival-pharmacy',
            'device_id' => 'TEST-'.uniqid(),
            'status' => 'Active',
        ]);
        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", [
                'enabled' => true,
                'store_slug' => 'rival-pharmacy',
            ])
            ->assertStatus(422);

        $this->store->refresh();
        $this->assertSame('corner-pharmacy', $this->store->store_slug);
        $this->assertFalse((bool) $this->store->online_store_enabled);
        $this->assertSame('rival-pharmacy', $other->refresh()->store_slug);
    }

    #[Test]
    public function a_slug_an_archived_store_already_holds_is_refused(): void
    {
        $archived = Store::create([
            'user_id' => $this->store->user_id,
            'name' => 'Closed Pharmacy',
            'store_slug' => 'closed-pharmacy',
            'device_id' => 'TEST-'.uniqid(),
            'status' => 'Active',
        ]);
        $archived->delete();
        $this->store->update(['store_slug' => null]);

        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", [
                'enabled' => true,
                'store_slug' => 'closed-pharmacy',
            ])
            ->assertStatus(422);

        $this->assertNull($this->store->refresh()->store_slug);
    }

    #[Test]
    public function a_malformed_slug_is_refused_rather_than_silently_rewritten(): void
    {
        $this->store->update(['store_slug' => null]);

        foreach (['!!!', '   ', '-', str_repeat('a', 101)] as $bad) {
            $this->actingAs($this->userWithRole('platform_admin'))
                ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", [
                    'enabled' => true,
                    'store_slug' => $bad,
                ])
                ->assertStatus(422);
        }

        $this->store->refresh();
        $this->assertNull($this->store->store_slug);
        $this->assertFalse((bool) $this->store->online_store_enabled);
    }

    #[Test]
    public function setting_the_slug_bumps_updated_at_so_devices_converge_on_pull(): void
    {
        $this->store->update(['store_slug' => null]);
        $this->store->forceFill(['updated_at' => now()->subDays(3)])->saveQuietly();
        $before = $this->store->refresh()->updated_at;

        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", [
                'enabled' => true,
                'store_slug' => 'fresh-slug',
            ])
            ->assertOk();

        $this->assertTrue($this->store->refresh()->updated_at->gt($before));
    }

    /**
     * Store::saving() reverts the slug attribute instead of failing when the
     * 6-month cooldown is live, so without an explicit check the admin would
     * get a 200 reporting a slug that was never stored.
     */
    #[Test]
    public function a_slug_change_inside_the_six_month_cooldown_is_refused_not_silently_dropped(): void
    {
        $this->store->forceFill([
            'store_slug' => 'corner-pharmacy',
            'store_slug_changed_at' => now()->subMonth(),
        ])->saveQuietly();

        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", [
                'enabled' => true,
                'store_slug' => 'brand-new-slug',
            ])
            ->assertStatus(422);

        $this->assertSame('corner-pharmacy', $this->store->refresh()->store_slug);
    }

    #[Test]
    public function the_toggle_still_works_with_no_slug_in_the_payload(): void
    {
        $this->actingAs($this->userWithRole('platform_admin'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => true])
            ->assertOk();

        $this->assertSame('corner-pharmacy', $this->store->refresh()->store_slug);
    }

    #[Test]
    public function an_agent_without_manage_account_status_cannot_set_the_slug_either(): void
    {
        $this->store->update(['store_slug' => null]);

        $this->actingAs($this->userWithRole('agent'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", [
                'enabled' => true,
                'store_slug' => 'agent-set-this',
            ])
            ->assertForbidden();

        $this->assertNull($this->store->refresh()->store_slug);
    }

    #[Test]
    public function an_agent_without_manage_account_status_is_forbidden(): void
    {
        $this->actingAs($this->userWithRole('agent'))
            ->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => true])
            ->assertForbidden();

        $this->assertFalse((bool) $this->store->refresh()->online_store_enabled);
    }

    private function userWithRole(string $roleSlug): User
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();

        return User::create([
            'first_name' => 'Test', 'last_name' => ucfirst($roleSlug),
            'email' => $roleSlug.'-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => $roleSlug, 'role_id' => $role->id, 'is_active' => true,
        ]);
    }
}
