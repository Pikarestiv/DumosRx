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

    private const SEED_PASSWORD_VAR = 'SEED_SUPER_ADMIN_PASSWORD';

    /**
     * `env()` reads through phpdotenv's default adapter chain, and
     * `ServerConstAdapter` ($_SERVER) is consulted BEFORE `EnvConstAdapter`
     * ($_ENV) and `PutenvAdapter` — the first adapter holding the name wins.
     * Loading a `.env` that declares the key writes it to all three, so a
     * test that sets only `putenv()` + `$_ENV` is silently overridden by the
     * stale `$_SERVER` copy and `env()` returns the `.env` value.
     *
     * That is exactly the local/CI split this file hit: the repo's own `.env`
     * has no `SEED_SUPER_ADMIN_PASSWORD` line at all, while CI runs against a
     * copy of `.env.example`, which declares it empty (`SEED_SUPER_ADMIN_PASSWORD=`).
     * So the seeder read `''`, fell through to the random-password branch, and
     * the assertion failed in CI only. Always write and clear all three
     * channels together.
     */
    private function setSeedSuperAdminPassword(string $password): void
    {
        putenv(self::SEED_PASSWORD_VAR . '=' . $password);
        $_ENV[self::SEED_PASSWORD_VAR] = $password;
        $_SERVER[self::SEED_PASSWORD_VAR] = $password;
    }

    private function clearSeedSuperAdminPassword(): void
    {
        putenv(self::SEED_PASSWORD_VAR);
        unset($_ENV[self::SEED_PASSWORD_VAR], $_SERVER[self::SEED_PASSWORD_VAR]);
    }

    public function test_local_env_uses_the_documented_default_password_when_unset()
    {
        // app()->environment() defaults to 'testing' here, which the
        // seeder buckets with 'local' as the only environments allowed the
        // documented default password.
        $this->clearSeedSuperAdminPassword();

        (new DatabaseSeeder())->run();

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertTrue(Hash::check('Admin123#', $admin->password));
    }

    public function test_production_env_does_not_use_the_hardcoded_default_when_unset()
    {
        $this->clearSeedSuperAdminPassword();

        app()->instance('env', 'production');

        try {
            (new DatabaseSeeder())->run();
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
            (new DatabaseSeeder())->run();
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
            (new DatabaseSeeder())->run();
        } finally {
            app()->instance('env', 'testing');
            $this->clearSeedSuperAdminPassword();
        }

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertTrue(Hash::check('SomeStrongOperatorChosenPassword1!', $admin->password));
    }

    public function test_seeder_does_not_recreate_admin_if_already_present()
    {
        (new DatabaseSeeder())->run();
        $originalHash = User::where('email', 'admin@dumosrx.com')->value('password');

        // A second run (e.g. an operator re-running the seeder) must
        // not touch the existing row.
        (new DatabaseSeeder())->run();

        $this->assertSame($originalHash, User::where('email', 'admin@dumosrx.com')->value('password'));
        $this->assertSame(1, User::where('email', 'admin@dumosrx.com')->count());
    }
}
