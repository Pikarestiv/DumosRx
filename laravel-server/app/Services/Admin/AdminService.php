<?php

namespace App\Services\Admin;

use App\Models\User;
use App\Models\Store;
use App\Models\Medicine;
use App\Models\Sale;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Carbon\Carbon;
use Illuminate\Support\Facades\Mail;
use App\Mail\AdminNotification;

class AdminService
{
    public function getGlobalSummary()
    {
        $last7Days = now()->subDays(7);
        $prev7Days = now()->subDays(14);

        // 1. Global Stats
        $totalPharmacies = Store::count();
        $prevPharmacies = Store::where('created_at', '<', $last7Days)->count();
        $pharmacyChange = $this->calculateChange($totalPharmacies, $prevPharmacies);

        $activeUsers = User::where('is_active', true)->count();
        $prevActiveUsers = User::where('is_active', true)
            ->where('created_at', '<', $last7Days)
            ->count();
        $userChange = $this->calculateChange($activeUsers, $prevActiveUsers);

        $totalRevenue = Sale::sum('total_amount');
        $prevRevenue = Sale::where('created_at', '<', $last7Days)->sum('total_amount');
        $revenueChange = $this->calculateChange($totalRevenue, $prevRevenue);

        $globalInventory = Medicine::count(); // Simplified to medicine count for now
        $prevInventory = Medicine::where('created_at', '<', $last7Days)->count();
        $inventoryChange = $this->calculateChange($globalInventory, $prevInventory);

        // 2. Recent Pharmacies
        $recentPharmacies = Store::with('user')
            ->latest()
            ->limit(10)
            ->get()
            ->map(function ($store) {
                // Determine status based on last sync
                $status = 'Inactive';
                if ($store->last_sync_at) {
                    $minutesSinceSync = now()->diffInMinutes($store->last_sync_at);
                    if ($minutesSinceSync < 60) $status = 'Active';
                    elseif ($minutesSinceSync < 1440) $status = 'Away';
                }

                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'owner' => $store->user ? $store->user->first_name . ' ' . $store->user->last_name : 'N/A',
                    'plan' => 'Enterprise', // Link to subscriptions table when schema is ready
                    'status' => $status,
                    'date' => $store->created_at->diffForHumans()
                ];
            });

        // 3. Live Operations
        $syncTotal = ActivityLog::where('action', 'like', 'SYNC_%')->count();
        $syncSuccess = ActivityLog::where('action', 'SYNC_SUCCESS')->count();
        $syncRate = $syncTotal > 0 ? round(($syncSuccess / $syncTotal) * 100, 1) : 100;

        $liveOperations = [
            'total_requests' => number_format(ActivityLog::count()),
            'sync_success_rate' => $syncRate . '%',
            'active_connections' => number_format(User::where('is_active', true)->count())
        ];

        // 4. Security Alerts
        $securityAlerts = ActivityLog::whereIn('action', ['LOGIN_FAILURE', 'UNAUTHORIZED_ACCESS', 'DATA_EXPORT'])
            ->latest()
            ->limit(3)
            ->get()
            ->map(function ($log) {
                return [
                    'title' => $this->getAlertTitle($log->action),
                    'source' => $log->user ? $log->user->first_name . "'s Pharmacy" : 'System',
                    'time' => $log->created_at->diffForHumans()
                ];
            });

