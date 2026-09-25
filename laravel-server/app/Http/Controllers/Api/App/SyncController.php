<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Concerns\EnforcesStaffOwnership;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Customer;
use App\Models\Supplier;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\User;
use App\Models\Role;
use App\Models\ActivityLog;
use App\Models\Expense;
use App\Models\StockMovement;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\RequestedProduct;
use App\Services\Web\SyncPayloadMapper;
use OpenApi\Attributes as OA;

class SyncController extends Controller
{
    use EnforcesStaffOwnership;

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
        $validation = $this->validateSync($request, true);
        if (!$validation['valid']) {
            return response()->json([
                'success' => false,
                'message' => $validation['message'],
                'code' => $validation['code']
            ], $validation['status']);
        }

        $request->validate([
            'changes' => 'required|array',
            'changes.*.table_name' => 'required|string',
            'changes.*.operation' => 'required|in:INSERT,UPDATE,DELETE',
            'changes.*.payload' => 'nullable'
        ]);

        $changes = $request->input('changes');

        // stock_movements rows carry a foreign key (stock_batch_id) that may
        // point at a batch created earlier in this very same payload. FK
        // constraints are checked per-statement, not deferred to commit, so
        // if a client happens to send the movement before the batch, the
        // INSERT fails outright, not just the quantity reconciliation.
        // Stable-sort (PHP's sort functions are stable as of 8.0) all
        // stock_movements changes to the end so every batch/product they
        // could reference is guaranteed to exist by the time they're
        // processed, regardless of the order the client sent them in.
        usort($changes, fn ($a, $b) => ($a['table_name'] === 'stock_movements') <=> ($b['table_name'] === 'stock_movements'));

        $processed = 0;



        DB::beginTransaction();

        $hasSyncedAtCache = [];
        $currentUser = $request->user();
        $currentStoreId = $currentUser ? $this->resolvePushStoreId($request, $currentUser) : null;

        // Ownership scope for UPDATE/DELETE targets and for rejecting an
        // INSERT payload that explicitly names a store_id the caller
        // doesn't own. $currentStoreId above is only ever used to BACK-FILL
        // a missing store_id, never to verify one; without this, any
        // authenticated user could push an UPDATE/DELETE against a record
        // id belonging to a completely different store (harvestable from
        // e.g. the unauthenticated public storefront endpoint), corrupting
        // or deleting a stranger's data. Mirrors pull()'s own $storeIds /
        // $userIds scoping above so read and write authorization agree.
        $isSuperAdmin = $currentUser && $currentUser->hasRole('super_admin');
        $allowedStoreIds = [];
        $allowedUserIds = [];
        if ($currentUser && !$isSuperAdmin) {
            [$allowedStoreIds, $allowedUserIds] = $this->resolveAllowedOwnershipScope($currentUser);
        }

