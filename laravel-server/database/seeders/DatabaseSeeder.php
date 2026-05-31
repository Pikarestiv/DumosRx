<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\Role;
use App\Models\Permission;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Seed Roles and Permissions
        $this->call(RolesAndPermissionsSeeder::class);

        // 2. Create Super Admin User
        $adminEmail = 'admin@rx.dumostech.com';
        
        if (!User::where('email', $adminEmail)->exists()) {
            $superAdminRole = Role::where('slug', 'super_admin')->first();
            User::create([
                'email' => $adminEmail,
                'password' => Hash::make('Admin123#'),
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'role' => 'super_admin',
                'role_id' => $superAdminRole ? $superAdminRole->id : null,
                'is_active' => true,
                'phone' => '08000000000'
            ]);
        }

        // 3. Create Sample Staff (Optional - commented out or active)
        $pharmacistEmail = 'pharmacist@rx.dumostech.com';
        if (!User::where('email', $pharmacistEmail)->exists()) {
            $pharmacistRole = Role::where('slug', 'pharmacist')->first();
            User::create([
                'email' => $pharmacistEmail,
                'password' => Hash::make('Pharmacist123#'),
                'first_name' => 'Chinedu',
                'last_name' => 'Okafor',
                'role' => 'pharmacist',
                'role_id' => $pharmacistRole ? $pharmacistRole->id : null,
                'is_active' => true
            ]);
        }

        $salesEmail = 'sales@rx.dumostech.com';
        if (!User::where('email', $salesEmail)->exists()) {
            $salesRole = Role::where('slug', 'sales_staff')->first();
            User::create([
                'email' => $salesEmail,
                'password' => Hash::make('Sales123#'),
                'first_name' => 'Ngozi',
                'last_name' => 'Adeyemi',
                'role' => 'sales_staff',
                'role_id' => $salesRole ? $salesRole->id : null,
                'is_active' => true
            ]);
        }

        $this->call(EmailTemplateSeeder::class);
        $this->call(SystemConfigSeeder::class);
        $this->call(PaymentAccountSeeder::class);
    }
}
