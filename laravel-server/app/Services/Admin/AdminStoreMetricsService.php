<?php

namespace App\Services\Admin;

use App\Models\Store;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Business (revenue) metrics for one store, behind the admin panel's Store
 * Details page. Split out of AdminStoreDetailService, which already owns
 * the profile/owner/subscription/sync payload, so neither file grows past
 * the repo's size rule. Operational (inventory/sync/activity) metrics live
 * in the sibling AdminStoreOperationalMetricsService, split out the same
 * way once this class also hit the limit — see laravel-server/AGENTS.md.
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

    private function growth(float $previous, float $current): ?float
    {
        if ($previous <= 0) {
            return $current > 0 ? null : 0.0;
        }

        return round((($current - $previous) / $previous) * 100, 1);
    }

    public function money(Store $store, float $amount): string
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
