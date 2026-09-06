<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Platform-wide, not-store-or-user-scoped admin views: the dashboard
 * summary, the global product catalog + catalog metrics/standardization,
 * system health, recent Sentry errors, platform-wide activity log, and
 * global search. Split out of the original AdminService, alongside
 * AdminStoreService and AdminUserService, so each admin sub-domain owns a
 * service roughly the size of the others instead of one 1300-line class.
 */
class AdminPlatformService
{
    public function getGlobalSummary()
    {
        $last7Days = now()->subDays(7);
        $prev7Days = now()->subDays(14);

        // 1. Global Stats
        $totalStores = Store::count();
        $prevStores = Store::where('created_at', '<', $last7Days)->count();
        $storeChange = $this->calculateChange($totalStores, $prevStores);

        $activeUsers = User::where('is_active', true)
            ->where('role', '!=', 'super_admin')
            ->count();
        $prevActiveUsers = User::where('is_active', true)
            ->where('role', '!=', 'super_admin')
            ->where('created_at', '<', $last7Days)
            ->count();
        $userChange = $this->calculateChange($activeUsers, $prevActiveUsers);

        $totalRevenue = Sale::sum('total_amount');
        $prevRevenue = Sale::where('created_at', '<', $last7Days)->sum('total_amount');
        $revenueChange = $this->calculateChange($totalRevenue, $prevRevenue);

        $globalInventory = Product::count(); // Simplified to product count for now
        $prevInventory = Product::where('created_at', '<', $last7Days)->count();
        $inventoryChange = $this->calculateChange($globalInventory, $prevInventory);

        // 2. Recent Stores
        $recentStores = Store::with('user')
            ->latest()
            ->limit(10)
            ->get()
            ->map(function ($store) {
                // Determine status based on last sync
                $status = 'Inactive';
                if ($store->last_sync_at) {
                    $minutesSinceSync = now()->diffInMinutes($store->last_sync_at);
                    if ($minutesSinceSync < 60) {
                        $status = 'Active';
                    } elseif ($minutesSinceSync < 1440) {
                        $status = 'Away';
                    }
                }

                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'owner' => $store->user ? $store->user->first_name.' '.$store->user->last_name : 'N/A',
                    'plan' => ($store->user && $store->user->subscriptions->isNotEmpty()) ? ucwords($store->user->subscriptions->sortByDesc('created_at')->first()->plan_name) : 'Basic',
                    'status' => $status,
                    'date' => $store->created_at->diffForHumans(),
                ];
            });

        // 3. Live Operations
        $syncTotal = ActivityLog::where('action', 'like', 'SYNC_%')->count();
        $syncSuccess = ActivityLog::where('action', 'SYNC_SUCCESS')->count();
        $syncRate = $syncTotal > 0 ? round(($syncSuccess / $syncTotal) * 100, 1) : 100;

        $liveOperations = [
            'total_requests' => number_format(ActivityLog::count()),
            'sync_success_rate' => $syncRate.'%',
            'active_connections' => number_format(User::where('is_active', true)->where('role', '!=', 'super_admin')->count()),
        ];

        // 4. Security Alerts
        $securityAlerts = ActivityLog::whereIn('action', [
            'LOGIN_FAILURE',
            'UNAUTHORIZED_ACCESS',
            'DATA_EXPORT',
            'ACCOUNT_DELETION_REQUESTED',
            'ACCOUNT_DELETION_CANCELLED',
        ])
            ->latest()
            ->limit(5)
            ->get()
            ->map(function ($log) {
                return [
                    'title' => $this->getAlertTitle($log->action),
                    'source' => $log->user ? $log->user->first_name."'s Store" : 'System',
                    'time' => $log->created_at->diffForHumans(),
                ];
            });

