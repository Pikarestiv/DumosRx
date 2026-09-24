<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Regression coverage for the hardcoded-super-admin-password fix: this
 * seeder runs on every production `/migrate-db` hit (`migrate --seed`),
 * not just first install, so a hardcoded password here was a real,
 * git-history-visible production credential — see docs/KNOWN_BUGS.md.
 */
class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_env_uses_the_documented_default_password_when_unset()
    {
        // app()->environment() defaults to 'testing' here, which this
        // seeder treats the same as any other non-production environment.
        putenv('SEED_SUPER_ADMIN_PASSWORD');
        unset($_ENV['SEED_SUPER_ADMIN_PASSWORD'], $_SERVER['SEED_SUPER_ADMIN_PASSWORD']);

        (new DatabaseSeeder())->run();

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertTrue(Hash::check('Admin123#', $admin->password));
    }

    public function test_production_env_does_not_use_the_hardcoded_default_when_unset()
    {
        putenv('SEED_SUPER_ADMIN_PASSWORD');
        unset($_ENV['SEED_SUPER_ADMIN_PASSWORD'], $_SERVER['SEED_SUPER_ADMIN_PASSWORD']);

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

    public function test_seed_super_admin_password_env_var_is_honored_in_any_environment()
    {
        putenv('SEED_SUPER_ADMIN_PASSWORD=SomeStrongOperatorChosenPassword1!');
        $_ENV['SEED_SUPER_ADMIN_PASSWORD'] = 'SomeStrongOperatorChosenPassword1!';

        app()->instance('env', 'production');

        try {
            (new DatabaseSeeder())->run();
        } finally {
            app()->instance('env', 'testing');
            putenv('SEED_SUPER_ADMIN_PASSWORD');
            unset($_ENV['SEED_SUPER_ADMIN_PASSWORD'], $_SERVER['SEED_SUPER_ADMIN_PASSWORD']);
        }

        $admin = User::where('email', 'admin@dumosrx.com')->firstOrFail();
        $this->assertTrue(Hash::check('SomeStrongOperatorChosenPassword1!', $admin->password));
    }

    public function test_seeder_does_not_recreate_admin_if_already_present()
    {
        (new DatabaseSeeder())->run();
        $originalHash = User::where('email', 'admin@dumosrx.com')->value('password');

        // A second run (e.g. a re-deploy hitting /migrate-db again) must
        // not touch the existing row.
        (new DatabaseSeeder())->run();

        $this->assertSame($originalHash, User::where('email', 'admin@dumosrx.com')->value('password'));
        $this->assertSame(1, User::where('email', 'admin@dumosrx.com')->count());
    }
}
