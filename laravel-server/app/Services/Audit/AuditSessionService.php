<?php

namespace App\Services\Audit;

use App\Exceptions\AuditSessionConflictException;
use App\Models\AuditSession;
use App\Models\AuditSessionItem;
use App\Models\StockAudit;
use App\Models\Store;
use Illuminate\Support\Facades\DB;

class AuditSessionService
{
    public const LEASE_DURATION_SECONDS = 300;

    public const PENDING_SYNC_GRACE_HOURS = 24;

    public function __construct(private AuditSessionItemWriter $items) {}

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
                $this->items->insertStartingItems($session, $items, $now);
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

    public function getSessionStatus(string $storeId, string $sessionId): ?string
    {
        return AuditSession::where('store_id', $storeId)
            ->where('id', $sessionId)
            ->value('status');
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

    private function lockSession(AuditSession $session): AuditSession
    {
        return AuditSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
    }

    private function assertLeaseHeld(AuditSession $locked, string $tillId, int $leaseVersion, string $inactiveMessage): void
    {
        if ($locked->status !== AuditSession::STATUS_IN_PROGRESS) {
            throw new AuditSessionConflictException($inactiveMessage, $locked);
        }

        if ($locked->active_till_id !== $tillId || $locked->lease_version !== $leaseVersion) {
            throw new AuditSessionConflictException('Lease has been superseded or expired on this device.', $locked);
        }
    }

    public function heartbeat(AuditSession $session, string $tillId, int $leaseVersion, ?string $userId = null): AuditSession
    {
        return DB::transaction(function () use ($session, $tillId, $leaseVersion, $userId) {
            $locked = $this->lockSession($session);
            $this->assertLeaseHeld($locked, $tillId, $leaseVersion, 'Cannot heartbeat an inactive audit session.');

            $locked->update([
                'lease_expires_at' => now()->addSeconds(self::LEASE_DURATION_SECONDS),
                'active_user_id' => $userId ?? $locked->active_user_id,
            ]);

            return $locked;
        }, 3);
    }

    public function syncBatchItems(AuditSession $session, string $tillId, int $leaseVersion, array $items): AuditSession
    {
        return DB::transaction(function () use ($session, $tillId, $leaseVersion, $items) {
            $locked = $this->lockSession($session);
            $this->assertLeaseHeld($locked, $tillId, $leaseVersion, 'Cannot sync items to an inactive audit session.');

            $now = now();
            $this->items->upsertSyncedItems($locked, $items, $now);

            $locked->update([
                'total_items_count' => AuditSessionItem::where('audit_session_id', $locked->id)->count(),
                'counted_items_count' => AuditSessionItem::where('audit_session_id', $locked->id)->where('counted', true)->count(),
                'lease_expires_at' => $now->copy()->addSeconds(self::LEASE_DURATION_SECONDS),
                'last_synced_at' => $now,
            ]);

            return $locked;
        }, 3);
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
        return DB::transaction(function () use ($session, $tillId, $leaseVersion, $submittedAuditId) {
            $locked = $this->lockSession($session);

            if ($this->isCompletionReplay($locked, $submittedAuditId)) {
                $this->settlePendingSessions($locked->store_id);

                return $locked->refresh();
            }

            $this->assertLeaseHeld($locked, $tillId, $leaseVersion, 'Cannot complete an audit session that is not in progress.');

            $isAlreadySynced = $submittedAuditId && StockAudit::where('id', $submittedAuditId)->exists();
            $targetStatus = (! $submittedAuditId || $isAlreadySynced)
                ? AuditSession::STATUS_COMPLETED
                : AuditSession::STATUS_COMPLETION_PENDING_SYNC;

            $locked->update([
                'status' => $targetStatus,
                'submitted_stock_audit_id' => $submittedAuditId,
                'completed_at' => $targetStatus === AuditSession::STATUS_COMPLETED ? now() : null,
                'last_synced_at' => now(),
            ]);

            return $locked;
        }, 3);
    }

    public function abandonSession(
        AuditSession $session,
        string $userId,
        ?string $reason = null,
        ?string $tillId = null,
        ?int $leaseVersion = null
    ): AuditSession {
        return DB::transaction(function () use ($session, $reason, $tillId, $leaseVersion) {
            $locked = AuditSession::whereKey($session->id)->lockForUpdate()->firstOrFail();

            if (in_array($locked->status, [AuditSession::STATUS_COMPLETED, AuditSession::STATUS_ABANDONED], true)) {
                throw new AuditSessionConflictException('Cannot abandon an audit session that is already finished.', $locked);
            }

            if ($leaseVersion !== null && ($locked->active_till_id !== $tillId || $locked->lease_version !== $leaseVersion)) {
                throw new AuditSessionConflictException('Lease has been superseded or expired on this device.', $locked);
            }

            $notes = $locked->notes;
            if ($reason) {
                $notes = trim(($notes ? $notes."\n" : '').'['.now()->toIso8601String().'] Abandoned: '.$reason);
            }

            $locked->update([
                'status' => AuditSession::STATUS_ABANDONED,
                'lease_expires_at' => null,
                'notes' => $notes,
            ]);

            return $locked;
        });
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
