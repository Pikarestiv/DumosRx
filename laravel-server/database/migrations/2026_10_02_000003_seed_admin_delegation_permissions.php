<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    private const DELEGATABLE_PERMISSIONS = [
        'view_platform_data' => 'View stores, platform users and activity logs',
        'send_notifications' => 'Send user notifications and manage broadcasts',
        'reset_user_passwords' => "Force-reset a user's password",
        'manage_account_status' => 'Suspend/reactivate a store or user',
        'impersonate_store' => "View a store's data as if logged in as them",
    ];

    private const ROLE_GRANTS = [
        'platform_admin' => ['view_platform_data', 'send_notifications', 'reset_user_passwords', 'manage_account_status', 'impersonate_store'],
        'agent' => ['view_platform_data', 'send_notifications'],
    ];

    public function up(): void
    {
        foreach (self::DELEGATABLE_PERMISSIONS as $slug => $description) {
            Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => ucwords(str_replace('_', ' ', $slug)), 'description' => $description],
            );
        }

        foreach (self::ROLE_GRANTS as $roleSlug => $permissionSlugs) {
            $role = Role::where('slug', $roleSlug)->first();
            if (!$role) {
                continue;
            }
            $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
            // syncWithoutDetaching, not sync: this role already carries
            // manage_platform/create_accounts/grant_trials and this migration
            // must only ADD the 5 new slugs, never touch existing ones.
            $role->permissions()->syncWithoutDetaching($permissionIds);
        }
    }

    public function down(): void
    {
        foreach (self::ROLE_GRANTS as $roleSlug => $permissionSlugs) {
            $role = Role::where('slug', $roleSlug)->first();
            if (!$role) {
                continue;
            }
            $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
            $role->permissions()->detach($permissionIds);
        }

        Permission::whereIn('slug', array_keys(self::DELEGATABLE_PERMISSIONS))->delete();
    }
};
