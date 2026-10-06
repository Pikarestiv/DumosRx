<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AdminHealthService
{
    public function getSystemHealth()
    {
        $cpuUtil = 0;
        if (function_exists('sys_getloadavg')) {
            try {
                $load = @sys_getloadavg();
                if (is_array($load) && isset($load[0])) {
                    $cpuUtil = round($load[0] * 10, 1);
                }
            } catch (\Throwable $e) {
                // Ignore
            }
        }

        $memory = [
            'used' => 'Unknown',
            'total' => 'Unknown',
            'percent' => 0,
        ];
        if (function_exists('shell_exec')) {
            try {
                $free = @shell_exec('free -m');
                if ($free) {
                    $free = (string) trim($free);
                    $free_arr = explode("\n", $free);
                    if (isset($free_arr[1])) {
                        $mem = preg_split('/\s+/', $free_arr[1]);
                        $totalMem = round($mem[1] / 1024, 1);
                        $usedMem = round($mem[2] / 1024, 1);
                        $memory = [
                            'used' => $usedMem.'GB',
                            'total' => $totalMem.'GB',
                            'percent' => round(($usedMem / $totalMem) * 100, 1),
                        ];
                    }
                }
            } catch (\Throwable $e) {
                // Ignore
            }
        }

        $diskTotal = 0;
        $diskFree = 0;
        try {
            if (function_exists('disk_total_space')) {
                $diskTotal = @disk_total_space('/') ?: 0;
            }
            if (function_exists('disk_free_space')) {
                $diskFree = @disk_free_space('/') ?: 0;
            }
        } catch (\Throwable $e) {
            // Ignore
        }
        $diskUsed = $diskTotal - $diskFree;

        $dbStatus = 'Operational';
        $start = microtime(true);
        try {
            DB::connection()->getPdo();
            $latency = round((microtime(true) - $start) * 1000, 1).'ms';
        } catch (\Exception $e) {
            $dbStatus = 'Degraded';
            $latency = '0ms';
        }

        $recentActivity = ActivityLog::where('created_at', '>', now()->subMinute())->count();
        $dbLoad = min(100, max(5, $recentActivity * 2));

        $firstLog = ActivityLog::oldest()->first();
        $uptime = $firstLog ? $firstLog->created_at->diffForHumans(null, true) : 'No data';

        return [
            'overallStatus' => $dbStatus === 'Operational' ? 'Healthy' : 'Degraded',
            'uptime' => $uptime,
            'latency' => $latency,
            'resources' => [
                'cpu' => $cpuUtil,
                'memory' => $memory,
                'disk' => [
                    'used' => $diskTotal > 0 ? round($diskUsed / (1024 * 1024 * 1024), 1).'GB' : 'Unknown',
                    'total' => $diskTotal > 0 ? round($diskTotal / (1024 * 1024 * 1024), 1).'GB' : 'Unknown',
                    'percent' => $diskTotal > 0 ? round(($diskUsed / $diskTotal) * 100, 1) : 0,
                ],
                'database' => [
                    'load' => $dbLoad,
                    'status' => $dbStatus,
                ],
            ],
            'nodes' => [
                ['name' => 'Primary Server', 'location' => 'Main Hosting Node', 'status' => 'Operational', 'latency' => $latency],
                ['name' => 'Database Primary', 'location' => 'Local Cluster', 'status' => $dbStatus, 'latency' => '1ms'],
            ],
        ];
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
