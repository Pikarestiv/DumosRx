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
        // 1. Create Roles
        $roles = [
            'super_admin' => 'Super Administrator',
            'manager' => 'Pharmacy Manager',
            'pharmacist' => 'Pharmacist',
            'sales_staff' => 'Sales Staff',
            'auditor' => 'Auditor'
        ];

        foreach ($roles as $key => $name) {
            Role::firstOrCreate(
                ['slug' => $key],
                ['name' => $name, 'description' => $name]
            );
        }

        // 2. Create Super Admin User
        $adminEmail = 'admin@rx.dumostech.com';
        
        if (!User::where('email', $adminEmail)->exists()) {
            User::create([
                'email' => $adminEmail,
                'password' => Hash::make('Admin123#'),
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'role' => 'super_admin',
                'is_active' => true,
                'phone' => '08000000000'
            ]);
        }

        // 3. Create Sample Staff (Optional - commented out or active)
        $pharmacistEmail = 'pharmacist@rx.dumostech.com';
        if (!User::where('email', $pharmacistEmail)->exists()) {
            User::create([
                'email' => $pharmacistEmail,
                'password' => Hash::make('Pharmacist123#'),
                'first_name' => 'Chinedu',
                'last_name' => 'Okafor',
                'role' => 'pharmacist',
                'is_active' => true
            ]);
        }

        $salesEmail = 'sales@rx.dumostech.com';
        if (!User::where('email', $salesEmail)->exists()) {
            User::create([
                'email' => $salesEmail,
                'password' => Hash::make('Sales123#'),
                'first_name' => 'Ngozi',
                'last_name' => 'Adeyemi',
                'role' => 'sales_staff',
                'is_active' => true
            ]);
        }
    }
}
