<?php

namespace App\Services\Admin;

use App\Models\PaymentTransaction;
use App\Support\CurrencyTotals;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Subscription-payment revenue reporting for the admin Marketing > Revenue
 * tab and, since Phase 1, the Overview "Subscription Revenue" stat. This is
 * the canonical definition of platform revenue: successful PaymentTransaction
 * rows, reported per currency and never converted between them.
 */
class AdminRevenueService
{
    /** Matches the payment_transactions.status enum (pending/success/failed/abandoned). */
    private const SUCCESS_STATUSES = ['success'];

    public function getOverview($page = 1, $search = null, $provider = null, $plan = null, $dateFrom = null, $dateTo = null)
    {
        $query = PaymentTransaction::with('subscription.user')
            ->whereIn('payment_transactions.status', self::SUCCESS_STATUSES);

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

        if ($plan) {
            $query->whereHas('subscription', function ($sq) use ($plan) {
                $sq->whereRaw('LOWER(plan_name) = ?', [strtolower($plan)]);
            });
        }

        $totals = (clone $query)
            ->selectRaw("currency, provider = 'bank_transfer' as is_manual, COALESCE(SUM(amount), 0) as total")
            ->groupBy('currency', 'is_manual')
            ->get();

        $byPlanTier = (clone $query)
            ->leftJoin('subscriptions', 'subscriptions.id', '=', 'payment_transactions.subscription_id')
            ->selectRaw('subscriptions.plan_name as plan_name, COALESCE(SUM(payment_transactions.amount), 0) as total')
            ->groupBy('subscriptions.plan_name')
            ->get()
            ->mapWithKeys(fn ($row) => [
                $row->plan_name ? ucfirst($row->plan_name) : 'Unknown' => (float) $row->total,
            ]);

        $paginator = (clone $query)->latest()->paginate(20, ['*'], 'page', max(1, (int) $page));
        $paged = collect($paginator->items());

        $totalRevenue = (float) $totals->sum('total');
        $manualRevenue = (float) $totals->where('is_manual', true)->sum('total');

        return [
            'total_revenue' => $totalRevenue,
            'manual_revenue' => $manualRevenue,
            'automated_revenue' => $totalRevenue - $manualRevenue,
            'totals_by_currency' => $this->groupedTotals($totals),
            'automated_by_currency' => $this->groupedTotals($totals->where('is_manual', false)),
            'manual_by_currency' => $this->groupedTotals($totals->where('is_manual', true)),
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

    private function groupedTotals($rows): array
    {
        return CurrencyTotals::fromPairs(
            collect($rows)->map(fn ($row) => [
                'currency' => $row->currency,
                'amount' => $row->total,
            ])
        );
    }

    private function planNameFor(PaymentTransaction $txn): string
    {
        if ($txn->subscription && $txn->subscription->plan_name) {
            return ucfirst($txn->subscription->plan_name);
        }

        return $txn->metadata['plan_name'] ?? 'Unknown';
    }
}
