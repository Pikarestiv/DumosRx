<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HasPermissionResolutionTest extends TestCase
{
    use RefreshDatabase;

    private Permission $permission;

    protected function setUp(): void
    {
        parent::setUp();
        $this->permission = Permission::firstOrCreate(['slug' => 'test_perm'], ['name' => 'Test']);
    }

    public function test_grants_via_role_with_no_override()
    {
        $role = Role::create(['name' => 'Test Role A', 'slug' => 'test_role_a']);
        $role->permissions()->attach($this->permission->id);
        $user = $this->makeUser('test_role_a', $role->id, 'granted-no-override@dumosrx.com');

        $this->assertTrue($user->hasPermission('test_perm'));
    }

    public function test_denies_when_role_grants_it_but_a_granted_false_override_exists()
    {
        $role = Role::create(['name' => 'Test Role B', 'slug' => 'test_role_b']);
        $role->permissions()->attach($this->permission->id);
        $user = $this->makeUser('test_role_b', $role->id, 'denied-override@dumosrx.com');

        $user->permissions()->attach($this->permission->id, ['granted' => false]);

        $this->assertFalse($user->hasPermission('test_perm'));
    }

    public function test_grants_when_role_denies_it_but_a_granted_true_override_exists()
    {
        $role = Role::create(['name' => 'Test Role C', 'slug' => 'test_role_c']);
        $user = $this->makeUser('test_role_c', $role->id, 'granted-override@dumosrx.com');

        $user->permissions()->attach($this->permission->id, ['granted' => true]);

        $this->assertTrue($user->hasPermission('test_perm'));
    }

    public function test_denies_when_role_denies_it_and_there_is_no_override()
    {
        $role = Role::create(['name' => 'Test Role D', 'slug' => 'test_role_d']);
        $user = $this->makeUser('test_role_d', $role->id, 'denied-no-override@dumosrx.com');

        $this->assertFalse($user->hasPermission('test_perm'));
    }

    public function test_always_grants_to_super_admin_regardless_of_any_row()
    {
        $superAdminRole = Role::firstOrCreate(['slug' => 'super_admin'], ['name' => 'Super Admin']);
        $user = $this->makeUser('super_admin', $superAdminRole->id, 'super-admin-bypass@dumosrx.com');

        $this->assertTrue($user->hasPermission('test_perm'));
        $this->assertTrue($user->hasPermission('anything_made_up'));
    }

    private function makeUser(string $role, string $roleId, string $email): User
    {
        $user = User::create([
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => $email,
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
        $user->role_id = $roleId;
        $user->save();

        return $user;
    }
}
