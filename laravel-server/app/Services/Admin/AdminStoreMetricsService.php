<?php

namespace App\Services\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Business and operational metrics for one store, behind the admin panel's
 * Store Details page. Split out of AdminStoreDetailService, which already
 * owns the profile/owner/subscription/sync payload, so neither file grows
 * past the repo's size rule.
 *
 * Every sales figure here goes through salesQuery(), which repeats the
 * store-scoping of AdminStoreService::revenueSubquery() (sales.store_id
 * when present, legacy cashier match when null) so the metrics can never
 * quote a different revenue than the fleet list does for the same store.
 */
class AdminStoreMetricsService
{
    private const TREND_MONTHS = 6;

    private const RECENT_WINDOW_DAYS = 30;

    public function businessMetrics(Store $store): array
    {
        $totals = $this->salesQuery($store)
            ->selectRaw('COUNT(*) as order_count')
            ->selectRaw('COALESCE(SUM(total_amount), 0) as revenue')
            ->selectRaw('MIN(created_at) as first_sale_at')
            ->selectRaw('MAX(created_at) as last_sale_at')
            ->first();

        $orderCount = (int) ($totals->order_count ?? 0);
        $revenue = (float) ($totals->revenue ?? 0);

        $windowStart = now()->subDays(self::RECENT_WINDOW_DAYS);
        $previousStart = now()->subDays(self::RECENT_WINDOW_DAYS * 2);

        $current = $this->windowTotals($store, $windowStart, null);
        $previous = $this->windowTotals($store, $previousStart, $windowStart);

        return [
            'revenue_raw' => $revenue,
            'revenue' => $this->money($store, $revenue),
            'order_count' => $orderCount,
            'average_order_value' => $this->money($store, $orderCount > 0 ? $revenue / $orderCount : 0),
            'average_order_value_raw' => $orderCount > 0 ? round($revenue / $orderCount, 2) : 0.0,
            'active_days' => $this->activeDays($store),
            'days_since_registration' => $store->created_at
                ? (int) $store->created_at->diffInDays(now())
                : 0,
            'first_sale_at' => $this->humanDate($totals->first_sale_at ?? null),
            'last_sale_at' => $this->humanDate($totals->last_sale_at ?? null),
            'window_days' => self::RECENT_WINDOW_DAYS,
            'revenue_last_window' => $this->money($store, $current['revenue']),
            'orders_last_window' => $current['orders'],
            'revenue_growth_pct' => $this->growth($previous['revenue'], $current['revenue']),
            'order_growth_pct' => $this->growth($previous['orders'], $current['orders']),
            'monthly_trend' => $this->monthlyTrend($store),
        ];
    }

