<?php

namespace App\Services\Admin;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Operational metrics (inventory, stock value, sync health, "last active")
 * for one store, behind the admin panel's Store Details page. Split out of
 * AdminStoreMetricsService once that class also hit the repo's file-size
 * rule — see laravel-server/AGENTS.md for the business/operational split
 * and the "last_active_by" design this class's lastActive() implements.
 */
class AdminStoreOperationalMetricsService
{
    private const RECENT_WINDOW_DAYS = 30;

    public function __construct(private AdminStoreMetricsService $businessMetrics)
    {
    }

    public function operationalMetrics(Store $store): array
    {
        $staffIds = User::where('store_id', $store->id)->where('id', '!=', $store->user_id)->pluck('id');
        $staffCount = $staffIds->count();
        $sessionUserIds = $staffIds->merge([$store->user_id])->filter()->unique();
        $stockValue = $this->stockValueRaw($store);

        ['at' => $lastActiveAt, 'by' => $lastActiveBy] = $this->lastActive($store);

        return [
            'staff_count' => $staffCount,
            'device_id' => $store->device_id,
            'device_count' => $store->device_id ? 1 : 0,
            'active_sessions' => $this->activeSessionCount($sessionUserIds->all()),
            'inventory' => [
                'products' => $this->countScoped('products', $store->id),
                'categories' => $this->countScoped('categories', $store->id),
                'suppliers' => $this->countScoped('suppliers', $store->id),
                'customers' => $this->countScoped('customers', $store->id),
            ],
            'stock_value_raw' => $stockValue,
            'stock_value' => $this->businessMetrics->money($store, $stockValue),
            'stock_activity' => [
                'movements' => $this->countScoped('stock_movements', $store->id),
                'movements_last_window' => $this->countScoped(
                    'stock_movements',
                    $store->id,
                    now()->subDays(self::RECENT_WINDOW_DAYS),
                ),
                'audits' => $this->countScoped('stock_audits', $store->id),
                'audits_last_window' => $this->countScoped(
                    'stock_audits',
                    $store->id,
                    now()->subDays(self::RECENT_WINDOW_DAYS),
                ),
            ],
            'last_active_at' => $lastActiveAt?->toIso8601String(),
            'last_active_human' => $lastActiveAt ? $lastActiveAt->diffForHumans() : 'Never',
            'last_active_by' => $lastActiveBy,
            'activity_last_window' => (int) DB::table('activity_logs')
                ->where('store_id', $store->id)
                ->where('created_at', '>=', now()->subDays(self::RECENT_WINDOW_DAYS))
                ->count(),
            'sync_health' => $this->syncHealth($store),
        ];
    }

    // See laravel-server/AGENTS.md ("Admin: owner vs. staff accounts...")
    // for why this resolves an actor per winning signal, not just a time.
    private function lastActive(Store $store): array
    {
        $lastSale = $this->businessMetrics->salesQuery($store)
            ->orderByDesc('created_at')
            ->select('created_at', 'cashier_id')
            ->first();
        $lastActivity = DB::table('activity_logs')
            ->where('store_id', $store->id)
            ->orderByDesc('created_at')
            ->select('created_at', 'user_id')
            ->first();

        $candidates = collect([
            $store->last_sync_at ? [
                'at' => $store->last_sync_at->toDateTimeString(),
                'user_id' => null,
                'label' => 'Device sync',
            ] : null,
            $lastSale ? [
                'at' => $lastSale->created_at,
                'user_id' => $lastSale->cashier_id,
                'label' => null,
            ] : null,
            $lastActivity ? [
                'at' => $lastActivity->created_at,
                'user_id' => $lastActivity->user_id,
                'label' => null,
            ] : null,
        ])->filter();

        if ($candidates->isEmpty()) {
            return ['at' => null, 'by' => null];
        }

        $winner = $candidates->sortByDesc(fn ($c) => Carbon::parse($c['at']))->first();

        $by = $winner['label'];
        if ($by === null && $winner['user_id']) {
            $actor = User::find($winner['user_id']);
            $by = $actor ? trim("{$actor->first_name} {$actor->last_name}") : null;
        }

        return [
            'at' => $this->clampToNow($winner['at']),
            'by' => $by,
        ];
    }

    /**
     * Live sessions only: an expired token is not a session, and the
     * admin panel's own impersonation token (AdminStoreService::
     * impersonate) is platform activity, not the store's.
     */
    private function activeSessionCount(array $userIds): int
    {
        if ($userIds === [] || !Schema::hasTable('personal_access_tokens')) {
            return 0;
        }

        return (int) DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $userIds)
            ->where('name', '!=', 'Impersonation Token')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->count();
    }

    // stock_batches.store_id is not authoritative; scoped via
    // product_id -> products.store_id instead. See laravel-server/AGENTS.md
    // and docs/KNOWN_BUGS.md A-145 for why and its remaining limits.
    private function stockValueRaw(Store $store): float
    {
        if (!Schema::hasTable('stock_batches')) {
            return 0.0;
        }

        $productIds = Product::query()->where('store_id', $store->id)->select('id');

        $total = DB::table('stock_batches')
            ->whereIn('product_id', $productIds)
            ->whereNull('deleted_at')
            ->selectRaw('COALESCE(SUM(quantity * cost_price), 0) as total_value')
            ->value('total_value');

        return (float) $total;
    }

    private function countScoped(string $table, string $storeId, ?Carbon $since = null): int
    {
        if (!Schema::hasTable($table)) {
            return 0;
        }

        $query = DB::table($table)->where('store_id', $storeId);

        if (Schema::hasColumn($table, 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        if ($since && Schema::hasColumn($table, 'created_at')) {
            $query->where('created_at', '>=', $since);
        }

        return (int) $query->count();
    }

    private function syncHealth(Store $store): string
    {
        if (!$store->last_sync_at) {
            return 'Never synced';
        }

        $hours = $this->clampToNow($store->last_sync_at)->diffInHours(now());

        return match (true) {
            $hours < 24 => 'Healthy',
            $hours < 24 * 7 => 'Stale',
            default => 'Dormant',
        };
    }

    // Clamps a clock-skewed device's future-dated push; see
    // laravel-server/AGENTS.md ("operationalMetrics()/businessMetrics()...").
    public function clampToNow(string|Carbon|null $value): ?Carbon
    {
        if ($value === null) {
            return null;
        }

        $parsed = $value instanceof Carbon ? $value : Carbon::parse($value);
        $now = now();

        return $parsed->greaterThan($now) ? $now : $parsed;
    }
}
