<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\SyncFailure;
use Illuminate\Support\Carbon;

/**
 * Normalises each source into the feed's event shape. Dispatch is an explicit
 * match rather than a lookup keyed by request input (§8), so an unknown source
 * name cannot reach a method.
 */
class AdminActivityFeedSources
{
    /** @return array<int, array{id: string, type: string, at: string, title: string, detail: ?string, store_id: ?string, derived: bool}> */
    public function fetch(string $type, Carbon $before, int $limit): array
    {
        return match ($type) {
            'admin_action' => $this->adminActions($before, $limit),
            'sync_failure' => $this->syncFailures($before, $limit),
            'payment' => $this->payments($before, $limit),
            'subscription' => $this->subscriptions($before, $limit),
            default => throw new \InvalidArgumentException("Unknown activity source: {$type}"),
        };
    }

    private function adminActions(Carbon $before, int $limit): array
    {
        return ActivityLog::query()
            ->where('created_at', '<', $before)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get(['id', 'action', 'description', 'store_id', 'created_at'])
            ->map(fn (ActivityLog $log) => [
                'id' => 'admin_action:'.$log->id,
                'type' => 'admin_action',
                'at' => $log->created_at->toIso8601String(),
                'title' => $this->humanise($log->action),
                'detail' => $log->description,
                'store_id' => $log->store_id,
                'derived' => false,
            ])
            ->all();
    }

    private function syncFailures(Carbon $before, int $limit): array
    {
        return SyncFailure::query()
            ->where('created_at', '<', $before)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get(['id', 'table_name', 'record_id', 'operation', 'reason', 'store_id', 'created_at'])
            ->map(fn (SyncFailure $failure) => [
                'id' => 'sync_failure:'.$failure->id,
                'type' => 'sync_failure',
                'at' => $failure->created_at->toIso8601String(),
                'title' => 'Sync refused: '.$this->humanise($failure->reason),
                'detail' => "{$failure->operation} on {$failure->table_name}",
                'store_id' => $failure->store_id,
                'derived' => false,
            ])
            ->all();
    }

    private function payments(Carbon $before, int $limit): array
    {
        return PaymentTransaction::query()
            ->where('created_at', '<', $before)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get(['id', 'amount', 'currency', 'status', 'provider', 'created_at'])
            ->map(fn (PaymentTransaction $txn) => [
                'id' => 'payment:'.$txn->id,
                'type' => 'payment',
                'at' => $txn->created_at->toIso8601String(),
                'title' => 'Payment '.$txn->status,
                'detail' => trim(($txn->currency ?: '').' '.number_format((float) $txn->amount, 2)).' via '.$txn->provider,
                'store_id' => null,
                'derived' => false,
            ])
            ->all();
    }

    /**
     * Derived, and labelled as such: there is no subscription event table. A
     * row yields a start, and an end only once that date has actually passed —
     * a future end_date is not something that happened.
     */
    private function subscriptions(Carbon $before, int $limit): array
    {
        $events = [];

        $started = Subscription::query()
            ->where('start_date', '<', $before)
            ->orderByDesc('start_date')
            ->limit($limit)
            ->get(['id', 'plan_name', 'is_trial', 'start_date']);

        foreach ($started as $subscription) {
            $events[] = [
                'id' => 'subscription_started:'.$subscription->id,
                'type' => 'subscription',
                'at' => $subscription->start_date->toIso8601String(),
                'title' => ($subscription->is_trial ? 'Trial' : 'Subscription').' started',
                'detail' => ucfirst((string) $subscription->plan_name),
                'store_id' => null,
                'derived' => true,
            ];
        }

        $ended = Subscription::query()
            ->whereNotNull('end_date')
            ->where('end_date', '<', $before)
            ->where('end_date', '<=', now())
            ->orderByDesc('end_date')
            ->limit($limit)
            ->get(['id', 'plan_name', 'is_trial', 'end_date']);

        foreach ($ended as $subscription) {
            $events[] = [
                'id' => 'subscription_ended:'.$subscription->id,
                'type' => 'subscription',
                'at' => $subscription->end_date->toIso8601String(),
                'title' => ($subscription->is_trial ? 'Trial' : 'Subscription').' ended',
                'detail' => ucfirst((string) $subscription->plan_name),
                'store_id' => null,
                'derived' => true,
            ];
        }

        return $events;
    }

    private function humanise(?string $value): string
    {
        return ucfirst(strtolower(str_replace('_', ' ', (string) $value)));
    }
}
