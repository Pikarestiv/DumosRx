<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
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

            // This seeder isn't first-install-only: production's only
            // migration path (`GET /migrate-db`, see routes/web.php) runs
            // `artisan migrate --seed --force` on every deploy, so this
            // block re-runs — and would re-create this account — any time
            // that one row happens to be missing (a fresh DB, a
            // disaster-recovery restore predating this row, the account
            // having been deleted/renamed). A hardcoded password here was
            // therefore a real, git-history-visible production credential,
            // not just a local-dev convenience. `SEED_SUPER_ADMIN_PASSWORD`
            // lets an operator pin a real password via .env; with nothing
            // set, production gets a random one-time password (surfaced
            // below, since this route — gated by MIGRATE_DB_KEY — is the
            // only way to reach this host at all; no SSH, see AGENTS.md)
            // instead of a predictable committed string. Local/dev keeps
            // the documented default (README's Quick Start) for onboarding
            // convenience, since a local DB is not a real credential.
            $password = env('SEED_SUPER_ADMIN_PASSWORD');
            $generatedPassword = null;

            if (!$password) {
                if (app()->environment('production')) {
                    $generatedPassword = Str::random(24);
                    $password = $generatedPassword;
                } else {
                    $password = 'Admin123#';
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
                'phone' => '08000000000'
            ]);

            if ($generatedPassword) {
                $message = "Generated a one-time super_admin password for {$adminEmail}: {$generatedPassword} — log in and rotate it immediately, then set SEED_SUPER_ADMIN_PASSWORD so future re-seeds don't generate a new one unexpectedly.";
                $this->command?->warn($message);
                Log::warning($message);
            }
        }



        $this->call(EmailTemplateSeeder::class);
        $this->call(SystemConfigSeeder::class);
        $this->call(PaymentAccountSeeder::class);
    }
}
