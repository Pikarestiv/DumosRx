<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionUserGrantedColumnTest extends TestCase
{
    use RefreshDatabase;

    public function test_adds_a_granted_column_to_permission_user_defaulting_to_true()
    {
        $user = User::create([
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => 'test-granted@dumosrx.com',
            'password' => bcrypt('password'),
        ]);
        $permission = Permission::create([
            'name' => 'Test Granted Column',
            'slug' => 'test_granted_column',
        ]);

        $user->permissions()->attach($permission->id);

        $row = \DB::table('permission_user')
            ->where('user_id', $user->id)
            ->where('permission_id', $permission->id)
            ->first();

        $this->assertTrue((bool) $row->granted);
    }

    public function test_rejects_a_duplicate_user_id_permission_id_pair()
    {
        $user = User::create([
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => 'test-unique@dumosrx.com',
            'password' => bcrypt('password'),
        ]);
        $permission = Permission::create([
            'name' => 'Test Unique Pair',
            'slug' => 'test_unique_pair',
        ]);

        \DB::table('permission_user')->insert([
            'user_id' => $user->id,
            'permission_id' => $permission->id,
            'granted' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);
        \DB::table('permission_user')->insert([
            'user_id' => $user->id,
            'permission_id' => $permission->id,
            'granted' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
