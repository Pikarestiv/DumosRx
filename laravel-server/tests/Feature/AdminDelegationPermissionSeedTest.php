<?php

namespace Tests\Feature;

use App\Models\Role;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDelegationPermissionSeedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->runMigration();
    }

    public function test_grants_platform_admin_all_5_delegatable_permissions()
    {
        $platformAdmin = Role::where('slug', 'platform_admin')->first();
        $slugs = $platformAdmin->permissions()->pluck('slug')->sort()->values()->all();

        foreach (['view_platform_data', 'send_notifications', 'reset_user_passwords', 'manage_account_status', 'impersonate_store'] as $expected) {
            $this->assertContains($expected, $slugs);
        }
    }

    public function test_grants_agent_only_view_platform_data_and_send_notifications()
    {
        $agent = Role::where('slug', 'agent')->first();
        $slugs = $agent->permissions()->pluck('slug')->all();

        $this->assertContains('view_platform_data', $slugs);
        $this->assertContains('send_notifications', $slugs);
        $this->assertNotContains('reset_user_passwords', $slugs);
        $this->assertNotContains('manage_account_status', $slugs);
        $this->assertNotContains('impersonate_store', $slugs);
    }

    public function test_does_not_remove_platform_admins_existing_manage_platform_create_accounts_grant_trials_permissions()
    {
        $platformAdmin = Role::where('slug', 'platform_admin')->first();
        $slugs = $platformAdmin->permissions()->pluck('slug')->all();

        $this->assertContains('manage_platform', $slugs);
        $this->assertContains('create_accounts', $slugs);
        $this->assertContains('grant_trials', $slugs);
    }

    private function runMigration(): void
    {
        (require base_path('database/migrations/2026_10_02_000003_seed_admin_delegation_permissions.php'))->up();
    }
}
