<?php

namespace App\Services\Admin;

use App\Models\Subscription;
use App\Models\User;
use App\Services\SubscriptionService;
use App\Support\TimeSeries;

/**
 * Churn as a time series. Split from AdminTrendsService because it is the one
 * series that cannot be answered in SQL: "lapsed" is defined by
 * SubscriptionService::subscriptionState(), which resolves the grace window in
 * PHP, and a second definition here is the duplication AGENTS.md forbids.
 */
class AdminChurnTrendService
{
    /** Bounds the candidate set, the Phase 3 CANDIDATE_LIMIT pattern. */
    private const CANDIDATE_LIMIT = 2000;

    /** @var array<string, string> */
    private array $resolved = [];

    public function __construct(private SubscriptionService $subscriptions) {}

    public function series(string $window, \Illuminate\Support\Carbon $since): array
    {
        $candidates = Subscription::query()
            ->whereBetween('end_date', [$since, now()])
            ->orderByDesc('end_date')
            ->limit(self::CANDIDATE_LIMIT)
            ->get(['id', 'user_id', 'end_date']);

        $owners = User::with('subscriptions')
            ->whereIn('id', $candidates->pluck('user_id')->unique())
            ->get()
            ->keyBy('id');

        $byBucket = [];

        foreach ($candidates as $candidate) {
            $owner = $owners->get($candidate->user_id);

            if (! $owner || $this->stateFor($owner) !== 'lapsed') {
                continue;
            }

            $byBucket[TimeSeries::labelFor($window, $candidate->end_date)][] = $owner->id;
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

    /** One resolution per owner per request, the Phase 3 memo pattern. */
    private function stateFor(User $owner): string
    {
        $key = (string) $owner->id;

        if (! array_key_exists($key, $this->resolved)) {
            $this->resolved[$key] = $this->subscriptions->subscriptionState($owner);
        }

        return $this->resolved[$key];
    }
}
