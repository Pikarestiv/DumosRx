<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AdminRoleService
{
    public function listRoles(): array
    {
        return Role::with('permissions')
            ->whereIn('slug', $this->platformRoleSlugs())
            ->get()
            ->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'slug' => $role->slug,
                'is_system' => $role->is_system,
                'permissions' => $role->permissions->pluck('slug')->intersect(User::DELEGATABLE_PERMISSIONS)->values(),
                'user_count' => User::where('role_id', $role->id)->orWhere('role', $role->slug)->count(),
            ])
            ->all();
    }

    public function updateRolePermissions(string $roleSlug, array $permissionSlugs, string $actorId): Role
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $this->assertPlatformRole($role);
        $this->assertCatalogSubset($permissionSlugs);

        $before = $role->permissions()->whereIn('slug', User::DELEGATABLE_PERMISSIONS)->pluck('slug')->sort()->values()->all();

        $nonCatalogIds = $role->permissions()->whereNotIn('slug', User::DELEGATABLE_PERMISSIONS)->pluck('permissions.id');
        $desiredCatalogIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');

        $role->permissions()->sync($nonCatalogIds->merge($desiredCatalogIds)->unique());

        $after = collect($permissionSlugs)->sort()->values()->all();

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'ROLE_PERMISSIONS_UPDATED',
            'description' => "Updated delegated permissions for role \"{$role->name}\" ({$role->slug})",
            'status' => 'success',
            'properties' => ['role_slug' => $role->slug, 'before' => $before, 'after' => $after],
        ]);

        return $role->fresh('permissions');
    }

    public function createRole(string $name, array $permissionSlugs, string $actorId): Role
    {
        $this->assertCatalogSubset($permissionSlugs);

        $slug = Str::slug($name, '_');
        if (Role::where('slug', $slug)->exists()) {
            throw ValidationException::withMessages(['name' => 'A role with this name already exists.']);
        }

        $role = Role::create(['name' => $name, 'slug' => $slug, 'is_system' => false]);
        $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
        $role->permissions()->sync($permissionIds);

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'PLATFORM_ROLE_CREATED',
            'description' => "Created platform role \"{$name}\" ({$slug})",
            'status' => 'success',
            'properties' => ['role_slug' => $slug, 'permissions' => $permissionSlugs],
        ]);

        return $role;
    }

    public function deleteRole(string $roleSlug, string $actorId): void
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();

        if ($role->is_system) {
            throw ValidationException::withMessages(['role' => 'This role is built in and cannot be deleted.']);
        }

        $userCount = User::where('role_id', $role->id)->orWhere('role', $role->slug)->count();
        if ($userCount > 0) {
            throw ValidationException::withMessages(['role' => "Reassign the {$userCount} user(s) on this role before deleting it."]);
        }

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'PLATFORM_ROLE_DELETED',
            'description' => "Deleted platform role \"{$role->name}\" ({$role->slug})",
            'status' => 'success',
        ]);

        $role->delete();
    }

    public function setUserPermissionOverride(string $userId, string $permissionSlug, ?bool $granted, string $actorId): User
    {
        $this->assertCatalogSubset([$permissionSlug]);
        $user = User::findOrFail($userId);
        $permission = Permission::where('slug', $permissionSlug)->firstOrFail();

        if ($granted === null) {
            DB::table('permission_user')->where('user_id', $user->id)->where('permission_id', $permission->id)->delete();
            $action = 'USER_PERMISSION_OVERRIDE_CLEARED';
            $description = "Cleared {$permissionSlug} override for {$user->email}, reverting to role default";
        } else {
            DB::table('permission_user')->updateOrInsert(
                ['user_id' => $user->id, 'permission_id' => $permission->id],
                ['granted' => $granted, 'updated_at' => now(), 'created_at' => now()],
            );
            $action = 'USER_PERMISSION_OVERRIDE_SET';
            $verb = $granted ? 'Granted' : 'Revoked';
            $description = "{$verb} {$permissionSlug} override for {$user->email}";
        }

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => $action,
            'description' => $description,
            'status' => 'success',
            'properties' => ['target_user_id' => $user->id, 'permission' => $permissionSlug, 'granted' => $granted],
        ]);

        return $user->fresh();
    }

    private function assertPlatformRole(Role $role): void
    {
        if (! in_array($role->slug, $this->platformRoleSlugs(), true)) {
            throw ValidationException::withMessages(['role' => 'This role is not a platform role and cannot have delegated permissions.']);
        }
    }

    private function assertCatalogSubset(array $permissionSlugs): void
    {
        $unknown = array_diff($permissionSlugs, User::DELEGATABLE_PERMISSIONS);
        if ($unknown) {
            throw ValidationException::withMessages(['permissions' => 'Unknown permission(s): ' . implode(', ', $unknown)]);
        }
    }

    private function platformRoleSlugs(): array
    {
        return \App\Services\Admin\AdminUserService::platformRoleSlugs();
    }
}
