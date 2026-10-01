<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $permissionId = Permission::where('slug', 'manage_platform')->value('id');
        if (!$permissionId) {
            return;
        }

        Role::where('is_system', false)->get()->each(
            fn (Role $role) => $role->permissions()->syncWithoutDetaching([$permissionId]),
        );
    }

    public function down(): void
    {
        $permissionId = Permission::where('slug', 'manage_platform')->value('id');
        if (!$permissionId) {
            return;
        }

        Role::where('is_system', false)->get()->each(
            fn (Role $role) => $role->permissions()->detach($permissionId),
        );
    }
};