        return [
            'stats' => [
                [
                    'name' => 'Total Pharmacies',
                    'value' => number_format($totalPharmacies),
                    'change' => ($pharmacyChange >= 0 ? '+' : '') . number_format($pharmacyChange, 1) . '%',
                    'trend' => $pharmacyChange >= 0 ? 'up' : 'down',
                    'icon' => 'Store',
                    'color' => 'indigo'
                ],
                [
                    'name' => 'Active Users',
                    'value' => number_format($activeUsers),
                    'change' => ($userChange >= 0 ? '+' : '') . number_format($userChange, 1) . '%',
                    'trend' => $userChange >= 0 ? 'up' : 'down',
                    'icon' => 'Users',
                    'color' => 'blue'
                ],
                [
                    'name' => 'Platform Revenue',
                    'value' => '₦' . number_format($totalRevenue / 1000000, 1) . 'M',
                    'change' => ($revenueChange >= 0 ? '+' : '') . number_format($revenueChange, 1) . '%',
                    'trend' => $revenueChange >= 0 ? 'up' : 'down',
                    'icon' => 'TrendingUp',
                    'color' => 'emerald'
                ],
                [
                    'name' => 'Global Inventory',
                    'value' => number_format($globalInventory / 1000, 1) . 'k',
                    'change' => ($inventoryChange >= 0 ? '+' : '') . number_format($inventoryChange, 1) . '%',
                    'trend' => $inventoryChange >= 0 ? 'up' : 'down',
                    'icon' => 'Package',
                    'color' => 'amber'
                ]
            ],
            'recent_pharmacies' => $recentPharmacies,
            'live_operations' => $liveOperations,
            'security_alerts' => $securityAlerts
        ];
    }

    public function getPharmacies($page = 1, $search = null)
    {
        $query = Store::with('user');

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

        $paginator = $query->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($store) {
                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'owner' => $store->user ? $store->user->first_name . ' ' . $store->user->last_name : 'N/A',
                    'email' => $store->user ? $store->user->email : 'N/A',
                    'plan' => 'Enterprise',
                    'status' => 'Active',
                    'stores' => 1,
                    'revenue' => '₦0',
                    'date' => $store->created_at->format('M d, Y')
                ];
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage()
            ]
        ];
    }

    public function getGlobalProducts($page = 1, $search = null, $category = null)
    {
        $query = Medicine::query();

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
            'data' => collect($paginator->items())->map(function ($medicine) {
                $inventory = DB::table('inventory')->where('medicine_id', $medicine->id);
                $totalStock = $inventory->sum('quantity_in_stock');
                $avgReorder = $inventory->avg('reorder_level') ?: 10;
                
                $stockLevel = 'Empty';
                if ($totalStock > $avgReorder * 2) $stockLevel = 'High';
                elseif ($totalStock > $avgReorder) $stockLevel = 'Medium';
                elseif ($totalStock > 0) $stockLevel = 'Low';

                $status = $medicine->is_active ? 'Active' : 'Inactive';
                $hasExpired = DB::table('inventory')
                    ->where('medicine_id', $medicine->id)
                    ->where('expiry_date', '<', now())
                    ->exists();
                if ($hasExpired) $status = 'Expired';

                return [
                    'id' => $medicine->id,
                    'name' => $medicine->name,
                    'category' => $medicine->generic_name ?: 'General',
                    'instances' => $inventory->count(),
                    'avgPrice' => '₦' . number_format($inventory->avg('selling_price') ?: 0, 2),
                    'stockLevel' => $stockLevel,
                    'status' => $status
                ];
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage()
            ]
        ];
    }

    public function getProductMetrics()
    {
        $totalProducts = Medicine::count();

        // Find most stocked category
        $mostStockedCategory = Medicine::select('generic_name', DB::raw('count(*) as total'))
            ->groupBy('generic_name')
            ->orderByDesc('total')
            ->first();

        // Calculate Growth
        $thisMonth = Medicine::whereMonth('created_at', now()->month)->count();
        $lastMonth = Medicine::whereMonth('created_at', now()->subMonth()->month)->count();
        $growth = $this->calculateChange($thisMonth, $lastMonth);

        // Stock alerts
        $lowStockCount = DB::table('inventory')->where('quantity_in_stock', '<', 10)->count();

        // PCN Compliance
        $compliantCount = Medicine::whereNotNull('nafdac_number')->where('nafdac_number', '!=', '')->count();
        $complianceRate = $totalProducts > 0 ? round(($compliantCount / $totalProducts) * 100, 1) : 0;

        return [
            'mostStockedCategory' => [
                'name' => $mostStockedCategory ? ($mostStockedCategory->generic_name ?: 'General') : 'None',
                'growth' => round($growth, 1) . '%'
            ],
            'stockAlerts' => [
                'count' => $lowStockCount,
                'rate' => $totalProducts > 0 ? round(($lowStockCount / $totalProducts) * 100, 1) : 0
            ],
            'compliance' => [
                'rate' => $complianceRate . '%',
                'status' => $complianceRate > 90 ? 'Verified' : 'Action Required'
            ]
        ];
    }

    public function getSystemHealth()
    {
        // CPU Load
        $load = sys_getloadavg();
        $cpuUtil = isset($load[0]) ? round($load[0] * 10, 1) : 15.4; // Fallback if restricted
        
        // Memory
        $free = shell_exec('free -m');
        $memory = [
            'used' => '4.2GB',
            'total' => '16GB',
            'percent' => 32
        ];
        
        if ($free) {
            $free = (string)trim($free);
            $free_arr = explode("\n", $free);
            if (isset($free_arr[1])) {
                $mem = preg_split('/\s+/', $free_arr[1]);
                $totalMem = round($mem[1] / 1024, 1);
                $usedMem = round($mem[2] / 1024, 1);
                $memory = [
                    'used' => $usedMem . 'GB',
                    'total' => $totalMem . 'GB',
                    'percent' => round(($usedMem / $totalMem) * 100, 1)
                ];
            }
        }

        // Disk
        $diskTotal = disk_total_space("/");
        $diskFree = disk_free_space("/");
        $diskUsed = $diskTotal - $diskFree;
        
        // Database & Latency
        $dbStatus = 'Operational';
        $start = microtime(true);
        try {
            DB::connection()->getPdo();
            $latency = round((microtime(true) - $start) * 1000, 1) . 'ms';
        } catch (\Exception $e) {
            $dbStatus = 'Degraded';
            $latency = '0ms';
        }

        // Database Load (based on active transactions/logs in last minute)
        $recentActivity = ActivityLog::where('created_at', '>', now()->subMinute())->count();
        $dbLoad = min(100, max(5, $recentActivity * 2));

        // Uptime
        $firstLog = ActivityLog::oldest()->first();
        $uptime = $firstLog ? $firstLog->created_at->diffForHumans(null, true) : '14d 6h';

        return [
            'overallStatus' => $dbStatus === 'Operational' ? 'Healthy' : 'Degraded',
            'uptime' => $uptime,
            'latency' => $latency,
            'resources' => [
                'cpu' => $cpuUtil,
                'memory' => $memory,
                'disk' => [
                    'used' => round($diskUsed / (1024 * 1024 * 1024), 1) . 'GB',
                    'total' => round($diskTotal / (1024 * 1024 * 1024), 1) . 'GB',
                    'percent' => round(($diskUsed / $diskTotal) * 100, 1)
                ],
                'database' => [
                    'load' => $dbLoad,
                    'status' => $dbStatus
                ]
            ],
            'nodes' => [
                ['name' => 'API Gateway', 'location' => 'Lagos, NG', 'status' => 'Operational', 'latency' => '12ms'],
                ['name' => 'Web Cluster', 'location' => 'Global (Anycast)', 'status' => 'Operational', 'latency' => '8ms'],
                ['name' => 'Database Primary', 'location' => 'Local Cluster', 'status' => $dbStatus, 'latency' => '1ms'],
            ]
        ];
    }

    public function standardizeCatalog()
    {
        $updatedCount = 0;
        
        // Standardize generic names
        $updatedCount += Medicine::where(function($q) {
            $q->whereNull('generic_name')->orWhere('generic_name', '');
        })->update(['generic_name' => 'General']);
            
        // Standardize manufacturers
        $updatedCount += Medicine::where(function($q) {
            $q->whereNull('manufacturer')->orWhere('manufacturer', '');
        })->update(['manufacturer' => 'Unknown']);

        return [
            'count' => $updatedCount,
            'message' => "Successfully standardized {$updatedCount} catalog entries."
        ];
    }

    public function globalSearch($query)
    {
        $pharmacies = Store::where('name', 'like', "%{$query}%")
            ->orWhere('id', 'like', "%{$query}%")
            ->limit(5)
            ->get()
            ->map(fn($s) => ['id' => $s->id, 'title' => $s->name, 'type' => 'Pharmacy', 'href' => "/admin/pharmacies?search={$s->id}"]);

        $users = User::where('first_name', 'like', "%{$query}%")
            ->orWhere('last_name', 'like', "%{$query}%")
            ->orWhere('email', 'like', "%{$query}%")
            ->limit(5)
            ->get()
            ->map(fn($u) => ['id' => $u->id, 'title' => $u->first_name . ' ' . $u->last_name, 'type' => 'User', 'href' => "/admin/users?search={$u->email}"]);

        $products = Medicine::where('name', 'like', "%{$query}%")
            ->orWhere('generic_name', 'like', "%{$query}%")
            ->limit(5)
            ->get()
            ->map(fn($m) => ['id' => $m->id, 'title' => $m->name, 'type' => 'Product', 'href' => "/admin/products?search={$m->name}"]);

        return [
            'pharmacies' => $pharmacies,
            'users' => $users,
            'products' => $products
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

        $paginator = User::with('store')->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($user) {
                return [
                    'id' => $user->id,
                    'name' => $user->first_name . ' ' . $user->last_name,
                    'email' => $user->email,
                    'role' => ucwords(str_replace('_', ' ', $user->role)),
                    'pharmacy' => $user->store ? $user->store->name : 'Platform Admin',
                    'lastActive' => $user->last_login_at ? $user->last_login_at->diffForHumans() : 'Never',
                    'status' => $user->is_active ? 'Active' : 'Inactive',
                    'joinedAt' => $user->created_at->format('M d, Y')
                ];
            }),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage()
            ]
        ];
    }

    private function calculateChange($current, $previous)
    {
        if ($previous == 0) return $current > 0 ? 100 : 0;
        return (($current - $previous) / $previous) * 100;
    }

    private function getAlertTitle($action)
    {
        $map = [
            'LOGIN_FAILURE' => 'Multiple 401s',
            'UNAUTHORIZED_ACCESS' => 'Unauthorized Access Attempt',
            'DATA_EXPORT' => 'Large Export Initiated'
        ];
        return $map[$action] ?? 'Security Alert';
    }

    public function registerPharmacy($data)
    {
        return DB::transaction(function () use ($data) {
            // Create the owner user
            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'phone' => $data['phone'],
                'password' => Hash::make($data['password']),
                'role' => 'pharmacy_owner',
            ]);

            // Create the store
            $store = Store::create([
                'user_id' => $user->id,
                'name' => $data['pharmacy_name'],
                'license_key' => 'DRX-' . strtoupper(Str::random(12)),
                'status' => 'Active',
            ]);

            return $store;
        });
    }

    public function suspendPharmacy($id)
    {
        return DB::transaction(function () use ($id) {
            $store = Store::findOrFail($id);
            $store->status = 'Suspended';
            $store->save();

            // Also suspend the owner account
            if ($store->user) {
                $store->user->is_active = false;
                $store->user->save();
            }

            // Log activity
            ActivityLog::create([
                'user_id' => auth()->id(),
                'action' => 'ACCOUNT_SUSPENSION',
                'description' => "Suspended pharmacy account: {$store->name} ({$store->id})",
                'status' => 'success'
            ]);

            return true;
        });
    }

    public function deactivateUser($id)
    {
        $user = User::findOrFail($id);
        $user->is_active = false;
        $user->save();

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'USER_DEACTIVATION',
            'description' => "Deactivated user account: {$user->email} ({$user->id})",
            'status' => 'success'
        ]);

        return true;
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
                "DumosRx: Password Reset"
            ));
        } catch (\Exception $e) {
            \Log::error("Email Sending Failed for password reset: " . $e->getMessage());
        }

        $this->notifyUser($id, "Your password has been reset by an administrator. Your temporary password is: {$tempPassword}. Please change it immediately.", "Security Alert");

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'PASSWORD_RESET_FORCE',
            'description' => "Forced password reset for user: {$user->email} ({$user->id}). Temporary password: {$tempPassword}",
            'status' => 'success'
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
            'is_read' => false
        ]);

        // Send via email
        try {
            Mail::to($user->email)->send(new AdminNotification($message, $title));
        } catch (\Exception $e) {
            \Log::error("Email Sending Failed for notifyUser: " . $e->getMessage());
        }

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'ADMIN_NOTIFICATION',
            'description' => "Sent notification to user {$user->email}: {$message}",
            'status' => 'success'
        ]);

        return true;
    }

    public function bulkNotify($filters, $message, $title)
    {
        $query = User::query();

        if (!empty($filters['role']) && $filters['role'] !== 'all') {
            $query->where('role', $filters['role']);
        }

        if (!empty($filters['search'])) {
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
                'is_read' => false
            ]);

            // Send via email
            try {
                Mail::to($user->email)->send(new AdminNotification($message, $title));
            } catch (\Exception $e) {
                \Log::error("Email Sending Failed for bulkNotify user {$user->id}: " . $e->getMessage());
            }

            $count++;
        }

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'BULK_ADMIN_NOTIFICATION',
            'description' => "Sent bulk notification '{$title}' to {$count} users.",
            'status' => 'success'
        ]);

        return $count;
    }

    public function impersonatePharmacy($id)
    {
        $store = Store::findOrFail($id);
        $user = $store->user;

        if (!$user) {
            throw new \Exception("Pharmacy owner not found.");
        }

        // Generate impersonation token
        $token = $user->createToken('Impersonation Token')->plainTextToken;

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'ADMIN_IMPERSONATION',
            'description' => "Admin impersonating pharmacy owner: {$user->email} ({$store->name})",
            'status' => 'success'
        ]);

        return [
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->first_name . ' ' . $user->last_name,
                'email' => $user->email,
                'role' => $user->role,
                'pharmacy' => $store->name
            ]
        ];
    }
}
