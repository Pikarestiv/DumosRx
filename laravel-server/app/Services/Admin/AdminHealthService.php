<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

class AdminHealthService
{
    public function getSystemHealth()
    {
        $connectMs = $this->databaseConnectMs();
        $dbStatus = $connectMs === null ? 'Degraded' : 'Operational';

        $recentActivity = ActivityLog::where('created_at', '>', now()->subMinute())->count();
        $firstLog = ActivityLog::oldest()->first();

        return [
            'overallStatus' => $dbStatus === 'Operational' ? 'Healthy' : 'Degraded',
            'platformAge' => $firstLog ? $firstLog->created_at->diffForHumans(null, true) : 'No data',
            'databaseConnectMs' => $connectMs,
            'resources' => [
                'loadAverage' => $this->loadAverage(),
                'memory' => $this->memory(),
                'disk' => $this->disk(),
                'database' => [
                    'load' => min(100, max(5, $recentActivity * 2)),
                    'status' => $dbStatus,
                ],
            ],
            'probes' => [
                ['name' => 'Database', 'status' => $dbStatus],
                ['name' => 'Cache', 'status' => $this->cacheProbe()],
                ['name' => 'Storage', 'status' => $this->storageProbe()],
                ['name' => 'Queue', 'status' => $this->queueProbe()],
            ],
        ];
    }

    private function databaseConnectMs(): ?float
    {
        $start = microtime(true);

        try {
            DB::connection()->getPdo();

            return round((microtime(true) - $start) * 1000, 1);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function loadAverage(): ?array
    {
        if (! function_exists('sys_getloadavg')) {
            return null;
        }

        try {
            $load = @sys_getloadavg();
        } catch (\Throwable $e) {
            return null;
        }

        if (! is_array($load) || ! isset($load[0], $load[1], $load[2])) {
            return null;
        }

        return [
            1 => round((float) $load[0], 2),
            5 => round((float) $load[1], 2),
            15 => round((float) $load[2], 2),
        ];
    }

    private function memory(): ?array
    {
        if (! function_exists('shell_exec')) {
            return null;
        }

        try {
            $free = @shell_exec('free -m');
        } catch (\Throwable $e) {
            return null;
        }

        if (! $free) {
            return null;
        }

        $lines = explode("\n", (string) trim($free));
        if (! isset($lines[1])) {
            return null;
        }

        $mem = preg_split('/\s+/', $lines[1]);
        if (! isset($mem[1], $mem[2]) || ! is_numeric($mem[1]) || ! is_numeric($mem[2]) || (float) $mem[1] <= 0) {
            return null;
        }

        $totalMem = round($mem[1] / 1024, 1);
        $usedMem = round($mem[2] / 1024, 1);

        return [
            'used' => $usedMem.'GB',
            'total' => $totalMem.'GB',
            'percent' => round(($usedMem / $totalMem) * 100, 1),
        ];
    }

    private function disk(): ?array
    {
        if (! function_exists('disk_total_space') || ! function_exists('disk_free_space')) {
            return null;
        }

        try {
            $total = @disk_total_space('/') ?: 0;
            $free = @disk_free_space('/') ?: 0;
        } catch (\Throwable $e) {
            return null;
        }

        if ($total <= 0) {
            return null;
        }

        $used = $total - $free;

        return [
            'used' => round($used / (1024 ** 3), 1).'GB',
            'total' => round($total / (1024 ** 3), 1).'GB',
            'percent' => round(($used / $total) * 100, 1),
        ];
    }

    private function cacheProbe(): string
    {
        $key = 'admin_health_probe';

        try {
            Cache::put($key, 'ok', 10);
            $read = Cache::get($key);
            Cache::forget($key);

            return $read === 'ok' ? 'Operational' : 'Degraded';
        } catch (\Throwable $e) {
            return 'Unavailable';
        }
    }

    private function storageProbe(): string
    {
        try {
            return is_writable(storage_path('app')) ? 'Operational' : 'Degraded';
        } catch (\Throwable $e) {
            return 'Unavailable';
        }
    }

    private function queueProbe(): string
    {
        try {
            Queue::connection();

            return 'Operational';
        } catch (\Throwable $e) {
            return 'Unavailable';
        }
    }

    public function getRecentErrors()
    {
        $token = config('dumos.sentry.api_token');
        $org = config('dumos.sentry.org_slug');

        if (! $token || ! $org) {
            return [
                'configured' => false,
                'issues' => [],
            ];
        }

        $projects = ['dumosrx-client', 'dumosrx-server'];
        $issues = [];

        foreach ($projects as $project) {
            try {
                $response = \Illuminate\Support\Facades\Http::withToken($token)
                    ->timeout(5)
                    ->get("https://sentry.io/api/0/projects/{$org}/{$project}/issues/", [
                        'query' => 'is:unresolved',
                        'sort' => 'freq',
                        'statsPeriod' => '14d',
                        'limit' => 10,
                    ]);

                if ($response->successful()) {
                    foreach ($response->json() as $issue) {
                        $issues[] = [
                            'id' => $issue['id'] ?? null,
                            'project' => $project,
                            'title' => $issue['title'] ?? 'Unknown error',
                            'culprit' => $issue['culprit'] ?? null,
                            'level' => $issue['level'] ?? 'error',
                            'count' => (int) ($issue['count'] ?? 0),
                            'userCount' => (int) ($issue['userCount'] ?? 0),
                            'lastSeen' => $issue['lastSeen'] ?? null,
                            'firstSeen' => $issue['firstSeen'] ?? null,
                            'permalink' => $issue['permalink'] ?? null,
                        ];
                    }
                } else {
                    Log::error("Sentry issues fetch failed for {$project}: ".$response->status());
                }
            } catch (\Throwable $e) {
                Log::error("Sentry issues fetch error for {$project}: ".$e->getMessage());
            }
        }

        usort($issues, fn ($a, $b) => strtotime($b['lastSeen'] ?? 'now') <=> strtotime($a['lastSeen'] ?? 'now'));

        return [
            'configured' => true,
            'issues' => $issues,
        ];
    }
}
