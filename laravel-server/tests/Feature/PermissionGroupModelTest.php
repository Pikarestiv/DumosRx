<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionGroupModelTest extends TestCase
{
    use RefreshDatabase;

    private function makeStore(): Store
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner-pg@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'user_id' => $owner->id,
            'name' => 'Store PG',
            'store_slug' => 'store-pg',
            'device_id' => 'WEB-PG',
        ]);
    }

    public function test_a_permission_group_belongs_to_a_store_and_casts_permissions_to_an_array(): void
    {
        $store = $this->makeStore();
        $group = PermissionGroup::create([
            'store_id' => $store->id,
            'name' => 'Manager',
            'based_on_role' => 'manager',
            'is_default' => true,
            'permissions' => ['process_sales', 'manage_inventory'],
        ]);

        $this->assertEquals($store->id, $group->store->id);
        $this->assertEquals(['process_sales', 'manage_inventory'], $group->permissions);
    }

    public function test_a_user_can_be_assigned_a_permission_group(): void
    {
        $store = $this->makeStore();
        $group = PermissionGroup::create([
            'store_id' => $store->id,
            'name' => 'Manager',
            'based_on_role' => 'manager',
            'is_default' => true,
            'permissions' => [],
        ]);
        $user = User::create([
            'first_name' => 'Staff', 'last_name' => 'A',
            'email' => 'staff-pg@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'manager', 'store_id' => $store->id,
        ]);
        $user->update(['permission_group_id' => $group->id]);

        $this->assertEquals($group->id, $user->fresh()->permission_group_id);
    }
}
