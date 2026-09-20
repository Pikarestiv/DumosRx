<?php

namespace App\Services\Admin;

use App\Models\PaymentTransaction;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Subscription-payment revenue reporting for the admin Marketing > Revenue
 * tab. Distinct from AdminPlatformService::getGlobalSummary()'s "Platform
 * Revenue" stat, which sums Sale::total_amount (store product sales) - this
 * aggregates PaymentTransaction rows instead, the actual SaaS subscription
 * revenue, which previously had no admin-facing report at all.
 */
class AdminRevenueService
{
    private const SUCCESS_STATUSES = ['completed', 'success'];

    public function getOverview($page = 1, $search = null, $provider = null, $plan = null, $dateFrom = null, $dateTo = null)
    {
        $query = PaymentTransaction::with('subscription.user')
            ->whereIn('status', self::SUCCESS_STATUSES);

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('provider_reference', 'like', "%{$search}%")
                    ->orWhereHas('subscription.user', function ($uq) use ($search) {
                        $uq->where('email', 'like', "%{$search}%")
                            ->orWhere('first_name', 'like', "%{$search}%")
                            ->orWhere('last_name', 'like', "%{$search}%");
                    });
            });
        }

        if ($provider) {
            $query->where('provider', $provider);
        }

        if ($dateFrom) {
            $query->where('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('created_at', '<=', $dateTo);
        }

        // plan_name lives inside metadata (JSON) rather than a plain column,
        // so it's filtered/grouped in PHP after the DB-level filters above
        // narrow the result set, rather than a driver-specific JSON query.
        $transactions = $query->latest()->get();

        if ($plan) {
            $transactions = $transactions->filter(fn ($txn) => strtolower($this->planNameFor($txn)) === strtolower($plan))->values();
        }

        $totalRevenue = (float) $transactions->sum('amount');
        $manualRevenue = (float) $transactions->where('provider', 'bank_transfer')->sum('amount');

        $byPlanTier = $transactions
            ->groupBy(fn ($txn) => $this->planNameFor($txn))
            ->map(fn ($group) => (float) $group->sum('amount'));

        $perPage = 20;
        $currentPage = max(1, (int) $page);
        $paged = $transactions->slice(($currentPage - 1) * $perPage, $perPage)->values();
        $paginator = new LengthAwarePaginator($paged, $transactions->count(), $perPage, $currentPage);

        return [
            'total_revenue' => $totalRevenue,
            'manual_revenue' => $manualRevenue,
            'automated_revenue' => $totalRevenue - $manualRevenue,
            'by_plan_tier' => $byPlanTier,
            'transactions' => [
                'data' => $paged->map(function ($txn) {
                    $user = $txn->subscription->user ?? null;

                    return [
                        'id' => $txn->id,
                        'date' => $txn->created_at->format('M j, Y'),
                        'plan' => $this->planNameFor($txn),
                        'provider' => $txn->provider,
                        'is_manual' => $txn->provider === 'bank_transfer',
                        'amount' => (float) $txn->amount,
                        'currency' => $txn->currency,
                        'status' => ucfirst($txn->status),
                        'reference' => $txn->provider_reference,
                        'customer' => $user ? trim("{$user->first_name} {$user->last_name}") : null,
                        'email' => $user->email ?? null,
                    ];
                }),
                'meta' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'total' => $paginator->total(),
                    'per_page' => $paginator->perPage(),
                ],
            ],
        ];
    }

    private function planNameFor(PaymentTransaction $txn): string
    {
        if ($txn->subscription && $txn->subscription->plan_name) {
            return ucfirst($txn->subscription->plan_name);
        }

        return $txn->metadata['plan_name'] ?? 'Unknown';
    }
}
