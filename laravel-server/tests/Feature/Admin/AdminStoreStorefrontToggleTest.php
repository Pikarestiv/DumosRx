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
