<?php

namespace App\Services\Admin;

use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Support\TimeSeries;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Churn as a time series, split from AdminTrendsService because its
 * definition is a question about coverage over time rather than a column that
 * can be grouped. See the Phase 4 spec, Part 2, for why a historical bucket
 * must not change after the fact.
 */
class AdminChurnTrendService
{
    /** Bounds the candidate set, the Phase 3 CANDIDATE_LIMIT pattern. */
    private const CANDIDATE_LIMIT = 2000;

    public function series(string $window, Carbon $since): array
    {
        $candidates = Subscription::query()
            ->whereBetween('end_date', [$since, now()])
            ->orderByDesc('end_date')
            ->limit(self::CANDIDATE_LIMIT)
            ->get(['id', 'user_id', 'start_date', 'end_date']);

        if ($candidates->isEmpty()) {
            return $this->emptySeries($window);
        }

        $byOwner = Subscription::query()
            ->whereIn('user_id', $candidates->pluck('user_id')->unique())
            ->get(['id', 'user_id', 'start_date', 'end_date'])
            ->groupBy('user_id');

        $graceDays = SystemConfig::getVal('subscription_plans', [])['grace_period_days'] ?? 3;
        $byBucket = [];

        foreach ($candidates as $candidate) {
            if (! $candidate->end_date) {
                continue;
            }

            $lapsedAt = $candidate->end_date->copy()->addDays($graceDays);

            if ($this->coveredAt($byOwner->get($candidate->user_id) ?? collect(), $candidate, $lapsedAt)) {
                continue;
            }

            $byBucket[TimeSeries::labelFor($window, $candidate->end_date)][] = $candidate->user_id;
        }

        $found = [];

        foreach ($byBucket as $label => $ownerIds) {
            $found[$label]['count'] = count(array_unique($ownerIds));
        }

        return [
            'currencies' => [],
            'points' => TimeSeries::fill($window, $found, ['count' => 0]),
        ];
    }

    /**
     * Whether some other subscription of this owner was live once the grace
     * window closed. Deciding from the rows' own dates rather than the owner's
     * state today is what keeps a past bucket stable: an owner who lapsed in
     * March and came back in June still churned in March, and reading their
     * current state would have quietly removed them from March's number.
     */
    private function coveredAt(Collection $owned, Subscription $candidate, Carbon $moment): bool
    {
        foreach ($owned as $other) {
            if ($other->id === $candidate->id || ! $other->start_date) {
                continue;
            }

            $startsInTime = $other->start_date->lessThanOrEqualTo($moment);
            $stillLive = $other->end_date === null || $other->end_date->greaterThan($moment);

            if ($startsInTime && $stillLive) {
                return true;
            }
        }

        return false;
    }

    private function emptySeries(string $window): array
    {
        return [
            'currencies' => [],
            'points' => TimeSeries::fill($window, [], ['count' => 0]),
        ];
    }
}
