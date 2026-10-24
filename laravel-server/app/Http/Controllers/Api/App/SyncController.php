<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\RequestedProduct;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockBatch;
use App\Models\StockMovement;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Sync\PeerSyncFreshnessService;
use App\Services\Sync\PullPager;
use App\Services\Sync\PullRowMapper;
use App\Services\Sync\PullTenantScope;
use App\Services\Sync\PushConflictResolver;
use App\Services\Sync\PushPayloadNormalizer;
use App\Services\Sync\PushRowWriter;
use App\Services\Sync\QuantityReconciliationService;
use App\Services\Sync\StockBatchDeltaApplier;
use App\Services\Sync\SyncActivityRecorder;
use App\Services\Sync\SyncGate;
use App\Services\Sync\SyncOwnershipResolver;
use App\Services\Sync\SyncWriteAuthorizer;
use App\Services\Web\SyncPayloadMapper;
use App\Services\Web\UserDeviceTracker;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#synccontroller */
class SyncController extends Controller
{
    #[OA\Post(
        path: '/app/sync/push',
        summary: 'Push offline-first client changes to the server',
        description: 'Applies a batch of INSERT/UPDATE/DELETE changes from the client\'s local SQLite database. Conflict resolution on UPDATE uses strict-equality optimistic concurrency on `_version` (falling back to `updated_at` only for legacy rows with no version tracking): the payload\'s `_version` must exactly equal the server\'s current version for the edit to be accepted (not merely "not older" — an equal version means two devices edited from the same ancestor, a real conflict, not a free pass); on acceptance the server assigns the new version itself, never trusting whatever `_version` value the payload carries. A rejected UPDATE (real conflict, in either the version or timestamp fallback path) is reported in `failed`, never silently dropped. EXCEPT for a `stock_batches` UPDATE whose payload is provably quantity-only (nothing left after stripping `quantity` and the usual bookkeeping fields): `quantity` is never trusted from the client at all (INSERT or UPDATE) and is always derived by applying `stock_movements` deltas on top of the server\'s current value, since concurrent quantity changes from multiple devices/terminals are commutative and both should apply rather than one winning by version — but any OTHER `stock_batches` field (`cost_price`, `expiry_date`, `batch_number`, etc.) still goes through the normal strict-equality check, since those are genuinely overwritten by this path and a real two-manager conflict on them must still be caught. May reject the whole request (403/429) if the store\'s plan disables cloud sync or the sync-interval throttle hasn\'t elapsed yet.',
        tags: ['Sync'],
        security: [['sanctum' => []]],
        parameters: [new OA\HeaderParameter(name: 'X-Store-Id', description: 'Which of the caller\'s stores to sync (defaults to their primary store)', schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['changes'],
            properties: [
                new OA\Property(property: 'changes', type: 'array', items: new OA\Items(
                    properties: [
                        new OA\Property(property: 'table_name', type: 'string'),
                        new OA\Property(property: 'operation', type: 'string', enum: ['INSERT', 'UPDATE', 'DELETE']),
                        new OA\Property(property: 'record_id', type: 'string'),
                        new OA\Property(property: 'payload', type: 'object', nullable: true),
                    ],
                )),
                new OA\Property(property: 'manual', type: 'boolean', description: 'Bypasses the plan\'s sync-interval throttle when true'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Changes applied', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'processed', type: 'integer'),
                new OA\Property(property: 'failed', type: 'array', description: 'Changes that failed and were skipped individually (each one isolated to its own savepoint, so it never blocks the rest of the batch). The client should call recordSyncFailure for each rather than treating the whole push as failed.', items: new OA\Items(properties: [
                    new OA\Property(property: 'id', type: 'integer', description: 'The client-side _sync_queue id'),
                    new OA\Property(property: 'table_name', type: 'string'),
                    new OA\Property(property: 'record_id', type: 'string'),
                    new OA\Property(property: 'reason', type: 'string'),
                ])),
                new OA\Property(property: 'id_map', type: 'object', description: 'Local id -> server id, grouped by table_name, for INSERTs skipped because the name collided with an existing categories/suppliers row. The client applies this immediately to its own local rows referencing the old id, rather than relying on a future pull to ever surface the collision.'),
                new OA\Property(property: 'versions', type: 'object', description: 'Record id -> server-assigned new _version, grouped by table_name, for UPDATE changes accepted via the version-equality check. The client applies this immediately to its local row so its very next edit is based on the true current server version, instead of waiting for a future pull.'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Cloud sync disabled on current plan, or store count exceeds plan limit'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 429, description: 'Sync-interval throttle not yet elapsed for this plan'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function push(Request $request)
    {
        $authorizer = app(SyncWriteAuthorizer::class);
        $activity = app(SyncActivityRecorder::class);
        $validation = app(SyncGate::class)->validateSync($request, true);
        if (! $validation['valid']) {
            $activity->recordRejectedPush($request, $validation['code'] ?? null);

            return response()->json([
                'success' => false,
                'message' => $validation['message'],
                'code' => $validation['code'],
            ], $validation['status']);
        }

        $request->validate([
            'changes' => 'present|array',
            'changes.*.table_name' => 'required|string',
            'changes.*.operation' => 'required|in:INSERT,UPDATE,DELETE',
            'changes.*.payload' => 'nullable',
        ]);

        $changes = $request->input('changes');

        usort($changes, fn ($a, $b) => ($a['table_name'] === 'stock_movements') <=> ($b['table_name'] === 'stock_movements'));

        $processed = 0;

        $entryTransactionLevel = DB::transactionLevel();
        DB::beginTransaction();

        $crossStoreGuard = app(\App\Services\Sync\CrossStoreReferenceGuard::class);

        $hasSyncedAtCache = [];
        $restamper = new \App\Services\Sync\PushedRowRestamper;
        $storelessProducts = new \App\Services\Sync\StorelessProductAttributor;
        $conflicts = app(PushConflictResolver::class);
        $rowWriter = app(PushRowWriter::class);
        $normalizer = app(PushPayloadNormalizer::class);
        $currentUser = $request->user();
        $currentStoreId = $currentUser ? $this->ownership()->resolvePushStoreId($request, $currentUser) : null;
        UserDeviceTracker::touch($request, $currentUser, $currentStoreId);
        $activity->recordQueueState($request, $currentUser, $currentStoreId);

        $isSuperAdmin = $currentUser && $currentUser->hasRole('super_admin');
        $allowedStoreIds = [];
        $allowedUserIds = [];
        $ownerId = null;
        if ($currentUser && ! $isSuperAdmin) {
            [$allowedStoreIds, $allowedUserIds, $ownerId] = $this->ownership()->resolveAllowedOwnershipScope($currentUser);
        }

        try {
            $idMap = [];
            $idMapByTable = [];

            $stockBatchDeltas = [];
            $failed = [];
            $versions = [];

            $resentInsertsAccepted = 0;
            $insertOverrides = 0;

            foreach ($changes as $changeIndex => $change) {
                $modelClass = $this->getModelForTable($change['table_name']);

                if (! $modelClass) {
                    Log::warning('Sync push ignored unknown table: '.$change['table_name']);

                    continue;
                }

                DB::beginTransaction();
                try {
                    $pendingStockBatchDelta = null;
                    $restamper->discardChange();
                    $crossStoreGuard->discardChange();
                    $storelessProducts->discardChange();

                    $payload = is_array($change['payload']) ? $change['payload'] : (json_decode($change['payload'], true) ?? []);

                    if (isset($payload['_synced'])) {
                        unset($payload['_synced']);
                    }

                    foreach ($payload as $key => $value) {
                        if (is_string($value) && isset($idMap[$value])) {
                            $payload[$key] = $idMap[$value];
                        }
                    }

                    $context = ['user_id' => $currentUser ? $currentUser->id : null, 'store_id' => $currentStoreId];
                    $payload = SyncPayloadMapper::map($change['table_name'], $payload, $context);

                    $now = now();

                    $clientNamedStoreId = ! empty($payload['store_id']);

                    $payload = $normalizer->normalizePushPayload($request, $change, $payload, $currentStoreId, $currentUser, $isSuperAdmin, $allowedStoreIds, $allowedUserIds, $ownerId);

                    $recordId = $change['record_id'] ?? ($payload['id'] ?? null);

                    $isResentInsert = false;

                    if ($change['operation'] === 'INSERT' && $recordId) {
                        if ($change['table_name'] === 'audit_logs') {
                            $exists = $conflicts->findAuditLogByClientId($modelClass, $recordId, $currentStoreId) !== null;
                        } else {
                            $exists = \method_exists($modelClass, 'trashed')
                                ? $modelClass::withTrashed()->where('id', $recordId)->exists()
                                : $modelClass::where('id', $recordId)->exists();
                        }

                        if ($exists) {
                            $change['operation'] = 'UPDATE';
                            $changes[$changeIndex]['operation'] = 'UPDATE';
                            $isResentInsert = true;
                            $insertOverrides++;
                            if ($change['table_name'] === 'users' || (! $clientNamedStoreId && in_array($change['table_name'], PushPayloadNormalizer::STORE_ID_BACKFILL_TABLES, true))) {
                                unset($payload['store_id']);
                            }
                        }
                    }

                    if ($change['operation'] === 'INSERT') {
                        if ($currentUser && ! $isSuperAdmin && ! $authorizer->authorizeInsertTarget($change['table_name'], $payload, $allowedStoreIds)) {
                            DB::commit();
                            $failed[] = [
                                'id' => $change['id'] ?? null,
                                'table_name' => $change['table_name'],
                                'record_id' => $recordId,
                                'reason' => 'forbidden',
                            ];

                            continue;
                        }

                        $exists = false;

                        $conflict = $conflicts->findDuplicateInsertConflict($modelClass, $change['table_name'], $payload, $recordId);
                        if ($conflict) {
                            $exists = true;
                            if (\method_exists($conflict, 'trashed') && $conflict->trashed()) {
                                $rowWriter->reviveConflictTarget($conflict, $change['table_name'], $payload, $hasSyncedAtCache, $now);
                                $restamper->remember($conflict);
                            }
                            $idMap[$recordId] = $conflict->id;
                            if ($change['table_name'] === 'categories' || $change['table_name'] === 'suppliers') {
                                $idMapByTable[$change['table_name']][$recordId] = $conflict->id;
                            }
                        }

                        if (! $exists) {
                            $payload = $crossStoreGuard->apply(
                                $change['table_name'],
                                $payload,
                                $authorizer->guardedRowStoreId($change['table_name'], $payload),
                                $recordId,
                            );
                            $model = new $modelClass;
                            $model->forceFill($payload);

                            if ($change['table_name'] === 'users') {
                                if (empty($model->getAttribute('password'))) {
                                    $model->setAttribute('password', null);
                                }
                                if (empty($model->getAttribute('first_name'))) {
                                    $model->setAttribute('first_name', $payload['first_name'] ?? 'User');
                                }
                                if (empty($model->getAttribute('last_name')) && ! isset($payload['last_name'])) {
                                    $model->setAttribute('last_name', '');
                                }
                            }

                            if ($change['table_name'] === 'audit_logs') {
                                if (isset($payload['created_at'])) {
                                    $model->setAttribute('created_at', $payload['created_at']);
                                }
                            } else {
                                $model->setAttribute('id', $recordId);
                            }

                            $isDeleted = null;
                            if (isset($payload['_deleted'])) {
                                $isDeleted = $payload['_deleted'];
                                unset($payload['_deleted']);
                            }

                            $model->forceFill($payload);

                            $rowWriter->stampSyncedAt($model, $hasSyncedAtCache, $now);

                            $rowWriter->applyNotNullColumnDefaults($request, $change['table_name'], $model);

                            if ($change['table_name'] === 'stock_batches') {
                                $model->setAttribute('quantity', 0);
                            }

                            $model->save();
                            $restamper->remember($model);
                            $storelessProducts->afterWrite($change['table_name'], $model, $clientNamedStoreId);

                            if ($change['table_name'] === 'stock_movements') {
                                $stockBatchId = $payload['stock_batch_id'] ?? null;
                                $qtyDelta = (float) ($payload['quantity'] ?? 0);
                                if ($stockBatchId && $qtyDelta != 0) {
                                    $pendingStockBatchDelta = [$stockBatchId, $qtyDelta];
                                }
                            }

                            if ($isDeleted) {
                                if (\method_exists($model, 'trashed')) {
                                    $model->delete();
                                }
                            }
                        }
                    } elseif ($change['operation'] === 'UPDATE') {
                        $recordId = $change['record_id'] ?? ($payload['id'] ?? null);
                        if ($change['table_name'] === 'audit_logs') {
                            $model = $conflicts->findAuditLogByClientId($modelClass, $recordId, $currentStoreId, true);
                        } else {
                            $model = \method_exists($modelClass, 'trashed') ? $modelClass::withTrashed()->lockForUpdate()->find($recordId) : $modelClass::lockForUpdate()->find($recordId);
                        }

                        if ($model && $currentUser && ! $isSuperAdmin && (
                            ! $authorizer->authorizeChangeTarget($change['table_name'], $model, $allowedStoreIds, $allowedUserIds)
                            || $authorizer->namesForeignBatch($change['table_name'], $payload, $allowedStoreIds, $model)
                        )) {
                            DB::commit();
                            $failed[] = [
                                'id' => $change['id'] ?? null,
                                'table_name' => $change['table_name'],
                                'record_id' => $recordId,
                                'reason' => 'forbidden',
                            ];

                            continue;
                        }

                        if ($model) {
                            $payload = $authorizer->withoutStoreReassignment($change['table_name'], $payload, $model, $isSuperAdmin ? null : $allowedStoreIds);
                        }

                        if (
                            $model
                            && $change['table_name'] === 'purchase_order_items'
                            && isset($payload['quantity_received'])
                        ) {
                            $ordered = $payload['quantity_ordered'] ?? $model->quantity_ordered;
                            if ($ordered !== null && (float) $payload['quantity_received'] > (float) $ordered) {
                                DB::commit();
                                Log::warning(
                                    'Sync push: rejected purchase_order_items '.$recordId
                                    .' receipt of '.$payload['quantity_received']
                                    .' against '.$ordered.' ordered',
                                );
                                $failed[] = [
                                    'id' => $change['id'] ?? null,
                                    'table_name' => $change['table_name'],
                                    'record_id' => $recordId,
                                    'reason' => 'quantity_received_exceeds_ordered',
                                ];

                                continue;
                            }
                        }

                        if ($model) {
                            $isCommutativeTable = $conflicts->isQuantityOnlyStockBatchUpdate($change['table_name'], $payload);

                            [$versionConflict, $conflictReason, $newVersion] =
                                $conflicts->resolveUpdateConflict($change['table_name'], $model, $payload, $isCommutativeTable, $recordId, $isResentInsert);

                            if ($versionConflict) {
                                if ($isResentInsert) {
                                    $rowWriter->reopenPullWindow($model, $hasSyncedAtCache, $now);
                                }

                                DB::commit();

                                if ($isResentInsert) {
                                    $restamper->remember($model);
                                    $restamper->commitChange();
                                    if ($model->_version !== null) {
                                        $versions[$change['table_name']][$recordId] = (int) $model->_version;
                                    }
                                    $resentInsertsAccepted++;
                                    $processed++;

                                    continue;
                                }

                                $failed[] = [
                                    'id' => $change['id'] ?? null,
                                    'table_name' => $change['table_name'],
                                    'record_id' => $recordId,
                                    'reason' => $conflictReason,
                                ];

                                continue;
                            }

                            $isDeleted = null;
                            if (isset($payload['_deleted'])) {
                                $isDeleted = $payload['_deleted'];
                                unset($payload['_deleted']);
                            }

                            unset($payload['_version']);

                            if ($change['table_name'] === 'stock_batches') {
                                if (isset($payload['quantity'])) {
                                    unset($payload['quantity']);
                                }
                            }

                            $payload = $crossStoreGuard->apply(
                                $change['table_name'],
                                $payload,
                                $authorizer->guardedRowStoreId($change['table_name'], $payload, $model),
                                $recordId,
                            );

                            $model->forceFill($payload);
                            if ($newVersion !== null) {
                                $model->_version = $newVersion;
                            }

                            if ($change['table_name'] === 'users') {
                                if (isset($payload['password'])) {
                                    $model->password = $payload['password'];
                                }
                                if (isset($payload['first_name'])) {
                                    $model->first_name = $payload['first_name'];
                                }
                                if (isset($payload['last_name'])) {
                                    $model->last_name = $payload['last_name'];
                                }
                            }

                            $rowWriter->stampSyncedAt($model, $hasSyncedAtCache, $now);

                            $rowWriter->applyNotNullColumnDefaults($request, $change['table_name'], $model);

                            $model->save();
                            $restamper->remember($model);
                            $storelessProducts->afterWrite($change['table_name'], $model, $clientNamedStoreId);

                            if ($newVersion !== null) {
                                $versions[$change['table_name']][$recordId] = $newVersion;
                            }

                            if ($isDeleted !== null) {
                                if ($model instanceof Model && \method_exists($model, 'trashed') && \method_exists($model, 'restore')) {
                                    if ($isDeleted && ! $model->trashed()) {
                                        $model->delete();
                                    } elseif (! $isDeleted && $model->trashed()) {
                                        $model->restore();
                                    }
                                }
                            }
                        }
                    } elseif ($change['operation'] === 'DELETE') {
                        if ($change['table_name'] === 'audit_logs') {
                            DB::commit();
                            Log::warning('Sync push: rejected DELETE against append-only audit_logs for record '.($change['record_id'] ?? '?'));
                            $failed[] = [
                                'id' => $change['id'] ?? null,
                                'table_name' => $change['table_name'],
                                'record_id' => $change['record_id'] ?? null,
                                'reason' => 'unsupported_operation',
                            ];

                            continue;
                        }

                        $target = \method_exists($modelClass, 'trashed')
                            ? $modelClass::withTrashed()->find($change['record_id'])
                            : $modelClass::find($change['record_id']);

                        if ($target) {
                            if ($currentUser && ! $isSuperAdmin && ! $authorizer->authorizeChangeTarget($change['table_name'], $target, $allowedStoreIds, $allowedUserIds)) {
                                DB::commit();
                                $failed[] = [
                                    'id' => $change['id'] ?? null,
                                    'table_name' => $change['table_name'],
                                    'record_id' => $change['record_id'],
                                    'reason' => 'forbidden',
                                ];

                                continue;
                            }
                            $claimIsInScope = ! empty($payload['store_id'])
                                && $authorizer->claimIsEvidence($payload['store_id'], $isSuperAdmin ? null : $allowedStoreIds);
                            if (empty($target->store_id) && $claimIsInScope && \Illuminate\Support\Facades\Schema::hasColumn($target->getTable(), 'store_id')) {
                                $target->store_id = $payload['store_id'];
                                $target->save();
                            }
                            $target->delete();
                            $restamper->remember($target);
                        }
                    }

                    if ($pendingStockBatchDelta !== null) {
                        [$pendingBatchId, $pendingQtyDelta] = $pendingStockBatchDelta;
                        $stockBatchDeltas[$pendingBatchId] = ($stockBatchDeltas[$pendingBatchId] ?? 0) + $pendingQtyDelta;
                    }

                    $crossStoreGuard->commitChange($restamper);
                    $storelessProducts->commitChange();
                    $restamper->commitChange();
                    $processed++;
                    DB::commit();
                } catch (\Exception $e) {
                    DB::rollBack();
                    $restamper->discardChange();
                    $crossStoreGuard->discardChange();
                    $storelessProducts->discardChange();
                    Log::warning("Sync push: skipped {$change['table_name']} ".($change['record_id'] ?? '?').': '.$e->getMessage());
                    $failed[] = [
                        'id' => $change['id'] ?? null,
                        'table_name' => $change['table_name'],
                        'record_id' => $change['record_id'] ?? null,
                        'reason' => $e instanceof \App\Exceptions\SyncPushRefusalException
                            ? $e->reason()
                            : $e->getMessage(),
                    ];
                }
            }

            if ($insertOverrides > 0) {
                Log::info("Sync push: existence probe converted {$insertOverrides} INSERT(s) to UPDATE, {$resentInsertsAccepted} accepted without writing");
            }

            app(StockBatchDeltaApplier::class)->applyStockBatchDeltas($stockBatchDeltas, $failed, $isSuperAdmin ? null : $allowedStoreIds);

            $firstSyncedStore = $activity->touchStoreLastSyncAt($request);

            $storelessProducts->attribute($isSuperAdmin ? null : $allowedStoreIds, $crossStoreGuard, $restamper, now());
            $restamper->restamp(now());

            DB::commit();

            $activity->sendFirstSyncAlert($firstSyncedStore, $request->user());

            try {
                app(\App\Services\Sync\SyncFailureRecorder::class)->recordPushOutcome(
                    $failed,
                    $changes,
                    $request->user() ? $this->ownership()->resolvePushStoreId($request, $request->user()) : null,
                    $request->user()?->id,
                    $processed,
                    $crossStoreGuard->remapped()
                );
            } catch (\Throwable $e) {
                Log::warning('Sync failure recording skipped: '.$e->getMessage());
            }

            $activity->recordStockFingerprint($request, $currentUser, $currentStoreId);
            $activity->recordTableFingerprint($request, $currentUser, $currentStoreId);

            return response()->json([
                'success' => true,
                'processed' => $processed,
                'failed' => $failed,
                'id_map' => $idMapByTable,
                'versions' => $versions,
                'sync_commands' => $activity->exchangeSyncCommands($request, $currentStoreId),
            ]);
        } catch (\Throwable $e) {
            while (DB::transactionLevel() > $entryTransactionLevel) {
                DB::rollBack();
            }

            Log::error('Sync push failed: '.$e->getMessage());
            $activity->recordRejectedPush($request, 'server_error');

            return response()->json(['success' => false, 'message' => 'Sync failed', 'error' => $e->getMessage()], 500);
        }
    }

    public const PULL_WATERMARK_LAG_SECONDS = 10;

    #[OA\Post(
        path: '/app/sync/pull',
        summary: 'Pull server-side changes down to the client',
        description: 'Returns, per table, every row changed since the client\'s last-known sync timestamp for that table (max 500 rows/table/call; clients should loop until a response comes back empty). Soft-deleted rows are included with `_deleted: 1` so the client can remove them locally too.',
        tags: ['Sync'],
        security: [['sanctum' => []]],
        parameters: [new OA\HeaderParameter(name: 'X-Store-Id', description: 'Which of the caller\'s stores to sync (defaults to their primary store)', schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(
                property: 'last_synced',
                type: 'object',
                description: 'Map of table_name -> ISO8601 timestamp of the last successful pull for that table. Omit/empty to do a full initial sync.',
                additionalProperties: new OA\AdditionalProperties(type: 'string', format: 'date-time'),
            ),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Changed rows per table', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'server_timestamp', type: 'string', format: 'date-time'),
                new OA\Property(property: 'changes', type: 'object', description: 'Keyed by table name, each value an array of row objects', additionalProperties: new OA\AdditionalProperties(type: 'array', items: new OA\Items(type: 'object'))),
                new OA\Property(property: 'refused_store_id', type: 'string', nullable: true, description: "Set when X-Store-Id names a store outside the caller's scope: only `stores` (including that store's tombstone if it is the owner's deleted store) and `payment_accounts` are served, every other table is omitted so no window can be stamped from it (A-254)"),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Cloud sync disabled on current plan, or store count exceeds plan limit'),
            new OA\Response(response: 429, description: 'Sync-interval throttle not yet elapsed for this plan'),
        ],
    )]
    public function pull(Request $request)
    {
        $validation = app(SyncGate::class)->validateSync($request, false);
        if (! $validation['valid']) {
            return response()->json([
                'success' => false,
                'message' => $validation['message'],
                'code' => $validation['code'],
            ], $validation['status']);
        }

        $lastSyncedMap = $request->input('last_synced', []);
        $pageOffsets = $request->input('page_offset', []);
        $pageCursors = $request->input('page_cursor', []);
        $pager = app(PullPager::class);
        $scoper = app(PullTenantScope::class);
        $rowMapper = app(PullRowMapper::class);
        $changes = [];
        $hasMore = [];
        $serverTimestamp = now()->subSeconds(self::PULL_WATERMARK_LAG_SECONDS)->toIso8601String();
        $tables = ['products', 'stock_batches', 'categories', 'customers', 'suppliers', 'sales', 'sale_items', 'sale_item_batches', 'stores', 'users', 'stock_movements', 'purchase_orders', 'purchase_order_items', 'expenses', 'payment_accounts', 'requested_products', 'supplier_payments', 'returns', 'return_items', 'prescriptions', 'prescription_items', 'loyalty_tiers', 'loyalty_redemption_options', 'stock_audits', 'held_transactions', 'loyalty_transactions', 'customer_payments', 'audit_logs', 'permission_groups'];

        if (app(SyncGate::class)->isStoresOnlySetupOverridePull($request, $lastSyncedMap)) {
            $tables = ['stores'];
        }

        $user = $request->user();
        UserDeviceTracker::touch($request, $user, $this->ownership()->resolvePushStoreId($request, $user));
        $tenantScope = $user->hasRole('super_admin')
            ? null
            : $scoper->resolvePullTenantScope($user, $request);

        $refusedStoreId = $tenantScope['refusedStoreId'] ?? null;
        if ($refusedStoreId !== null) {
            $tables = array_values(array_intersect($tables, PullTenantScope::PULL_TABLES_INDEPENDENT_OF_STORE_HEADER));
            $scoper->logRefusedPullStore($user->id, $refusedStoreId);
        }

        foreach ($tables as $table) {
            $modelClass = $this->getModelForTable($table);

            if (! $modelClass) {
                continue;
            }

            $query = \method_exists($modelClass, 'trashed')
                ? $modelClass::withTrashed()
                : $modelClass::query();

            if ($tenantScope) {
                $scoper->applyPullTenantScope($query, $table, $tenantScope);
            }

            $pager->applyPullCursor($query, $table, $lastSyncedMap[$table] ?? null);

            [$records, $hasMore[$table]] = $pager->fetchPullPage(
                $query,
                $table,
                (int) ($pageOffsets[$table] ?? 0),
                $pager->normalizePageCursor($pageCursors[$table] ?? null),
            );

            $changes[$table] = $records->map(fn ($item) => $rowMapper->mapPullRowForClient($item, $table));
        }

        return response()->json([
            'success' => true,
            'server_timestamp' => $serverTimestamp,
            'changes' => $changes,
            'has_more' => $hasMore,
            'refused_store_id' => $refusedStoreId,
        ]);
    }

    #[OA\Get(
        path: '/api/v1/app/sync/counts',
        description: "Authoritative server-side row counts, per table, for the caller's store — NOT a data pull, just COUNT(*)s. Exists so a device can periodically verify its local counts actually match the server instead of trusting an incremental pull's cursor never got stuck (see docs/KNOWN_BUGS.md: a device's pull cursor can, rarely, advance past content it never actually received — e.g. after a crash mid-round — leaving every SUBSEQUENT delta pull \"succeed\" while silently never re-offering the missed rows, with no error anywhere to notice it by). A device finding its own local count doesn't match this response is the signal to run a full resync, not a partial one.",
        tags: ['Sync'],
        security: [['sanctum' => []]],
        parameters: [new OA\HeaderParameter(name: 'X-Store-Id', description: 'Which of the caller\'s stores to check (defaults to their primary store)', schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Row counts per table', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'counts', type: 'object', additionalProperties: new OA\AdditionalProperties(type: 'integer')),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function counts(Request $request)
    {
        $currentUser = $request->user();
        $currentStoreId = $currentUser ? $this->ownership()->resolvePushStoreId($request, $currentUser) : null;
        UserDeviceTracker::touch($request, $currentUser, $currentStoreId);

        if (! $currentStoreId) {
            return response()->json(['success' => true, 'counts' => []]);
        }

        $scopedProductIds = Product::withTrashed()->select('id')->where('store_id', $currentStoreId);

        $counts = [
            'products' => DB::table('products')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
            'stock_batches' => DB::table('stock_batches')->whereIn('product_id', $scopedProductIds)->whereNull('deleted_at')->count(),
            'sales' => DB::table('sales')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
            'customers' => DB::table('customers')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
            'categories' => DB::table('categories')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
        ];

        return response()->json([
            'success' => true,
            'counts' => $counts,
        ]);
    }

    public function peerFreshness(Request $request, PeerSyncFreshnessService $freshness)
    {
        $storeId = $this->ownership()->resolvePushStoreId($request, $request->user());

        return response()->json([
            'success' => true,
            'threshold_minutes' => PeerSyncFreshnessService::STALE_AFTER_MINUTES,
            'stale_devices' => $storeId
                ? $freshness->stalePeers($storeId, $request->header('X-Device-Id'))
                : [],
        ]);
    }

    public const HEALTH_SYNC_DISABLED_MESSAGE = 'Health Sync has been retired and no longer runs. Nothing was sent and nothing has changed on this device. If stock looks wrong here, run a Force Full Resync from this screen, or contact support.';

    #[OA\Post(
        path: '/api/v1/app/sync/reconcile-quantities',
        description: "Accepts the device's own stock_batches.quantity snapshot and closes any gap between it and the server's replayed-delta value. Exists because push() never trusts a pushed quantity (it only ever replays stock_movements deltas), so a batch whose opening stock never produced a movement row is stuck at the server's zero forever. Every correction is written as a real, labelled 'sync_reconciliation' stock_movements row plus one summary ActivityLog per store touched — nothing is silently rewritten. Idempotent: a batch already matching the snapshot is skipped. See docs/FIXED_BUGS.md A-148 and client/AGENTS.md.",
        tags: ['Sync'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Reconciliation summary', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'reconciled', type: 'integer'),
                new OA\Property(property: 'checked', type: 'integer'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function reconcileQuantities(Request $request)
    {
        // shortcut: hard off (config/dumos.php, flipped on only by its own
        // tests); restore with the spec's opening_quantity work.
        if (! config('dumos.health_sync_enabled')) {
            return response()->json([
                'success' => false,
                'message' => self::HEALTH_SYNC_DISABLED_MESSAGE,
            ], 410);
        }

        $request->validate([
            'batches' => 'required|array',
            'batches.*.id' => 'required|string',
            'batches.*.quantity' => 'required|integer|min:0',
        ]);

        $currentUser = $request->user();
        [$allowedStoreIds] = $this->ownership()->resolveAllowedOwnershipScope($currentUser);

        [$reconciled, $checked, $movements] = app(QuantityReconciliationService::class)->reconcile($request, $currentUser, $allowedStoreIds);

        return response()->json([
            'success' => true,
            'reconciled' => $reconciled,
            'checked' => $checked,
            'movements' => $movements,
        ]);
    }

    private function ownership(): SyncOwnershipResolver
    {
        return app(SyncOwnershipResolver::class);
    }

    /**
     * @return class-string<Model>|null
     */
    public function getModelForTable($tableName)
    {
        $map = [
            'products' => Product::class,
            'customers' => Customer::class,
            'suppliers' => Supplier::class,
            'sales' => Sale::class,
            'sale_items' => SaleItem::class,
            'stores' => Store::class,
            'users' => User::class,
            'stock_batches' => StockBatch::class,
            'activity_logs' => ActivityLog::class,
            'audit_logs' => ActivityLog::class,
            'permission_groups' => \App\Models\PermissionGroup::class,
            'categories' => \App\Models\Category::class,
            'expenses' => Expense::class,
            'feedback' => \App\Models\Feedback::class,
            'stock_movements' => StockMovement::class,
            'purchase_orders' => PurchaseOrder::class,
            'purchase_order_items' => PurchaseOrderItem::class,
            'payment_accounts' => \App\Models\PaymentAccount::class,
            'returns' => \App\Models\SaleReturn::class,
            'return_items' => \App\Models\SaleReturnItem::class,
            'requested_products' => RequestedProduct::class,
            'supplier_payments' => \App\Models\SupplierPayment::class,
            'prescriptions' => \App\Models\Prescription::class,
            'prescription_items' => \App\Models\PrescriptionItem::class,
            'loyalty_tiers' => \App\Models\LoyaltyTier::class,
            'loyalty_redemption_options' => \App\Models\LoyaltyRedemptionOption::class,
            'sale_item_batches' => \App\Models\SaleItemBatch::class,
            'stock_audits' => \App\Models\StockAudit::class,
            'held_transactions' => \App\Models\HeldTransaction::class,
            'loyalty_transactions' => \App\Models\LoyaltyTransaction::class,
            'customer_payments' => \App\Models\CustomerPayment::class,
        ];

        return $map[$tableName] ?? null;
    }
}
