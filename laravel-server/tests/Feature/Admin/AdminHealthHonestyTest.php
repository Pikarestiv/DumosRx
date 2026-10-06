<?php

namespace Tests\Feature\Admin;

use App\Services\Admin\AdminHealthService;
use App\Support\HostMetrics;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminHealthHonestyTest extends TestCase
{
    use RefreshDatabase;

    private function health(): array
    {
        return app(AdminHealthService::class)->getSystemHealth();
    }

    /** Swaps the host readings for a stub so both the available and the
     * unavailable branch are reachable regardless of the machine running
     * the suite. See laravel-server/AGENTS.md. */
    private function withHostMetrics(?array $load, ?array $memory, ?array $disk): void
    {
        $this->app->instance(HostMetrics::class, new class($load, $memory, $disk) extends HostMetrics
        {
            public function __construct(
                private ?array $load,
                private ?array $mem,
                private ?array $dsk
            ) {}

            public function loadAverage(): ?array
            {
                return $this->load;
            }

            public function memory(): ?array
            {
                return $this->mem;
            }

            public function disk(): ?array
            {
                return $this->dsk;
            }
        });
    }

    public function test_it_no_longer_reports_fabricated_infrastructure_nodes(): void
    {
        $this->assertArrayNotHasKey('nodes', $this->health());
    }

    public function test_it_reports_real_probes_instead(): void
    {
        $names = array_column($this->health()['probes'], 'name');

        $this->assertContains('Database', $names);
        $this->assertContains('Cache', $names);
        $this->assertContains('Storage', $names);
        $this->assertContains('Queue', $names);
    }

    public function test_every_probe_reports_a_known_status(): void
    {
        foreach ($this->health()['probes'] as $probe) {
            $this->assertContains($probe['status'], ['Operational', 'Degraded', 'Unavailable']);
            $this->assertArrayNotHasKey('latency', $probe);
        }
    }

    public function test_it_reports_database_connect_time_not_a_p99_latency(): void
    {
        $health = $this->health();

        $this->assertArrayNotHasKey('latency', $health);
        $this->assertArrayHasKey('databaseConnectMs', $health);
        $this->assertIsFloat($health['databaseConnectMs']);
    }

    /**
     * Connection::getPdo() returns an already-resolved PDO instance, so timing
     * it brackets a property read and reports ~0ms on any host. The figure
     * replaced a hardcoded "42ms", so it has to measure a real round trip.
     */
    public function test_the_connect_timer_issues_a_real_round_trip(): void
    {
        $statements = [];
        DB::listen(function ($query) use (&$statements) {
            $statements[] = $query->sql;
        });

        $this->health();

        $this->assertContains('select 1', $statements);
    }

    public function test_it_reports_platform_age_not_uptime(): void
    {
        $health = $this->health();

        $this->assertArrayNotHasKey('uptime', $health);
        $this->assertArrayHasKey('platformAge', $health);
    }

    public function test_it_reports_load_average_not_a_fabricated_cpu_percentage(): void
    {
        $resources = $this->health()['resources'];

        $this->assertArrayNotHasKey('cpu', $resources);
        $this->assertArrayHasKey('loadAverage', $resources);
    }

    /**
     * `min(100, max(5, $recentActivity * 2))` is not a load figure in any
     * unit: it floors an idle platform at 5% and saturates at 100% after 50
     * activity rows. It is the same class of invention as the removed CPU
     * percentage and fake node latencies.
     */
    public function test_it_no_longer_reports_a_fabricated_database_load(): void
    {
        $database = $this->health()['resources']['database'];

        $this->assertArrayNotHasKey('load', $database);
        $this->assertArrayHasKey('status', $database);
    }

    public function test_unmeasurable_host_readings_are_null_not_zero(): void
    {
        $this->withHostMetrics(null, null, null);

        $resources = $this->health()['resources'];

        $this->assertNull($resources['loadAverage']);
        $this->assertNull($resources['memory']);
        $this->assertNull($resources['disk']);
    }

    public function test_measurable_host_readings_are_passed_through(): void
    {
        $this->withHostMetrics(
            [1 => 1.5, 5 => 1.25, 15 => 1.0],
            ['used' => '4GB', 'total' => '8GB', 'percent' => 50.0],
            ['used' => '100GB', 'total' => '200GB', 'percent' => 50.0],
        );

        $resources = $this->health()['resources'];

        $this->assertSame([1 => 1.5, 5 => 1.25, 15 => 1.0], $resources['loadAverage']);
        $this->assertSame('4GB', $resources['memory']['used']);
        $this->assertSame(50.0, $resources['disk']['percent']);
    }

    /**
     * The Database probe exists to report a dead connection, so the method
     * must not itself blow up on one: the activity-log reads that follow the
     * timer ran unguarded against the same connection and turned a
     * "Degraded" report into a 500.
     */
    public function test_it_reports_degraded_without_throwing_when_the_database_is_unavailable(): void
    {
        config(['database.connections.broken' => [
            'driver' => 'sqlite',
            'database' => '/nonexistent-directory/definitely-not-here.sqlite',
            'prefix' => '',
        ]]);

        $original = config('database.default');
        config(['database.default' => 'broken']);

        try {
            $health = $this->health();
        } finally {
            config(['database.default' => $original]);
            DB::purge('broken');
        }

        $this->assertSame('Degraded', $health['overallStatus']);
        $this->assertNull($health['databaseConnectMs']);
        $this->assertSame('Degraded', $health['resources']['database']['status']);

        $probes = collect($health['probes'])->keyBy('name');
        $this->assertSame('Degraded', $probes['Database']['status']);
    }
}
