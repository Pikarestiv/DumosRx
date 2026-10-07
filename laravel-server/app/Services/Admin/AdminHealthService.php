<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Support\HostMetrics;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;

class AdminHealthService
{
    public function __construct(private HostMetrics $host) {}

    public function getSystemHealth()
    {
        $connectMs = $this->databaseConnectMs();
        $dbStatus = $connectMs === null ? 'Degraded' : 'Operational';

        return [
            'overallStatus' => $dbStatus === 'Operational' ? 'Healthy' : 'Degraded',
            'platformAge' => $this->platformAge(),
            'databaseConnectMs' => $connectMs,
            'resources' => [
                'loadAverage' => $this->host->loadAverage(),
                'memory' => $this->host->memory(),
                'disk' => $this->host->disk(),
                'database' => [
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

    private function databaseConnectMs(): ?float
    {
        $start = microtime(true);

        try {
            DB::select('select 1');

            return round((microtime(true) - $start) * 1000, 1);
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function platformAge(): string
    {
        try {
            $firstLog = ActivityLog::oldest()->first();
        } catch (\Throwable $e) {
            return 'Unavailable';
        }

        return $firstLog ? $firstLog->created_at->diffForHumans(null, true) : 'No data';
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
            Queue::connection()->size();

            return 'Operational';
        } catch (\Throwable $e) {
            return 'Unavailable';
        }
    }
}
