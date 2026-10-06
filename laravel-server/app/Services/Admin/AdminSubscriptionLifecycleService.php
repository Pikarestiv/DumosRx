<?php

namespace App\Services\Admin;

use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class AdminSubscriptionLifecycleService
{
    private const PER_PAGE = 50;

    public function __construct(private SubscriptionService $subscriptions) {}

    public function expiringSoon(int $days, int $page = 1): array
    {
        return $this->endingWithin($days, $page, false, ['active']);
    }

    public function trialsEnding(int $days, int $page = 1): array
    {
        return $this->endingWithin($days, $page, true, ['trialing']);
    }

    public function lapsed(int $page = 1): array
    {
        $candidates = Subscription::query()
            ->where('end_date', '<', now())
            ->orderByDesc('end_date')
            ->get()
            ->unique('user_id');

        $rows = $this->ownersInState($candidates, ['lapsed'])
            ->map(fn (array $pair) => $this->row($pair['owner'], $pair['subscription']))
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

    private function endingWithin(int $days, int $page, bool $trial, array $states): array
    {
        $candidates = Subscription::query()
            ->where('is_trial', $trial)
            ->whereBetween('end_date', [now(), now()->addDays($days)])
            ->orderBy('end_date')
            ->get()
            ->unique('user_id');

        $rows = $this->ownersInState($candidates, $states)
            ->map(fn (array $pair) => $this->row($pair['owner'], $pair['subscription']))
            ->values();

        return $this->paginate($rows, $page);
    }

    /**
     * Grace is deliberately not expressed in SQL: subscriptionState() is the
     * single definition the application itself gates on. See
     * laravel-server/AGENTS.md.
     */
    private function ownersInState(Collection $candidates, array $states): Collection
    {
        $owners = User::with('stores')
            ->whereIn('id', $candidates->pluck('user_id')->unique())
            ->get()
            ->keyBy('id');

        return $candidates
            ->map(function (Subscription $subscription) use ($owners) {
                $owner = $owners->get($subscription->user_id);

                return $owner ? ['owner' => $owner, 'subscription' => $subscription] : null;
            })
            ->filter()
            ->filter(fn (array $pair) => in_array(
                $this->subscriptions->subscriptionState($pair['owner']),
                $states,
                true
            ));
    }

    private function row(User $owner, ?Subscription $subscription): array
    {
        $store = $owner->stores->first();

        return [
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
