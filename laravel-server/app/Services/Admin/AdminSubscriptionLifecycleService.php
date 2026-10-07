<?php

namespace App\Services\Admin;

use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class AdminSubscriptionLifecycleService
{
    private const PER_PAGE = 50;

    /** Bounds the candidate set each bucket resolves in PHP. Grace cannot be
     * expressed in SQL, so the alternative is hydrating every historically
     * expired row on the platform — the PG-12 pattern. See AGENTS.md. */
    private const CANDIDATE_LIMIT = 2000;

    /** @var array<string, array{subscription: ?Subscription, state: string}> */
    private array $resolved = [];

    public function __construct(private SubscriptionService $subscriptions) {}

    public function expiringSoon(int $days, int $page = 1): array
    {
        return $this->endingWithin($days, $page, false, ['active', 'in_grace']);
    }

    public function trialsEnding(int $days, int $page = 1): array
    {
        return $this->endingWithin($days, $page, true, ['trialing', 'in_grace']);
    }

    public function lapsed(int $page = 1): array
    {
        $candidates = Subscription::query()
            ->where('end_date', '<', now())
            ->orderByDesc('end_date')
            ->limit(self::CANDIDATE_LIMIT)
            ->get()
            ->unique('user_id');

        $rows = $this->ownersInState($candidates, ['lapsed'])
            ->map(fn (array $pair) => $this->row($pair['owner'], $pair['subscription'], $pair['state']))
            ->values();

        return $this->paginate($rows, $page);
    }

    public function paymentsNeedingAttention(int $days, int $page = 1): array
    {
        $transactions = PaymentTransaction::with('subscription.user.stores')
            ->whereIn('status', ['failed', 'abandoned'])
            ->where('created_at', '>=', now()->subDays($days))
            ->orderByDesc('created_at')
            ->get()
            ->filter(fn (PaymentTransaction $txn) => $txn->subscription?->user !== null);

        $rows = $transactions
            ->groupBy(fn (PaymentTransaction $txn) => $txn->subscription->user->id)
            ->map(function (Collection $group) {
                $latest = $group->first();
                $owner = $latest->subscription->user;

                return array_merge($this->row($owner, $latest->subscription), [
                    'attempts' => $group->count(),
                    'last_attempt_at' => $latest->created_at?->toIso8601String(),
                    'last_status' => $latest->status,
                    'amount' => (float) $latest->amount,
                    'currency' => $latest->currency,
                ]);
            })
            ->values();

        return $this->paginate($rows, $page);
    }

    public function figures(int $days): array
    {
        $since = now()->subDays($days);

        $trialStarts = Subscription::where('is_trial', true)
            ->where('start_date', '>=', $since)
            ->get(['user_id', 'start_date'])
            ->groupBy('user_id')
            ->map(fn ($rows) => $rows->min('start_date'));

        $trialOwners = $trialStarts->keys();

        // A win-back trial to a lapsed former customer is routine, so a paid
        // row that predates the trial is not a conversion.
        $converted = $trialOwners->isEmpty() ? collect() : Subscription::where('is_trial', false)
            ->whereIn('user_id', $trialOwners)
            ->get(['user_id', 'start_date'])
            ->filter(fn ($row) => $row->start_date >= $trialStarts[$row->user_id])
            ->pluck('user_id')
            ->unique();

        $mix = PaymentTransaction::where('created_at', '>=', $since)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'trials_started' => $trialOwners->count(),
            'trial_conversion_rate' => $trialOwners->isEmpty()
                ? null
                : round(($converted->count() / $trialOwners->count()) * 100, 1).'%',
            'lapsed_in_period' => $this->ownersLapsedSince($since)->count(),
            'recovered_in_period' => $this->recoveredSince($since)->count(),
            'payment_mix' => [
                'success' => (int) ($mix['success'] ?? 0),
                'failed' => (int) ($mix['failed'] ?? 0),
                'abandoned' => (int) ($mix['abandoned'] ?? 0),
                'pending' => (int) ($mix['pending'] ?? 0),
            ],
            'bucket_counts' => [
                'expiring' => $this->expiringSoon($days, 1)['meta']['total'],
                'trials' => $this->trialsEnding($days, 1)['meta']['total'],
                'lapsed' => $this->lapsed(1)['meta']['total'],
                'payments' => $this->paymentsNeedingAttention($days, 1)['meta']['total'],
            ],
        ];
    }

    private function ownersLapsedSince(\Illuminate\Support\Carbon $since): Collection
    {
        return $this->expiredSince($since)
            ->filter(fn (array $pair) => $pair['state'] === 'lapsed');
    }

    /** One candidate query per figures() call, resolved once and filtered twice. */
    private function expiredSince(\Illuminate\Support\Carbon $since): Collection
    {
        $candidates = Subscription::whereBetween('end_date', [$since, now()])
            ->orderByDesc('end_date')
            ->limit(self::CANDIDATE_LIMIT)
            ->get()
            ->unique('user_id');

        return $this->ownersInState($candidates, ['lapsed', 'active', 'trialing', 'in_grace', 'none'], false);
    }

    /** A win-back trial is not money received, so `trialing` is not recovery. */
    private function recoveredSince(\Illuminate\Support\Carbon $since): Collection
    {
        return $this->expiredSince($since)
            ->filter(fn (array $pair) => $pair['state'] === 'active');
    }

    private function endingWithin(int $days, int $page, bool $trial, array $states): array
    {
        $candidates = Subscription::query()
            ->where('is_trial', $trial)
            ->whereBetween('end_date', [$this->graceFloor(), now()->addDays($days)])
            ->orderBy('end_date')
            ->limit(self::CANDIDATE_LIMIT)
            ->get()
            ->unique('user_id');

        $rows = $this->ownersInState($candidates, $states)
            ->map(fn (array $pair) => $this->row($pair['owner'], $pair['subscription'], $pair['state']))
            ->values();

        return $this->paginate($rows, $page);
    }

    /**
     * An owner inside the grace window still has access and the shortest
     * runway of anyone on the platform. They are correctly excluded from
     * `lapsed`, so the window reaches back far enough to surface them here
     * rather than nowhere at all.
     */
    private function graceFloor(): \Illuminate\Support\Carbon
    {
        $graceDays = SystemConfig::getVal('subscription_plans', [])['grace_period_days'] ?? 3;

        return now()->subDays($graceDays);
    }

    /**
     * Grace is deliberately not expressed in SQL: subscriptionState() is the
     * single definition the application itself gates on. See
     * laravel-server/AGENTS.md.
     */
    /**
     * $onlyGoverning is false for the period figures: "recovered" means the
     * candidate expired and a *newer* subscription replaced it, so requiring
     * the candidate to be the governing row would exclude every recovery.
     */
    private function ownersInState(Collection $candidates, array $states, bool $onlyGoverning = true): Collection
    {
        $owners = User::with(['stores', 'subscriptions'])
            ->whereIn('id', $candidates->pluck('user_id')->unique())
            ->get()
            ->keyBy('id');

        return $candidates
            ->map(function (Subscription $subscription) use ($owners) {
                $owner = $owners->get($subscription->user_id);

                if (! $owner) {
                    return null;
                }

                $resolution = $this->resolutionFor($owner);
                $effective = $resolution['subscription'];

                return [
                    'owner' => $owner,
                    'subscription' => $effective ?? $subscription,
                    'candidate' => $subscription,
                    'effective' => $effective,
                    'state' => $resolution['state'],
                ];
            })
            ->filter()
            ->filter(fn (array $pair) => in_array($pair['state'], $states, true))
            ->filter(fn (array $pair) => ! $onlyGoverning || $this->candidateIsGoverning($pair));
    }

    /**
     * One request resolves one owner once, however many buckets they land in.
     * The service is request-scoped, so the memo cannot outlive the data it
     * describes.
     *
     * @return array{subscription: ?Subscription, state: string}
     */
    private function resolutionFor(User $owner): array
    {
        $key = (string) $owner->id;

        if (! array_key_exists($key, $this->resolved)) {
            $this->resolved[$key] = $this->subscriptions->effectiveSubscriptionWithState($owner);
        }

        return $this->resolved[$key];
    }

    /**
     * An owner who renews early holds two concurrently-active rows, because
     * self-service renewal creates a new subscription without expiring the old
     * one. Without this check the worklist lists the superseded row — telling
     * the operator to chase an account that paid this morning, under a date
     * that is not its real expiry.
     */
    private function candidateIsGoverning(array $pair): bool
    {
        if ($pair['effective'] === null) {
            return true;
        }

        return $pair['effective']->id === $pair['candidate']->id;
    }

    private function row(User $owner, ?Subscription $subscription, ?string $state = null): array
    {
        $store = $owner->stores->first();

        return [
            'state' => $state,
            'user_id' => $owner->id,
            'owner_name' => trim("{$owner->first_name} {$owner->last_name}"),
            'email' => $owner->email,
            'store_id' => $store?->id,
            'store_name' => $store?->name,
            'plan' => $subscription?->plan_name ? ucfirst($subscription->plan_name) : null,
            'is_trial' => (bool) $subscription?->is_trial,
            'end_date' => $subscription?->end_date?->toDateString(),
        ];
    }

    private function paginate(Collection $rows, int $page): array
    {
        $page = max(1, $page);
        $paged = $rows->slice(($page - 1) * self::PER_PAGE, self::PER_PAGE)->values();
        $paginator = new LengthAwarePaginator($paged, $rows->count(), self::PER_PAGE, $page);

        return [
            'data' => $paged->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
            ],
        ];
    }
}
