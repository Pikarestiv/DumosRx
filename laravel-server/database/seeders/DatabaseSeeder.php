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
        $adminEmail = 'admin@dumosrx.com';
        
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



        $this->call(EmailTemplateSeeder::class);
        $this->call(SystemConfigSeeder::class);
        $this->call(PaymentAccountSeeder::class);
    }
}
