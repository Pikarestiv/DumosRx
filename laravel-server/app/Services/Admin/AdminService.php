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
            'total_requests' => number_format(ActivityLog::count()),
            'sync_success_rate' => '100%',
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
        
        // In a production app, you would send this via email.
        // For now, we log it and also create a system notification for the user
        // so they can see it if they somehow manage to log in or if an admin tells them.
        $this->notifyUser($id, "Your password has been reset by an administrator. Your temporary password is: {$tempPassword}. Please change it immediately.");

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'PASSWORD_RESET_FORCE',
            'description' => "Forced password reset for user: {$user->email} ({$user->id}). Temporary password: {$tempPassword}",
            'status' => 'success'
        ]);

        return ['temp_password' => $tempPassword];
    }

    public function notifyUser($id, $message)
    {
        $user = User::findOrFail($id);
        
        // Create actual notification record
        \App\Models\Notification::create([
            'user_id' => $user->id,
            'title' => 'Administrative Message',
            'message' => $message,
            'type' => 'urgent',
            'is_read' => false
        ]);

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'ADMIN_NOTIFICATION',
            'description' => "Sent notification to user {$user->email}: {$message}",
            'status' => 'success'
        ]);

        return true;
    }
}
