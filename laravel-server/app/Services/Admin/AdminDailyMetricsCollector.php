<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\DownloadLog;
use App\Models\Feedback;
use App\Models\OnlineOrder;
use App\Models\PaymentTransaction;
use App\Models\Sale;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use App\Models\User;
use App\Models\UserDevice;
use App\Support\CurrencyTotals;
use Illuminate\Support\Carbon;

class AdminDailyMetricsCollector
{
    private const OWNER_ROLE = 'store_owner';

    private const STAFF_ROLES = ['admin', 'manager', 'specialist', 'sales_staff', 'auditor'];

    private const SECURITY_ACTIONS = [
        'LOGIN_FAILURE',
        'UNAUTHORIZED_ACCESS',
        'ACCOUNT_DELETION_REQUESTED',
    ];

    /**
     * @return array{total_stores: int, new_stores: int, stores_synced: int, active_owners: int, new_owners: int, new_staff: int}
     */
    public function fleet(Carbon $startUtc, Carbon $endUtc): array
    {
        return [
            'total_stores' => Store::where('is_demo', false)->count(),
            'new_stores' => Store::where('is_demo', false)->whereBetween('created_at', [$startUtc, $endUtc])->count(),
            'stores_synced' => Store::where('is_demo', false)->whereBetween('last_sync_at', [$startUtc, $endUtc])->count(),
            'active_owners' => User::where('is_active', true)->where('role', self::OWNER_ROLE)->count(),
            'new_owners' => User::where('role', self::OWNER_ROLE)->whereBetween('created_at', [$startUtc, $endUtc])->count(),
            'new_staff' => User::whereIn('role', self::STAFF_ROLES)->whereBetween('created_at', [$startUtc, $endUtc])->count(),
        ];
    }

    /**
     * @return array{total: int, pwa: int, desktop: int, unlabeled: int, versions_summary: string}
     */
    public function devices(Carbon $startUtc, Carbon $endUtc): array
    {
        $devices = UserDevice::query()
            ->leftJoin('stores', 'stores.id', '=', 'user_devices.store_id')
            ->whereBetween('user_devices.last_synced_at', [$startUtc, $endUtc])
            ->where(fn ($q) => $q->whereNull('stores.id')->orWhere('stores.is_demo', false))
            ->orderByDesc('user_devices.last_synced_at')
            ->toBase()
            ->get(['user_devices.device_id', 'user_devices.device_label', 'user_devices.app_version', 'user_devices.build_sha'])
            ->unique('device_id')
            ->values();

        $pwa = 0;
        $desktop = 0;
        $unlabeled = 0;
        $versions = [];

        foreach ($devices as $device) {
            $label = trim((string) ($device->device_label ?? ''));
            if ($label === '') {
                $unlabeled++;
            } elseif (str_starts_with(strtolower($label), 'desktop app')) {
                $desktop++;
            } else {
                $pwa++;
            }

            $version = trim((string) ($device->app_version ?? ''));
            $sha = substr(trim((string) ($device->build_sha ?? '')), 0, 7);
            if ($version !== '' || $sha !== '') {
                $key = trim($version.($sha !== '' ? " ({$sha})" : ''));
                $versions[$key] = ($versions[$key] ?? 0) + 1;
            }
        }

        arsort($versions);
        $versionParts = [];
        foreach (array_slice($versions, 0, 3, true) as $label => $count) {
            $versionParts[] = "{$label}: {$count}";
        }

        return [
            'total' => $devices->count(),
            'pwa' => $pwa,
            'desktop' => $desktop,
            'unlabeled' => $unlabeled,
            'versions_summary' => $versionParts !== [] ? implode(' · ', $versionParts) : 'No versioned syncs recorded',
        ];
    }

    /**
     * @return array{total: int, summary: string}
     */
    public function downloads(Carbon $startUtc, Carbon $endUtc): array
    {
        $rows = DownloadLog::query()
            ->whereBetween('created_at', [$startUtc, $endUtc])
            ->selectRaw("COALESCE(NULLIF(platform, ''), 'unknown') as platform, COUNT(*) as total")
            ->groupBy('platform')
            ->toBase()
            ->get();

        $total = (int) $rows->sum('total');
        if ($total === 0) {
            return ['total' => 0, 'summary' => ''];
        }

        $parts = [];
        foreach ($rows as $row) {
            $parts[] = ucfirst((string) $row->platform).': '.(int) $row->total;
        }

        return ['total' => $total, 'summary' => "{$total} (".implode(', ', $parts).')'];
    }

