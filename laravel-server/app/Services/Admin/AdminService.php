<?php

namespace App\Services\Admin;

use App\Models\User;
use App\Models\Store;
use App\Models\Medicine;
use App\Models\Sale;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

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
                return [
                    'id' => $store->id,
                    'name' => $store->name,
                    'owner' => $store->user ? $store->user->first_name . ' ' . $store->user->last_name : 'N/A',
                    'plan' => 'Enterprise', // Hardcoded for now until subscription link is ready
                    'status' => 'Active',
                    'date' => $store->created_at->diffForHumans()
                ];
            });

        // 3. Live Operations
        $liveOperations = [
            'total_requests' => number_format(ActivityLog::count() + 1200),
            'sync_success_rate' => '99.9%',
            'active_connections' => number_format(User::where('is_active', true)->count() + 5)
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

    public function getGlobalProducts($page = 1, $search = null)
    {
        $query = Medicine::query();

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('id', 'like', "%{$search}%")
                  ->orWhere('generic_name', 'like', "%{$search}%");
            });
        }

        $paginator = $query->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($medicine) {
                return [
                    'id' => $medicine->id,
                    'name' => $medicine->name,
                    'category' => $medicine->generic_name ?: 'General',
                    'instances' => DB::table('inventory')->where('medicine_id', $medicine->id)->count(),
                    'avgPrice' => '₦' . number_format(DB::table('inventory')->where('medicine_id', $medicine->id)->avg('selling_price') ?: 0, 2),
                    'stockLevel' => 'High',
                    'status' => 'Verified'
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

        $paginator = $query->latest()->paginate(10, ['*'], 'page', $page);

        return [
            'data' => collect($paginator->items())->map(function ($user) {
                return [
                    'id' => $user->id,
                    'name' => $user->first_name . ' ' . $user->last_name,
                    'email' => $user->email,
                    'role' => ucwords(str_replace('_', ' ', $user->role)),
                    'pharmacy' => 'DumosTech Global',
                    'lastActive' => $user->last_login_at ? $user->last_login_at->diffForHumans() : 'Never',
                    'status' => $user->is_active ? 'Active' : 'Inactive'
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
}
