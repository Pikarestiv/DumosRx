<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;

class AdminActivityService
{
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
     * Super-admin actions are privileged operational detail (role changes,
     * subscription overrides, migrations), not peer accountability. Everyone
     * below super_admin sees their own peer group and store-level activity
     * but not these. See laravel-server/AGENTS.md.
     */
    private function hideSuperAdminActionsFromOperators($query): void
    {
        $viewer = \Illuminate\Support\Facades\Auth::user();

        if ($viewer && $viewer->hasRole('super_admin')) {
            return;
        }

        $query->where(function ($q) {
            $q->whereDoesntHave('user', function ($uq) {
                $uq->where('role', 'super_admin');
            });
        });
    }

    public function getActivityLogs($page = 1, $search = null, $action = null, $storeId = null, $userId = null, $dateFrom = null, $dateTo = null, $role = null)
    {
        $query = ActivityLog::with(['user.store', 'user.stores', 'user.employerStore'])
            ->where('action', '!=', 'CLIENT_API_ERROR');

        $this->hideSuperAdminActionsFromOperators($query);

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

        if ($role) {
            $query->whereHas('user', function ($uq) use ($role) {
                $uq->where('role', $role);
            });
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
}