        try {
            $idMap = [];
            // Grouped by table_name, unlike $idMap above (which is flat and
            // only used to remap foreign keys within payloads later in this
            // same request): returned to the client as id_map so it can fix
            // up its own local rows immediately, since a future delta pull
            // only ever reconciles a collision if the pre-existing row it
            // collided with happens to also appear in that pull's response
            // (see DUPLICATE_NAME_TABLES in the client's reconcile-identity.ts)
            // — a long-unchanged row like "DRUGS" or "COSMETICS" never will.
            $idMapByTable = [];

            // stock_batches.quantity is never trusted from a client payload
            // (see the INSERT/UPDATE handling below); it is always derived
            // by applying stock_movements deltas on top of whatever the
            // server currently has. Deltas are accumulated here and applied
            // in one atomic pass after the main loop, rather than inline,
            // so a movement's delta is never skipped just because its batch
            // happened to be processed later in the same payload (clients
            // are not guaranteed to order changes batch-before-movement).
            $stockBatchDeltas = [];
            $failed = [];
            // Server-assigned versions for accepted UPDATE changes, grouped by
            // table_name like $idMapByTable, returned to the client as
            // `versions` so it can apply the new authoritative number to its
            // local row immediately instead of waiting for a future pull (see
            // docs/features/_known-bugs.md #11).
            $versions = [];

            foreach ($changes as $change) {
                $modelClass = $this->getModelForTable($change['table_name']);

                if (!$modelClass) {
                    Log::warning("Sync push ignored unknown table: " . $change['table_name']);
                    continue;
                }

                // Each change gets its own SAVEPOINT (Laravel nests
                // automatically inside the outer transaction) so one bad row
                // (a legacy schema mismatch, a dangling FK from an earlier
                // partial sync, anything data-quality-related rather than a
                // real conflict) only loses its own change instead of
                // rolling back every other change sharing this batch. Before
                // this, a single unresolvable row could permanently block an
                // entire device's backlog, since every retry hit the exact
                // same row again in the same position.
                DB::beginTransaction();
                try {

                // Set by the stock_movements INSERT branch below, merged into
                // $stockBatchDeltas only right before this change's own
                // DB::commit() (not immediately after $model->save()) — a
                // later step in this same change's block (e.g. the
                // soft-delete handling further down) could still throw and
                // roll back this savepoint, and a delta already merged into
                // the shared array by then wouldn't be undone with it, even
                // though the movement it came from never actually committed.
                $pendingStockBatchDelta = null;

                // The OA doc marks payload as nullable (DELETE doesn't need one), and the
                // request validation above allows it through as such. Default a genuinely-
                // null (or unparseable) payload to [] here rather than passing null onward:
                // SyncPayloadMapper::map() takes a strict `array $payload`, and a null would
                // throw a TypeError — which, being an \Error and not an \Exception, is NOT
                // caught by either catch block below, so it would propagate as an uncaught
                // fatal instead of a clean per-change failure. See docs/KNOWN_BUGS.md.
                $payload = is_array($change['payload']) ? $change['payload'] : (json_decode($change['payload'], true) ?? []);

                // Strip client-only state flags that should never reach the DB
                if (isset($payload['_synced'])) {
                    unset($payload['_synced']);
                }
                
                // Apply ID mappings for foreign keys (if a previous record was merged due to conflict)
                foreach ($payload as $key => $value) {
                    if (is_string($value) && isset($idMap[$value])) {
                        $payload[$key] = $idMap[$value];
                    }
                }

                $context = ['user_id' => $currentUser ? $currentUser->id : null, 'store_id' => $currentStoreId];
                $payload = SyncPayloadMapper::map($change['table_name'], $payload, $context);

                $now = now();

                $payload = $this->normalizePushPayload($request, $change, $payload, $currentStoreId, $currentUser, $isSuperAdmin, $allowedStoreIds, $allowedUserIds);

                $recordId = $change['record_id'] ?? ($payload['id'] ?? null);

                if ($change['operation'] === 'INSERT' && $recordId) {
                    if ($change['table_name'] === 'audit_logs') {
                        // Scoped to this push's store, not just client_id: a
                        // client-generated audit_logs id is only guaranteed
                        // unique on the device that created it, not globally.
                        // A device that switches active store while an audit
                        // log INSERT from the PREVIOUS store is still queued
                        // reuses that same local id under the new store's
                        // push - an unscoped match here silently turned that
                        // INSERT into an UPDATE against the other store's
                        // row, which authorizeChangeTarget() below then
                        // correctly (but permanently, since audit_logs are
                        // append-only and nothing ever re-queues it) rejected
                        // as 'forbidden', losing that log entry for good.
                        $exists = $modelClass::where('properties->client_id', $recordId)
                            ->where('store_id', $currentStoreId)
                            ->exists();
                    } else {
                        // Use withTrashed to catch soft-deleted items so we don't get Duplicate Entry crashes
                        $exists = \method_exists($modelClass, 'trashed') 
                            ? $modelClass::withTrashed()->where('id', $recordId)->exists() 
                            : $modelClass::where('id', $recordId)->exists();
                    }

                    if ($exists) {
                        // If it exists (even if soft-deleted), we should treat it as an UPDATE
                        // to restore it and apply the new payload instead of crashing on INSERT
                        $change['operation'] = 'UPDATE';
                        Log::info("Sync push: Overriding INSERT to UPDATE for existing record {$recordId} in {$change['table_name']}");
                    }
                }

                if ($change['operation'] === 'INSERT') {
                    // Re-calculate exists for normal INSERT flow just in case
                    $exists = false;

                    // Name/email/username collisions with a row that already
                    // exists server-side: resolved by remapping the client's
                    // local id onto the existing row rather than crashing the
                    // INSERT. See findDuplicateInsertConflict() for the
                    // per-table rules and why each one exists.
                    $conflict = $this->findDuplicateInsertConflict($modelClass, $change['table_name'], $payload, $recordId);
                    if ($conflict) {
                        $exists = true; // Pretend it exists to skip insertion
                        $idMap[$recordId] = $conflict->id;
                        // Only categories/suppliers are reported back to the
                        // client in the response's id_map; the users remap
                        // stays request-local, exactly as before.
                        if ($change['table_name'] === 'categories' || $change['table_name'] === 'suppliers') {
                            $idMapByTable[$change['table_name']][$recordId] = $conflict->id;
                        }
                    }

                    if (!$exists) {
                        $model = new $modelClass();
                        $model->forceFill($payload);
                        
                        // Force missing required fields for users
                        if ($change['table_name'] === 'users') {
                            if (empty($model->password)) {
                                // $payload['pin'] used to be the raw 4-digit
                                // PIN a device pushed for a user it created
                                // offline, so hashing it here gave that
                                // account a working web-dashboard password
                                // equal to their PIN (StaffController::store
                                // does the same thing intentionally for the
                                // online creation path). The client now
                                // hashes `pin` before it's ever written
                                // locally, so this fallback would otherwise
                                // hash an already-hashed value - not a
                                // lockout (the row still gets SOME password),
                                // but it silently drops the "log into the
                                // dashboard with your PIN" convenience for
                                // every offline-created user. Detect that
                                // case and fall back to the same generic
                                // placeholder StaffController::store already
                                // uses when no PIN was supplied at all,
                                // rather than deriving a password from a
                                // value that no longer represents a secret
                                // the user actually knows.
                                $rawPin = (isset($payload['pin']) && preg_match('/^\$2[aby]\$\d{2}\$/', $payload['pin']) !== 1)
                                    ? $payload['pin']
                                    : '1234';
                                $model->password = \Illuminate\Support\Facades\Hash::make($rawPin);
                            }
                            if (empty($model->first_name)) {
                                $model->first_name = $payload['first_name'] ?? 'User';
                            }
                            if (empty($model->last_name) && !isset($payload['last_name'])) {
                                $model->last_name = '';
                            }
                        }
                        
                        if ($change['table_name'] === 'audit_logs') {
                            if (isset($payload['created_at'])) {
                                $model->created_at = $payload['created_at'];
                            }
                        } else {
                            $model->id = $recordId;
                        }
                        
                        $isDeleted = null;
                        if (isset($payload['_deleted'])) {
                            $isDeleted = $payload['_deleted'];
                            unset($payload['_deleted']);
                        }

                        $model->forceFill($payload);

                        $this->stampSyncedAt($model, $hasSyncedAtCache, $now);
                        
                        $this->applyNotNullColumnDefaults($request, $change['table_name'], $model);

                        // A brand-new batch's quantity is never trusted from the client
                        // either: a batch created locally and already partially sold
                        // before its first-ever sync would arrive with an already-net
                        // value, and applying the accompanying stock_movements delta on
                        // top of that would double-count exactly like it used to (see
                        // git history: 83ffb95 removed the delta application because of
                        // this, without noticing the real fix is to stop trusting
                        // quantity on both INSERT and UPDATE, not just UPDATE). New
                        // batches start at the column default (0) and every caller that
                        // creates one (procurement receiving, at minimum) already pushes
                        // a matching opening-balance movement in the same sync, so this
                        // is reconstructed correctly below.
                        if ($change['table_name'] === 'stock_batches') {
                            $model->quantity = 0;
                        }

                        $model->save();

                        // stock_batches.quantity is derived from stock_movements deltas,
                        // never trusted directly from a client payload (INSERT above, or
                        // UPDATE below); see the comment on $stockBatchDeltas. Recorded
                        // rather than applied immediately: a client is not guaranteed to
                        // order a new batch's INSERT before its movement in the same
                        // payload, and incrementing against a batch row that doesn't
                        // exist yet would silently do nothing. Held in
                        // $pendingStockBatchDelta (merged into $stockBatchDeltas just
                        // before this change's own DB::commit() below) rather than
                        // written into the shared array directly — see that variable's
                        // doc comment above.
                        if ($change['table_name'] === 'stock_movements') {
                            $stockBatchId = $payload['stock_batch_id'] ?? null;
                            $qtyDelta = (float) ($payload['quantity'] ?? 0);
                            if ($stockBatchId && $qtyDelta != 0) {
                                $pendingStockBatchDelta = [$stockBatchId, $qtyDelta];
                            }
                        }

                        // Handle _deleted flag for soft deletes
                        if ($isDeleted) {
                            if (\method_exists($model, 'trashed')) {
                                $model->delete();
                            }
                        }
                    }
                } elseif ($change['operation'] === 'UPDATE') {
                    $recordId = $change['record_id'] ?? ($payload['id'] ?? null);
                    // Use withTrashed to ensure we can find soft-deleted items to restore them if needed.
                    // lockForUpdate() is required here: this branch reads _version, compares it
                    // against the payload, then writes based on that comparison. Without a row lock,
                    // two concurrent pushes for the same record can both read the same _version, both
                    // pass the equality check, and both save — a lost update, which is exactly what
                    // the version scheme above exists to prevent.
                    //
                    // Note this lock is held until the *outer* transaction (opened at the top of
                    // push(), ~line 104) commits, not just this change's savepoint: Laravel's nested
                    // DB::commit() below only decrements an internal counter and issues no real
                    // COMMIT/RELEASE SAVEPOINT until the outermost level, so the underlying DB
                    // transaction — and any locks taken inside it — stays open regardless. That's
                    // no different from the exclusive lock $model->save() already takes on an
                    // accepted change; the only new case is a *rejected* (version-conflict) row,
                    // which now stays locked for the rest of the batch instead of never being
                    // locked at all. That's an acceptable, bounded tradeoff for correctness here,
                    // not a deadlock risk beyond what already exists from save() locking rows in
                    // whatever order the batch happens to process them.
                    $model = \method_exists($modelClass, 'trashed') ? $modelClass::withTrashed()->lockForUpdate()->find($recordId) : $modelClass::lockForUpdate()->find($recordId);

                    if ($model && $currentUser && !$isSuperAdmin && !$this->authorizeChangeTarget($change['table_name'], $model, $allowedStoreIds, $allowedUserIds)) {
                        // Reject before even looking at version info: the
                        // record exists but doesn't belong to the caller's
                        // store(s) — see the ownership-scope comment above
                        // $allowedStoreIds for why this check exists at all.
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
                        // Conflict Resolution: strict-equality optimistic concurrency,
                        // not a `<` / "older" check — see docs/features/_known-bugs.md
                        // #11. Two devices editing the same row from the same shared
                        // ancestor version will *always* compute the identical next
                        // version (it's just arithmetic on the same starting number),
                        // so by the time the second push arrives its version now
                        // EQUALS the server's current version (already bumped by the
                        // first, already-accepted push). The old `<` check only ever
                        // fired on strictly-older payloads and silently fell through to
                        // comparing wall-clock updated_at on equality — exactly the
                        // guaranteed-collision case above — which is how the second
                        // device's edit could silently clobber the first's confirmed
                        // write with zero signal. Now: equal versions accept (this
                        // edit is genuinely based on the server's current state, so the
                        // server assigns the new version itself, never trusting
                        // whatever _version the payload carries — see below); anything
                        // else with two known versions is a real conflict, not just
                        // "older," and gets rejected and reported either way.
                        //
                        // stock_batches is exempt from this check, but ONLY when the
                        // payload doesn't touch anything besides quantity (which is
                        // stripped just below and never applied from this UPDATE at
                        // all — it's derived separately from commutative
                        // stock_movements deltas, see $stockBatchDeltas and this
                        // controller's own API doc comment above, which have no
                        // version check of their own). Two different terminals/devices
                        // concurrently selling from the same batch is normal, everyday,
                        // expected operation, and both pushes carry the same base
                        // _version by the same guaranteed-collision arithmetic as any
                        // other two-device edit — rejecting a quantity-only update here
                        // would be a constant false alarm for a field where nothing
                        // meaningful is actually being overwritten.
                        //
                        // This does NOT extend to the table's other columns
                        // (batch_number, expiry_date, cost_price, supplier_id,
                        // manufacture_date, location, is_active, notes, received_date):
                        // the stock-audit cost-correction flow
                        // (lib/db/queries/inventory.ts's reconcileStockAudit, ~line
                        // 518) really does UPDATE cost_price directly, and two managers
                        // concurrently correcting the same batch's cost/expiry data is a
                        // genuine conflict the version check must still catch — silently
                        // last-write-winning THAT would reintroduce exactly the kind of
                        // silent data loss this whole fix exists to close, just on a
                        // different field. So: strip quantity and the usual
                        // bookkeeping/derived fields (mirroring the quantity strip a few
                        // lines below and the _synced/_deleted stripping done earlier in
                        // push()) from a COPY of the payload, and only exempt this
                        // change from the version check if nothing else is left —
                        // i.e. this specific push is provably quantity-only.
                        $isCommutativeTable = $this->isQuantityOnlyStockBatchUpdate($change['table_name'], $payload);

                        [$versionConflict, $conflictReason, $newVersion] =
                            $this->resolveUpdateConflict($change['table_name'], $model, $payload, $isCommutativeTable, $recordId);

                        if ($versionConflict) {
                            // Must close the per-change savepoint opened above
                            // before skipping to the next change. A bare
                            // `continue` here left it dangling every time an
                            // older update was ignored (a routine, expected
                            // occurrence in multi-device sync, not an edge
                            // case), stacking unclosed savepoints for the
                            // rest of the request.
                            DB::commit();
                            // Every rejection is now reported into $failed, including
                            // the timestamp-fallback path — before this fix, EITHER
                            // rejection reason left the client with zero signal at all,
                            // not just the version-equality gap this bug was filed for.
                            $failed[] = [
                                'id' => $change['id'] ?? null,
                                'table_name' => $change['table_name'],
                                'record_id' => $recordId,
                                'reason' => $conflictReason,
                            ];
                            continue;
                        }

                        // Pre-process payload before forceFill
                        $isDeleted = null;
                        if (isset($payload['_deleted'])) {
                            $isDeleted = $payload['_deleted'];
                            unset($payload['_deleted']);
                        }

                        // Never trust _version from the client for a write that's
                        // actually being applied: the server is now the sole authority
                        // for version numbers (see above). Per the client-side fix,
                        // the payload's _version is just the unchanged base value the
                        // edit was made from, not a real new version.
                        unset($payload['_version']);

                        // Inventory Reconciliation: Ignore quantity updates for stock_batches, rely on stock_movements
                        if ($change['table_name'] === 'stock_batches') {
                            if (isset($payload['quantity'])) {
                                unset($payload['quantity']);
                            }
                        }

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

                        $this->stampSyncedAt($model, $hasSyncedAtCache, $now);

                        $this->applyNotNullColumnDefaults($request, $change['table_name'], $model);

                        $model->save();

                        if ($newVersion !== null) {
                            $versions[$change['table_name']][$recordId] = $newVersion;
                        }

                        // Handle _deleted flag for soft deletes on update
                        if ($isDeleted !== null) {
                            if (\method_exists($model, 'trashed')) {
                                if ($isDeleted && !$model->trashed()) {
                                    $model->delete();
                                } elseif (!$isDeleted && $model->trashed()) {
                                    $model->restore();
                                }
                            }
                        }
                    }
                } elseif ($change['operation'] === 'DELETE') {
                    $target = \method_exists($modelClass, 'trashed')
                        ? $modelClass::withTrashed()->find($change['record_id'])
                        : $modelClass::find($change['record_id']);

                    if ($target) {
                        // Client's legacy-row store_id claim (base-helpers.ts's
                        // softDelete()) — applied before authorization so a
                        // legacy row's claim actually reaches the server.
                        if (empty($target->store_id) && !empty($payload['store_id']) && \Illuminate\Support\Facades\Schema::hasColumn($target->getTable(), 'store_id')) {
                            $target->store_id = $payload['store_id'];
                        }

                        if ($currentUser && !$isSuperAdmin && !$this->authorizeChangeTarget($change['table_name'], $target, $allowedStoreIds, $allowedUserIds)) {
                            DB::commit();
                            $failed[] = [
                                'id' => $change['id'] ?? null,
                                'table_name' => $change['table_name'],
                                'record_id' => $change['record_id'],
                                'reason' => 'forbidden',
                            ];
                            continue;
                        }
                        if ($target->isDirty('store_id')) {
                            $target->save();
                        }
                        $target->delete();
                    }
                }

                // Only now — nothing left in this change's block that can
                // still throw and roll back its savepoint — fold the
                // pending delta into the shared accumulator applied after
                // the loop.
                if ($pendingStockBatchDelta !== null) {
                    [$pendingBatchId, $pendingQtyDelta] = $pendingStockBatchDelta;
                    $stockBatchDeltas[$pendingBatchId] = ($stockBatchDeltas[$pendingBatchId] ?? 0) + $pendingQtyDelta;
                }

                $processed++;
                DB::commit();
                } catch (\Exception $e) {
                    DB::rollBack();
                    Log::warning("Sync push: skipped {$change['table_name']} " . ($change['record_id'] ?? '?') . ": " . $e->getMessage());
                    $failed[] = [
                        'id' => $change['id'] ?? null,
                        'table_name' => $change['table_name'],
                        'record_id' => $change['record_id'] ?? null,
                        'reason' => $e->getMessage(),
                    ];
                }
            }

            $this->applyStockBatchDeltas($stockBatchDeltas, $failed);

            $this->touchStoreLastSyncAt($request);

            DB::commit();
            return response()->json(['success' => true, 'processed' => $processed, 'failed' => $failed, 'id_map' => $idMapByTable, 'versions' => $versions]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Sync push failed: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Sync failed', 'error' => $e->getMessage()], 500);
        }
    }

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
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Cloud sync disabled on current plan, or store count exceeds plan limit'),
            new OA\Response(response: 429, description: 'Sync-interval throttle not yet elapsed for this plan'),
        ],
    )]
    public function pull(Request $request)
    {
        $validation = $this->validateSync($request, false);
        if (!$validation['valid']) {
            return response()->json([
                'success' => false,
                'message' => $validation['message'],
                'code' => $validation['code']
            ], $validation['status']);
        }

        $lastSyncedMap = $request->input('last_synced', []);
        // Per-table page offset for the current in-progress pull round (see
        // client's pull.ts loop). Distinct from $lastSyncedMap, which only
        // advances once a table's entire backlog for this round has been
        // drained — offsets exist so a table with >500 changed rows can be
        // paged within a single round without prematurely marking it synced.
        $pageOffsets = $request->input('page_offset', []);
        $changes = [];
        $hasMore = [];
        $serverTimestamp = now()->toIso8601String();
        // stock_audits, held_transactions, loyalty_transactions,
        // customer_payments, and audit_logs were all missing from this list
        // — their changes could push (once the corresponding
        // getModelForTable/schema fixes landed) but never pulled back down
        // to any other device, so a second device or a fresh restore would
        // never see them even after the push-side bug was fixed.
        $tables = ['products', 'stock_batches', 'categories', 'customers', 'suppliers', 'sales', 'sale_items', 'sale_item_batches', 'stores', 'users', 'stock_movements', 'purchase_orders', 'purchase_order_items', 'expenses', 'payment_accounts', 'requested_products', 'supplier_payments', 'returns', 'return_items', 'prescriptions', 'prescription_items', 'loyalty_tiers', 'loyalty_redemption_options', 'stock_audits', 'held_transactions', 'loyalty_transactions', 'customer_payments', 'audit_logs'];

        // The privileged subscription-status pull (client's
        // syncSubscriptionStatus()) sends `?setup=1` specifically to bypass
        // the cloud_sync gate below — see isStoresOnlySetupOverridePull()'s
        // own doc comment for why that override is only honored for a
        // request shaped exactly like this one. Mirror that same narrowing
        // here: even though validateSync() already scoped the GATE bypass
        // to this exact request shape, pull() itself has no per-table
        // request scoping of its own (every table in $tables above is
        // always fetched, regardless of which ones the caller's
        // `last_synced` actually named) — without this, the gate override
        // would hand back a full initial sync of every table, not just the
        // `stores` row this privileged call actually needs.
        if ($this->isStoresOnlySetupOverridePull($request, $lastSyncedMap)) {
            $tables = ['stores'];
        }

        foreach ($tables as $table) {
            $modelClass = $this->getModelForTable($table);

            if (!$modelClass)
                continue;

            // withTrashed() is a Builder macro registered by SoftDeletingScope,
            // not a real declared method, so method_exists($modelClass,
            // 'withTrashed') is always false and this always fell through to
            // ::query() - silently excluding every soft-deleted row from
            // every pull response, for every table, regardless of whether
            // the model is soft-deletable. Probe for trashed() instead (a
            // real SoftDeletes trait method), matching the pattern already
            // used correctly elsewhere in this controller (see push()'s
            // duplicate-INSERT check and its UPDATE/restore lookup above).
            $query = \method_exists($modelClass, 'trashed')
                ? $modelClass::withTrashed()
                : $modelClass::query();

            // Multi-tenant filtering
            $user = $request->user();
            if (!$user->hasRole('super_admin')) {
                $this->applyPullTenantScope($query, $table, $user, $request);
            }

            $this->applyPullCursor($query, $table, $lastSyncedMap[$table] ?? null);

            [$records, $hasMore[$table]] = $this->fetchPullPage($query, $table, (int) ($pageOffsets[$table] ?? 0));

            $changes[$table] = $records->map(fn ($item) => $this->mapPullRowForClient($item, $table));
        }

        return response()->json([
            'success' => true,
            'server_timestamp' => $serverTimestamp,
            'changes' => $changes,
            'has_more' => $hasMore
        ]);
    }

    /**
     * Applies the client's per-table last_synced cursor, preferring
     * _synced_at OR updated_at where the table has a _synced_at column.
     * 'stores' is deliberately exempt (see fetchPullPage()).
     */
    private function applyPullCursor($query, string $table, $lastSynced): void
    {
        if ($lastSynced && $table !== 'stores') {
            $parsedLastSynced = \Carbon\Carbon::parse($lastSynced)->setTimezone('UTC')->format('Y-m-d H:i:s');
            if (\Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at')) {
                $query->where(function ($q) use ($parsedLastSynced) {
                    $q->where('_synced_at', '>', $parsedLastSynced)
                      ->orWhere('updated_at', '>', $parsedLastSynced);
                });
            } else {
                $query->where('updated_at', '>', $parsedLastSynced);
            }
        }
    }

    /**
     * Fetches one page for a table as [$records, $hasMore].
     *
     * 'stores' is deliberately exempt from both the last_synced cursor
     * (applyPullCursor() above) and this 500-row cap, so the client can
     * always treat it as a complete snapshot (see the pruning logic in the
     * client's pull.ts) — capping it like every other (delta-filtered) table
     * would silently contradict that for any owner with more stores than
     * that, since a store past the cutoff would look indistinguishable from
     * one that's genuinely gone.
     *
     * Every other table gets deterministic ordering (previously unordered,
     * so the 500 that made it into any given page were an arbitrary subset
     * of the matching rows, not even the oldest) plus offset-based paging
     * within this pull round: fetching 501 and slicing tells us whether more
     * rows remain beyond this page without a second COUNT query.
     */
    private function fetchPullPage($query, string $table, int $offset): array
    {
        if ($table === 'stores') {
            return [$query->get(), false];
        }

        $page = $query->orderBy('updated_at')->orderBy('id')
            ->skip($offset)->limit(501)->get();
        $hasMore = $page->count() > 500;

        return [$hasMore ? $page->slice(0, 500) : $page, $hasMore];
    }

    /**
     * Narrows one table's pull query to the rows the (non-super-admin)
     * caller may see. The table groupings here are the read-side mirror
     * of authorizeChangeTarget()/resolveChangeStoreId()'s write-side
     * ones, so read and write authorization agree on which tables are
     * store-scoped, which derive scope through a parent, and which are
     * legacy user_id-owned. Mutates the query in place, exactly as the
     * inline match() it replaces did.
     */
    private function applyPullTenantScope($query, string $table, $user, Request $request): void
    {
        $ownerId = $user->store_id
            ? Store::where('id', $user->store_id)->value('user_id') 
            : $user->id;
        
        $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');
        if ($requestedStoreId) {
            $ownsStore = Store::where('id', $requestedStoreId)->where('user_id', $ownerId)->exists();
            if ($ownsStore) {
                $storeIds = [$requestedStoreId];
            } else {
                $storeIds = [];
            }
        } else {
            $storeIds = $user->store_id 
                ? [$user->store_id] 
                : Store::where('user_id', $ownerId)->pluck('id')->toArray();
        }
            
        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($ownerId)->toArray();

        match ($table) {
            'users' => $query->whereIn('id', $userIds),
            // Unlike every other table, 'stores' isn't scoped to the
            // X-Store-Id-narrowed $storeIds: it IS the "which stores
            // do I own" discovery list the store switcher is built
            // from, so narrowing it to whichever single store happens
            // to be active meant a newly created store (or any store
            // metadata change on a non-active store, e.g. a plan
            // granted by an admin) could never be pulled down at all.
            // Staff (fixed store_id) still only ever see their own
            // store, same as before.
            'stores' => $query->whereIn(
                'id',
                $user->store_id ? $storeIds : Store::where('user_id', $ownerId)->pluck('id')->toArray()
            )->with(['user.subscriptions']),
            // These 11 tables now carry a real store_id column (see
            // add_store_id_to_domain_tables migration); scope directly
            // by store rather than by an owner/cashier user-id chain, so
            // a multi-store owner's stores actually stay separated
            // instead of merging under "anything this owner touched."
            'products' => $query->whereIn('store_id', $storeIds),
            'sales' => $query->whereIn('store_id', $storeIds),
            'customers' => $query->whereIn('store_id', $storeIds),
            'categories' => $query->whereIn('store_id', $storeIds),
            'suppliers' => $query->whereIn('store_id', $storeIds),
            'expenses' => $query->whereIn('store_id', $storeIds),
            'purchase_orders' => $query->whereIn('store_id', $storeIds),
            'prescriptions' => $query->whereIn('store_id', $storeIds),
            'returns' => $query->whereIn('store_id', $storeIds),
            'stock_movements' => $query->whereIn('store_id', $storeIds),
            'supplier_payments' => $query->whereIn('store_id', $storeIds),
            // Child tables still derive scoping through their now
            // correctly store-scoped parent, no store_id of their own.
            'sale_items' => $query->whereIn('sale_id', Sale::whereIn('store_id', $storeIds)->pluck('id')),
            'return_items' => $query->whereIn('return_id', \App\Models\SaleReturn::whereIn('store_id', $storeIds)->pluck('id')),
            'prescription_items' => $query->whereIn('prescription_id', \App\Models\Prescription::whereIn('store_id', $storeIds)->pluck('id')),
            'purchase_order_items' => $query->whereIn('purchase_order_id', PurchaseOrder::whereIn('store_id', $storeIds)->pluck('id')),
            'stock_batches' => $query->whereIn('product_id', Product::whereIn('store_id', $storeIds)->pluck('id')),
            'sale_item_batches' => $query->whereIn('sale_item_id', SaleItem::whereIn('sale_id', Sale::whereIn('store_id', $storeIds)->pluck('id'))->pluck('id')),
            'requested_products' => $query->whereIn('store_id', $storeIds),
            // Upgraded from the legacy `where('user_id', $ownerId)`
            // now that these carry a real store_id (see
            // fix_sync_schema_drift migration) — owner-wide scoping
            // let a multi-store owner's tiers/options bleed across
            // their own stores, the same class of bug the comment
            // above already fixed for the 11-table group.
            'loyalty_tiers' => $query->whereIn('store_id', $storeIds),
            'loyalty_redemption_options' => $query->whereIn('store_id', $storeIds),
            // Added along with the fix for these tables being
            // missing from getModelForTable()/this pull list
            // entirely (see fix_sync_schema_drift migration and the
            // SyncController comment above the model map). None of
            // held_transactions/loyalty_transactions/
            // customer_payments has a user_id column at all, so
            // falling through to `default` below would throw an
            // "Unknown column 'user_id'" SQL error the moment these
            // were added to the pull table list.
            'stock_audits' => $query->whereIn('store_id', $storeIds),
            'held_transactions' => $query->whereIn('store_id', $storeIds),
            'loyalty_transactions' => $query->whereIn('store_id', $storeIds),
            'customer_payments' => $query->whereIn('store_id', $storeIds),
            'audit_logs' => $query->whereIn('store_id', $storeIds),
            default => $query->where('user_id', $ownerId),
        };
    }

    /**
     * Server row -> client-SQLite row for one pulled record: the
     * _deleted flag every table carries, the stores subscription/license
     * derivation, and the per-table column renames that mirror
     * normalizePushPayload()'s client -> server direction.
     */
    private function mapPullRowForClient($item, string $table): array
    {
        $array = $item->toArray();
        $array['_deleted'] = (\method_exists($item, 'trashed') && $item->trashed()) ? 1 : 0;

        if ($table === 'stores') {
            $plan = 'free';
            $expiry = null;
            $isTrial = false;
            if ($item->user && $item->user->subscriptions->isNotEmpty()) {
                $sub = $item->user->subscriptions()
                    ->where('status', 'active')
                    ->where('end_date', '>', now())
                    ->latest()
                    ->first();
                if ($sub) {
                    $plan = $sub->plan_name;
                    $expiry = $sub->end_date;
                    $isTrial = $sub->is_trial;
                }
            }
            $array['subscription_tier'] = $plan;
            // Generate license token for offline validation
            if (($plan !== 'free' || $isTrial) && !empty($expiry)) {
                $array['license_token'] = json_encode([
                    'tier' => $plan,
                    'expiry' => \Carbon\Carbon::parse($expiry)->toIso8601String(),
                    'is_trial' => (bool) $isTrial
                ]);
            } else {
                $array['license_token'] = null;
            }
        }

        // Map users fields for SQLite
        if ($table === 'users') {
            // `pin` is in User::$hidden (so no ordinary API response leaks
            // it), but POS login is fully offline and verifies the typed PIN
            // against the locally-stored value - the device can only do that
            // if the pull ships it. It's a bcrypt hash now, not the raw PIN.
            $array['pin'] = $item->getAttribute('pin');
            if (empty($array['username'])) {
                $array['username'] = $array['email'] ?: 'user_' . substr($array['id'], 0, 8);
            }
            if (!isset($array['name']) && isset($array['first_name'])) {
                $array['name'] = trim(($array['first_name'] ?? '') . ' ' . ($array['last_name'] ?? ''));
            }
        }

        // Map cashier_id back to user_id for client SQLite sales table
        if ($table === 'sales' && isset($array['cashier_id'])) {
            $array['user_id'] = $array['cashier_id'];
        }

        // Map supplier_id to vendor_id and ordered_by to user_id for purchase_orders
        if ($table === 'purchase_orders') {
            if (isset($array['supplier_id'])) {
                $array['vendor_id'] = $array['supplier_id'];
            }
            if (isset($array['ordered_by'])) {
                $array['user_id'] = $array['ordered_by'];
            }
        }

        // Map purchase_order_items back to SQLite format
        if ($table === 'purchase_order_items') {
            if (isset($array['purchase_order_id'])) {
                $array['po_id'] = $array['purchase_order_id'];
            }
            if (isset($array['total_cost'])) {
                $array['subtotal'] = $array['total_cost'];
            }
            if (isset($array['quantity_ordered'])) {
                $array['bulk_quantity'] = $array['quantity_ordered'];
                $array['units_per_bulk'] = 1;
            }
        }

        return $array;
    }

    /**
     * Applies every accumulated stock_movements delta. See push()'s own
     * comments (preserved verbatim below) for why this runs after the main
     * loop, per-delta-savepointed, as a single atomic floored UPDATE.
     */
    private function applyStockBatchDeltas(array $stockBatchDeltas, array &$failed): void
    {
        // Apply every accumulated stock_movements delta, now that every
        // change in this push has been processed and any batch created
        // earlier in the same payload definitely exists. Each delta
        // gets its own savepoint, exactly like each change in the main
        // loop above — a single atomic UPDATE (not load-mutate-save) so
        // concurrent syncs from different devices can't race and
        // clobber each other's deltas, but isolated so a failure on ONE
        // delta (a deadlock, a constraint violation) can't roll back
        // every other change already committed in this push. Before
        // this, any exception here propagated to the outer catch,
        // rolling back the entire transaction — since Laravel's nested
        // DB::commit() only releases a savepoint rather than truly
        // committing until the outermost level, that undid every
        // change in the batch, not just the one behind the failing
        // delta, so the whole backlog got re-queued and hit the same
        // failure again on retry (see docs/KNOWN_BUGS.md).
        //
        // Floored at 0, mirroring the client's own local deduction
        // (lib/db/queries/inventory.ts's deductFromBatch: "the batch's
        // own running balance should never be written negative" — an
        // oversell is surfaced via getOversoldAlerts(), not a negative
        // quantity). Before this, an oversell left the selling device's
        // local batch at 0 while this server-side increment (and every
        // OTHER device's pull-side `quantity + delta` application, see
        // client's pull.ts) computed a negative quantity from the exact
        // same movement — a permanent per-device divergence, since pull
        // deliberately never trusts a pulled quantity snapshot to
        // reconcile it back. CASE WHEN instead of MySQL's GREATEST()/
        // SQLite's scalar MAX() so the same expression works against
        // both engines (production is MySQL, tests run on sqlite — see
        // phpunit.xml).
        foreach ($stockBatchDeltas as $stockBatchId => $delta) {
            DB::beginTransaction();
            try {
                $affected = DB::update(
                    'UPDATE stock_batches SET quantity = CASE WHEN quantity + ? < 0 THEN 0 ELSE quantity + ? END WHERE id = ?',
                    [$delta, $delta, $stockBatchId],
                );

                if (!$affected) {
                    Log::warning("Sync push: stock_movements delta of {$delta} referenced unknown stock_batch_id {$stockBatchId}, no batch to apply it to.");
                }
                DB::commit();
            } catch (\Exception $e) {
                DB::rollBack();
                Log::error("Sync push: failed to apply stock_batch delta of {$delta} to {$stockBatchId}: " . $e->getMessage());
                $failed[] = [
                    'id' => null,
                    'table_name' => 'stock_batches',
                    'record_id' => $stockBatchId,
                    'reason' => $e->getMessage(),
                ];
            }
        }
    }

    /**
     * Stamps the synced store's last_sync_at, and fires the one-time
     * super-admin "first sync" alert the very first time a store completes
     * one. Alert failures are swallowed (logged only) — they must never
     * fail the push that triggered them.
     */
    private function touchStoreLastSyncAt(Request $request): void
    {
        // Update the last sync time for the store the push actually wrote
        // to -- resolved the same way push() itself resolves it, so a
        // multi-store owner's other branches don't get their last_sync_at
        // stamped by a push meant for a different store (see X-Store-Id
        // header). Using an arbitrary "first" store here previously broke
        // sync throttling and the dashboard's per-store online/offline
        // status for any multi-store account.
        if ($request->user()) {
            $user = $request->user();
            $storeId = $this->resolvePushStoreId($request, $user);
            $store = $storeId ? Store::where('id', $storeId)->first() : null;

            if ($store) {
                $isFirstSync = is_null($store->last_sync_at);
                $store->last_sync_at = now();
                $store->save();

                if ($isFirstSync) {
                    try {
                        \App\Services\AdminAlertService::send(
                            'First-Time Sync Completed: ' . $store->name,
                            [
                                "A user has just successfully completed their first local sync with the DumosRx Cloud.",
                                "Store: {$store->name}",
                                "User: {$user->first_name} {$user->last_name} ({$user->email})"
                            ]
                        );
                    } catch (\Exception $e) {
                        Log::error("Failed to send super admin alert for sync: " . $e->getMessage());
                    }
                }
            }
        }
    }

    /**
     * Whether a stock_batches UPDATE is provably quantity-only, and so
     * exempt from the strict-equality version check (see the long comment
     * on push()'s UPDATE branch for why).
     *
     * Besides the client's own bookkeeping fields, this must also ignore
     * whatever this controller injects into the payload itself before this
     * point runs regardless of what the client actually sent — user_id is
     * auto-filled by normalizePushPayload() for every table in
     * $tablesWithUserId (stock_batches included) whenever the client didn't
     * already set it, so treating it as "meaningful" here would wrongly deny
     * the exemption to every quantity-only push that omitted it (which is
     * all of them — see updateStockBatchQuantity() etc. in
     * lib/db/queries/inventory.ts). store_id isn't currently auto-injected
     * for this table, but is included here defensively in case that ever
     * changes. Always false for every other table.
     */
    private function isQuantityOnlyStockBatchUpdate(string $tableName, array $payload): bool
    {
        if ($tableName !== 'stock_batches') {
            return false;
        }

        $meaningfulPayload = $payload;
        foreach (['id', '_version', '_deleted', '_synced', '_synced_at', 'created_at', 'updated_at', 'quantity', 'user_id', 'store_id'] as $ignoredField) {
            unset($meaningfulPayload[$ignoredField]);
        }

        return count($meaningfulPayload) === 0;
    }

    /**
     * Decides whether a pushed UPDATE is accepted, as
     * [$versionConflict, $conflictReason, $newVersion]:
     *
     * - both sides version-tracked: strict-equality optimistic concurrency
     *   (or an unconditional accept for a commutative/quantity-only change),
     *   with the server — never the payload — assigning the next version.
     * - either side missing a version: the legacy updated_at comparison,
     *   which only rejects a strictly-older payload. $newVersion stays null
     *   there because a legacy row has no version to overwrite.
     * - neither applies: accepted with no new version.
     *
     * DO NOT remove the updated_at fallback branch as dead code: today's
     * client (base-helpers.ts's update()) always sends _version, but the
     * fallback is reachable whenever a payload omits it - from an older
     * client version, or a hand-built payload - and is exercised directly by
     * SyncEndpointTest::test_push_sync_rejects_an_older_update_with_no_version_via_the_timestamp_fallback,
     * ::test_push_sync_accepts_a_newer_update_...,
     * and incidentally by ::test_push_sync_handles_soft_deletes (an UPDATE
     * with _deleted=1 and no _version). Confirm none of those still rely on
     * it before deleting the branch.
     */
    private function resolveUpdateConflict(string $tableName, $model, array $payload, bool $isCommutativeTable, $recordId): array
    {
        $payloadVersion = isset($payload['_version']) ? (int)$payload['_version'] : null;
        $modelVersion = isset($model->_version) ? (int)$model->_version : null;

        if ($payloadVersion !== null && $modelVersion !== null) {
            if ($isCommutativeTable || $payloadVersion === $modelVersion) {
                return [false, null, $modelVersion + 1];
            }

            Log::info("Sync push: version conflict for {$tableName} {$recordId} (payload version {$payloadVersion}, server version {$modelVersion})");

            return [true, 'version_conflict', null];
        }

        if (!$isCommutativeTable && $model->updated_at && isset($payload['updated_at'])) {
            // Legacy fallback for rows without version tracking at all.
            $modelUpdatedAt = \Carbon\Carbon::parse($model->updated_at);
            $payloadUpdatedAt = \Carbon\Carbon::parse($payload['updated_at']);
            if ($payloadUpdatedAt->lt($modelUpdatedAt)) {
                Log::info("Sync push: Ignored older update (timestamp fallback) for {$tableName} {$recordId}");

                return [true, 'stale_timestamp', null];
            }
        }

        return [false, null, null];
    }

    /**
     * Stamps _synced_at on tables that have the column, memoizing the
     * Schema::hasColumn() probe per table across the whole push (the cache
     * array is the caller's, passed by reference, exactly as when this was
     * inline in push()).
     */
    private function stampSyncedAt($model, array &$hasSyncedAtCache, $now): void
    {
        $table = $model->getTable();
        if (!isset($hasSyncedAtCache[$table])) {
            $hasSyncedAtCache[$table] = \Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at');
        }
        if ($hasSyncedAtCache[$table]) {
            $model->_synced_at = $now;
        }
    }

    /**
     * Last-chance defaults for NOT NULL columns the client may leave empty,
     * applied to the hydrated model right before save() on both the INSERT
     * and UPDATE paths (which ran byte-identical copies of this inline).
     * The string 'null' checks are deliberate: legacy clients stringify a
     * missing value rather than omitting it.
     *
     * stores.device_id is NOT NULL + UNIQUE, so it can never fall back to a
     * shared literal — see the identical guard in normalizePushPayload().
     */
    private function applyNotNullColumnDefaults(Request $request, string $tableName, $model): void
    {
        if ($tableName === 'suppliers') {
            if (empty($model->payment_terms) || $model->payment_terms === 'null') {
                $model->payment_terms = 30;
            }
        }
        if ($tableName === 'products') {
            if (empty($model->pack_size) || $model->pack_size === 'null') $model->pack_size = 1;
            if (empty($model->unit_of_measure) || $model->unit_of_measure === 'null') $model->unit_of_measure = 'piece';
        }
        if ($tableName === 'stores') {
            if (empty($model->device_id)) {
                $model->device_id = $request->header('X-Device-Id') ?? ('web-client-' . $model->id);
            }
        }
    }

    /**
     * The pre-existing row a pushed INSERT collides with by natural key
     * (users: email, or username within the same store; categories and
     * suppliers: name within the same store, or a pre-multi-tenancy NULL-
     * store row), or null when there's no collision. The caller remaps the
     * client's local id onto the returned row's id instead of attempting
     * the doomed INSERT.
     *
     * - users: local staff accounts are explicitly allowed to have no email
     *   ("Optional for local staff" in the web staff form), so
     *   $payload['email'] is then simply absent and must not be accessed
     *   unguarded like the sibling username/store_id checks already don't.
     * - categories/suppliers: store-scoped, because an unscoped check meant
     *   a generic name (Cosmetics, Drugs) reused by an unrelated store got
     *   silently merged into that other store's row, and a later
     *   rename/delete there orphaned this store's products with no action of
     *   its own. See 2026_09_12_000000_scope_category_uniqueness_to_store.
     */
    private function findDuplicateInsertConflict(string $modelClass, string $tableName, array $payload, $recordId)
    {
        if ($tableName === 'users') {
            $conflict = $modelClass::where(function ($q) use ($payload) {
                                     if (!empty($payload['email'])) {
                                         $q->where('email', $payload['email']);
                                     }
                                 })
                                 ->orWhere(function ($q) use ($payload) {
                                     $q->where('username', $payload['username'] ?? null)
                                       ->where('store_id', $payload['store_id'] ?? null);
                                 })
                                 ->first();
            if ($conflict) {
                Log::warning("Sync push skipped user insert due to duplicate email/username: " . ($payload['email'] ?? $payload['username'] ?? $recordId));
            }

            return $conflict;
        }

        if (($tableName === 'categories' || $tableName === 'suppliers') && !empty($payload['name'])) {
            $conflict = $modelClass::where('name', $payload['name'])
                ->where(function ($q) use ($payload) {
                    $q->where('store_id', $payload['store_id'] ?? null)
                      ->orWhereNull('store_id');
                })
                ->first();
            if ($conflict) {
                $label = $tableName === 'categories' ? 'category' : 'supplier';
                Log::warning("Sync push skipped {$label} insert due to duplicate name: {$payload['name']}");
            }

            return $conflict;
        }

        return null;
    }

    /**
     * Client-schema -> server-schema payload normalization for one pushed
     * change: per-table column renames, required-field backfills and the
     * store_id/user_id injection every table group needs before the row is
     * written. Purely a transformation of $payload (returned, not mutated
     * in place) with one deliberate exception: it THROWS when an INSERT
     * payload names a store_id outside the caller's allowed stores, which
     * push()'s per-change savepoint turns into a single failed change.
     * Every rule below is lifted verbatim from push()'s inline pipeline —
     * see the individual comments for the incident each one came from.
     */
    private function normalizePushPayload(Request $request, array $change, array $payload, ?string $currentStoreId, $currentUser, bool $isSuperAdmin, array $allowedStoreIds, array $allowedUserIds = []): array
    {
        // Privilege-limit a client-originated `users` payload BEFORE any of
        // the backfill logic below runs, so a stripped/rejected role can't
        // still influence e.g. the store_id backfill just underneath. See
        // sanitizeUserSyncPayload()'s own doc comment for what this closes.
        if ($change['table_name'] === 'users' && $currentUser && !$isSuperAdmin) {
            $recordId = $change['record_id'] ?? ($payload['id'] ?? null);
            $payload = $this->sanitizeUserSyncPayload($payload, $recordId, $currentUser, $allowedStoreIds);
        }

        // Ensure staff users get associated with the store
        if ($change['table_name'] === 'users' && $currentStoreId) {
            if (($payload['role'] ?? null) !== 'store_owner' && ($payload['role'] ?? null) !== 'admin') {
                $payload['store_id'] = $payload['store_id'] ?? $currentStoreId;
            }
        }

        // Map user_id to cashier_id for sales table coming from client
        if ($change['table_name'] === 'sales' && isset($payload['user_id'])) {
            $payload['cashier_id'] = $payload['user_id'];
            unset($payload['user_id']);
        }

        // Map vendor_id to supplier_id for purchase orders
        if ($change['table_name'] === 'purchase_orders') {
            if (isset($payload['vendor_id'])) {
                $payload['supplier_id'] = $payload['vendor_id'];
                unset($payload['vendor_id']);
            }
            if (!isset($payload['ordered_by']) && isset($payload['user_id'])) {
                $payload['ordered_by'] = $payload['user_id'];
                unset($payload['user_id']);
            }
        }

        // Map purchase_order_items fields
        if ($change['table_name'] === 'purchase_order_items') {
            if (isset($payload['po_id'])) {
                $payload['purchase_order_id'] = $payload['po_id'];
                unset($payload['po_id']);
            }
            if (isset($payload['subtotal'])) {
                $payload['total_cost'] = $payload['subtotal'];
                unset($payload['subtotal']);
            }
            if (isset($payload['bulk_quantity']) && isset($payload['units_per_bulk'])) {
                $payload['quantity_ordered'] = intval($payload['bulk_quantity']) * intval($payload['units_per_bulk']);
                unset($payload['bulk_quantity']);
                unset($payload['units_per_bulk']);
            }
        }

        // Handle user specific mappings
        if ($change['table_name'] === 'users') {
            if (isset($payload['name']) && !isset($payload['first_name'])) {
                $parts = explode(' ', $payload['name'], 2);
                $payload['first_name'] = $parts[0] ?? 'User';
                $payload['last_name'] = $parts[1] ?? '';
            }
            // users has no `name` column (only first_name/last_name) - leaving
            // the raw key in the payload after deriving from it fails the
            // INSERT/UPDATE with an unknown-column error.
            unset($payload['name']);
        }

        // `feedback` is the one synced table whose ownership is user_id and
        // ONLY user_id (no store_id column, and it isn't in pull()'s table
        // list either — it's push-only telemetry/support tickets). It was
        // absent from both normalization lists, so whatever the client put in
        // user_id was stored verbatim: in practice the literal "anonymous"
        // the crash logger writes when no user is in localStorage, or a
        // previous account's id after a store/account switch. The row inserts
        // fine (push()'s INSERT branch has no ownership check) and is then
        // permanently rejected 'forbidden' on every subsequent push, because
        // push() turns an INSERT for an already-existing id into an UPDATE,
        // which authorizeChangeTarget() does check. Stamp it to the caller
        // instead, matching the store_id backfill convention a few lines
        // below — but only when it names nobody the caller may write for, so
        // a colleague's genuine ticket keeps its author.
        if ($change['table_name'] === 'feedback' && $currentUser && !$isSuperAdmin) {
            if (empty($payload['user_id']) || !in_array($payload['user_id'], $allowedUserIds, true)) {
                $payload['user_id'] = $currentUser->id;
            }
        }

        // Inject user_id for core tables if missing
        $tablesWithUserId = [
            'sales', 'customers', 'products', 'stock_batches',
            'subscriptions', 'payment_transactions', 'categories',
            'suppliers', 'prescriptions', 'stores',
            'loyalty_tiers', 'loyalty_redemption_options'
        ];
        if (in_array($change['table_name'], $tablesWithUserId)) {
            if (!isset($payload['user_id']) || empty($payload['user_id'])) {
                if ($currentUser) {
                    $payload['user_id'] = $currentUser->id;
                }
            }

            // Inject device_id for stores if missing. device_id is NOT NULL +
            // UNIQUE; a shared literal fallback ('web-client' for every browser
            // session with no X-Device-Id header) collides the instant a second
            // store hits this same path, permanently failing that store's every
            // sync (confirmed in production via a stuck-sync-item Sentry alert).
            // Derived from the change's own (already-unique) record_id instead,
            // so it can never collide and stays stable across retries.
            // (Nested inside the $tablesWithUserId branch exactly as it was
            // inline in push(); 'stores' is a member of that list, so the
            // nesting is behaviourally equivalent to a top-level check.)
            if ($change['table_name'] === 'stores') {
                if (empty($payload['device_id'])) {
                    $payload['device_id'] = $request->header('X-Device-Id') ?? ('web-client-' . $change['record_id']);
                }
            }
        }

        // Inject store_id if missing and table supports it
        $tablesWithStoreId = [
            'requested_products', 'payment_accounts',
            'products', 'sales', 'customers', 'categories', 'suppliers',
            'expenses', 'purchase_orders', 'prescriptions', 'returns',
            'stock_movements', 'supplier_payments', 'audit_logs',
        ];
        if (in_array($change['table_name'], $tablesWithStoreId) && $currentStoreId) {
            if (empty($payload['store_id'])) {
                $payload['store_id'] = $currentStoreId;
            } elseif ($currentUser && !$isSuperAdmin && !in_array($payload['store_id'], $allowedStoreIds, true)) {
                // An explicit store_id in the payload is otherwise
                // trusted as-is (only a MISSING one gets backfilled
                // above) — without this check, a caller could plant
                // rows directly into a store they don't own via
                // INSERT, the mirror image of the UPDATE/DELETE
                // ownership gap this same fix closes below.
                throw new \RuntimeException('Sync push: store_id in payload is outside the caller\'s allowed stores');
            }
        }

        // stock_movements.performed_by is a required FK on the cloud
        // DB with no default, but createSale() on the client never
        // set it, so every sale-triggered movement has been failing
        // this INSERT and sitting stuck in _sync_queue. Fixed
        // client-side too, but this backfills already-queued rows
        // from devices that haven't picked up that fix yet.
        if ($change['table_name'] === 'stock_movements' && empty($payload['performed_by']) && $currentUser) {
            $payload['performed_by'] = $currentUser->id;
        }

        // Prevent NULL constraint violations for products
        if ($change['table_name'] === 'products') {
            if (empty($payload['pack_size'])) {
                $payload['pack_size'] = 1;
            }
            if (empty($payload['unit_of_measure'])) {
                $payload['unit_of_measure'] = 'piece';
            }
        }

        // Prevent NULL constraint violations for suppliers/vendors
        if ($change['table_name'] === 'suppliers') {
            if (empty($payload['payment_terms']) || $payload['payment_terms'] === 'null') {
                $payload['payment_terms'] = 30; // Default fallback
            }
        }

        // Handle audit_logs specific mappings
        if ($change['table_name'] === 'audit_logs') {
            // The client always sends a user_id (whoever was locally
            // logged in when the action happened), but that id might
            // not exist server-side: a local-only/offline-created
            // account, or one since deleted. activity_logs.user_id
            // has an ON DELETE CASCADE foreign key, so an unknown id
            // isn't just wrong, it fails the insert entirely and (since
            // the whole push runs in one transaction) rolls back every
            // other change in the same batch along with it. Fall back
            // to the authenticated user making this sync request
            // whenever the client's id doesn't actually exist, not
            // only when it's missing.
            if (
                empty($payload['user_id']) ||
                !User::where('id', $payload['user_id'])->exists()
            ) {
                $payload['user_id'] = $currentUser->id ?? null;
            }
            $payload['description'] = "Action: " . ($payload['action'] ?? 'Unknown') . " on " . ($payload['table_name'] ?? 'unknown');
            $payload['properties'] = [
                'client_id' => $payload['id'] ?? null,
                'table_name' => $payload['table_name'] ?? null,
                'record_id' => $payload['record_id'] ?? null,
                'details' => $payload['details'] ?? null,
            ];
            $payload['ip_address'] = $request->ip();
            $payload['user_agent'] = $request->userAgent();
            unset($payload['table_name']);
            unset($payload['record_id']);
            unset($payload['details']);
            unset($payload['id']);
        }

        return $payload;
    }

    /**
     * Which store push() should treat as "the store being synced": the one
     * named by X-Store-Id / store_id when the caller actually owns it,
     * otherwise their own store (or their first owned store). Used ONLY to
     * BACK-FILL a missing store_id on a payload, never to verify one — see
     * the ownership-scope comment in push() and
     * resolveAllowedOwnershipScope() below for the verification side.
     */
    private function resolvePushStoreId(Request $request, $currentUser): ?string
    {
        $currentStoreId = null;
        $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');
        if ($requestedStoreId) {
            $ownerId = $currentUser->store_id
                ? Store::where('id', $currentUser->store_id)->value('user_id')
                : $currentUser->id;
            $ownsStore = Store::where('id', $requestedStoreId)->where('user_id', $ownerId)->exists();
            if ($ownsStore) {
                $currentStoreId = $requestedStoreId;
            }
        }
        if (!$currentStoreId) {
            $currentStoreId = $currentUser->store_id ?? Store::where('user_id', $currentUser->id)->value('id');
        }

        return $currentStoreId;
    }

    /**
     * users columns that must never be settable from a client-originated
     * sync payload at all: platform-attribution/referral bookkeeping
     * (registered_by_id, platform_referral_code, account_manager_id,
     * referral_code/referred_by_id/referral_credits), verification/security
     * state (email_verified_at, remember_token), account-deletion request
     * state, and — critically — role_id, which could point at a privileged
     * Role row (hasRole()/hasPermission() both consult the role_id
     * relation, not just the `role` string column) even while `role` itself
     * passes the allow-list below.
     */
    private const USER_SYNC_FORBIDDEN_FIELDS = [
        'role_id', 'email_verified_at', 'remember_token',
        'referral_code', 'referred_by_id', 'referral_credits',
        'platform_referral_code', 'registered_by_id', 'account_manager_id',
        'deletion_requested_at', 'deletion_reason',
        'setup_reminder_level', 'setup_reminder_last_sent_at',
    ];

    /**
     * users columns a SELF-edit sync push (recordId === currentUser->id) may
     * ever set. Deliberately excludes role/store_id/is_active — a user must
     * never be able to change their own role, store assignment or active
     * status via sync, full stop (that's exactly the "cashier self-promotes
     * to admin" exploit this allow-list closes). Sync bookkeeping fields
     * (id/_version/_synced_at) and last_login_at are harmless passthrough
     * the client always resends.
     */
    private const USER_SYNC_SELF_ALLOWED_FIELDS = [
        'id', 'first_name', 'last_name', 'phone', 'email', 'username',
        'password', 'pin', 'last_login_at', 'updated_at',
        '_version', '_synced_at',
    ];

    /**
     * Role slugs assignable to someone ELSE via sync, in ascending order of
     * privilege, mirroring RolesAndPermissionsSeeder's store-level roles.
     * super_admin/platform_admin/agent (platform-level) are never assignable
     * via sync regardless of caller privilege. 'store_owner' is excluded
     * here too — it's only ever reachable via the self-edit passthrough
     * above (which now strips 'role' entirely), never assignable to
     * another record via sync.
     */
    private const USER_SYNC_ASSIGNABLE_ROLES = ['admin', 'manager', 'specialist', 'sales_staff', 'auditor'];

    /**
     * Privilege-limits a client-originated `users` sync payload for a
     * non-super-admin caller (a super_admin's own push bypasses this, same
     * as every other ownership check in this controller). True allow-list,
     * not a deny-list: self-edits are capped to a narrow safe-fields set
     * (see USER_SYNC_SELF_ALLOWED_FIELDS), and edits to someone else's row
     * are rejected outright unless the caller holds manage_staff — matching
     * StaffController's own gate — with any `role` value additionally
     * capped so a caller can never grant a role with MORE permissions than
     * their own current role holds (never lateral-or-up beyond what they
     * themselves have).
     *
     * Throws (caught by push()'s per-change savepoint, reported in
     * `failed`) rather than silently dropping/keeping a stale value, so a
     * rejected privilege-escalation attempt gets clear signal instead of a
     * payload that silently didn't do what it asked.
     */
    private function sanitizeUserSyncPayload(array $payload, $recordId, $currentUser, array $allowedStoreIds): array
    {
        foreach (self::USER_SYNC_FORBIDDEN_FIELDS as $field) {
            unset($payload[$field]);
        }

        $isSelf = $recordId !== null && (string) $recordId === (string) $currentUser->id;

        if ($isSelf) {
            // Self-edit: allow-list down to the safe self-service fields
            // only. role/store_id/is_active are never in this set, so they
            // silently fall away here rather than reaching forceFill() —
            // this also naturally handles the web staff table's "re-submits
            // the owner's current role verbatim" case, since dropping the
            // field just leaves the DB's existing value untouched.
            return array_intersect_key($payload, array_flip(self::USER_SYNC_SELF_ALLOWED_FIELDS));
        }

        // Editing someone else's row (e.g. a staff device pulling the
        // owner's profile down — pushing changes TO it is not a legitimate
        // client flow at all): require manage_staff before permitting ANY
        // field change, matching StaffController's own authorization.
        if (!$currentUser->hasPermission('manage_staff')) {
            throw new \RuntimeException('Sync push: users payload attempted to modify another user without manage_staff permission');
        }

        if (array_key_exists('role', $payload) && $payload['role'] !== null) {
            if (!in_array($payload['role'], self::USER_SYNC_ASSIGNABLE_ROLES, true)) {
                throw new \RuntimeException('Sync push: users payload attempted to set a disallowed role');
            }

            if (!$this->roleIsAtOrBelowCallerPrivilege($payload['role'], $currentUser)) {
                throw new \RuntimeException('Sync push: users payload attempted to grant a role above the caller\'s own privilege level');
            }
        }

        if (array_key_exists('store_id', $payload) && $payload['store_id'] !== null) {
            if (!in_array($payload['store_id'], $allowedStoreIds, true)) {
                throw new \RuntimeException('Sync push: users payload attempted to set store_id outside caller\'s allowed stores');
            }
        }

        return $payload;
    }

    // roleIsAtOrBelowCallerPrivilege() now lives on the shared
    // EnforcesStaffOwnership trait (used above), so the REST staff
    // endpoints (StaffController) and this sync-push path can't drift
    // apart on what counts as a privilege escalation.

    /**
     * The full set of store ids and user ids a non-super-admin caller may
     * write to, as [$allowedStoreIds, $allowedUserIds]. Deliberately NOT
     * narrowed by X-Store-Id (unlike resolvePushStoreId() above): this is
     * the authorization envelope, and an owner legitimately owns every one
     * of their stores regardless of which one a given request happens to
     * name. Mirrors pull()'s own $storeIds/$userIds scoping so read and
     * write authorization agree.
     */
    private function resolveAllowedOwnershipScope($currentUser): array
    {
        $ownerId = $currentUser->store_id
            ? Store::where('id', $currentUser->store_id)->value('user_id')
            : $currentUser->id;
        $allowedStoreIds = $currentUser->store_id
            ? [$currentUser->store_id]
            : Store::where('user_id', $ownerId)->pluck('id')->toArray();
        $allowedUserIds = User::whereIn('store_id', $allowedStoreIds)->pluck('id')->push($ownerId)->toArray();

        return [$allowedStoreIds, $allowedUserIds];
    }

    /**
     * Whether $model (an already-loaded row for $tableName) belongs to one
     * of $allowedStoreIds/$allowedUserIds — used to gate push()'s
     * UPDATE/DELETE so a caller can't mutate or delete another tenant's
     * row just by knowing its id. Table groupings mirror pull()'s own
     * store/user scoping match() above, so read and write authorization
     * agree on which tables are store-scoped vs. child tables scoped via a
     * parent's store_id vs. legacy user_id-owned tables.
     */
    private function authorizeChangeTarget(string $tableName, $model, array $allowedStoreIds, array $allowedUserIds): bool
    {
        if ($tableName === 'stores') {
            return in_array($model->id, $allowedStoreIds, true);
        }
        if ($tableName === 'users') {
            return in_array($model->id, $allowedUserIds, true);
        }

        $resolvedStoreId = $this->resolveChangeStoreId($tableName, $model);
        if ($resolvedStoreId !== null) {
            return in_array($resolvedStoreId, $allowedStoreIds, true);
        }

        // Ownership couldn't be determined from store_id — either this row
        // (or, for a child table, its parent) predates the store_id
        // backfill migration. `backfillStoreIdOnLegacyRows` in core.ts is
        // still active precisely because several currently-active accounts
        // have local DBs older than its ship date (see docs/KNOWN_BUGS.md),
        // so rejecting outright here would break real, legitimate syncs for
        // those accounts. Fall back to user_id ownership where the table
        // has one; if neither is determinable, fail open rather than break
        // a legacy sync — the actual attack surface this check closes
        // (harvesting record ids off the public storefront) only ever
        // yields rows with a real store_id already set.
        if (!isset($model->user_id)) {
            return true;
        }

        if (in_array($model->user_id, $allowedUserIds, true)) {
            return true;
        }

        // The row names a user id that isn't in the caller's scope. Before
        // rejecting, distinguish "belongs to another tenant" (a real denial)
        // from "names nobody at all" — a dangling id that resolves to no
        // `users` row is ownership that couldn't be determined, exactly like
        // the null case above, not another tenant's property.
        //
        // This is not hypothetical: the client's crash logger
        // (client/lib/utils/error-logger.ts) writes `feedback` rows with the
        // literal string user_id "anonymous" whenever it can't read a logged-in
        // user out of localStorage (a crash before login, after logout, or
        // with storage unavailable). `feedback` carries no store_id, so it
        // lands here; the INSERT branch of push() has no ownership check, so
        // the server happily stores the row; and then every later push of
        // that same row — push() rewrites an INSERT for an already-existing
        // id into an UPDATE, so a retried/re-queued crash report always
        // becomes one — was rejected 'forbidden' forever, which is exactly
        // the production symptom logged in docs/KNOWN_BUGS.md. The same
        // applies to any row left behind by an account switch whose original
        // user has since been deleted.
        //
        // Deliberately on the reject path only: this extra lookup runs just
        // for a change that was about to be denied, never for the overwhelming
        // majority that resolve through store_id or an in-scope user_id.
        // A dangling id confers no privilege — anyone could create such a row
        // themselves — so failing open here matches the existing fallback's
        // reasoning rather than widening it.
        //
        // withTrashed(): User uses SoftDeletes, whose global scope makes a
        // plain whereKey()->exists() return false for a deleted staff member
        // or store owner too — a REAL user's rows, not a dangling id. Without
        // this, any of a deactivated/removed user's un-store-scoped rows
        // become writable by any authenticated sync caller who happens to
        // know the id, which is exactly the "another tenant's property" case
        // this fallback exists to keep denied.
        return !User::withTrashed()->whereKey($model->user_id)->exists();
    }

    /**
     * Resolves the store_id a change target belongs to, following a child
     * table's foreign key up to its store-scoped parent where the table
     * itself carries no store_id column. Returns null when it can't be
     * determined (missing/legacy data), which authorizeChangeTarget()
     * treats as "fall back to user_id ownership," not "denied."
     */
    private function resolveChangeStoreId(string $tableName, $model): ?string
    {
        static $directStoreTables = [
            'products', 'sales', 'customers', 'categories', 'suppliers',
            'expenses', 'purchase_orders', 'prescriptions', 'returns',
            'stock_movements', 'supplier_payments', 'requested_products',
            'payment_accounts', 'loyalty_tiers', 'loyalty_redemption_options',
            'stock_audits', 'held_transactions', 'loyalty_transactions',
            'customer_payments', 'audit_logs',
        ];

        if (in_array($tableName, $directStoreTables, true)) {
            return $model->store_id ?? null;
        }

        if ($tableName === 'sale_items') {
            return isset($model->sale_id) ? Sale::where('id', $model->sale_id)->value('store_id') : null;
        }
        if ($tableName === 'return_items') {
            return isset($model->return_id) ? \App\Models\SaleReturn::where('id', $model->return_id)->value('store_id') : null;
        }
        if ($tableName === 'prescription_items') {
            return isset($model->prescription_id) ? \App\Models\Prescription::where('id', $model->prescription_id)->value('store_id') : null;
        }
        if ($tableName === 'purchase_order_items') {
            return isset($model->purchase_order_id) ? PurchaseOrder::where('id', $model->purchase_order_id)->value('store_id') : null;
        }
        if ($tableName === 'stock_batches') {
            return isset($model->product_id) ? Product::where('id', $model->product_id)->value('store_id') : null;
        }
        if ($tableName === 'sale_item_batches') {
            if (!isset($model->sale_item_id)) {
                return null;
            }
            $saleId = SaleItem::where('id', $model->sale_item_id)->value('sale_id');
            return $saleId ? Sale::where('id', $saleId)->value('store_id') : null;
        }

        return null;
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
        $currentStoreId = $currentUser ? $this->resolvePushStoreId($request, $currentUser) : null;

        if (!$currentStoreId) {
            return response()->json(['success' => true, 'counts' => []]);
        }

        // Deliberately NOT run through validateSync()'s plan-interval
        // throttle: that throttle exists to bound the cost of a real data
        // pull, not a handful of COUNT(*)s, and gating this behind the same
        // window it's meant to double-check would leave it just as capable
        // of silently never running as the pull cursor it exists to verify.
        // Scoped to the tables actually implicated in the known stuck-
        // cursor failure mode (inventory + sales) rather than every synced
        // table - a targeted, cheap check, not a second sync engine.
        // stock_batches must be scoped EXACTLY the way pull() scopes it
        // (line ~845: whereIn('product_id', Product::whereIn('store_id', ...)
        // ->pluck('id'))), not by stock_batches.store_id directly. Product
        // uses SoftDeletes, so that pull-side subquery silently excludes
        // batches belonging to a deleted product — completely routine
        // (discontinuing/removing a product) for a store like this one.
        // Counting by store_id alone here would count those orphaned-
        // product batches too, permanently disagreeing with what pull()
        // can ever actually deliver: a device would look "behind" by
        // exactly that many rows forever, since forceFullResync() re-runs
        // the very same pull scoping and can never close a gap that isn't
        // real. Matching this exactly is what keeps the health check
        // comparing apples to apples.
        $nonDeletedProductIds = Product::where('store_id', $currentStoreId)->pluck('id');

        $counts = [
            'products' => DB::table('products')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
            'stock_batches' => DB::table('stock_batches')->whereIn('product_id', $nonDeletedProductIds)->whereNull('deleted_at')->count(),
            'sales' => DB::table('sales')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
            'customers' => DB::table('customers')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
            'categories' => DB::table('categories')->where('store_id', $currentStoreId)->whereNull('deleted_at')->count(),
        ];

        return response()->json([
            'success' => true,
            'counts' => $counts,
        ]);
    }

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
            // These four were missing entirely: getModelForTable() returning
            // null makes push() `continue` past the change with only a
            // server-side log warning — it's never added to
            // response.failed, so the client (which treats "not explicitly
            // failed" as "succeeded") deleted these from its local queue
            // having never actually been written anywhere. Real customer
            // payments, held transactions, loyalty point transactions, and
            // stock audits were silently lost, not just stuck.
            'stock_audits' => \App\Models\StockAudit::class,
            'held_transactions' => \App\Models\HeldTransaction::class,
            'loyalty_transactions' => \App\Models\LoyaltyTransaction::class,
            'customer_payments' => \App\Models\CustomerPayment::class,
        ];
        return $map[$tableName] ?? null;
    }

    /**
     * Whether this pull request is the client's privileged
     * subscription-status pull (see client's syncSubscriptionStatus()),
     * which sends `?setup=1` specifically to bypass the cloud_sync gate for
     * this one call, on exactly the free/lapsed/suspended tiers that call
     * exists to correct.
     *
     * `setup=1` is a plain client-controlled query param with no
     * server-side corroboration of its own — honoring it outright for any
     * pull would let a free/lapsed account keep the gate permanently
     * bypassed on every subsequent (non-setup) sync too, not just this one
     * narrow call, silently defeating the cloud_sync feature gate entirely.
     * So this only fires for a request shaped EXACTLY like the privileged
     * call always shapes itself: a `last_synced` map naming ONLY `stores`
     * (a real full/incremental sync always also names the rest of pull()'s
     * table list, even ones with an empty cursor — see that fixed $tables
     * list). A genuinely-empty `last_synced` (a real first-ever full sync)
     * is handled separately by validateSync()'s existing bypass and is not
     * this method's concern.
     */
    private function isStoresOnlySetupOverridePull(Request $request, $lastSyncedMap): bool
    {
        return $request->boolean('setup')
            && is_array($lastSyncedMap)
            && array_keys($lastSyncedMap) === ['stores'];
    }

    private function validateSync(Request $request, $isPush = true)
    {
        $user = $request->user();
        if ($user && !$user->hasRole('super_admin')) {
            $subscriptionService = app(\App\Services\SubscriptionService::class);
            $owner = $subscriptionService->getSubscriptionOwner($user);
            
            // Check active subscription
            $sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
            $plan = $sub ? strtolower($sub->plan_name) : 'free';
            
            $systemConfig = \App\Models\SystemConfig::getVal('subscription_plans', []);
            $canSync = $systemConfig['tiers'][$plan]['features']['cloud_sync'] ?? false;

            // Resolved the same way push()/touchStoreLastSyncAt() resolve
            // "the store being synced" (X-Store-Id when present and owned,
            // else the caller's own store) -- an arbitrary "first" store
            // here previously measured the interval throttle and the
            // isSetup escape hatch against the wrong branch entirely for
            // multi-store accounts.
            $syncedStoreId = $this->resolvePushStoreId($request, $user);
            $store = $syncedStoreId ? Store::where('id', $syncedStoreId)->first() : null;

            $isManual = $request->boolean('manual');
            // The client-supplied `setup` flag exists so a brand-new device
            // can complete its very first sync even on a plan that
            // otherwise disables cloud sync or throttles the interval (see
            // the passing test for exactly that case). But `setup` is a
            // plain client-controlled boolean with no server-side
            // corroboration — any request could set it, permanently
            // skipping both the cloud_sync feature gate and the interval
            // throttle on every push, not just a genuine first one. Require
            // the store to actually have never synced before (last_sync_at
            // null) to honor it; once a real sync has landed, the escape
            // hatch closes for good, same as if it never existed for that
            // store from then on. Pull's own isSetup (no last_synced
            // supplied at all) doesn't have an equivalent spoofable flag —
            // left as-is.
            $isSetup = $isPush
                ? ($request->boolean('setup') && !($store && $store->last_sync_at))
                // The pull-side `setup` flag has two distinct honored shapes:
                // a genuinely empty `last_synced` (a real first-ever full
                // sync, unaffected by the change below), or the narrow
                // `stores`-only shape isStoresOnlySetupOverridePull() checks
                // for — see that method's doc comment for why `setup=1`
                // isn't simply honored outright the way it now half-is (this
                // used to ignore the query param entirely, computing isSetup
                // from `last_synced` alone, which meant the client's
                // subscription-status pull — which always sends a non-empty
                // `last_synced: { stores: "" }` specifically so it can bypass
                // this gate — never actually got the bypass it asked for,
                // and was rejected with SYNC_DISABLED for exactly the
                // free/lapsed/suspended tiers that call exists to correct).
                : (!$isPush && (empty($request->input('last_synced', [])) || $this->isStoresOnlySetupOverridePull($request, $request->input('last_synced', []))));

            if (!$isSetup) {
                if (!$canSync) {
                    return [
                        'valid' => false,
                        'message' => 'Cloud sync is disabled on your current plan. Please upgrade to a premium plan to backup your data.',
                        'code' => 'SYNC_DISABLED',
                        'status' => 403
                    ];
                }

                $syncIntervalMinutes = $systemConfig['tiers'][$plan]['limits']['sync_interval'] ?? 0;
                
                if ($syncIntervalMinutes > 0 && !$isManual) {
                    if ($store && $store->last_sync_at) {
                        $minutesSinceLastSync = abs((int)$store->last_sync_at->diffInMinutes(now()));
                        if ($minutesSinceLastSync < $syncIntervalMinutes) {
                            // Allow pull requests that happen immediately after a push (in the same minute)
                            if (!$isPush && $minutesSinceLastSync === 0) {
                                // Skip throttling for this immediate paired pull
                            } else {
                                $intervalText = $syncIntervalMinutes >= 60 
                                    ? floor($syncIntervalMinutes / 60) . ' hours' 
                                    : $syncIntervalMinutes . ' minutes';
                                    
                                return [
                                    'valid' => false,
                                    'message' => "Sync limit reached. Your current plan synchronizes once every {$intervalText}. Last sync: " . $store->last_sync_at->diffForHumans() . '. Please upgrade your plan for faster sync.',
                                    'code' => 'SYNC_THROTTLED',
                                    'status' => 429
                                ];
                            }
                        }
                    }
                }
            }
            
            // Enforce staff limits
            $subscriptionService->enforceStaffLimits($owner);

            // Enforce store limits for syncing
            $storeLimit = \App\Models\SystemConfig::getVal('subscription_plans')['tiers'][$plan]['limits']['stores'] ?? 0;
            if ($storeLimit !== -1) {
                $allowedStoreIds = Store::where('user_id', $owner->id)->orderBy('created_at', 'asc')->limit($storeLimit)->pluck('id')->toArray();

                // Must resolve to the SAME store push()/pull() actually
                // write to (X-Store-Id when present, exactly like their own
                // $currentStoreId/store-scoping resolution above) — not a
                // separately-derived default. Previously this always
                // checked $user->store_id regardless of X-Store-Id, so a
                // multi-store owner over their plan's store limit could
                // pass a disallowed store's id via the header, have this
                // check validate their allowed default store instead, and
                // have push()/pull() write to the disallowed one anyway.
                $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');
                $syncStoreId = null;
                if ($requestedStoreId && Store::where('id', $requestedStoreId)->where('user_id', $owner->id)->exists()) {
                    $syncStoreId = $requestedStoreId;
                }
                if (!$syncStoreId) {
                    $syncStoreId = $user->store_id ?? Store::where('user_id', $user->id)->value('id');
                }

                if ($syncStoreId && !in_array($syncStoreId, $allowedStoreIds)) {
                    return [
                        'valid' => false,
                        'message' => "Sync rejected. Your " . ucfirst($plan) . " plan limits you to {$storeLimit} store(s). This store exceeds your limit and has been temporarily paused from cloud syncing.",
                        'code' => 'STORE_LIMIT_EXCEEDED',
                        'status' => 403
                    ];
                }
            }
        }
        
        return ['valid' => true];
    }
}
