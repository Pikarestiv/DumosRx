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
            'admin' => [
                'name' => 'Store Admin',
                'description' => 'Store owner or high-level manager',
                'permissions' => array_keys($permissions) // Gets all
            ],
            'manager' => [
                'name' => 'Store Manager',
                'description' => 'Store manager with high access',
                'permissions' => ['manage_staff', 'view_reports', 'manage_inventory', 'process_sales', 'dispense_prescriptions', 'view_own_sales']
            ],
            'pharmacist' => [
                'name' => 'Pharmacist',
                'description' => 'Clinical staff',
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
        }
    }
}
