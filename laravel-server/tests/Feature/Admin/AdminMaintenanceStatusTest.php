<?php

namespace Tests\Feature\Admin;

use App\Services\Admin\AdminMaintenanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminMaintenanceStatusTest extends TestCase
{
    use RefreshDatabase;

    private function service(): AdminMaintenanceService
    {
        return app(AdminMaintenanceService::class);
    }

    public function test_it_lists_pending_migrations_in_apply_order(): void
    {
        $status = $this->service()->migrationStatus();

        $this->assertSame('ok', $status['status']);
        $this->assertIsArray($status['pending']);
        $this->assertSame(count($status['pending']), $status['pending_count']);
    }

    /**
     * "0 pending" is indistinguishable from "up to date" and is exactly the
     * false statement A-170 consisted of, so the unreadable case must not
     * be able to render as a count at all.
     */
    public function test_an_unreadable_migrations_table_is_unknown_not_zero_pending(): void
    {
        Schema::drop('migrations');

        $status = $this->service()->migrationStatus();

        $this->assertSame('unknown', $status['status']);
        $this->assertNotSame(0, $status['pending_count'], 'unknown must not be reported as zero pending');
        $this->assertNull($status['pending_count']);
        $this->assertNotNull($status['error']);
    }

    /**
     * Found by a browser smoke test, not by this suite: constructor-injecting
     * `Migrator` 500s on a real HTTP request, because MigrationServiceProvider
     * is deferred and auto-wiring the concrete class fails on the unbound
     * MigrationRepositoryInterface. Every test here passed anyway — PHPUnit
     * boots Artisan, which registers that provider, so the behaviour under
     * test is not the behaviour in production.
     *
     * Asserted at the source level for the same reason
     * PaymentProviderTimeoutTest is: the passing case is indistinguishable
     * from the broken one inside this harness.
     */
    public function test_the_migrator_is_resolved_by_alias_not_constructor_injected(): void
    {
        $constructor = (new \ReflectionClass(AdminMaintenanceService::class))->getConstructor();

        $this->assertNull(
            $constructor,
            'AdminMaintenanceService must not constructor-inject Migrator: it is unresolvable in an HTTP request'
        );

        $this->assertStringContainsString(
            "app('migrator')",
            file_get_contents(app_path('Services/Admin/AdminMaintenanceService.php')),
            'the migrator must be resolved through its deferred-provider alias'
        );
    }

    public function test_it_flags_a_pending_migration_that_removes_a_column(): void
    {
        $this->assertTrue($this->service()->fileAltersExistingData(
            base_path('tests/fixtures/migrations/2026_01_01_000001_destructive_fixture.php')
        ));
    }

    public function test_it_does_not_flag_a_purely_additive_migration(): void
    {
        $this->assertFalse($this->service()->fileAltersExistingData(
            base_path('tests/fixtures/migrations/2026_01_01_000000_additive_fixture.php')
        ));
    }

    /**
     * Nearly every additive migration drops the column again in `down()`.
     * Scanning the whole file would flag all of them, which is the same as
     * flagging none.
     */
    public function test_it_does_not_flag_a_migration_whose_drop_is_only_in_down(): void
    {
        $source = file_get_contents(
            base_path('tests/fixtures/migrations/2026_01_01_000000_additive_fixture.php')
        );

        $this->assertStringContainsString('dropColumn', $source);
        $this->assertFalse($this->service()->fileAltersExistingData(
            base_path('tests/fixtures/migrations/2026_01_01_000000_additive_fixture.php')
        ));
    }
}
