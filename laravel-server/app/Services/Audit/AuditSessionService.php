<?php

namespace App\Services\Audit;

use App\Exceptions\AuditSessionConflictException;
use App\Models\AuditSession;
use App\Models\AuditSessionItem;
use App\Models\StockAudit;
use App\Models\Store;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AuditSessionService
{
    public const LEASE_DURATION_SECONDS = 300;

    public const PENDING_SYNC_GRACE_HOURS = 24;

    public function startSession(
        string $storeId,
        string $userId,
        string $tillId,
        ?string $tillName,
        ?string $name,
        ?string $notes,
        array $items
    ): AuditSession {
        return DB::transaction(function () use ($storeId, $userId, $tillId, $tillName, $name, $notes, $items) {
            Store::whereKey($storeId)->lockForUpdate()->firstOrFail();
            $this->settlePendingSessions($storeId);

            $existing = AuditSession::where('store_id', $storeId)
                ->whereIn('status', [AuditSession::STATUS_IN_PROGRESS, AuditSession::STATUS_COMPLETION_PENDING_SYNC])
                ->first();

            if ($existing) {
                if ($existing->status === AuditSession::STATUS_COMPLETION_PENDING_SYNC) {
                    throw new AuditSessionConflictException(
                        'An audit session is currently awaiting sync completion.',
                        $existing
                    );
                }

                if ($existing->active_till_id === $tillId) {
                    $existing->update([
                        'lease_expires_at' => now()->addSeconds(self::LEASE_DURATION_SECONDS),
                        'active_user_id' => $userId,
                        'active_till_name' => $tillName ?? $existing->active_till_name,
                    ]);

                    return $existing->load('items');
                }

                throw new AuditSessionConflictException(
                    'An active audit session already exists on another device.',
                    $existing
                );
            }

            $now = now();
            $countedCount = 0;
            foreach ($items as $item) {
                if (! empty($item['counted'])) {
                    $countedCount++;
                }
            }

            $session = AuditSession::create([
                'store_id' => $storeId,
                'created_by' => $userId,
                'name' => $name,
                'notes' => $notes,
                'status' => AuditSession::STATUS_IN_PROGRESS,
                'active_till_id' => $tillId,
                'active_till_name' => $tillName,
                'active_user_id' => $userId,
                'lease_version' => 1,
                'lease_expires_at' => $now->copy()->addSeconds(self::LEASE_DURATION_SECONDS),
                'total_items_count' => count($items),
                'counted_items_count' => $countedCount,
                'started_at' => $now,
                'last_synced_at' => $now,
            ]);

            if (! empty($items)) {
                $itemRecords = [];
                foreach ($items as $item) {
                    $itemRecords[] = [
                        'id' => (string) Str::uuid(),
                        'audit_session_id' => $session->id,
                        'product_id' => $item['product_id'],
                        'system_quantity' => $item['system_quantity'] ?? 0,
                        'counted_quantity' => $item['counted_quantity'] ?? null,
                        'cost_price' => $item['cost_price'] ?? null,
                        'counted_cost_price' => $item['counted_cost_price'] ?? null,
                        'selling_price' => $item['selling_price'] ?? null,
                        'counted_selling_price' => $item['counted_selling_price'] ?? null,
                        'counted' => (bool) ($item['counted'] ?? false),
                        'notes' => $item['notes'] ?? null,
                        'counted_at' => isset($item['counted_at']) ? Carbon::parse($item['counted_at']) : null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }

                foreach (array_chunk($itemRecords, 200) as $chunk) {
                    AuditSessionItem::insert($chunk);
                }
            }

            return $session->load('items');
        });
    }

    public function getActiveSession(string $storeId, bool $includeItems = false): ?AuditSession
    {
        $this->settlePendingSessions($storeId);

        $query = AuditSession::where('store_id', $storeId)
            ->whereIn('status', [AuditSession::STATUS_IN_PROGRESS, AuditSession::STATUS_COMPLETION_PENDING_SYNC])
            ->with(['creator', 'activeUser']);

        if ($includeItems) {
            $query->with('items');
        }

        $session = $query->first();
        if ($session && $includeItems && $session->status !== AuditSession::STATUS_IN_PROGRESS) {
            $session->setRelation('items', collect());
        }

        return $session;
    }

    private function settlePendingSessions(string $storeId): void
    {
        $pending = AuditSession::where('store_id', $storeId)
            ->where('status', AuditSession::STATUS_COMPLETION_PENDING_SYNC)
            ->get();

        foreach ($pending as $session) {
            $synced = $session->submitted_stock_audit_id
                && StockAudit::whereKey($session->submitted_stock_audit_id)->exists();
            $expired = $session->last_synced_at === null
                || $session->last_synced_at->lt(now()->subHours(self::PENDING_SYNC_GRACE_HOURS));
            if ($synced || $expired) {
                $session->update(['status' => AuditSession::STATUS_COMPLETED, 'completed_at' => now()]);
            }
        }
    }

    private function isCompletionReplay(AuditSession $session, ?string $submittedAuditId): bool
    {
        return in_array($session->status, [AuditSession::STATUS_COMPLETION_PENDING_SYNC, AuditSession::STATUS_COMPLETED], true)
            && $session->submitted_stock_audit_id === $submittedAuditId;
    }

    public function heartbeat(AuditSession $session, string $tillId, int $leaseVersion, ?string $userId = null): AuditSession
    {
        if ($session->status !== AuditSession::STATUS_IN_PROGRESS) {
            throw new AuditSessionConflictException('Cannot heartbeat an inactive audit session.', $session);
        }

        if ($session->active_till_id !== $tillId || $session->lease_version !== $leaseVersion) {
            throw new AuditSessionConflictException('Lease has been superseded or expired on this device.', $session);
        }

        $session->update([
            'lease_expires_at' => now()->addSeconds(self::LEASE_DURATION_SECONDS),
            'active_user_id' => $userId ?? $session->active_user_id,
        ]);

        return $session;
    }

    public function syncBatchItems(AuditSession $session, string $tillId, int $leaseVersion, array $items): AuditSession
    {
        if ($session->status !== AuditSession::STATUS_IN_PROGRESS) {
            throw new AuditSessionConflictException('Cannot sync items to an inactive audit session.', $session);
        }

        if ($session->active_till_id !== $tillId || $session->lease_version !== $leaseVersion) {
            throw new AuditSessionConflictException('Lease has been superseded or expired on this device.', $session);
        }

        return DB::transaction(function () use ($session, $items) {
            $now = now();
            foreach ($items as $item) {
                AuditSessionItem::updateOrCreate(
                    [
                        'audit_session_id' => $session->id,
                        'product_id' => $item['product_id'],
                    ],
                    [
                        'system_quantity' => $item['system_quantity'] ?? 0,
                        'counted_quantity' => $item['counted_quantity'] ?? null,
                        'cost_price' => $item['cost_price'] ?? null,
                        'counted_cost_price' => $item['counted_cost_price'] ?? null,
                        'selling_price' => $item['selling_price'] ?? null,
                        'counted_selling_price' => $item['counted_selling_price'] ?? null,
                        'counted' => (bool) ($item['counted'] ?? false),
                        'notes' => $item['notes'] ?? null,
                        'counted_at' => isset($item['counted_at']) ? Carbon::parse($item['counted_at']) : null,
                    ]
                );
            }

            $totalCount = AuditSessionItem::where('audit_session_id', $session->id)->count();
            $countedCount = AuditSessionItem::where('audit_session_id', $session->id)->where('counted', true)->count();

            $session->update([
                'total_items_count' => $totalCount,
                'counted_items_count' => $countedCount,
                'lease_expires_at' => $now->copy()->addSeconds(self::LEASE_DURATION_SECONDS),
                'last_synced_at' => $now,
            ]);

            return $session;
        });
    }

    public function takeoverSession(
        AuditSession $session,
        string $userId,
        string $tillId,
        ?string $tillName,
        ?string $reason = null
    ): AuditSession {
        return DB::transaction(function () use ($session, $userId, $tillId, $tillName, $reason) {
            $locked = AuditSession::whereKey($session->id)->lockForUpdate()->firstOrFail();

            if ($locked->status !== AuditSession::STATUS_IN_PROGRESS) {
                throw new AuditSessionConflictException('Cannot take over an audit session that is not in progress.', $locked);
            }

            $notes = $locked->notes;
            if ($reason) {
                $notes = trim(($notes ? $notes."\n" : '').'['.now()->toIso8601String().'] Takeover: '.$reason);
            }

            $locked->update([
                'active_till_id' => $tillId,
                'active_till_name' => $tillName,
                'active_user_id' => $userId,
                'lease_version' => $locked->lease_version + 1,
                'lease_expires_at' => now()->addSeconds(self::LEASE_DURATION_SECONDS),
                'notes' => $notes,
                'last_synced_at' => now(),
            ]);

            return $locked->load('items');
        });
    }

    public function completeSession(
        AuditSession $session,
        string $tillId,
        int $leaseVersion,
        ?string $submittedAuditId = null
    ): AuditSession {
        if ($this->isCompletionReplay($session, $submittedAuditId)) {
            $this->settlePendingSessions($session->store_id);

            return $session->refresh();
        }

        if ($session->status !== AuditSession::STATUS_IN_PROGRESS) {
            throw new AuditSessionConflictException('Cannot complete an audit session that is not in progress.', $session);
        }

        if ($session->active_till_id !== $tillId || $session->lease_version !== $leaseVersion) {
            throw new AuditSessionConflictException('Lease has been superseded or expired on this device.', $session);
        }

        $isAlreadySynced = $submittedAuditId && StockAudit::where('id', $submittedAuditId)->exists();
        $targetStatus = (! $submittedAuditId || $isAlreadySynced)
            ? AuditSession::STATUS_COMPLETED
            : AuditSession::STATUS_COMPLETION_PENDING_SYNC;

        $session->update([
            'status' => $targetStatus,
            'submitted_stock_audit_id' => $submittedAuditId,
            'completed_at' => $targetStatus === AuditSession::STATUS_COMPLETED ? now() : null,
            'last_synced_at' => now(),
        ]);

        return $session;
    }

    public function abandonSession(
        AuditSession $session,
        string $userId,
        ?string $reason = null,
        ?string $tillId = null,
        ?int $leaseVersion = null
    ): AuditSession {
        if (in_array($session->status, [AuditSession::STATUS_COMPLETED, AuditSession::STATUS_ABANDONED], true)) {
            throw new AuditSessionConflictException('Cannot abandon an audit session that is already finished.', $session);
        }

        if ($leaseVersion !== null && ($session->active_till_id !== $tillId || $session->lease_version !== $leaseVersion)) {
            throw new AuditSessionConflictException('Lease has been superseded or expired on this device.', $session);
        }

        $notes = $session->notes;
        if ($reason) {
            $notes = trim(($notes ? $notes."\n" : '').'['.now()->toIso8601String().'] Abandoned: '.$reason);
        }

        $session->update([
            'status' => AuditSession::STATUS_ABANDONED,
            'lease_expires_at' => null,
            'notes' => $notes,
        ]);

        return $session;
    }

    public function confirmSyncCompletion(string $stockAuditId): int
    {
        return AuditSession::where('submitted_stock_audit_id', $stockAuditId)
            ->where('status', AuditSession::STATUS_COMPLETION_PENDING_SYNC)
            ->update([
                'status' => AuditSession::STATUS_COMPLETED,
                'completed_at' => now(),
            ]);
    }
}

