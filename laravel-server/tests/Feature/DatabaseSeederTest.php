<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Regression coverage for the hardcoded-super-admin-password fix: this
 * seeder ran on every production `/migrate-db` hit (`migrate --seed`) until Phase 5,
 * not just first install, so a hardcoded password here was a real,
 * git-history-visible production credential — see docs/KNOWN_BUGS.md.
 */
class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    private function setSeedSuperAdminPassword(string $password): void
    {
        config(['app.seed_super_admin_password' => $password]);
    }

    private function clearSeedSuperAdminPassword(): void
    {
        config(['app.seed_super_admin_password' => null]);
    }

    public function test_local_env_uses_the_documented_default_password_when_unset()
    {
        // app()->environment() defaults to 'testing' here, which the
        // seeder buckets with 'local' as the only environments allowed the
        // documented default password.
        $this->clearSeedSuperAdminPassword();

        (new DatabaseSeeder)->run();

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertTrue(Hash::check('Admin123#', $admin->password));
    }

    public function test_production_env_does_not_use_the_hardcoded_default_when_unset()
    {
        $this->clearSeedSuperAdminPassword();

        app()->instance('env', 'production');

        try {
            (new DatabaseSeeder)->run();
        } finally {
            app()->instance('env', 'testing');
        }

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertFalse(
            Hash::check('Admin123#', $admin->password),
            'Production must never fall back to the hardcoded default password.'
        );
    }

    /**
     * Regression coverage for a review finding on the first pass of this
     * fix: the original discriminator was `environment('production')`
     * (exact match only), so a real, internet-facing deployment with any
     * OTHER environment string (`staging`, `development`, the actual
     * `deploy-dev.yml`-deployed host, etc.) fell through to the
     * hardcoded-default branch just because it wasn't literally
     * "production". The discriminator is now `!environment(['local',
     * 'testing'])`, so any deployed-but-not-local environment name is
     * treated the same as production.
     */
    public function test_non_local_non_testing_env_does_not_use_the_hardcoded_default_when_unset()
    {
        $this->clearSeedSuperAdminPassword();

        app()->instance('env', 'staging');

        try {
            (new DatabaseSeeder)->run();
        } finally {
            app()->instance('env', 'testing');
        }

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertFalse(
            Hash::check('Admin123#', $admin->password),
            'A deployed non-local, non-testing environment must never fall back to the hardcoded default password, regardless of its exact name.'
        );
    }

    public function test_seed_super_admin_password_env_var_is_honored_in_any_environment()
    {
        $this->setSeedSuperAdminPassword('SomeStrongOperatorChosenPassword1!');

        app()->instance('env', 'production');

        try {
            (new DatabaseSeeder)->run();
        } finally {
            app()->instance('env', 'testing');
            $this->clearSeedSuperAdminPassword();
        }

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertTrue(Hash::check('SomeStrongOperatorChosenPassword1!', $admin->password));
    }

    public function test_seeder_does_not_recreate_admin_if_already_present()
    {
        (new DatabaseSeeder)->run();
        $originalHash = User::where('email', 'admin@dumosrx.com')->value('password');

        // A second run (e.g. an operator re-running the seeder) must
        // not touch the existing row.
        (new DatabaseSeeder)->run();

        $this->assertSame($originalHash, User::where('email', 'admin@dumosrx.com')->value('password'));
        $this->assertSame(1, User::where('email', 'admin@dumosrx.com')->count());
    }
}
