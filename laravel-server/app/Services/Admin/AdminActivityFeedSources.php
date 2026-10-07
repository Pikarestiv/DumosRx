<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\SyncFailure;
use Illuminate\Database\Eloquent\Builder;

/**
 * Normalises each source into the feed's event shape. Dispatch is an explicit
 * match rather than a lookup keyed by request input (§8), so an unknown source
 * name cannot reach a method.
 */
class AdminActivityFeedSources
{
    /**
     * @param  array{0: string, 1: string}|null  $after  the cursor's (timestamp, event id)
     * @return array<int, array{id: string, type: string, at: string, title: string, detail: ?string, store_id: ?string, derived: bool}>
     */
    public function fetch(string $type, ?array $after, int $limit, bool $includeSuperAdmin = true): array
    {
        return match ($type) {
            'admin_action' => $this->adminActions($after, $limit, $includeSuperAdmin),
            'sync_failure' => $this->syncFailures($after, $limit),
            'payment' => $this->payments($after, $limit),
            'subscription' => $this->subscriptions($after, $limit),
            default => throw new \InvalidArgumentException("Unknown activity source: {$type}"),
        };
    }

    /**
     * Keyset pagination, per source. A timestamp alone is not a position:
     * these sources are second-granular and one bulk action writes many rows
     * in the same second, so a page boundary falling inside that second left
     * the remaining rows unreachable however many pages were requested.
     */
    private function applyCursor(Builder $query, string $column, string $prefix, ?array $after): Builder
    {
        if ($after === null) {
            return $query;
        }

        [$rawAt, $afterId] = $after;
        // The cursor carries ISO-8601; the columns store 'Y-m-d H:i:s', and a
        // string comparison between the two forms is not an ordering.
        $at = \Illuminate\Support\Carbon::parse($rawAt)->format('Y-m-d H:i:s');
        $afterPrefix = explode(':', $afterId)[0];

        if ($afterPrefix === $prefix) {
            $afterKey = substr($afterId, strlen($prefix) + 1);

            return $query->where(function (Builder $q) use ($column, $at, $afterKey) {
                $q->where($column, '<', $at)
                    ->orWhere(fn (Builder $tie) => $tie->where($column, '=', $at)->where('id', '<', $afterKey));
            });
        }

        // A different source held the boundary, so this source's rows at that
        // exact second order against it by prefix alone.
        return $prefix < $afterPrefix
            ? $query->where($column, '<=', $at)
            : $query->where($column, '<', $at);
    }

    private function adminActions(?array $after, int $limit, bool $includeSuperAdmin): array
    {
        $base = ActivityLog::query();

        // Mirrors AdminActivityService's tiering, so the feed cannot become
        // the way around it. See laravel-server/AGENTS.md.
        if (! $includeSuperAdmin) {
            $base->whereDoesntHave('user', fn ($uq) => $uq->where('role', 'super_admin'));
        }

        return $this->applyCursor($base, 'created_at', 'admin_action', $after)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
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

    private function syncFailures(?array $after, int $limit): array
    {
        return $this->applyCursor(SyncFailure::query(), 'created_at', 'sync_failure', $after)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
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

    private function payments(?array $after, int $limit): array
    {
        return $this->applyCursor(PaymentTransaction::query(), 'created_at', 'payment', $after)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
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
    private function subscriptions(?array $after, int $limit): array
    {
        $events = [];

        $started = $this->applyCursor(Subscription::query(), 'start_date', 'subscription_started', $after)
            ->orderByDesc('start_date')
            ->orderByDesc('id')
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

        $ended = $this->applyCursor(
            Subscription::query()->whereNotNull('end_date')->where('end_date', '<=', now()),
            'end_date',
            'subscription_ended',
            $after,
        )
            ->orderByDesc('end_date')
            ->orderByDesc('id')
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