    /**
     * @return array{sales_count: int, sales_formatted: string, orders_count: int, orders_paid: int, orders_formatted: string, orders_pending_total: int, top_stores: array<int, string>}
     */
    public function commerce(Carbon $startUtc, Carbon $endUtc): array
    {
        $saleRows = Sale::query()
            ->leftJoin('stores', 'stores.id', '=', 'sales.store_id')
            ->whereNull('sales.deleted_at')
            ->whereBetween('sales.created_at', [$startUtc, $endUtc])
            ->where(fn ($q) => $q->whereNull('stores.id')->orWhere('stores.is_demo', false))
            ->toBase()
            ->get(['sales.total_amount', 'stores.currency as store_currency']);

        $salesTotals = CurrencyTotals::fromPairs(
            $saleRows->map(fn ($r) => ['currency' => $r->store_currency, 'amount' => $r->total_amount])
        );

        $orderRows = OnlineOrder::query()
            ->leftJoin('stores', 'stores.id', '=', 'online_orders.store_id')
            ->whereNull('online_orders.deleted_at')
            ->whereBetween('online_orders.created_at', [$startUtc, $endUtc])
            ->where(fn ($q) => $q->whereNull('stores.id')->orWhere('stores.is_demo', false))
            ->toBase()
            ->get(['online_orders.total_amount', 'online_orders.payment_status', 'stores.currency as store_currency']);

        $ordersTotals = CurrencyTotals::fromPairs(
            $orderRows->map(fn ($r) => ['currency' => $r->store_currency, 'amount' => $r->total_amount])
        );

        $pendingOrdersTotal = OnlineOrder::query()
            ->leftJoin('stores', 'stores.id', '=', 'online_orders.store_id')
            ->whereNull('online_orders.deleted_at')
            ->where('online_orders.order_status', 'pending')
            ->where(fn ($q) => $q->whereNull('stores.id')->orWhere('stores.is_demo', false))
            ->count();

        $topStoreRows = Sale::query()
            ->join('stores', 'stores.id', '=', 'sales.store_id')
            ->whereNull('sales.deleted_at')
            ->where('stores.is_demo', false)
            ->whereBetween('sales.created_at', [$startUtc, $endUtc])
            ->groupBy('stores.id', 'stores.name', 'stores.currency')
            ->selectRaw('stores.name, stores.currency, COUNT(sales.id) as sale_count, COALESCE(SUM(sales.total_amount), 0) as total_amount')
            ->orderByDesc('sale_count')
            ->orderByDesc('total_amount')
            ->limit(3)
            ->toBase()
            ->get();

        $topStores = [];
        foreach ($topStoreRows as $row) {
            $currency = strtoupper(trim((string) ($row->currency ?: CurrencyTotals::FALLBACK_CURRENCY)));
            $topStores[] = 'Top Store: '.$row->name.' — '.(int) $row->sale_count.' sales ('.$currency.' '.number_format((float) $row->total_amount, 2).')';
        }

        return [
            'sales_count' => $saleRows->count(),
            'sales_formatted' => $this->formatCurrencyTotals($salesTotals, 'No sales'),
            'orders_count' => $orderRows->count(),
            'orders_paid' => $orderRows->where('payment_status', 'paid')->count(),
            'orders_formatted' => $this->formatCurrencyTotals($ordersTotals, 'No orders'),
            'orders_pending_total' => $pendingOrdersTotal,
            'top_stores' => $topStores,
        ];
    }

