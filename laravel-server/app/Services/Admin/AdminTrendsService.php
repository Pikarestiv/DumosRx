<?php

namespace App\Services\Admin;

use App\Models\PaymentTransaction;
use App\Models\Store;
use App\Models\Subscription;
use App\Support\TimeSeries;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Time series for the admin Trends page. Every series comes from a real
 * column; see the Phase 4 spec for why MRR is absent rather than estimated,
 * and why historical buckets include soft-deleted rows.
 */
class AdminTrendsService
{
    public function __construct(private AdminChurnTrendService $churn) {}

    public function trends(string $window): array
    {
        $since = TimeSeries::startOf($window);

        return [
            'window' => $window,
            'granularity' => TimeSeries::isDaily($window) ? 'day' : 'month',
            'cash_collected' => $this->cashCollected($window, $since),
            'new_paid_subscriptions' => $this->subscriptionStarts($window, $since, false),
            'trial_starts' => $this->subscriptionStarts($window, $since, true),
            'store_signups' => $this->storeSignups($window, $since),
            'churn' => $this->churn->series($window, $since),
        ];
    }

    private function cashCollected(string $window, \Illuminate\Support\Carbon $since): array
    {
        $rows = PaymentTransaction::query()
            ->where('status', 'success')
            ->where('created_at', '>=', $since)
            ->get(['amount', 'currency', 'created_at']);

        $currencies = $rows->pluck('currency')
            ->map(fn ($currency) => $currency ?: 'UNKNOWN')
            ->unique()
            ->values();

        $found = [];

        foreach ($rows as $row) {
            $label = TimeSeries::labelFor($window, $row->created_at);
            $currency = $row->currency ?: 'UNKNOWN';
            $found[$label][$currency] = ($found[$label][$currency] ?? 0.0) + (float) $row->amount;
        }

        $empty = $currencies->mapWithKeys(fn ($currency) => [$currency => 0.0])->all();

        return [
            'currencies' => $currencies->all(),
            'points' => TimeSeries::fill($window, $found, $empty),
        ];
    }

    /** Distinct owners, not rows: three renewals by one owner is one customer. */
    private function subscriptionStarts(string $window, \Illuminate\Support\Carbon $since, bool $trial): array
    {
        $rows = Subscription::query()
            ->where('is_trial', $trial)
            ->where('start_date', '>=', $since)
            ->get(['user_id', 'start_date']);

        return $this->countDistinctOwners($window, $rows, 'start_date');
    }

    /**
     * withTrashed() is deliberate: a store that signed up in March and was
     * deleted in August still signed up in March, and a past bucket that
     * shrinks when someone deletes a store makes the chart rewrite its own
     * history. See the Phase 4 spec, Part 2.
     */
    private function storeSignups(string $window, \Illuminate\Support\Carbon $since): array
    {
        $rows = Store::withTrashed()
            ->where('is_demo', false)
            ->where('created_at', '>=', $since)
            ->get(['id', 'created_at']);

        $found = [];

        foreach ($rows as $row) {
            $label = TimeSeries::labelFor($window, $row->created_at);
            $found[$label]['count'] = ($found[$label]['count'] ?? 0) + 1;
        }

        return [
            'currencies' => [],
            'points' => TimeSeries::fill($window, $found, ['count' => 0]),
        ];
    }

    private function countDistinctOwners(string $window, Collection $rows, string $dateColumn): array
    {
        $byBucket = [];

        foreach ($rows as $row) {
            $date = $row->{$dateColumn};

            if (! $date) {
                continue;
            }

            $byBucket[TimeSeries::labelFor($window, $date)][] = $row->user_id;
        }

        $found = [];

        foreach ($byBucket as $label => $owners) {
            $found[$label]['count'] = count(array_unique($owners));
        }

        return [
            'currencies' => [],
            'points' => TimeSeries::fill($window, $found, ['count' => 0]),
        ];
    }

    public function scopeWindow(Builder $query, \Illuminate\Support\Carbon $since): Builder
    {
        return $query->where('created_at', '>=', $since);
    }
}
