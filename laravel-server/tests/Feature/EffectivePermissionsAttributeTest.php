<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EffectivePermissionsAttributeTest extends TestCase
{
    use RefreshDatabase;

    public function test_includes_effective_permissions_in_a_serialized_user_with_only_its_granted_catalog_slugs()
    {
        $this->artisan('migrate')->run();

        $agentRole = Role::where('slug', 'agent')->firstOrCreate(
            ['slug' => 'agent'],
            ['name' => 'Agent']
        );

        $permissions = ['view_platform_data', 'send_notifications', 'impersonate_store'];
        foreach ($permissions as $slug) {
            Permission::firstOrCreate(['slug' => $slug], ['name' => ucwords(str_replace('_', ' ', $slug))]);
        }

        $agentRole->permissions()->syncWithoutDetaching(
            Permission::whereIn('slug', ['view_platform_data', 'send_notifications'])->pluck('id')
        );

        $user = User::create([
            'first_name' => 'Test',
            'last_name' => 'Agent',
            'email' => 'agent@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'agent',
        ]);
        $user->role_id = $agentRole->id;
        $user->save();

        $array = $user->append('effective_permissions')->toArray();

        $this->assertArrayHasKey('effective_permissions', $array);
        $this->assertContains('view_platform_data', $array['effective_permissions']);
        $this->assertContains('send_notifications', $array['effective_permissions']);
        $this->assertNotContains('impersonate_store', $array['effective_permissions']);
    }

    public function test_includes_the_pre_existing_grant_trials_permission_so_the_admin_ui_can_gate_on_it()
    {
        $this->artisan('migrate')->run();

        $role = Role::where('slug', 'platform_admin')->firstOrCreate(
            ['slug' => 'platform_admin'],
            ['name' => 'Platform Admin']
        );
        Permission::firstOrCreate(['slug' => 'grant_trials'], ['name' => 'Grant Trials']);
        $role->permissions()->syncWithoutDetaching(Permission::where('slug', 'grant_trials')->pluck('id'));

        $user = User::create([
            'first_name' => 'Test',
            'last_name' => 'Partner',
            'email' => 'partner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'platform_admin',
        ]);
        $user->role_id = $role->id;
        $user->save();

        $this->assertContains('grant_trials', $user->append('effective_permissions')->toArray()['effective_permissions']);
    }

    public function test_returns_an_empty_array_for_a_super_admin_rather_than_listing_the_whole_catalog()
    {
        $this->artisan('migrate')->run();

        $superAdminRole = Role::where('slug', 'super_admin')->firstOrCreate(
            ['slug' => 'super_admin'],
            ['name' => 'Super Admin']
        );

        $user = User::create([
            'first_name' => 'Test',
            'last_name' => 'Admin',
            'email' => 'super-admin@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $user->role_id = $superAdminRole->id;
        $user->save();

        $this->assertSame([], $user->append('effective_permissions')->toArray()['effective_permissions']);
    }
}