    /**
     * @return array{tx_count: int, cash_formatted: string, trials_started: int, paid_started: int, active_trials: int, active_paid: int, expiring_paid: int, expiring_trials: int}
     */
    public function billing(Carbon $startUtc, Carbon $endUtc, Carbon $now): array
    {
        $txns = PaymentTransaction::query()
            ->where('status', 'success')
            ->whereBetween('created_at', [$startUtc, $endUtc])
            ->get(['amount', 'currency']);

        $cashTotals = CurrencyTotals::fromPairs(
            $txns->map(fn ($t) => ['currency' => $t->currency, 'amount' => $t->amount])
        );

        $weekAhead = $now->copy()->addDays(7);

        return [
            'tx_count' => $txns->count(),
            'cash_formatted' => $this->formatCurrencyTotals($cashTotals, 'No payments'),
            'trials_started' => Subscription::where('is_trial', true)->whereBetween('start_date', [$startUtc, $endUtc])->distinct()->count('user_id'),
            'paid_started' => Subscription::where('is_trial', false)->whereBetween('start_date', [$startUtc, $endUtc])->distinct()->count('user_id'),
            'active_trials' => Subscription::where('status', 'active')->where('is_trial', true)->where('end_date', '>=', $now)->distinct()->count('user_id'),
            'active_paid' => Subscription::where('status', 'active')->where('is_trial', false)->where('end_date', '>=', $now)->distinct()->count('user_id'),
            'expiring_paid' => Subscription::where('status', 'active')->where('is_trial', false)->whereBetween('end_date', [$now, $weekAhead])->distinct()->count('user_id'),
            'expiring_trials' => Subscription::where('status', 'active')->where('is_trial', true)->whereBetween('end_date', [$now, $weekAhead])->distinct()->count('user_id'),
        ];
    }

    /**
     * @return array{pushes: int, accepted: int, refused: int, conflicted: int, rate_pct: float|null, rate_display: string, sync_failures: int, failures_summary: string, new_tickets: int, open_tickets: int, security_events: int}
     */
    public function health(string $dateString, Carbon $startUtc, Carbon $endUtc): array
    {
        $syncTotals = SyncHealthDaily::query()
            ->leftJoin('stores', 'stores.id', '=', 'sync_health_daily.store_id')
            ->whereDate('sync_health_daily.date', $dateString)
            ->where(fn ($q) => $q->whereNull('stores.id')->orWhere('stores.is_demo', false))
            ->selectRaw('COALESCE(SUM(pushes), 0) as pushes, COALESCE(SUM(changes_accepted), 0) as accepted, COALESCE(SUM(changes_refused), 0) as refused, COALESCE(SUM(changes_conflicted), 0) as conflicted')
            ->toBase()
            ->first();

        $pushes = (int) ($syncTotals->pushes ?? 0);
        $accepted = (int) ($syncTotals->accepted ?? 0);
        $refused = (int) ($syncTotals->refused ?? 0);
        $conflicted = (int) ($syncTotals->conflicted ?? 0);
        $totalChanges = $accepted + $refused;
        $ratePct = $totalChanges > 0 ? round(($accepted / $totalChanges) * 100, 1) : null;

        $failureRows = SyncFailure::query()
            ->leftJoin('stores', 'stores.id', '=', 'sync_failures.store_id')
            ->whereBetween('sync_failures.created_at', [$startUtc, $endUtc])
            ->where(fn ($q) => $q->whereNull('stores.id')->orWhere('stores.is_demo', false))
            ->selectRaw('sync_failures.reason, COUNT(*) as total')
            ->groupBy('sync_failures.reason')
            ->orderByDesc('total')
            ->toBase()
            ->get();

        $failuresCount = (int) $failureRows->sum('total');
        $topReasonRow = $failureRows->first();
        $failuresSummary = $failuresCount === 0
            ? '0 failures'
            : "{$failuresCount} failures (top: {$topReasonRow->reason} [{$topReasonRow->total}])";

        return [
            'pushes' => $pushes,
            'accepted' => $accepted,
            'refused' => $refused,
            'conflicted' => $conflicted,
            'rate_pct' => $ratePct,
            'rate_display' => $ratePct !== null ? "{$ratePct}%" : 'No pushes',
            'sync_failures' => $failuresCount,
            'failures_summary' => $failuresSummary,
            'new_tickets' => Feedback::where('_deleted', false)->whereBetween('created_at', [$startUtc, $endUtc])->count(),
            'open_tickets' => Feedback::where('_deleted', false)->where('status', 'pending')->count(),
            'security_events' => ActivityLog::whereIn('action', self::SECURITY_ACTIONS)->whereBetween('created_at', [$startUtc, $endUtc])->count(),
        ];
    }

    /**
     * @param  array<string, float>  $totals
     */
    private function formatCurrencyTotals(array $totals, string $emptyLabel): string
    {
        if ($totals === []) {
            return $emptyLabel;
        }

        $parts = [];
        foreach ($totals as $currency => $amount) {
            $parts[] = "{$currency} ".number_format($amount, 2);
        }

        return implode(' · ', $parts);
    }
}