    public function operationalMetrics(Store $store): array
    {
        $staffIds = User::where('store_id', $store->id)->where('id', '!=', $store->user_id)->pluck('id');
        $staffCount = $staffIds->count();
        $sessionUserIds = $staffIds->merge([$store->user_id])->filter()->unique();
        $stockValue = $this->stockValueRaw($store);

        $lastSaleAt = $this->salesQuery($store)->max('created_at');
        $lastActivityAt = DB::table('activity_logs')->where('store_id', $store->id)->max('created_at');
        $lastActiveAt = collect([
            $store->last_sync_at?->toDateTimeString(),
            $lastSaleAt,
            $lastActivityAt,
        ])->filter()->max();
        $lastActiveAt = $this->clampToNow($lastActiveAt);

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
            'stock_value' => $this->money($store, $stockValue),
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
            'activity_last_window' => (int) DB::table('activity_logs')
                ->where('store_id', $store->id)
                ->where('created_at', '>=', now()->subDays(self::RECENT_WINDOW_DAYS))
                ->count(),
            'sync_health' => $this->syncHealth($store),
        ];
    }

    /**
     * Mirrors AdminStoreService::revenueSubquery()'s scoping as a real
     * query builder: sales.store_id when the sync engine populated it,
     * falling back to the owner's / staff's cashier_id for rows synced
     * before that column existed, and excluding soft-deleted rows the way
     * the SoftDeletes global scope would.
     */
    public function salesQuery(Store $store)
    {
        return DB::table('sales')->whereNull('sales.deleted_at')->where(function ($q) use ($store) {
            $q->where('sales.store_id', $store->id)
                ->orWhere(function ($fallback) use ($store) {
                    $fallback->whereNull('sales.store_id')
                        ->where(function ($cashierMatch) use ($store) {
                            $cashierMatch->where('sales.cashier_id', $store->user_id)
                                ->orWhereIn('sales.cashier_id', function ($staffIds) use ($store) {
                                    $staffIds->select('id')->from('users')->where('users.store_id', $store->id);
                                });
                        });
                });
        });
    }

    private function windowTotals(Store $store, Carbon $from, ?Carbon $to): array
    {
        $row = $this->salesQuery($store)
            ->where('created_at', '>=', $from)
            ->when($to, fn ($q) => $q->where('created_at', '<', $to))
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(total_amount), 0) as revenue')
            ->first();

        return [
            'orders' => (int) ($row->orders ?? 0),
            'revenue' => (float) ($row->revenue ?? 0),
        ];
    }

    private function monthlyTrend(Store $store): array
    {
        $months = [];

        for ($offset = self::TREND_MONTHS - 1; $offset >= 0; $offset--) {
            $start = now()->startOfMonth()->subMonths($offset);
            $end = (clone $start)->addMonth();
            $totals = $this->windowTotals($store, $start, $end);

            $months[] = [
                'label' => $start->format('M Y'),
                'revenue_raw' => $totals['revenue'],
                'revenue' => $this->money($store, $totals['revenue']),
                'orders' => $totals['orders'],
            ];
        }

        return $months;
    }

    /**
     * Trading days are the store's own calendar days, matching
     * Store::localDayRangeUtc()'s definition of a day, not the UTC dates
     * the created_at column happens to be stored in: a Lagos shop that
     * trades until 01:00 local would otherwise book that evening twice.
     */
    private function activeDays(Store $store): int
    {
        $dates = $this->salesQuery($store)
            ->selectRaw($this->localDayExpression($store).' as sale_day')
            ->groupBy('sale_day')
            ->pluck('sale_day');

        return $dates->count();
    }

    /**
     * DATE() over the store's local clock. Uses the store's current UTC
     * offset for every row rather than a per-row zone conversion, which no
     * driver expresses portably; the two only disagree for rows recorded on
     * the other side of a DST switch, in the zones that have one.
     */
    private function localDayExpression(Store $store): string
    {
        $offset = (int) Carbon::now($store->timezone ?: 'UTC')->getOffset();

        if ($offset === 0) {
            return 'DATE(created_at)';
        }

        return match (DB::connection()->getDriverName()) {
            'sqlite' => "DATE(created_at, '{$offset} seconds')",
            'mysql', 'mariadb' => "DATE(created_at + INTERVAL {$offset} SECOND)",
            'pgsql' => "DATE(created_at + INTERVAL '{$offset} seconds')",
            default => 'DATE(created_at)',
        };
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

    /**
     * Mirrors DashboardService's own inventory-value formula (SUM(quantity
     * * cost_price) over stock_batches) so the admin panel and the store
     * owner's dashboard never quote two different stock valuations.
     */
    private function stockValueRaw(Store $store): float
    {
        if (!Schema::hasTable('stock_batches')) {
            return 0.0;
        }

        $total = DB::table('stock_batches')
            ->where('store_id', $store->id)
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

    /**
     * An offline POS device's wall clock can drift or be misconfigured, and
     * the sync pipeline trusts whatever created_at/updated_at it pushes
     * (see SyncController::push()) with no server-side validation. A
     * clock-skewed device can therefore push a timestamp that is genuinely
     * in the future relative to the server. "Last active"/"last synced"
     * can never truthfully be later than now, so any such value is clamped
     * here rather than displayed as a future time.
     */
    public function clampToNow(string|Carbon|null $value): ?Carbon
    {
        if ($value === null) {
            return null;
        }

        $parsed = $value instanceof Carbon ? $value : Carbon::parse($value);
        $now = now();

        return $parsed->greaterThan($now) ? $now : $parsed;
    }

    private function growth(float $previous, float $current): ?float
    {
        if ($previous <= 0) {
            return $current > 0 ? null : 0.0;
        }

        return round((($current - $previous) / $previous) * 100, 1);
    }

    private function money(Store $store, float $amount): string
    {
        $currency = $store->currency ?: 'NGN';
        $prefix = $currency === 'NGN' ? '₦' : $currency.' ';

        return $prefix.number_format($amount, 0);
    }

    private function humanDate($value): ?string
    {
        return $value ? Carbon::parse($value)->format('M d, Y') : null;
    }
}
