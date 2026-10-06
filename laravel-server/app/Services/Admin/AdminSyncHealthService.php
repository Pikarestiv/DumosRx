<?php

namespace App\Services\Admin;

use App\Models\Store;
use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use Illuminate\Pagination\LengthAwarePaginator;

class AdminSyncHealthService
{
    private const PER_PAGE = 50;

    private const WORST_STORES = 10;

    private const REASON_GROUPS = 20;

    public function platformSummary(int $days = 7): array
    {
        $since = $this->windowStart($days);

        return [
            'success_rate_today' => $this->successRate($this->windowStart(1)),
            'success_rate_7d' => $this->successRate($since),
            'failures_by_reason' => $this->failuresByReason($since),
            'worst_stores' => $this->worstStores($since),
        ];
    }

    /**
     * $days counts whole days inclusive of today, so 1 is today and 7 is a
     * true week. Every figure on the card shares this one boundary: a rolling
     * cutoff for the failure lists and a day-start cutoff for the daily tally
     * would disagree, showing a degraded rate above "No refusals recorded".
     */
    private function windowStart(int $days): \Illuminate\Support\Carbon
    {
        return now()->subDays(max(0, $days - 1))->startOfDay();
    }

    public function storeHealth(string $storeId, int $page = 1): array
    {
        $store = Store::withTrashed()->find($storeId);

        $daily = SyncHealthDaily::where('store_id', $storeId)
            ->orderByDesc('date')
            ->limit(30)
            ->get()
            ->map(fn (SyncHealthDaily $row) => [
                'date' => $row->date->toDateString(),
                'accepted' => $row->changes_accepted,
                'refused' => $row->changes_refused,
                'conflicted' => $row->changes_conflicted,
            ])
            ->values()
            ->all();

        $paginator = SyncFailure::where('store_id', $storeId)
            ->orderByDesc('created_at')
            ->paginate(self::PER_PAGE, ['*'], 'page', max(1, $page));

        return [
            'store_name' => $store?->name,
            'last_sync_at' => $store?->last_sync_at?->toIso8601String(),
            'daily' => $daily,
            'failures' => [
                'data' => collect($paginator->items())->map(fn (SyncFailure $failure) => [
                    'id' => $failure->id,
                    'table_name' => $failure->table_name,
                    'record_id' => $failure->record_id,
                    'operation' => $failure->operation,
                    'reason' => $failure->reason,
                    'created_at' => $failure->created_at?->toIso8601String(),
                ])->all(),
                'meta' => $this->meta($paginator),
            ],
        ];
    }

    private function successRate(\Illuminate\Support\Carbon $since): ?string
    {
        $totals = SyncHealthDaily::where('date', '>=', $since)
            ->selectRaw('COALESCE(SUM(changes_accepted), 0) as accepted, COALESCE(SUM(changes_refused), 0) as refused')
            ->first();

        $accepted = (int) ($totals->accepted ?? 0);
        $refused = (int) ($totals->refused ?? 0);
        $total = $accepted + $refused;

        if ($total === 0) {
            return null;
        }

        return round(($accepted / $total) * 100, 1).'%';
    }

    private function failuresByReason(\Illuminate\Support\Carbon $since): array
    {
        return SyncFailure::where('created_at', '>=', $since)
            ->selectRaw('reason, COUNT(*) as total')
            ->groupBy('reason')
            ->orderByDesc('total')
            ->limit(self::REASON_GROUPS)
            ->get()
            ->mapWithKeys(fn ($row) => [$row->reason => (int) $row->total])
            ->all();
    }

    private function worstStores(\Illuminate\Support\Carbon $since): array
    {
        $counts = SyncFailure::where('created_at', '>=', $since)
            ->whereNotNull('store_id')
            ->selectRaw('store_id, COUNT(*) as refused')
            ->groupBy('store_id')
            ->orderByDesc('refused')
            ->limit(self::WORST_STORES)
            ->get();

        $names = Store::withTrashed()
            ->whereIn('id', $counts->pluck('store_id'))
            ->pluck('name', 'id');

        return $counts->map(fn ($row) => [
            'store_id' => $row->store_id,
            'store_name' => $names[$row->store_id] ?? null,
            'refused' => (int) $row->refused,
        ])->all();
    }

    private function meta(LengthAwarePaginator $paginator): array
    {
        return [
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'total' => $paginator->total(),
            'per_page' => $paginator->perPage(),
        ];
    }
}