        return [
            'stats' => [
                [
                    'name' => 'Total Stores',
                    'value' => number_format($totalStores),
                    'change' => ($storeChange >= 0 ? '+' : '').number_format($storeChange, 1).'%',
                    'trend' => $storeChange >= 0 ? 'up' : 'down',
                    'icon' => 'Store',
                    'color' => 'indigo',
                ],
                [
                    'name' => 'Active Users',
                    'value' => number_format($activeUsers),
                    'change' => ($userChange >= 0 ? '+' : '').number_format($userChange, 1).'%',
                    'trend' => $userChange >= 0 ? 'up' : 'down',
                    'icon' => 'Users',
                    'color' => 'blue',
                ],
                [
                    'name' => 'Platform Revenue',
                    'value' => '₦'.number_format($totalRevenue / 1000000, 1).'M',
                    'change' => ($revenueChange >= 0 ? '+' : '').number_format($revenueChange, 1).'%',
                    'trend' => $revenueChange >= 0 ? 'up' : 'down',
                    'icon' => 'TrendingUp',
                    'color' => 'emerald',
                ],
                [
                    'name' => 'Global Inventory',
                    'value' => number_format($globalInventory / 1000, 1).'k',
                    'change' => ($inventoryChange >= 0 ? '+' : '').number_format($inventoryChange, 1).'%',
                    'trend' => $inventoryChange >= 0 ? 'up' : 'down',
                    'icon' => 'Package',
                    'color' => 'amber',
                ],
            ],
            'recent_stores' => $recentStores,
            'live_operations' => $liveOperations,
            'security_alerts' => $securityAlerts,
        ];
    }

    public function getGlobalProducts($page = 1, $search = null, $category = null)
    {
        $query = Product::query();

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('id', 'like', "%{$search}%")
                    ->orWhere('generic_name', 'like', "%{$search}%");
            });
        }

        if ($category && $category !== 'all') {
            $query->where('generic_name', $category);
        }

        $paginator = $query->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($product) {
                $inventory = DB::table('stock_batches')->where('product_id', $product->id);
                $totalStock = $inventory->sum('quantity');
                $avgReorder = 10; // Default reorder level fallback
                if ($product->reorder_level) {
                    $avgReorder = $product->reorder_level;
                }

                $stockLevel = 'Empty';
                if ($totalStock > $avgReorder * 2) {
                    $stockLevel = 'High';
                } elseif ($totalStock > $avgReorder) {
                    $stockLevel = 'Medium';
                } elseif ($totalStock > 0) {
                    $stockLevel = 'Low';
                }

                $status = $product->is_active ? 'Active' : 'Inactive';
                $hasExpired = DB::table('stock_batches')
                    ->where('product_id', $product->id)
                    ->where('expiry_date', '<', now())
                    ->exists();
                if ($hasExpired) {
                    $status = 'Expired';
                }

                return [
                    'id' => $product->id,
                    'name' => $product->name,
                    'category' => $product->generic_name ?: 'General',
                    'instances' => $inventory->count(),
                    'avgPrice' => '₦'.number_format($product->selling_price ?: 0, 2),
                    'stockLevel' => $stockLevel,
                    'status' => $status,
                ];
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
            ],
        ];
    }

    public function getProductMetrics()
    {
        $totalProducts = Product::count();

        // Find most stocked category
        $mostStockedCategory = Product::select('generic_name', DB::raw('count(*) as total'))
            ->groupBy('generic_name')
            ->orderByDesc('total')
            ->first();

        // Calculate Growth
        $thisMonth = Product::whereYear('created_at', now()->year)
            ->whereMonth('created_at', now()->month)
            ->count();
        $lastMonth = Product::whereYear('created_at', now()->subMonth()->year)
            ->whereMonth('created_at', now()->subMonth()->month)
            ->count();
        $growth = $this->calculateChange($thisMonth, $lastMonth);

        // Stock alerts
        $lowStockCount = DB::table('stock_batches')->where('quantity', '<', 10)->count();

        // PCN Compliance
        $compliantCount = Product::whereNotNull('nafdac_number')->where('nafdac_number', '!=', '')->count();
        $complianceRate = $totalProducts > 0 ? round(($compliantCount / $totalProducts) * 100, 1) : 0;

        return [
            'mostStockedCategory' => [
                'name' => $mostStockedCategory ? ($mostStockedCategory->generic_name ?: 'General') : 'None',
                'growth' => round($growth, 1).'%',
            ],
            'stockAlerts' => [
                'count' => $lowStockCount,
                'rate' => ($totalProducts > 0 ? round(($lowStockCount / $totalProducts) * 100, 1) : 0).'%',
            ],
            'compliance' => [
                'rate' => $complianceRate.'%',
                'status' => $complianceRate > 90 ? 'Verified' : 'Action Required',
            ],
        ];
    }

    public function getSystemHealth()
    {
        // CPU Load
        $cpuUtil = 0; // Default to 0 if we can't read it
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

        // Memory
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

        // Disk
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

        // Database & Latency
        $dbStatus = 'Operational';
        $start = microtime(true);
        try {
            DB::connection()->getPdo();
            $latency = round((microtime(true) - $start) * 1000, 1).'ms';
        } catch (\Exception $e) {
            $dbStatus = 'Degraded';
            $latency = '0ms';
        }

        // Database Load (based on active transactions/logs in last minute)
        $recentActivity = ActivityLog::where('created_at', '>', now()->subMinute())->count();
        $dbLoad = min(100, max(5, $recentActivity * 2));

        // Uptime based on first recorded activity log
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

    /**
     * Recent unresolved issues across both Sentry projects (client + server),
     * for the super-admin dashboard. Requires SENTRY_API_TOKEN (an internal
     * integration token scoped to event:read/project:read), never exposed
     * to the browser, since `web/` is a static export with no server of its
     * own to keep it secret.
     */
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

    public function standardizeCatalog()
    {
        $updatedCount = 0;

        // Standardize generic names
        $updatedCount += Product::where(function ($q) {
            $q->whereNull('generic_name')->orWhere('generic_name', '');
        })->update(['generic_name' => 'General']);

        // Standardize manufacturers
        $updatedCount += Product::where(function ($q) {
            $q->whereNull('manufacturer')->orWhere('manufacturer', '');
        })->update(['manufacturer' => 'Unknown']);

        return [
            'count' => $updatedCount,
            'message' => "Successfully standardized {$updatedCount} catalog entries.",
        ];
    }

    public function globalSearch($query)
    {
        $stores = Store::where('name', 'like', "%{$query}%")
            ->orWhere('id', 'like', "%{$query}%")
            ->limit(5)
            ->get()
            ->map(fn ($s) => ['id' => $s->id, 'title' => $s->name, 'type' => 'Store', 'href' => "/admin/stores?search={$s->id}"]);

        $users = User::where('first_name', 'like', "%{$query}%")
            ->orWhere('last_name', 'like', "%{$query}%")
            ->orWhere('email', 'like', "%{$query}%")
            ->limit(5)
            ->get()
            ->map(fn ($u) => ['id' => $u->id, 'title' => $u->first_name.' '.$u->last_name, 'type' => 'User', 'href' => "/admin/users?search={$u->email}"]);

        $products = Product::where('name', 'like', "%{$query}%")
            ->orWhere('generic_name', 'like', "%{$query}%")
            ->limit(5)
            ->get()
            ->map(fn ($m) => ['id' => $m->id, 'title' => $m->name, 'type' => 'Product', 'href' => "/admin/products?search={$m->name}"]);

        return [
            'stores' => $stores,
            'users' => $users,
            'products' => $products,
        ];
    }

    /**
     * Platform-wide activity log, unscoped by store owner. Unlike
     * Api\Web\ActivityLogController@index, which only shows a store owner
     * their own stores' staff. This is the superadmin equivalent, spanning
     * every store on the platform.
     */
    public function getActivityLogs($page = 1, $search = null, $action = null, $storeId = null, $userId = null, $dateFrom = null, $dateTo = null)
    {
        $query = ActivityLog::with(['user.store', 'user.stores', 'user.employerStore'])
            ->where('action', '!=', 'CLIENT_API_ERROR');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                    ->orWhere('action', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($uq) use ($search) {
                        $uq->where('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        if ($action) {
            $query->where('action', $action);
        }

        if ($userId) {
            $query->where('user_id', $userId);
        }

        if ($storeId) {
            $query->whereHas('user', function ($uq) use ($storeId) {
                $uq->where('store_id', $storeId)
                    ->orWhereHas('stores', function ($sq) use ($storeId) {
                        $sq->where('id', $storeId);
                    });
            });
        }

        if ($dateFrom) {
            $query->where('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('created_at', '<=', $dateTo);
        }

        $paginator = $query->latest()->paginate(50, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function (ActivityLog $log) {
                $store = $log->user?->displayStore ?? $log->user?->stores?->first();
                return [
                    'id' => $log->id,
                    'action' => $log->action,
                    'description' => $log->description,
                    'user' => $log->user ? [
                        'id' => $log->user->id,
                        'name' => trim("{$log->user->first_name} {$log->user->last_name}"),
                        'email' => $log->user->email,
                        'role' => $log->user->role,
                    ] : null,
                    'store' => $store ? ['id' => $store->id, 'name' => $store->name] : null,
                    'ip_address' => $log->ip_address,
                    'properties' => $log->properties,
                    'created_at' => $log->created_at,
                ];
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
            ],
        ];
    }

    private function calculateChange($current, $previous)
    {
        if ($previous == 0) {
            return $current > 0 ? 100 : 0;
        }

        return (($current - $previous) / $previous) * 100;
    }

    private function getAlertTitle($action)
    {
        $map = [
            'LOGIN_FAILURE' => 'Multiple 401s',
            'UNAUTHORIZED_ACCESS' => 'Unauthorized Access Attempt',
            'DATA_EXPORT' => 'Large Export Initiated',
            'ACCOUNT_DELETION_REQUESTED' => 'Account Deletion Requested',
            'ACCOUNT_DELETION_CANCELLED' => 'Account Deletion Cancelled',
        ];

        return $map[$action] ?? 'Security Alert';
    }
}
