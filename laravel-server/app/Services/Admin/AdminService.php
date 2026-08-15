<?php

namespace App\Services\Admin;

use App\Mail\AdminNotification;
use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Role;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AdminService
{
    /** Accounts a platform user (super_admin/platform_admin/agent) either
     * registered directly (AdminController::registerStore) or that signed up
     * themselves using that user's platform_referral_code link. */
    public function getReferralsFor($userId)
    {
        $user = User::findOrFail($userId);

        $referredUsers = User::where('registered_by_id', $userId)
            ->with('store')
            ->orderByDesc('created_at')
            ->get(['id', 'first_name', 'last_name', 'email', 'role', 'store_id', 'created_at']);

        return [
            'platform_referral_code' => $user->platform_referral_code,
            'referral_link' => $user->platform_referral_code
                ? (config('app.frontend_url') . '/register?agent_ref=' . $user->platform_referral_code)
                : null,
            'total' => $referredUsers->count(),
            'accounts' => $referredUsers->map(function ($u) {
                return [
                    'id' => $u->id,
                    'name' => trim($u->first_name . ' ' . $u->last_name),
                    'email' => $u->email,
                    'role' => $u->role,
                    'store_name' => $u->store->name ?? null,
                    'registered_at' => $u->created_at,
                ];
            }),
        ];
    }

    /** Normalizes a candidate platform_referral_code to lowercase-alphanumeric
     * + hyphens the same way StoreController::checkSlug normalizes store
     * slugs, so both "Pika Restiv" and "pika_restiv" land on "pika-restiv". */
    public static function normalizeReferralCode($code)
    {
        return Str::slug($code);
    }

    public function checkReferralCodeAvailable($code, $ignoreUserId = null)
    {
        $normalized = self::normalizeReferralCode($code);

        $query = User::where('platform_referral_code', $normalized);
        if ($ignoreUserId) {
            $query->where('id', '!=', $ignoreUserId);
        }

        return [
            'available' => strlen($normalized) >= 3 && strlen($normalized) <= 32 && !$query->exists(),
            'code' => $normalized,
        ];
    }

    /** $callerId edits their own code unless they're super_admin, in which
     * case $targetUserId can be anyone's. Enforced in the controller too
     * (defense in depth) but re-checked here since this is the actual write. */
    public function updateReferralCode($targetUserId, $code, $callerId)
    {
        $caller = User::findOrFail($callerId);
        if ($targetUserId !== $callerId && !$caller->hasRole('super_admin')) {
            throw new \Exception('Only super_admin can edit another user\'s referral code.');
        }

        $target = User::findOrFail($targetUserId);
        if (!in_array($target->role, ['super_admin', 'platform_admin', 'agent'])) {
            throw new \Exception('Referral codes are only for platform-level accounts.');
        }

        $normalized = self::normalizeReferralCode($code);
        if (strlen($normalized) < 3 || strlen($normalized) > 32) {
            throw new \Exception('Referral code must be 3-32 characters (letters, numbers, hyphens).');
        }

        $taken = User::where('platform_referral_code', $normalized)->where('id', '!=', $targetUserId)->exists();
        if ($taken) {
            throw new \Exception('That referral code is already taken.');
        }

        $target->platform_referral_code = $normalized;
        $target->save();

        ActivityLog::create([
            'user_id' => $callerId,
            'action' => 'REFERRAL_CODE_UPDATED',
            'description' => "Set referral code for {$target->email} ({$target->id}) to \"{$normalized}\"",
            'status' => 'success',
        ]);

        return $target->platform_referral_code;
    }

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

    public function getStores($page = 1, $search = null, $status = null, $plan = null)
    {
        $query = Store::with(['user.subscriptions'])
            ->withSum(['sales as total_revenue' => function ($q) {
                $q->where('payment_status', 'completed');
            }], 'total_amount');

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('id', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($uq) use ($search) {
                        $uq->where('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%");
                    });
            });
        }

        if ($status && $status !== 'all') {
            // Capitalize status if needed or check directly (e.g. Active, Suspended)
            $query->where('status', ucwords(strtolower($status)));
        }

        if ($plan && $plan !== 'all') {
            $query->whereHas('user.subscriptions', function ($sq) use ($plan) {
                $sq->where('status', 'active')
                    ->where('end_date', '>', now())
                    ->where('plan_name', $plan);
            });
        }

        $paginator = $query->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($store) {
                $plan = 'free';
                if ($store->user && $store->user->subscriptions->isNotEmpty()) {
                    $sub = $store->user->subscriptions->sortByDesc('created_at')->first();
                    $plan = $sub->plan_name;
                }

                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'owner' => $store->user ? $store->user->first_name.' '.$store->user->last_name : 'N/A',
                    'email' => $store->user ? $store->user->email : 'N/A',
                    'plan' => $plan,
                    'status' => $store->status ?: 'Active',
                    'stores' => 1,
                    'revenue' => '₦'.number_format($store->total_revenue ?? 0),
                    'date' => $store->created_at->format('M d, Y'),
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
                    'avgPrice' => '₦'.number_format($inventory->avg('selling_price') ?: 0, 2),
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
                'rate' => $totalProducts > 0 ? round(($lowStockCount / $totalProducts) * 100, 1) : 0,
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
     * integration token scoped to event:read/project:read) — never exposed
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

    public function getGlobalUsers($page = 1, $search = null)
    {
        $query = User::query();

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('id', 'like', "%{$search}%");
            });
        }

        $paginator = $query->with('store')->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($user) {
                return [
                    'id' => $user->id,
                    'name' => $user->first_name.' '.$user->last_name,
                    'email' => $user->email,
                    'role' => ucwords(str_replace('_', ' ', $user->role)),
                    // Raw slug alongside the humanized label above — the
                    // frontend was comparing against display-text literals
                    // like 'Store Admin' that ucwords() never actually
                    // produces for the 'admin' role slug (it produces
                    // 'Admin'), silently breaking role-gated UI for every
                    // admin-role user. Logic should key off this, not text.
                    'role_slug' => $user->role,
                    'store' => $user->store ? $user->store->name : 'Platform Admin',
                    'lastActive' => $user->last_login_at ? $user->last_login_at->diffForHumans() : 'Never',
                    'status' => $user->is_active ? 'Active' : 'Inactive',
                    'joinedAt' => $user->created_at->format('M d, Y'),
                    'deletionRequested' => $user->deletion_requested_at ? true : false,
                    'deletionReason' => $user->deletion_reason,
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

    /**
     * Platform-wide activity log, unscoped by store owner — unlike
     * Api\Web\ActivityLogController@index, which only shows a store owner
     * their own stores' staff. This is the superadmin equivalent, spanning
     * every store on the platform.
     */
    public function getActivityLogs($page = 1, $search = null, $action = null, $storeId = null, $userId = null, $dateFrom = null, $dateTo = null)
    {
        $query = ActivityLog::with(['user.store', 'user.stores'])
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
                $store = $log->user?->store ?? $log->user?->stores?->first();
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

    public function registerStore($data, $registeredById = null)
    {
        return DB::transaction(function () use ($data, $registeredById) {
            // Create the owner user
            $roleObj = Role::where('slug', 'admin')->first();
            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'phone' => $data['phone'],
                'password' => Hash::make($data['password']),
                'role' => 'admin',
                'role_id' => $roleObj ? $roleObj->id : null,
                'registered_by_id' => $registeredById,
            ]);

            // Create the store
            $store = Store::create([
                'user_id' => $user->id,
                'name' => $data['store_name'],
                'device_id' => 'WEB-'.strtoupper(Str::random(8)),
                'status' => 'Active',
                'auto_sync_enabled' => true,
            ]);

            // Create trial subscription
            app(\App\Services\SubscriptionService::class)->createTrial($user);

            if ($registeredById) {
                ActivityLog::create([
                    'user_id' => $registeredById,
                    'action' => 'ACCOUNT_REGISTERED_BY_STAFF',
                    'description' => "Registered store account: {$store->name} ({$store->id}) for {$user->email}",
                    'status' => 'success',
                ]);
            }

            return $store;
        });
    }

    public function suspendStore($id, $reason = null)
    {
        return DB::transaction(function () use ($id, $reason) {
            $store = Store::findOrFail($id);
            $store->status = 'Suspended';
            $store->suspension_reason = $reason ?: 'Your store account has been suspended for violating our terms of usage. Please contact administrative support.';
            $store->save();

            // Also suspend the owner account
            if ($store->user) {
                $store->user->is_active = false;
                $store->user->save();
            }

            // Log activity
            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'ACCOUNT_SUSPENSION',
                'description' => "Suspended store account: {$store->name} ({$store->id}). Reason: ".($reason ?: 'N/A'),
                'status' => 'success',
            ]);

            return true;
        });
    }

    public function unsuspendStore($id)
    {
        return DB::transaction(function () use ($id) {
            $store = Store::findOrFail($id);
            $store->status = 'Active';
            $store->suspension_reason = null;
            $store->save();

            // Also reactivate the owner account
            if ($store->user) {
                $store->user->is_active = true;
                $store->user->save();
            }

            // Log activity
            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'ACCOUNT_UNSUSPENSION',
                'description' => "Unsuspended store account: {$store->name} ({$store->id})",
                'status' => 'success',
            ]);

            return true;
        });
    }

    /** Resolves an admin-picked trial duration string (e.g. "3 months") into
     * an absolute end Carbon instant. An explicit $endDate always wins when
     * present — used for exact-date grants instead of a preset window. */
    private function resolveTrialEndDate(?string $durationString, ?string $endDate)
    {
        if ($endDate) {
            return \Carbon\Carbon::parse($endDate)->endOfDay();
        }

        $daysByDuration = [
            '1 day' => 1,
            '3 days' => 3,
            '7 days' => 7,
            '14 days' => 14,
            '21 days' => 21,
            '30 days' => 30,
            '1 month' => 30,
            '3 months' => 90,
            '6 months' => 180,
            '1 year' => 365,
        ];

        $days = $daysByDuration[$durationString] ?? 14; // Default
        return now()->addDays($days);
    }

    public function grantTrial($storeId, $plan, $durationString = null, $endDate = null)
    {
        return DB::transaction(function () use ($storeId, $plan, $durationString, $endDate) {
            $store = Store::findOrFail($storeId);
            $user = $store->user;

            if (! $user) {
                throw new \Exception('Store has no owner.');
            }

            $resolvedEndDate = $this->resolveTrialEndDate($durationString, $endDate);

            // Optional: Mark previous active subscriptions as expired or just leave them
            $user->subscriptions()->where('status', 'active')->update(['status' => 'expired']);

            // Create new trial subscription
            \App\Models\Subscription::create([
                'user_id' => $user->id,
                'plan_name' => strtolower($plan),
                'start_date' => now(),
                'end_date' => $resolvedEndDate,
                'status' => 'active',
                'is_trial' => true,
                'license_key' => 'DRX-TRIAL-'.strtoupper(Str::random(12)),
            ]);

            // Update store plan in UI cache / trigger sync
            $store->last_sync_at = now();
            $store->save();

            // Log activity
            $durationLabel = $endDate ? "until {$resolvedEndDate->toDateString()}" : $durationString;
            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'GRANT_FREE_TRIAL',
                'description' => "Granted {$durationLabel} {$plan} Free Trial to {$store->name} ({$store->id})",
                'status' => 'success',
            ]);

            return true;
        });
    }

    public function grantUserTrial($userId, $plan, $durationString = null, $endDate = null)
    {
        return DB::transaction(function () use ($userId, $plan, $durationString, $endDate) {
            $user = User::findOrFail($userId);

            $resolvedEndDate = $this->resolveTrialEndDate($durationString, $endDate);

            // Optional: Mark previous active subscriptions as expired or just leave them
            $user->subscriptions()->where('status', 'active')->update(['status' => 'expired']);

            // Create new trial subscription
            \App\Models\Subscription::create([
                'user_id' => $user->id,
                'plan_name' => strtolower($plan),
                'start_date' => now(),
                'end_date' => $resolvedEndDate,
                'status' => 'active',
                'is_trial' => true,
                'license_key' => 'DRX-TRIAL-'.strtoupper(Str::random(12)),
            ]);

            // Update store plan in UI cache / trigger sync
            Store::where('user_id', $user->id)->update(['last_sync_at' => now()]);

            // Log activity
            $durationLabel = $endDate ? "until {$resolvedEndDate->toDateString()}" : $durationString;
            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'GRANT_FREE_TRIAL',
                'description' => "Granted {$durationLabel} {$plan} Free Trial to user {$user->email} ({$user->id})",
                'status' => 'success',
            ]);

            return true;
        });
    }

    public function createPlatformAdmin($data, $createdById = null)
    {
        return DB::transaction(function () use ($data, $createdById) {
            $roleSlug = $data['role'] ?? 'platform_admin';
            $roleObj = Role::where('slug', $roleSlug)->first();

            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password' => Hash::make($data['password']),
                'role' => $roleSlug,
                'role_id' => $roleObj ? $roleObj->id : null,
                'is_active' => true,
                'registered_by_id' => $createdById,
            ]);

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'PLATFORM_ACCOUNT_CREATED',
                'description' => "Created new {$roleSlug} account: {$user->email} ({$user->id})",
                'status' => 'success',
            ]);

            return $user;
        });
    }

    public function deactivateUser($id)
    {
        $user = User::findOrFail($id);
        $user->is_active = false;
        $user->save();

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'USER_DEACTIVATION',
            'description' => "Deactivated user account: {$user->email} ({$user->id})",
            'status' => 'success',
        ]);

        return true;
    }

    public function reactivateUser($id)
    {
        $user = User::findOrFail($id);
        $user->is_active = true;
        $user->save();

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'USER_REACTIVATION',
            'description' => "Reactivated user account: {$user->email} ({$user->id})",
            'status' => 'success',
        ]);

        return true;
    }

    public function deleteUser($id)
    {
        return DB::transaction(function () use ($id) {
            $user = User::findOrFail($id);

            // Delete associated store (cascades should ideally handle this, but explicit deletion is safer)
            if ($user->store) {
                // If there are specific related models that need explicit deletion, handle them here.
                $user->store->delete();
            }

            $userEmail = $user->email;
            $user->delete();

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'USER_DELETION',
                'description' => "Permanently deleted user account: {$userEmail} ({$id}) and all associated data.",
                'status' => 'success',
            ]);

            return true;
        });
    }

    public function forcePasswordReset($id)
    {
        $user = User::findOrFail($id);

        // Generate a random temporary password
        $tempPassword = Str::random(12);
        $user->password = Hash::make($tempPassword);
        $user->save();

        // Send via email
        try {
            Mail::to($user->email)->send(new AdminNotification(
                "Your password has been reset by an administrator. Your temporary password is: <b>{$tempPassword}</b>. Please change it immediately.",
                'DumosRx: Password Reset'
            ));
        } catch (\Exception $e) {
            Log::error('Email Sending Failed for password reset: '.$e->getMessage());
        }

        $this->notifyUser($id, "Your password has been reset by an administrator. Your temporary password is: {$tempPassword}. Please change it immediately.", 'Security Alert');

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'PASSWORD_RESET_FORCE',
            'description' => "Forced password reset for user: {$user->email} ({$user->id}). Temporary password: {$tempPassword}",
            'status' => 'success',
        ]);

        return ['temp_password' => $tempPassword];
    }

    public function notifyUser($id, $message, $title = 'Administrative Message')
    {
        $user = User::findOrFail($id);

        // Create actual notification record
        \App\Models\Notification::create([
            'user_id' => $user->id,
            'title' => $title,
            'message' => $message,
            'type' => 'urgent',
            'is_read' => false,
        ]);

        // Send via email
        try {
            Mail::to($user->email)->send(new AdminNotification($message, $title));
        } catch (\Exception $e) {
            Log::error('Email Sending Failed for notifyUser: '.$e->getMessage());
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'ADMIN_NOTIFICATION',
            'description' => "Sent notification to user {$user->email}: {$message}",
            'status' => 'success',
        ]);

        return true;
    }

    public function bulkNotify($filters, $message, $title)
    {
        $query = User::query();

        if (! empty($filters['role']) && $filters['role'] !== 'all') {
            $query->where('role', $filters['role']);
        }

        if (! empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->get();
        $count = 0;

        foreach ($users as $user) {
            \App\Models\Notification::create([
                'user_id' => $user->id,
                'title' => $title,
                'message' => $message,
                'type' => 'urgent',
                'is_read' => false,
            ]);

            // Send via email
            try {
                Mail::to($user->email)->send(new AdminNotification($message, $title));
            } catch (\Exception $e) {
                Log::error("Email Sending Failed for bulkNotify user {$user->id}: ".$e->getMessage());
            }

            $count++;
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'BULK_ADMIN_NOTIFICATION',
            'description' => "Sent bulk notification '{$title}' to {$count} users.",
            'status' => 'success',
        ]);

        return $count;
    }

    public function impersonateStore($id)
    {
        $store = Store::findOrFail($id);
        $user = $store->user;

        if (! $user) {
            throw new \Exception('Store owner not found.');
        }

        // Generate impersonation token
        $token = $user->createToken('Impersonation Token')->plainTextToken;

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'ADMIN_IMPERSONATION',
            'description' => "Admin impersonating store owner: {$user->email} ({$store->name})",
            'status' => 'success',
        ]);

        return [
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->first_name.' '.$user->last_name,
                'email' => $user->email,
                'role' => $user->role,
                'store' => $store->name,
            ],
        ];
    }
}
