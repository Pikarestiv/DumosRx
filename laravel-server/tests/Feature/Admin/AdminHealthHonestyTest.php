<?php

namespace Tests\Feature\Admin;

use App\Services\Admin\AdminHealthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminHealthHonestyTest extends TestCase
{
    use RefreshDatabase;

    private function health(): array
    {
        return app(AdminHealthService::class)->getSystemHealth();
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

    public function test_load_average_is_null_rather_than_zero_when_unmeasurable(): void
    {
        $loadAverage = $this->health()['resources']['loadAverage'];

        if ($loadAverage === null) {
            $this->assertNull($loadAverage);

            return;
        }

        $this->assertArrayHasKey(1, $loadAverage);
        $this->assertArrayHasKey(5, $loadAverage);
        $this->assertArrayHasKey(15, $loadAverage);
    }

    public function test_memory_is_null_rather_than_a_zero_bar_when_shell_exec_is_unavailable(): void
    {
        $memory = $this->health()['resources']['memory'];

        if ($memory === null) {
            $this->assertNull($memory);

            return;
        }

        $this->assertNotSame('Unknown', $memory['used']);
        $this->assertNotSame(0, $memory['percent']);
    }

    public function test_disk_is_null_rather_than_an_unknown_string_when_unmeasurable(): void
    {
        $disk = $this->health()['resources']['disk'];

        if ($disk === null) {
            $this->assertNull($disk);

            return;
        }

        $this->assertNotSame('Unknown', $disk['used']);
        $this->assertNotSame('Unknown', $disk['total']);
    }
}
