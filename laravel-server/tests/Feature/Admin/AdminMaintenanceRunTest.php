<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\User;
use App\Services\Admin\AdminMaintenanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class AdminMaintenanceRunTest extends TestCase
{
    use RefreshDatabase;

    private function service(): AdminMaintenanceService
    {
        return app(AdminMaintenanceService::class);
    }

    private function actor(): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => 'Tester',
            'email' => 'actor-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
    }

    /**
     * The endpoint this replaces ran `migrate --seed --force`, reseeding
     * production on every call (A-174). The invocation is asserted directly
     * because that is the defect, and a behavioural assertion cannot see
     * which flags were passed.
     */
    public function test_it_runs_migrate_without_seeding(): void
    {
        Artisan::shouldReceive('call')->once()->with('migrate', ['--force' => true])->andReturn(0);
        Artisan::shouldReceive('output')->andReturn('Nothing to migrate.');

        $result = $this->service()->runPendingMigrations($this->actor()->id);

        $this->assertTrue($result['ok']);
    }

    /**
     * A failed migration is the run most worth having a record of, so the
     * audit entry cannot live inside the success path.
     */
    public function test_a_failed_run_still_records_what_happened(): void
    {
        Artisan::shouldReceive('call')->once()->andThrow(new \RuntimeException('SQLSTATE[42S01]: Base table already exists'));
        Artisan::shouldReceive('output')->andReturn('');

        $result = $this->service()->runPendingMigrations($this->actor()->id);

        $this->assertFalse($result['ok']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'MIGRATIONS_RUN']);
        $this->assertStringContainsString('FAILED', ActivityLog::latest('id')->first()->description);
        $this->assertStringContainsString('SQLSTATE', $result['output']);
    }

    /**
     * A request that times out mid-migration loses its response while the
     * migration may still be applying, so the operator's source of truth is
     * re-read state rather than the outcome of the request.
     */
    public function test_the_result_carries_the_freshly_read_status(): void
    {
        Artisan::shouldReceive('call')->once()->andReturn(0);
        Artisan::shouldReceive('output')->andReturn('Nothing to migrate.');

        $result = $this->service()->runPendingMigrations($this->actor()->id);

        $this->assertArrayHasKey('status_after', $result);
        $this->assertSame('ok', $result['status_after']['status']);
        $this->assertArrayHasKey('pending_count', $result['status_after']);
    }

    /**
     * Dropping `--seed` from the migrate path would otherwise silently end
     * the only route by which a newly declared permission reaches production,
     * since RolesAndPermissionsSeeder ran on every old `/migrate-db` hit.
     * It is a separate, separately-confirmed action instead — and critically
     * it invokes that seeder alone, never DatabaseSeeder, which creates a
     * super-admin account and must not run as a side effect of anything.
     */
    public function test_syncing_roles_runs_only_the_roles_seeder(): void
    {
        Artisan::shouldReceive('call')->once()
            ->with('db:seed', ['--class' => 'Database\\Seeders\\RolesAndPermissionsSeeder', '--force' => true])
            ->andReturn(0);
        Artisan::shouldReceive('output')->andReturn('Seeded.');

        $result = $this->service()->syncRolesAndPermissions($this->actor()->id);

        $this->assertTrue($result['ok']);
    }

    public function test_a_failed_role_sync_is_recorded_and_reported(): void
    {
        Artisan::shouldReceive('call')->once()->andThrow(new \RuntimeException('seeder blew up'));
        Artisan::shouldReceive('output')->andReturn('');

        $result = $this->service()->syncRolesAndPermissions($this->actor()->id);

        $this->assertFalse($result['ok']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'ROLES_PERMISSIONS_SYNCED']);
        $this->assertStringContainsString('FAILED', ActivityLog::latest('id')->first()->description);
    }

    public function test_a_successful_run_records_the_actor_and_the_action(): void
    {
        Artisan::shouldReceive('call')->once()->andReturn(0);
        Artisan::shouldReceive('output')->andReturn('Nothing to migrate.');

        $actor = $this->actor();
        $this->service()->runPendingMigrations($actor->id);

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'MIGRATIONS_RUN',
            'user_id' => $actor->id,
        ]);
    }
}
