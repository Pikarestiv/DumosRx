<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * PUT /admin/users/{id}: the super-admin-only profile edit for any platform
 * account, including other admins'. Covers the two guards that did not
 * exist anywhere before it (no self-demotion, never demote the last active
 * super_admin) plus the field scope — password, status and plan stay with
 * their own dedicated endpoints and are rejected outright here.
 */
class AdminUserProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = $this->makeUser('super_admin', 'super@dumosrx.com');

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeUser(string $role, string $email, bool $isActive = true): User
    {
        return User::create([
            'first_name' => 'Test',
            'last_name' => ucfirst($role),
            'email' => $email,
            'password' => bcrypt('password'),
            'role' => $role,
            'is_active' => $isActive,
        ]);
    }

    private function update(User $actor, User $target, array $payload)
    {
        return $this->actingAs($actor)->putJson("/api/v1/admin/users/{$target->id}", $payload);
    }

    public function test_a_super_admin_updates_another_admins_profile_fields()
    {
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        $this->update($this->superAdmin, $target, [
            'first_name' => 'Ada',
            'last_name' => 'Lovelace',
            'phone' => '08012345678',
            'email' => 'ada@dumosrx.com',
            'role' => 'agent',
        ])->assertOk();

        $target->refresh();
        $this->assertSame('Ada', $target->first_name);
        $this->assertSame('Lovelace', $target->last_name);
        $this->assertSame('08012345678', $target->phone);
        $this->assertSame('ada@dumosrx.com', $target->email);
        $this->assertSame('agent', $target->role);
    }

    public function test_a_role_change_syncs_the_role_id_relation()
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');
        $agentRoleId = \App\Models\Role::where('slug', 'agent')->value('id');
        $this->assertNotNull($agentRoleId, 'The agent role is not seeded; this test would pass vacuously.');

        $this->update($this->superAdmin, $target, ['role' => 'agent'])->assertOk();

        $target->refresh();
        $this->assertSame('agent', $target->role);
        $this->assertSame($agentRoleId, $target->role_id);
    }

    public function test_a_super_admin_cannot_demote_their_own_role()
    {
        $this->makeUser('super_admin', 'other-super@dumosrx.com');

        $this->update($this->superAdmin, $this->superAdmin, ['role' => 'agent'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'You cannot change your own role.']);

        $this->assertSame('super_admin', $this->superAdmin->fresh()->role);
    }

    public function test_a_super_admin_may_still_edit_their_own_non_role_fields()
    {
        $this->update($this->superAdmin, $this->superAdmin, ['first_name' => 'Grace'])
            ->assertOk();

        $this->assertSame('Grace', $this->superAdmin->fresh()->first_name);
    }

    public function test_the_last_active_super_admin_cannot_be_demoted()
    {
        $target = $this->makeUser('super_admin', 'target-super@dumosrx.com');
        $this->superAdmin->forceFill(['is_active' => false])->save();

        $this->update($this->superAdmin, $target, ['role' => 'agent'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'You cannot demote the last active super admin.']);

        $this->assertSame('super_admin', $target->fresh()->role);
    }

    public function test_a_super_admin_can_be_demoted_while_another_active_one_remains()
    {
        $target = $this->makeUser('super_admin', 'target-super@dumosrx.com');

        $this->update($this->superAdmin, $target, ['role' => 'platform_admin'])->assertOk();

        $this->assertSame('platform_admin', $target->fresh()->role);
    }

    public function test_a_deactivated_super_admin_does_not_count_towards_the_last_active_check()
    {
        $target = $this->makeUser('super_admin', 'target-super@dumosrx.com');
        $this->makeUser('super_admin', 'dormant-super@dumosrx.com', false);
        $this->superAdmin->forceFill(['is_active' => false])->save();

        $this->update($this->superAdmin, $target, ['role' => 'agent'])
            ->assertStatus(422);
    }

    public function test_a_non_super_admin_is_forbidden_from_the_endpoint()
    {
        foreach (['platform_admin', 'agent'] as $role) {
            $actor = $this->makeUser($role, "{$role}-actor@dumosrx.com");
            $target = $this->makeUser('platform_admin', "{$role}-target@dumosrx.com");

            $this->update($actor, $target, ['first_name' => 'Nope'])->assertStatus(403);
            $this->assertSame('Test', $target->fresh()->first_name);
        }
    }

    public function test_an_email_already_used_by_another_user_is_rejected()
    {
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');
        $this->makeUser('agent', 'taken@dumosrx.com');

        $this->update($this->superAdmin, $target, ['email' => 'taken@dumosrx.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_keeping_the_users_own_email_is_not_a_uniqueness_conflict()
    {
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        $this->update($this->superAdmin, $target, [
            'email' => 'pa@dumosrx.com',
            'first_name' => 'Same',
        ])->assertOk();

        $this->assertSame('Same', $target->fresh()->first_name);
    }

    public function test_a_store_tenant_role_cannot_be_assigned_here()
    {
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        $this->update($this->superAdmin, $target, ['role' => 'store_owner'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');
    }

    public function test_password_status_and_plan_fields_are_rejected_outright()
    {
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        foreach (['password', 'is_active', 'subscription_tier'] as $field) {
            $this->update($this->superAdmin, $target, [
                'first_name' => 'Ada',
                $field => 'anything',
            ])->assertStatus(422)->assertJsonValidationErrors($field);
        }

        $this->assertSame('Test', $target->fresh()->first_name);
    }

    public function test_the_update_logs_an_activity_row_with_a_diff_of_only_the_changed_fields()
    {
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        $this->update($this->superAdmin, $target, [
            'first_name' => 'Ada',
            'last_name' => ucfirst('platform_admin'),
            'role' => 'agent',
        ])->assertOk();

        $log = ActivityLog::where('action', 'USER_PROFILE_UPDATED')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame($this->superAdmin->id, $log->user_id);
        $this->assertStringContainsString($target->email, $log->description);

        $this->assertSame(
            ['first_name', 'role'],
            array_keys($log->properties['before']),
            'The diff recorded unchanged fields.'
        );
        $this->assertSame(['first_name' => 'Test', 'role' => 'platform_admin'], $log->properties['before']);
        $this->assertSame(['first_name' => 'Ada', 'role' => 'agent'], $log->properties['after']);
    }

    public function test_an_update_that_changes_nothing_writes_no_activity_log()
    {
        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        $this->update($this->superAdmin, $target, ['first_name' => 'Test'])->assertOk();

        $this->assertSame(0, ActivityLog::where('action', 'USER_PROFILE_UPDATED')->count());
    }

    public function test_a_newly_created_custom_platform_role_is_accepted_for_the_role_field()
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        app(\App\Services\Admin\AdminRoleService::class)->createRole('Support Lead', ['view_platform_data'], $this->superAdmin->id);

        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        $this->update($this->superAdmin, $target, ['role' => 'support_lead'])->assertOk();

        $this->assertSame('support_lead', $target->fresh()->role);
    }

    public function test_a_store_tenant_role_is_still_rejected_even_after_a_custom_platform_role_exists()
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        app(\App\Services\Admin\AdminRoleService::class)->createRole('Support Lead', ['view_platform_data'], $this->superAdmin->id);

        $target = $this->makeUser('platform_admin', 'pa@dumosrx.com');

        $this->update($this->superAdmin, $target, ['role' => 'store_owner'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');
    }
}
