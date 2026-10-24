<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RolesAndPermissionsSeeder::class);

        $adminEmail = 'admin@dumosrx.com';

        if (! User::where('email', $adminEmail)->exists()) {
            $superAdminRole = Role::where('slug', 'super_admin')->first();

            $password = config('app.seed_super_admin_password');
            $generatedPassword = null;

            if (! $password) {
                if (app()->environment(['local', 'testing'])) {
                    $password = 'Admin123#';
                } else {
                    $generatedPassword = Str::random(24);
                    $password = $generatedPassword;
                }
            }

            User::create([
                'email' => $adminEmail,
                'password' => Hash::make($password),
                'first_name' => 'Super',
                'last_name' => 'Admin',
                'role' => 'super_admin',
                'role_id' => $superAdminRole ? $superAdminRole->id : null,
                'is_active' => true,
                'phone' => '08000000000',
            ]);

            if ($generatedPassword) {
                $message = "Generated a one-time super_admin password for {$adminEmail}: {$generatedPassword} — log in and rotate it immediately, then set SEED_SUPER_ADMIN_PASSWORD so future re-seeds don't generate a new one unexpectedly.";
                optional($this->command)->warn($message);
                Log::warning($message);
            }
        }

        $this->call(EmailTemplateSeeder::class);
        $this->call(SystemConfigSeeder::class);
        $this->call(PaymentAccountSeeder::class);
    }
}
