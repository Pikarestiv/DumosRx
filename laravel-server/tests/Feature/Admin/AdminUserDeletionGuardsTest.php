<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminUserDeletionGuardsTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeUser(string $role): User
    {
        return User::create([
            'first_name' => 'Target',
            'last_name' => uniqid(),
            'email' => 'target-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_the_acting_admins_own_account(): void
    {
        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$this->superAdmin->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('users', [
            'id' => $this->superAdmin->id,
            'deleted_at' => null,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_the_acting_admins_own_account_even_as_the_last_super_admin(): void
    {
        $this->assertSame(1, User::where('role', 'super_admin')->count());

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$this->superAdmin->id}")
            ->assertStatus(422);

        $this->assertSame(1, User::where('role', 'super_admin')->count());
    }

    #[Test]
    public function it_refuses_to_delete_another_platform_account(): void
    {
        foreach (['super_admin', 'platform_admin', 'agent'] as $role) {
            $target = $this->makeUser($role);

            $this->actingAs($this->superAdmin)
                ->deleteJson("/api/v1/admin/users/{$target->id}")
                ->assertStatus(422);

            $this->assertDatabaseHas('users', [
                'id' => $target->id,
                'deleted_at' => null,
            ]);
        }
    }

    #[Test]
    public function it_still_deletes_an_ordinary_store_owner(): void
    {
        $owner = $this->makeUser('store_owner');
        $store = Store::create([
            'name' => 'Target Pharmacy',
            'user_id' => $owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$owner->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $owner->id]);
        $this->assertSoftDeleted('stores', ['id' => $store->id]);
    }

    #[Test]
    public function it_frees_the_deleted_owners_original_email_for_reuse(): void
    {
        $originalEmail = 'reusable-'.uniqid().'@dumosrx.com';
        $owner = $this->makeUser('store_owner');
        $owner->email = $originalEmail;
        $owner->save();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$owner->id}")
            ->assertOk();

        $this->assertDatabaseMissing('users', [
            'email' => $originalEmail,
            'deleted_at' => null,
        ]);

        $newUser = User::create([
            'first_name' => 'New',
            'last_name' => 'Owner',
            'email' => $originalEmail,
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $newUser->id,
            'email' => $originalEmail,
            'deleted_at' => null,
        ]);
    }

    #[Test]
    public function it_still_deletes_an_ordinary_staff_account(): void
    {
        $owner = $this->makeUser('store_owner');
        $store = Store::create([
            'name' => 'Target Pharmacy',
            'user_id' => $owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);
        $staff = $this->makeUser('admin');
        $staff->store_id = $store->id;
        $staff->save();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$staff->id}")
            ->assertOk();

        $this->assertSoftDeleted('users', ['id' => $staff->id]);
        $this->assertDatabaseHas('stores', ['id' => $store->id, 'deleted_at' => null]);
    }

    #[Test]
    public function it_records_the_refusal_without_writing_a_deletion_audit_entry(): void
    {
        $before = \App\Models\ActivityLog::where('action', 'USER_DELETION')->count();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$this->superAdmin->id}")
            ->assertStatus(422);

        $this->assertSame(
            $before,
            \App\Models\ActivityLog::where('action', 'USER_DELETION')->count(),
        );
    }

    #[Test]
    public function it_refuses_self_deletion_on_the_self_branch_alone_when_neither_role_signal_is_a_platform_role(): void
    {
        $actor = $this->makeUser('store_owner');

        \Illuminate\Support\Facades\Auth::login($actor);

        $threw = false;

        try {
            app(\App\Services\Admin\AdminUserService::class)->deleteUser($actor->id);
        } catch (\App\Exceptions\StoreActionBlockedException $e) {
            $threw = true;
        }

        $this->assertTrue($threw, 'Expected deleteUser() to refuse self-deletion via the self branch alone.');

        $this->assertDatabaseHas('users', [
            'id' => $actor->id,
            'deleted_at' => null,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_a_user_holding_a_custom_platform_role(): void
    {
        $customRole = Role::create([
            'name' => 'Regional Lead',
            'slug' => 'regional-lead-'.uniqid(),
            'is_system' => false,
        ]);

        $target = $this->makeUser('store_owner');
        $target->role_id = $customRole->id;
        $target->save();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$target->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'deleted_at' => null,
        ]);
    }

    #[Test]
    public function it_refuses_to_delete_a_user_whose_legacy_role_column_disagrees_with_their_resolved_platform_role(): void
    {
        $target = $this->makeUser('store_owner');
        $target->role_id = Role::where('slug', 'platform_admin')->value('id');
        $target->save();

        $this->actingAs($this->superAdmin)
            ->deleteJson("/api/v1/admin/users/{$target->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'deleted_at' => null,
        ]);
    }

    #[Test]
    public function it_exposes_a_can_delete_flag_that_matches_the_deletion_guard(): void
    {
        $owner = $this->makeUser('store_owner');
        $store = Store::create([
            'name' => 'Target Pharmacy',
            'user_id' => $owner->id,
            'device_id' => 'TEST-'.uniqid(),
        ]);
        $staff = $this->makeUser('admin');
        $staff->store_id = $store->id;
        $staff->save();

        $service = app(\App\Services\Admin\AdminUserService::class);

        $this->assertFalse(
            $service->canDeleteUser($this->superAdmin->fresh(), $this->superAdmin->id),
            'The actor should not be able to delete their own account.'
        );

        foreach (['super_admin', 'platform_admin', 'agent'] as $role) {
            $platformUser = $this->makeUser($role);
            $this->assertFalse(
                $service->canDeleteUser($platformUser, $this->superAdmin->id),
                "A {$role} account should not be deletable."
            );
        }

        $this->assertTrue($service->canDeleteUser($owner->fresh(), $this->superAdmin->id));
        $this->assertTrue($service->canDeleteUser($staff->fresh(), $this->superAdmin->id));
    }

    #[Test]
    public function it_refuses_deletion_when_there_is_no_authenticated_admin(): void
    {
        $target = $this->makeUser('store_owner');

        $threw = false;

        try {
            app(\App\Services\Admin\AdminUserService::class)->deleteUser($target->id);
        } catch (\App\Exceptions\StoreActionBlockedException $e) {
            $threw = true;
        }

        $this->assertTrue($threw, 'Expected deleteUser() to refuse when no admin is authenticated.');

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'deleted_at' => null,
        ]);
    }
}
