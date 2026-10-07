<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Role;
use App\Models\Permission;

class RolesAndPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Define standard permissions
        $permissions = [
            'manage_staff' => 'Can add, edit, or remove staff members',
            'view_reports' => 'Can view financial and clinical reports',
            'manage_inventory' => 'Can add, edit, or remove inventory items',
            'process_sales' => 'Can create and process sales',
            'dispense_prescriptions' => 'Can view and dispense prescriptions',
            'view_own_sales' => 'Can view sales processed by themselves',
            // Platform-level (not store-level); the `permission:manage_platform`
            // middleware on the admin/* route group was previously referencing a
            // permission that was never seeded to anyone, so it only ever worked
            // via super_admin's unconditional bypass in CheckPermission, not
            // because anyone actually held the permission. Seeded here so that
            // gate reflects a real grant instead of silently being dead wiring.
            'manage_platform' => 'Can access the platform-wide super-admin dashboard',
            // Platform-level, granted to super_admin/platform_admin/agent only.
            // lets a platform user register a new store account on a customer's
            // behalf (used by both the internal "Register Store" tool and agents
            // onboarding pharmacies in the field).
            'create_accounts' => 'Can register new store accounts on the platform',
            // Platform-level. Deliberately NOT granted to agent: agents can
            // create accounts but not comp them; only super_admin/platform_admin
            // decide who gets a free trial.
            'grant_trials' => 'Can grant free trial subscriptions to a store',
            // Delegatable: revocable per-user via permission_user.granted.
            'view_platform_data' => 'View stores, platform users and activity logs',
            'view_platform_health' => 'View platform health, errors and sync health',
            'view_platform_revenue' => 'View platform revenue and trend series',
            'view_subscriptions' => 'View the subscription lifecycle worklists',
            'send_notifications' => 'Send user notifications and manage broadcasts',
            'reset_user_passwords' => "Force-reset a user's password",
            'manage_account_status' => 'Suspend/reactivate a store or user',
            'impersonate_store' => "View a store's data as if logged in as them",
        ];

        foreach ($permissions as $slug => $desc) {
            Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => ucwords(str_replace('_', ' ', $slug)), 'description' => $desc]
            );
        }

        // Define default roles
        $roles = [
            'super_admin' => [
                'name' => 'Super Admin',
                'description' => 'System administrator',
                'permissions' => array_keys($permissions) // Gets all
            ],
            // Platform-level (no store of their own): co-founders/partners who
            // help run the platform. Distinct from the 'admin' slug below, which
            // is store-level (a store's own admin/owner, always has a store_id).
            // Can register accounts and grant trials, but, unlike super_admin,
            // can't suspend/deactivate other platform accounts (AdminController
            // keeps those endpoints hasRole('super_admin') only).
            // Every read-only platform surface is a default here, not something
            // to grant by hand: restricting what a partner can DO matters,
            // restricting what they can SEE mostly makes them unable to help.
            // Anything that can hand out a permission is still absent.
            'platform_admin' => [
                'name' => 'Platform Admin',
                'description' => 'Platform partner/co-founder: manages accounts and trials, not platform administration itself',
                'permissions' => ['manage_platform', 'create_accounts', 'grant_trials', 'view_platform_data', 'view_platform_health', 'view_platform_revenue', 'view_subscriptions', 'send_notifications', 'reset_user_passwords', 'manage_account_status', 'impersonate_store']
            ],
            // Platform-level (no store of their own): field agents recruited to
            // onboard new pharmacies. Narrower than platform_admin: can create
            // accounts (and has their own referral link for self-serve signups)
            // but can't grant trials or manage other accounts.
            // Gets sync health - it is what tells an installer why a store they
            // set up is not working - but not platform revenue or the
            // subscription worklists, which carry money data for every store
            // on the platform rather than their own.
            'agent' => [
                'name' => 'Agent',
                'description' => 'Recruited installer/onboarding agent: registers new stores and tracks their own referrals',
                'permissions' => ['manage_platform', 'create_accounts', 'view_platform_data', 'view_platform_health', 'send_notifications']
            ],
            'admin' => [
                'name' => 'Store Admin',
                'description' => 'Store owner or high-level manager',
                // Every store-level permission, but NOT manage_platform;
                // that one's platform-wide (super_admin only).
                'permissions' => ['manage_staff', 'view_reports', 'manage_inventory', 'process_sales', 'dispense_prescriptions', 'view_own_sales']
            ],
            'store_owner' => [
                'name' => 'Store Owner',
                'description' => 'Store owner with full permissions',
                'permissions' => ['manage_staff', 'view_reports', 'manage_inventory', 'process_sales', 'dispense_prescriptions', 'view_own_sales']
            ],
            'manager' => [
                'name' => 'Store Manager',
                'description' => 'Store manager with high access',
                'permissions' => ['manage_staff', 'view_reports', 'manage_inventory', 'process_sales', 'dispense_prescriptions', 'view_own_sales']
            ],
            'specialist' => [
                'name' => 'Specialist / Senior Staff',
                'description' => 'Specialist staff or clinician',
                'permissions' => ['manage_inventory', 'process_sales', 'dispense_prescriptions', 'view_own_sales']
            ],
            'sales_staff' => [
                'name' => 'Sales Staff / Cashier',
                'description' => 'Cashier staff',
                'permissions' => ['process_sales', 'view_own_sales']
            ],
            'auditor' => [
                'name' => 'Auditor / Inventory Manager',
                'description' => 'Inventory and audit staff',
                'permissions' => ['manage_inventory', 'view_reports']
            ]
        ];

        foreach ($roles as $slug => $data) {
            $role = Role::firstOrCreate(
                ['slug' => $slug],
                ['name' => $data['name'], 'description' => $data['description']]
            );

            // Sync permissions
            $permissionIds = Permission::whereIn('slug', $data['permissions'])->pluck('id');
            $role->permissions()->sync($permissionIds);

            // Correct existing users who have this role string but NULL role_id
            \App\Models\User::where('role', $slug)
                ->whereNull('role_id')
                ->update(['role_id' => $role->id]);

            // Also map legacy store_owner users to the admin role ID
            if ($slug === 'admin') {
                \App\Models\User::where('role', 'store_owner')
                    ->whereNull('role_id')
                    ->update(['role_id' => $role->id]);
            }
        }
    }
}
