# Sync server rationale

Explanatory comments relocated verbatim from `SyncController` and the `app/Services/Sync/` classes extracted from it (2026-10-24), per `.agents/AGENTS.md` §3. Each entry names the member it documents; an inline comment is anchored to the line of code it sat above. The text is unchanged, so every A-NN and rule reference still greps.

## `SyncController`

`laravel-server/app/Http/Controllers/Api/App/SyncController.php`

### `push`

Above `$request->validate([`:

> `present`, not `required`: an empty array is a legitimate report-only
> push. See SyncPushReportOnlyExchangeTest for why that case exists.

Above `usort($changes, fn ($a, $b) => ($a['table_name'] === 'stock_movements') <=> ($b['table_name'] === 'stock_movements'));`:

> stock_movements rows carry a foreign key (stock_batch_id) that may
> point at a batch created earlier in this very same payload. FK
> constraints are checked per-statement, not deferred to commit, so
> if a client happens to send the movement before the batch, the
> INSERT fails outright, not just the quantity reconciliation.
> Stable-sort (PHP's sort functions are stable as of 8.0) all
> stock_movements changes to the end so every batch/product they
> could reference is guaranteed to exist by the time they're
> processed, regardless of the order the client sent them in.

Above `$crossStoreGuard = app(\App\Services\Sync\CrossStoreReferenceGuard::class);`:

> One instance per request so its referent/owned-name memos are shared
> across the batch's changes (A-302).

Above `$isSuperAdmin = $currentUser && $currentUser->hasRole('super_admin');`:

> Ownership scope for UPDATE/DELETE targets and for rejecting an
> INSERT payload that explicitly names a store_id the caller
> doesn't own. $currentStoreId above is only ever used to BACK-FILL
> a missing store_id, never to verify one; without this, any
> authenticated user could push an UPDATE/DELETE against a record
> id belonging to a completely different store (harvestable from
> e.g. the unauthenticated public storefront endpoint), corrupting
> or deleting a stranger's data. Mirrors pull()'s own $storeIds /
> $userIds scoping above so read and write authorization agree.

Above `$idMapByTable = [];`:

> Grouped by table_name, unlike $idMap above (which is flat and
> only used to remap foreign keys within payloads later in this
> same request): returned to the client as id_map so it can fix
> up its own local rows immediately, since a future delta pull
> only ever reconciles a collision if the pre-existing row it
> collided with happens to also appear in that pull's response
> (see DUPLICATE_NAME_TABLES in the client's reconcile-identity.ts)
> — a long-unchanged row like "DRUGS" or "COSMETICS" never will.

Above `$stockBatchDeltas = [];`:

> stock_batches.quantity is never trusted from a client payload
> (see the INSERT/UPDATE handling below); it is always derived
> by applying stock_movements deltas on top of whatever the
> server currently has. Deltas are accumulated here and applied
> in one atomic pass after the main loop, rather than inline,
> so a movement's delta is never skipped just because its batch
> happened to be processed later in the same payload (clients
> are not guaranteed to order changes batch-before-movement).

Above `$versions = [];`:

> Server-assigned versions for accepted UPDATE changes, grouped by
> table_name like $idMapByTable, returned to the client as
> `versions` so it can apply the new authoritative number to its
> local row immediately instead of waiting for a future pull (see
> docs/features/_known-bugs.md #11).

Above `DB::beginTransaction();`:

> Each change gets its own SAVEPOINT (Laravel nests
> automatically inside the outer transaction) so one bad row
> (a legacy schema mismatch, a dangling FK from an earlier
> partial sync, anything data-quality-related rather than a
> real conflict) only loses its own change instead of
> rolling back every other change sharing this batch. Before
> this, a single unresolvable row could permanently block an
> entire device's backlog, since every retry hit the exact
> same row again in the same position.

Above `$pendingStockBatchDelta = null;`:

> Set by the stock_movements INSERT branch below, merged into
> $stockBatchDeltas only right before this change's own
> DB::commit() (not immediately after $model->save()) — a
> later step in this same change's block (e.g. the
> soft-delete handling further down) could still throw and
> roll back this savepoint, and a delta already merged into
> the shared array by then wouldn't be undone with it, even
> though the movement it came from never actually committed.

Above `$payload = is_array($change['payload']) ? $change['payload'] : (json_decode($change['payload'], true) ?? []);`:

> The OA doc marks payload as nullable (DELETE doesn't need one), and the
> request validation above allows it through as such. Default a genuinely-
> null (or unparseable) payload to [] here rather than passing null onward:
> SyncPayloadMapper::map() takes a strict `array $payload`, and a null would
> throw a TypeError — which, being an \Error and not an \Exception, is NOT
> caught by either catch block below, so it would propagate as an uncaught
> fatal instead of a clean per-change failure. See docs/KNOWN_BUGS.md.

Above `if (isset($payload['_synced'])) {`:

> Strip client-only state flags that should never reach the DB

Above `foreach ($payload as $key => $value) {`:

> Apply ID mappings for foreign keys (if a previous record was merged due to conflict)

Above `$exists = $conflicts->findAuditLogByClientId($modelClass, $recordId, $currentStoreId) !== null;`:

> Scoped to this push's store, not just client_id: a
> client-generated audit_logs id is only guaranteed
> unique on the device that created it, not globally.
> A device that switches active store while an audit
> log INSERT from the PREVIOUS store is still queued
> reuses that same local id under the new store's
> push - an unscoped match here silently turned that
> INSERT into an UPDATE against the other store's
> row, which authorizeChangeTarget() below then
> correctly (but permanently, since audit_logs are
> append-only and nothing ever re-queues it) rejected
> as 'forbidden', losing that log entry for good.

Above `$exists = \method_exists($modelClass, 'trashed')`:

> Use withTrashed to catch soft-deleted items so we don't get Duplicate Entry crashes

Above `if ($change['table_name'] === 'users' || (! $clientNamedStoreId && in_array($change['table_name'], PushPayloadNormalizer::STORE_ID_BACKFILL_TABLES, true))) {`:

> normalizePushPayload() already ran, so it gated its
> store_id backfill on the pre-override operation.

Above `$exists = false;`:

> Re-calculate exists for normal INSERT flow just in case

Above `$conflict = $conflicts->findDuplicateInsertConflict($modelClass, $change['table_name'], $payload, $recordId);`:

> Name/email/username collisions with a row that already
> exists server-side: resolved by remapping the client's
> local id onto the existing row rather than crashing the
> INSERT. See findDuplicateInsertConflict() for the
> per-table rules and why each one exists.

On `$exists = true;`:

> Pretend it exists to skip insertion

Above `if ($change['table_name'] === 'categories' || $change['table_name'] === 'suppliers') {`:

> Only categories/suppliers are reported back to the
> client in the response's id_map; the users remap
> stays request-local, exactly as before.

Above `if ($change['table_name'] === 'users') {`:

> Force missing required fields for users

Above `$model->setAttribute('password', null);`:

> Offline-created users are PIN-only; never
> derive one. "Staff credentials" in AGENTS.md.

Above `if ($change['table_name'] === 'stock_batches') {`:

> A brand-new batch's quantity is never trusted from the client
> either: a batch created locally and already partially sold
> before its first-ever sync would arrive with an already-net
> value, and applying the accompanying stock_movements delta on
> top of that would double-count exactly like it used to (see
> git history: 83ffb95 removed the delta application because of
> this, without noticing the real fix is to stop trusting
> quantity on both INSERT and UPDATE, not just UPDATE). New
> batches start at the column default (0) and every caller that
> creates one (procurement receiving, at minimum) already pushes
> a matching opening-balance movement in the same sync, so this
> is reconstructed correctly below.

Above `if ($change['table_name'] === 'stock_movements') {`:

> stock_batches.quantity is derived from stock_movements deltas,
> never trusted directly from a client payload (INSERT above, or
> UPDATE below); see the comment on $stockBatchDeltas. Recorded
> rather than applied immediately: a client is not guaranteed to
> order a new batch's INSERT before its movement in the same
> payload, and incrementing against a batch row that doesn't
> exist yet would silently do nothing. Held in
> $pendingStockBatchDelta (merged into $stockBatchDeltas just
> before this change's own DB::commit() below) rather than
> written into the shared array directly — see that variable's
> doc comment above.

Above `if ($isDeleted) {`:

> Handle _deleted flag for soft deletes

Above `if ($change['table_name'] === 'audit_logs') {`:

> Use withTrashed to ensure we can find soft-deleted items to restore them if needed.
> lockForUpdate() is required here: this branch reads _version, compares it
> against the payload, then writes based on that comparison. Without a row lock,
> two concurrent pushes for the same record can both read the same _version, both
> pass the equality check, and both save — a lost update, which is exactly what
> the version scheme above exists to prevent.
>
> Note this lock is held until the *outer* transaction (opened at the top of
> push(), ~line 104) commits, not just this change's savepoint: Laravel's nested
> DB::commit() below only decrements an internal counter and issues no real
> COMMIT/RELEASE SAVEPOINT until the outermost level, so the underlying DB
> transaction — and any locks taken inside it — stays open regardless. That's
> no different from the exclusive lock $model->save() already takes on an
> accepted change; the only new case is a *rejected* (version-conflict) row,
> which now stays locked for the rest of the batch instead of never being
> locked at all. That's an acceptable, bounded tradeoff for correctness here,
> not a deadlock risk beyond what already exists from save() locking rows in
> whatever order the batch happens to process them.
> audit_logs never carries the client's id as its primary
> key (the INSERT path deliberately keeps the server's own
> auto-increment and stores the client id in
> properties->client_id), so it must be matched the same
> way the INSERT existence probe above matches it — a raw
> find() here coerces the id string to a leading numeric
> run under MySQL and can hit an unrelated row.

Above `if (`:

> A receipt can never book more than was ordered. The client
> clamps to the outstanding balance already, but that clamp is
> computed against whatever that device knew — so two devices
> booking the same delivery both compute the full outstanding
> balance and both push a receipt for it. The version check
> rejects the second UPDATE on this row only when both were
> based on the same version; a receipt staged against a
> stale-but-different version, or any other producer of an
> over-receipt, would otherwise be applied. quantity_received
> and quantity_ordered are both in base units by this point
> (SyncPayloadMapper scales them together), so they are
> directly comparable. See docs/FIXED_BUGS.md, A-9.

Above `$isCommutativeTable = $conflicts->isQuantityOnlyStockBatchUpdate($change['table_name'], $payload);`:

> Conflict Resolution: strict-equality optimistic concurrency,
> not a `<` / "older" check — see docs/features/_known-bugs.md
> #11. Two devices editing the same row from the same shared
> ancestor version will *always* compute the identical next
> version (it's just arithmetic on the same starting number),
> so by the time the second push arrives its version now
> EQUALS the server's current version (already bumped by the
> first, already-accepted push). The old `<` check only ever
> fired on strictly-older payloads and silently fell through to
> comparing wall-clock updated_at on equality — exactly the
> guaranteed-collision case above — which is how the second
> device's edit could silently clobber the first's confirmed
> write with zero signal. Now: equal versions accept (this
> edit is genuinely based on the server's current state, so the
> server assigns the new version itself, never trusting
> whatever _version the payload carries — see below); anything
> else with two known versions is a real conflict, not just
> "older," and gets rejected and reported either way.
>
> stock_batches is exempt from this check, but ONLY when the
> payload doesn't touch anything besides quantity (which is
> stripped just below and never applied from this UPDATE at
> all — it's derived separately from commutative
> stock_movements deltas, see $stockBatchDeltas and this
> controller's own API doc comment above, which have no
> version check of their own). Two different terminals/devices
> concurrently selling from the same batch is normal, everyday,
> expected operation, and both pushes carry the same base
> _version by the same guaranteed-collision arithmetic as any
> other two-device edit — rejecting a quantity-only update here
> would be a constant false alarm for a field where nothing
> meaningful is actually being overwritten.
>
> This does NOT extend to the table's other columns
> (batch_number, expiry_date, cost_price, supplier_id,
> manufacture_date, location, is_active, notes, received_date):
> the stock-audit cost-correction flow
> (lib/db/queries/inventory.ts's reconcileStockAudit, ~line
> 518) really does UPDATE cost_price directly, and two managers
> concurrently correcting the same batch's cost/expiry data is a
> genuine conflict the version check must still catch — silently
> last-write-winning THAT would reintroduce exactly the kind of
> silent data loss this whole fix exists to close, just on a
> different field. So: strip quantity and the usual
> bookkeeping/derived fields (mirroring the quantity strip a few
> lines below and the _synced/_deleted stripping done earlier in
> push()) from a COPY of the payload, and only exempt this
> change from the version check if nothing else is left —
> i.e. this specific push is provably quantity-only.

Above `DB::commit();`:

> Must close the per-change savepoint opened above
> before skipping to the next change. A bare
> `continue` here left it dangling every time an
> older update was ignored (a routine, expected
> occurrence in multi-device sync, not an edge
> case), stacking unclosed savepoints for the
> rest of the request.

Above `$isDeleted = null;`:

> Pre-process payload before forceFill

Above `unset($payload['_version']);`:

> Never trust _version from the client for a write that's
> actually being applied: the server is now the sole authority
> for version numbers (see above). Per the client-side fix,
> the payload's _version is just the unchanged base value the
> edit was made from, not a real new version.

Above `if ($isDeleted !== null) {`:

> Handle _deleted flag for soft deletes on update

Above `if ($pendingStockBatchDelta !== null) {`:

> Only now — nothing left in this change's block that can
> still throw and roll back its savepoint — fold the
> pending delta into the shared accumulator applied after
> the loop.

Above `$activity->recordStockFingerprint($request, $currentUser, $currentStoreId);`:

> After the commit, never before: taken earlier, the server's
> side excluded this very request's movements while the device's
> number already included them, reporting a divergence that was
> only ever the batch in flight.

Above `while (DB::transactionLevel() > $entryTransactionLevel) {`:

> Back to where this method found things, not one level. An
> \Error inside the per-change block leaves nesting at 2 (outer
> transaction + savepoint), and a single rollBack() unwinds only
> the savepoint — the recording below would then be written into
> a transaction nobody commits, which is exactly the case the
> \Throwable widening exists for.

### `PULL_WATERMARK_LAG_SECONDS`

> How far behind `now()` a pull's returned watermark is stamped. Reasoning
> and the cost in laravel-server/AGENTS.md, "The pull watermark lags".

### `pull`

Above `$pageOffsets = $request->input('page_offset', []);`:

> Per-table page offset for the current in-progress pull round (see
> client's pull.ts loop). Distinct from $lastSyncedMap, which only
> advances once a table's entire backlog for this round has been
> drained — offsets exist so a table with >500 changed rows can be
> paged within a single round without prematurely marking it synced.

Above `$pageCursors = $request->input('page_cursor', []);`:

> Keyset position within the current in-progress walk, per table:
> { table: { updated_at, id } }, echoed back from the last row of the
> page the client most recently committed. Supersedes $pageOffsets
> for any table that supplies one; $pageOffsets stays honored so a
> client older than this cursor keeps paging exactly as before.

Above `$tables = ['products', 'stock_batches', 'categories', 'customers', 'suppliers', 'sales', 'sale_items', 'sale_item_batches', 'stores', 'users', 'stock_movements', 'purchase_orders', 'purchase_order_items', 'expenses', 'payment_accounts', 'requested_products', 'supplier_payments', 'returns', 'return_items', 'prescriptions', 'prescription_items', 'loyalty_tiers', 'loyalty_redemption_options', 'stock_audits', 'held_transactions', 'loyalty_transactions', 'customer_payments', 'audit_logs', 'permission_groups'];`:

> stock_audits, held_transactions, loyalty_transactions,
> customer_payments, and audit_logs were all missing from this list
> — their changes could push (once the corresponding
> getModelForTable/schema fixes landed) but never pulled back down
> to any other device, so a second device or a fresh restore would
> never see them even after the push-side bug was fixed.

Above `if (app(SyncGate::class)->isStoresOnlySetupOverridePull($request, $lastSyncedMap)) {`:

> The privileged subscription-status pull (client's
> syncSubscriptionStatus()) sends `?setup=1` specifically to bypass
> the cloud_sync gate below — see isStoresOnlySetupOverridePull()'s
> own doc comment for why that override is only honored for a
> request shaped exactly like this one. Mirror that same narrowing
> here: even though validateSync() already scoped the GATE bypass
> to this exact request shape, pull() itself has no per-table
> request scoping of its own (every table in $tables above is
> always fetched, regardless of which ones the caller's
> `last_synced` actually named) — without this, the gate override
> would hand back a full initial sync of every table, not just the
> `stores` row this privileged call actually needs.

Above `$query = \method_exists($modelClass, 'trashed')`:

> withTrashed() is a Builder macro registered by SoftDeletingScope,
> not a real declared method, so method_exists($modelClass,
> 'withTrashed') is always false and this always fell through to
> ::query() - silently excluding every soft-deleted row from
> every pull response, for every table, regardless of whether
> the model is soft-deletable. Probe for trashed() instead (a
> real SoftDeletes trait method), matching the pattern already
> used correctly elsewhere in this controller (see push()'s
> duplicate-INSERT check and its UPDATE/restore lookup above).

Above `if ($tenantScope) {`:

> Multi-tenant filtering

### `counts`

Above `$scopedProductIds = Product::withTrashed()->select('id')->where('store_id', $currentStoreId);`:

> Deliberately NOT run through validateSync()'s plan-interval
> throttle: that throttle exists to bound the cost of a real data
> pull, not a handful of COUNT(*)s, and gating this behind the same
> window it's meant to double-check would leave it just as capable
> of silently never running as the pull cursor it exists to verify.
> Scoped to the tables actually implicated in the known stuck-
> cursor failure mode (inventory + sales) rather than every synced
> table - a targeted, cheap check, not a second sync engine.
> stock_batches is scoped EXACTLY as applyPullTenantScope() scopes
> it — through Product::withTrashed() since A-176a, never by
> stock_batches.store_id directly — so a device never looks
> permanently "behind" by rows pull cannot deliver. If one side
> changes, change the other in the same edit.

### `reconcileQuantities`

Above `'movements' => $movements,`:

> Lets the reporting device seed its own copy locally - see AGENTS.md.

### `getModelForTable`

Above `'stock_audits' => \App\Models\StockAudit::class,`:

> These four were missing entirely: getModelForTable() returning
> null makes push() `continue` past the change with only a
> server-side log warning — it's never added to
> response.failed, so the client (which treats "not explicitly
> failed" as "succeeded") deleted these from its local queue
> having never actually been written anywhere. Real customer
> payments, held transactions, loyalty point transactions, and
> stock audits were silently lost, not just stuck.

## `SyncOwnershipResolver`

`laravel-server/app/Services/Sync/SyncOwnershipResolver.php`

### `resolvePushStoreId`

> Which store push() should treat as "the store being synced": the one
> named by X-Store-Id / store_id when the caller actually owns it,
> otherwise their own store (or their first owned store). Used ONLY to
> BACK-FILL a missing store_id on a payload, never to verify one — see
> the ownership-scope comment in push() and
> resolveAllowedOwnershipScope() below for the verification side.

### `resolveAllowedOwnershipScope`

> The full set of store ids and user ids a non-super-admin caller may
> write to, as [$allowedStoreIds, $allowedUserIds]. Deliberately NOT
> narrowed by X-Store-Id (unlike resolvePushStoreId() above): this is
> the authorization envelope, and an owner legitimately owns every one
> of their stores regardless of which one a given request happens to
> name. Mirrors pull()'s own $storeIds/$userIds scoping so read and
> write authorization agree.

### `storeBelongsToTenantOwner`

> Whether $storeId is one of the tenant owner's live stores (some
> session of this account could write it, even if this one can't).
> Excludes soft-deleted stores, same as resolveOwnershipIdentity() -
> see docs/FIXED_BUGS.md A-167 and docs/KNOWN_BUGS.md A-168.

### `resolveOwnershipIdentity`

> The single ownership resolution every sync scope is built from, as
> ['ownerId' => tenant owner's user id, 'storeIds' => every store that
> owner's scope covers].
>
> `stores.user_id` is authoritative and `users.store_id` is only
> consulted for a caller who owns no store at all (a genuine staff
> account). The reverse — trusting a non-null `users.store_id` first —
> silently narrowed a multi-store owner carrying a stale `store_id` to
> one of their stores, making every row in the others unsyncable in
> both directions; see docs/FIXED_BUGS.md A-127 and the data-repair
> migration 2026_10_01_000000_clear_store_id_on_store_owners.

## `PushConflictResolver`

`laravel-server/app/Services/Sync/PushConflictResolver.php`

### `isQuantityOnlyStockBatchUpdate`

> Whether a stock_batches UPDATE is provably quantity-only, and so
> exempt from the strict-equality version check (see the long comment
> on push()'s UPDATE branch for why).
>
> Besides the client's own bookkeeping fields, this must also ignore
> whatever this controller injects into the payload itself before this
> point runs regardless of what the client actually sent — user_id is
> auto-filled by normalizePushPayload() for every table in
> $tablesWithUserId (stock_batches included) whenever the client didn't
> already set it, so treating it as "meaningful" here would wrongly deny
> the exemption to every quantity-only push that omitted it (which is
> all of them — see updateStockBatchQuantity() etc. in
> lib/db/queries/inventory.ts). store_id isn't currently auto-injected
> for this table, but is included here defensively in case that ever
> changes. Always false for every other table.

### `resolveUpdateConflict`

(This docblock sat above `findAuditLogByClientId()` in the source, but describes `resolveUpdateConflict()`.)

> Decides whether a pushed UPDATE is accepted, as
> [$versionConflict, $conflictReason, $newVersion]:
>
> - both sides version-tracked: strict-equality optimistic concurrency,
>   with the server — never the payload — assigning the next version.
> - a commutative/quantity-only change: accepted unconditionally and the
>   version left where it was, so a sale never invalidates another
>   device's pending edit to a field this push does not touch. See
>   laravel-server/AGENTS.md, "A sale does not version a batch".
> - either side missing a version: the legacy updated_at comparison,
>   which only rejects a strictly-older payload. $newVersion stays null
>   there because a legacy row has no version to overwrite.
> - neither applies: accepted with no new version.
>
> DO NOT remove the updated_at fallback branch as dead code: today's
> client (base-helpers.ts's update()) always sends _version, but the
> fallback is reachable whenever a payload omits it - from an older
> client version, or a hand-built payload - and is exercised directly by
> SyncEndpointTest::test_push_sync_rejects_an_older_update_with_no_version_via_the_timestamp_fallback,
> ::test_push_sync_accepts_a_newer_update_...,
> and incidentally by ::test_push_sync_handles_soft_deletes (an UPDATE
> with _deleted=1 and no _version). Confirm none of those still rely on
> it before deleting the branch.

### `findAuditLogByClientId`

> The only correct way to find the activity_logs row a client-generated
> audit_logs id refers to: activity_logs.id is the server's own
> auto-increment bigint, and the client's id lives in
> properties->client_id. Scoped to the pushing store because a client id
> is only unique on the device that generated it (see the INSERT
> existence probe in push() for the cross-store case that proved it).

Above `if ($currentStoreId === null || $currentStoreId === '') {`:

> A null store id (super-admin push, or no active store) has no store
> to scope to, and `where('store_id', null)` would silently become
> `whereNull('store_id')` — matching legacy store-less rows that share
> this client id rather than nothing. Since a client id is only unique
> per device, there is no safe unscoped match: report "not found" so
> an INSERT stays an INSERT and an UPDATE no-ops, instead of writing
> to a row we cannot prove is the right one.

### `resolveUpdateConflict`

Above `$modelUpdatedAt = \Carbon\Carbon::parse($model->updated_at);`:

> Legacy fallback for rows without version tracking at all.

### `findDuplicateInsertConflict`

> The pre-existing row a pushed INSERT collides with by natural key
> (users: email, or username within the same store; categories and
> suppliers: name within the same store, or a pre-multi-tenancy NULL-
> store row), or null when there's no collision. The caller remaps the
> client's local id onto the returned row's id instead of attempting
> the doomed INSERT.
>
> - users: local staff accounts are explicitly allowed to have no email
>   ("Optional for local staff" in the web staff form), so
>   $payload['email'] is then simply absent and must not be accessed
>   unguarded like the sibling username/store_id checks already don't.
> - categories/suppliers: matched ONLY within the pushing payload's own
>   store, because an unscoped check meant a generic name (Cosmetics,
>   Drugs) reused by an unrelated store got silently merged into that
>   other store's row, and a later rename/delete there orphaned this
>   store's products with no action of its own. See
>   2026_09_12_000000_scope_category_uniqueness_to_store. The match also
>   no longer falls back to a NULL-store row: pull() scopes these tables
>   with whereIn('store_id', ...), which never matches NULL, so a product
>   remapped onto an unowned category could never resolve it on any
>   device again (docs/KNOWN_BUGS.md A-189). A payload that genuinely
>   carries no store_id still matches NULL-store rows, which is the
>   pre-multi-tenancy path the id_map regression test covers.

## `PushRowWriter`

`laravel-server/app/Services/Sync/PushRowWriter.php`

### `stampSyncedAt`

> Stamps _synced_at on tables that have the column, memoizing the
> Schema::hasColumn() probe per table across the whole push (the cache
> array is the caller's, passed by reference, exactly as when this was
> inline in push()).

### `reviveConflictTarget`

> Brings back the trashed row a pushed INSERT was remapped onto, carrying
> the payload's user-authored columns across: the remap tombstones the
> row the client just created, so anything not applied here is lost.
> Reasoning in laravel-server/AGENTS.md, "Every pulled table soft-deletes".

### `reopenPullWindow`

> Puts a row back inside every device's incremental pull window without
> touching its content, its `updated_at` or its `_version` — the query
> builder, never Eloquent, so no timestamp or model event can move them.
> Rationale in laravel-server/AGENTS.md, "Re-sent INSERTs".

### `applyNotNullColumnDefaults`

> Last-chance defaults for NOT NULL columns the client may leave empty,
> applied to the hydrated model right before save() on both the INSERT
> and UPDATE paths (which ran byte-identical copies of this inline).
> The string 'null' checks are deliberate: legacy clients stringify a
> missing value rather than omitting it.
>
> stores.device_id is NOT NULL + UNIQUE, so it can never fall back to a
> shared literal — see the identical guard in normalizePushPayload().
>
> stock_batches.cost_price is nullable on the client and NOT NULL
> DEFAULT 0 here: a legacy adjustment batch holding a real local NULL
> only sends it explicitly once a whole-row requeue rebuilds its
> payload, which is why the column survived this long (A-128).

## `PullPager`

`laravel-server/app/Services/Sync/PullPager.php`

### `hasSyncedAtColumnCache`

> Memoizes applyPullCursor()'s _synced_at column probe for the lifetime
> of one request. Schema::hasColumn() is a real INFORMATION_SCHEMA round
> trip that Laravel does not cache, and the probe runs once per table per
> page — same reasoning as stampSyncedAt()'s own per-push cache.

### `applyPullCursor`

> Applies the client's per-table last_synced cursor, preferring
> _synced_at OR updated_at where the table has a _synced_at column.
> 'stores' is deliberately exempt (see fetchPullPage()).
>
> The column probe reads the model's physical table, never $table: a
> client sync name is not always a physical name (A-289).

### `fetchPullPage`

> Fetches one page for a table as [$records, $hasMore].
>
> 'stores' is deliberately exempt from both the last_synced cursor
> (applyPullCursor() above) and this 500-row cap, so the client can
> always treat it as a complete snapshot (see the pruning logic in the
> client's pull.ts) — capping it like every other (delta-filtered) table
> would silently contradict that for any owner with more stores than
> that, since a store past the cutoff would look indistinguishable from
> one that's genuinely gone.
>
> Every other table gets deterministic ordering (previously unordered,
> so the 500 that made it into any given page were an arbitrary subset
> of the matching rows, not even the oldest) and is walked by a keyset
> cursor on that same (updated_at, id) ordering: fetching 501 and slicing
> tells us whether more rows remain beyond this page without a second
> COUNT query, and seeking by the previous page's last row keeps every
> page the same cost instead of degrading as OFFSET grows.
>
> $offset is the pre-keyset fallback, still honored for clients that send
> page_offset without page_cursor. See docs/SYNC_PULL_PAGINATION.md.

### `normalizePageCursor`

> Validates one table's client-supplied keyset position, returning null
> for anything that isn't a complete, parseable (updated_at, id) pair so
> the page falls back to offset paging rather than throwing.

## `PullTenantScope`

`laravel-server/app/Services/Sync/PullTenantScope.php`

### `applyPullTenantScope`

> Narrows one table's pull query to the rows the (non-super-admin)
> caller may see. The table groupings here are the read-side mirror
> of authorizeChangeTarget()/resolveChangeStoreId()'s write-side
> ones, so read and write authorization agree on which tables are
> store-scoped, which derive scope through a parent, and which are
> legacy user_id-owned. Mutates the query in place, exactly as the
> inline match() it replaces did.
>
> Takes an already-resolved scope (resolvePullTenantScope()) rather than
> re-deriving it: this is called once per table per page, and the owner
> lookup + owned-store list + staff-id list never change within a
> request.

Above `'products' => $query->whereIn('store_id', $storeIds),`:

> These 11 tables now carry a real store_id column (see
> add_store_id_to_domain_tables migration); scope directly
> by store rather than by an owner/cashier user-id chain, so
> a multi-store owner's stores actually stay separated
> instead of merging under "anything this owner touched."

Above `'sale_items' => $query->whereIn('sale_id', $this->tenantSaleIds($storeIds)),`:

> Child tables still derive scoping through their now
> correctly store-scoped parent, no store_id of their own.
> Each passes a Builder, never a Collection: Laravel compiles a
> Builder into a real SQL subquery, while ->pluck('id') executed
> the parent query and inlined every id the tenant owns as bound
> literals, once per table per page (see
> docs/SYNC_PULL_PAGINATION.md). Every subquery is withTrashed()
> so a child of a soft-deleted parent is still delivered, and
> counted the same way — docs/FIXED_BUGS.md A-176a and A-284.

Above `'loyalty_tiers' => $query->whereIn('store_id', $storeIds),`:

> Upgraded from the legacy `where('user_id', $ownerId)`
> now that these carry a real store_id (see
> fix_sync_schema_drift migration) — owner-wide scoping
> let a multi-store owner's tiers/options bleed across
> their own stores, the same class of bug the comment
> above already fixed for the 11-table group.

Above `'stock_audits' => $query->whereIn('store_id', $storeIds),`:

> Added along with the fix for these tables being
> missing from getModelForTable()/this pull list
> entirely (see fix_sync_schema_drift migration and the
> SyncController comment above the model map). None of
> held_transactions/loyalty_transactions/
> customer_payments has a user_id column at all, so
> falling through to `default` below would throw an
> "Unknown column 'user_id'" SQL error the moment these
> were added to the pull table list.

Above `'permission_groups' => $query->whereIn('store_id', $storeIds),`:

> Has a store_id column but no user_id column at all (see
> PermissionGroup migration) - falling through to `default`
> below would throw "Unknown column 'user_id'", exactly the
> class of bug the comment above already fixed for
> held_transactions/loyalty_transactions/customer_payments.

### `tenantSaleIds`

> The tenant's sale-id subquery, used by both sale_items and (nested one
> level deeper) sale_item_batches.

### `PULL_TABLES_INDEPENDENT_OF_STORE_HEADER`

> Tables applyPullTenantScope() scopes by every owned store or by the owner, never by X-Store-Id; a test derives and checks it.

### `isCallersOwnDeletedStore`

> An owner's own deleted store; never a staff member's sibling store (A-129).

### `resolvePullTenantScope`

> Resolves, once per request, everything applyPullTenantScope() needs: the subscription owner, the stores this
> pull is narrowed to, the store rows it serves, and the staff ids. Rules: laravel-server/AGENTS.md, A-129 and A-254.

## `PullRowMapper`

`laravel-server/app/Services/Sync/PullRowMapper.php`

### `mapPullRowForClient`

> Server row -> client-SQLite row for one pulled record: the
> _deleted flag every table carries, the stores subscription/license
> derivation, and the per-table column renames that mirror
> normalizePushPayload()'s client -> server direction.

Above `if (($plan !== 'free' || $isTrial) && ! empty($expiry)) {`:

> Generate license token for offline validation

Above `if ($table === 'users') {`:

> Map users fields for SQLite

Above `$array['pin'] = $item->getAttribute('pin');`:

> `pin` is in User::$hidden (so no ordinary API response leaks
> it), but POS login is fully offline and verifies the typed PIN
> against the locally-stored value - the device can only do that
> if the pull ships it. It's a bcrypt hash now, not the raw PIN.

Above `if ($table === 'sales' && isset($array['cashier_id'])) {`:

> Map cashier_id back to user_id for client SQLite sales table

Above `if ($table === 'purchase_orders') {`:

> Map supplier_id to vendor_id and ordered_by to user_id for purchase_orders

Above `if ($table === 'purchase_order_items') {`:

> Map purchase_order_items back to SQLite format

## `SyncGate`

`laravel-server/app/Services/Sync/SyncGate.php`

### `isStoresOnlySetupOverridePull`

> Whether this pull request is the client's privileged
> subscription-status pull (see client's syncSubscriptionStatus()),
> which sends `?setup=1` specifically to bypass the cloud_sync gate for
> this one call, on exactly the free/lapsed/suspended tiers that call
> exists to correct.
>
> `setup=1` is a plain client-controlled query param with no
> server-side corroboration of its own — honoring it outright for any
> pull would let a free/lapsed account keep the gate permanently
> bypassed on every subsequent (non-setup) sync too, not just this one
> narrow call, silently defeating the cloud_sync feature gate entirely.
> So this only fires for a request shaped EXACTLY like the privileged
> call always shapes itself: a `last_synced` map naming ONLY `stores`,
> **with an empty cursor** — `{stores: ""}`, which is the literal that
> call has sent since it was written (126a7ec3) and which no real sync
> ever sends, because a real one carries a timestamp.
>
> That empty-cursor check is load-bearing, not belt-and-braces. Naming
> `stores` alone is NOT unique to the privileged call: something always
> runs syncSubscriptionStatus() before onboarding's main pull, and it
> stamps `_sync_state.stores` and nothing else — the new-account path
> calls it directly (app/setup/use-onboarding.ts), and the existing-
> account restore path gets it from StoreProvider's own effect
> (lib/context/store-context.tsx), which re-fires when the active store
> is set. Either way, on a fresh device the main setup pull also names
> only `stores` — and was therefore narrowed to ['stores'], never
> sending `users`. Onboarding then told a real store owner no staff account
> existed and offered to create one, which would have duplicated her
> identity. See docs/FIXED_BUGS.md, A-253.
>
> A genuinely-empty `last_synced` (a real first-ever full sync) is
> handled separately by validateSync()'s existing bypass and is not this
> method's concern.

### `SYNC_RUN_MAX_MINUTES`

> How long one client sync run may keep exempting its own follow-up
> batches from the plan's sync-interval throttle. Generously above what
> a real run costs (50-change batches paced ~1.1s apart, plus paged
> pulls) and far below the smallest configured interval (30 min on the
> mid tier), so it can never swallow a whole interval.

### `syncRunId`

> The client's per-sync()-call run token, or null when the request
> carries none (an older client build, or any other caller). Length- and
> charset-capped because it is persisted on the store row.

### `validateSync`

Above `$sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();`:

> Check active subscription

Above `$syncedStoreId = $this->ownership->resolvePushStoreId($request, $user);`:

> Resolved the same way push()/touchStoreLastSyncAt() resolve
> "the store being synced" (X-Store-Id when present and owned,
> else the caller's own store) -- an arbitrary "first" store
> here previously measured the interval throttle and the
> isSetup escape hatch against the wrong branch entirely for
> multi-store accounts.

Above `$isSetup = $isPush`:

> The client-supplied `setup` flag exists so a brand-new device
> can complete its very first sync even on a plan that
> otherwise disables cloud sync or throttles the interval (see
> the passing test for exactly that case). But `setup` is a
> plain client-controlled boolean with no server-side
> corroboration — any request could set it, permanently
> skipping both the cloud_sync feature gate and the interval
> throttle on every push, not just a genuine first one. Require
> the store to actually have never synced before (last_sync_at
> null) to honor it; once a real sync has landed, the escape
> hatch closes for good, same as if it never existed for that
> store from then on.
>
> Pull's own isSetup used to be considered un-spoofable ("no
> last_synced supplied at all" was assumed to only ever happen
> on a device's genuine first-ever sync) — wrong: any device can
> trivially reproduce an empty last_synced just by clearing its
> own local sync-cursor state (a real, shipped recovery feature
> - see forceFullResync() - and just as easy without it, by
> clearing local app storage). Left ungated, that's a repeatable,
> unlimited bypass of both the cloud_sync gate and the interval
> throttle for any store, on any plan, at any time. Gated with
> the exact same store.last_sync_at corroboration as the push
> side: an empty last_synced only counts as a genuine first sync
> when the STORE (not just this device) has never synced before.

Above `: ((empty($request->input('last_synced', [])) && ! ($store && $store->last_sync_at))`:

> The pull-side `setup` flag has two distinct honored shapes:
> a genuinely empty `last_synced` corroborated by the store
> never having synced before (a real first-ever full sync),
> or the narrow `stores`-only shape
> isStoresOnlySetupOverridePull() checks for — see that
> method's doc comment for why `setup=1` isn't simply
> honored outright the way it now half-is (this used to
> ignore the query param entirely, computing isSetup from
> `last_synced` alone, which meant the client's
> subscription-status pull — which always sends a non-empty
> `last_synced: { stores: "" }` specifically so it can bypass
> this gate — never actually got the bypass it asked for,
> and was rejected with SYNC_DISABLED for exactly the
> free/lapsed/suspended tiers that call exists to correct).

Above `$runId = $this->syncRunId($request);`:

> One sync() call on the client is many requests: the
> push is split into 50-change batches and the pull into
> pages, all seconds apart. Throttling per REQUEST would
> therefore reject every batch after the first of a
> multi-batch backlog (batch 1 stamps last_sync_at, batch
> 2 arrives with minutesSinceLastSync === 0) — which only
> stayed invisible while the client labelled every
> background sync `manual=1` and skipped this whole
> block. The client now sends one X-Sync-Run-Id per
> sync() call, so the interval is measured per RUN: the
> run's first request is checked, the rest are not.

Above `if (! $isPush && $minutesSinceLastSync === 0) {`:

> Allow pull requests that happen immediately after a push (in the same minute)

Above `} else {`:

> Skip throttling for this immediate paired pull

Above `if ($runId !== null && ! $isSameRun && $store) {`:

> This request opened a new run and was allowed through:
> remember which run it was, so its own later batches are
> recognized. Stamped with a start time, and only honored
> for SYNC_RUN_MAX_MINUTES, so a client that pinned one
> run id forever gets one run's worth of exemption, not a
> standing bypass of its plan's interval.

Above `$subscriptionService->enforceStaffLimits($owner);`:

> Enforce staff limits

Above `if ($store) {`:

> Lazily seed this store's 5 default permission groups server-side
> (spec: "server: equivalent lazy check on relevant API entry
> points") - covers stores whose staff are only ever managed via
> the web dashboard, and closes the gap where a second device
> pulling before the first device's own client-side seed has
> pushed up would otherwise see no groups at all. Idempotent,
> gated the same way the client is (stores.permission_groups_seeded_at).

Above `$storeLimit = \App\Models\SystemConfig::getVal('subscription_plans')['tiers'][$plan]['limits']['stores'] ?? 0;`:

> Enforce store limits for syncing

Above `$requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');`:

> Must resolve to the SAME store push()/pull() actually
> write to (X-Store-Id when present, exactly like their own
> $currentStoreId/store-scoping resolution above) — not a
> separately-derived default. Previously this always
> checked $user->store_id regardless of X-Store-Id, so a
> multi-store owner over their plan's store limit could
> pass a disallowed store's id via the header, have this
> check validate their allowed default store instead, and
> have push()/pull() write to the disallowed one anyway.

## `SyncActivityRecorder`

`laravel-server/app/Services/Sync/SyncActivityRecorder.php`

### `recordStockFingerprint`

> A two-integer summary of what this device believes about its stock,
> compared against what the server derives from stock_movements. Fully
> try/caught: a reporting failure must never fail a sync.

### `recordTableFingerprint`

> Two integers per synced table — row count and the sum of `_version` —
> compared against the rows a pull would send this device. The sibling
> of recordStockFingerprint(), which only ever measured stock. Absent
> from an older bundle's payload, in which case nothing is recorded and
> the panel reads "not reported". Fully try/caught: a reporting failure
> must never fail a sync. See docs/DEVICE_TABLE_AGREEMENT.md.

### `recordQueueState`

> What this device says is in its own `_sync_queue`. Fully try/caught:
> reporting must never fail a sync.

### `exchangeSyncCommands`

> Records what the device did with the last batch of commands and hands
> it the next. Rides on the push response rather than adding a round
> trip. Fully try/caught: this must never fail a sync.

### `recordRejectedPush`

> PG-18: both of the exits above return before the per-change recording
> hook, so a store that syncs nothing used to contribute nothing and the
> platform success rate read 100%.

### `touchStoreLastSyncAt`

> Stamps the synced store's last_sync_at, and fires the one-time
> super-admin "first sync" alert the very first time a store completes
> one. Alert failures are swallowed (logged only) — they must never
> fail the push that triggered them.

Above `if ($request->user()) {`:

> Update the last sync time for the store the push actually wrote
> to -- resolved the same way push() itself resolves it, so a
> multi-store owner's other branches don't get their last_sync_at
> stamped by a push meant for a different store (see X-Store-Id
> header). Using an arbitrary "first" store here previously broke
> sync throttling and the dashboard's per-store online/offline
> status for any multi-store account.

### `sendFirstSyncAlert`

> Must run AFTER push()'s DB::commit(): AdminAlertService::send() is a
> synchronous SMTP send (this repo runs no queue worker), and calling it
> inside the transaction held every lockForUpdate() row lock open for the
> SMTP timeout, timing the client's batch out against locked rows.

## `QuantityReconciliationService`

`laravel-server/app/Services/Sync/QuantityReconciliationService.php`

### `reconcile`

Above `$storeId = $productStoreIds->get($batch->product_id) ?? $batch->store_id;`:

> A batch's own store_id is never authoritative on its own (see
> resolveChangeStoreId()) - it's only trusted here as a last
> resort, after the product lookup, and only once confirmed to
> be one of the caller's own stores by the check below.

Above `continue;`:

> Lost the race to a concurrent push() - see docstring below.

### `writeQuantityReconciliation`

> Sets the batch to the device-reported quantity and records the signed
> difference as a 'sync_reconciliation' movement, atomically — the
> corrected value and the record explaining it must never diverge.
> Uses a conditional UPDATE rather than an absolute save() so a
> concurrent push() moving this same batch's quantity between the
> caller's read and this write is detected, not silently clobbered:
> returns null without writing anything if the row no longer holds
> $currentQuantity.

Above `'performed_by' => $currentUser->id,`:

> performed_by is NOT NULL, so this records the device the
> request came from rather than a system/null actor.

### `logQuantityReconciliations`

> One summary audit row per store actually corrected. Summary rather
> than per-batch detail, matching AdminStoreDeletionService::purgeStore()
> — a few hundred batches would make the properties blob disproportionate
> to what any reader needs; the per-batch truth lives in stock_movements.

## `SyncWriteAuthorizer`

`laravel-server/app/Services/Sync/SyncWriteAuthorizer.php`

### `batchStoreIds`

> Batch id to its product's store, for authorization within one push; one instance per push().

### `withoutStoreReassignment`

> A-248: a device may claim a store-less row only for its one store, and never move a row that has a store.

### `claimIsEvidence`

> A claim for a store-less row counts only when it names the session's one and only store; null scope (super admin) is a guess.

### `isBatchOutsideScope`

> Whether an accumulated delta's batch exists and belongs to a store the
> pusher may not write to. A batch that does not exist resolves to no
> store and is deliberately NOT out of scope — see
> laravel-server/AGENTS.md, "Stock batch deltas are store-scoped".
> $memoize is false for the delta backstop, which must see this push's own writes.

### `namesForeignBatch`

> A movement may not name, or be repointed at, a batch outside the session's scope (A-287).

### `authorizeChangeTarget`

> Whether $model (an already-loaded row for $tableName) belongs to one
> of $allowedStoreIds/$allowedUserIds — used to gate push()'s
> UPDATE/DELETE so a caller can't mutate or delete another tenant's
> row just by knowing its id. Table groupings mirror pull()'s own
> store/user scoping match() above, so read and write authorization
> agree on which tables are store-scoped vs. child tables scoped via a
> parent's store_id vs. legacy user_id-owned tables.

Above `if (! isset($model->user_id)) {`:

> Ownership couldn't be determined from store_id — either this row
> (or, for a child table, its parent) predates the store_id
> backfill migration. `backfillStoreIdOnLegacyRows` in core.ts is
> still active precisely because several currently-active accounts
> have local DBs older than its ship date (see docs/KNOWN_BUGS.md),
> so rejecting outright here would break real, legitimate syncs for
> those accounts. Fall back to user_id ownership where the table
> has one; if neither is determinable, fail open rather than break
> a legacy sync — the actual attack surface this check closes
> (harvesting record ids off the public storefront) only ever
> yields rows with a real store_id already set.

Above `return ! User::withTrashed()->whereKey($model->user_id)->exists();`:

> The row names a user id that isn't in the caller's scope. Before
> rejecting, distinguish "belongs to another tenant" (a real denial)
> from "names nobody at all" — a dangling id that resolves to no
> `users` row is ownership that couldn't be determined, exactly like
> the null case above, not another tenant's property.
>
> This is not hypothetical: the client's crash logger
> (client/lib/utils/error-logger.ts) writes `feedback` rows with the
> literal string user_id "anonymous" whenever it can't read a logged-in
> user out of localStorage (a crash before login, after logout, or
> with storage unavailable). `feedback` carries no store_id, so it
> lands here; the INSERT branch of push() has no ownership check, so
> the server happily stores the row; and then every later push of
> that same row — push() rewrites an INSERT for an already-existing
> id into an UPDATE, so a retried/re-queued crash report always
> becomes one — was rejected 'forbidden' forever, which is exactly
> the production symptom logged in docs/KNOWN_BUGS.md. The same
> applies to any row left behind by an account switch whose original
> user has since been deleted.
>
> Deliberately on the reject path only: this extra lookup runs just
> for a change that was about to be denied, never for the overwhelming
> majority that resolve through store_id or an in-scope user_id.
> A dangling id confers no privilege — anyone could create such a row
> themselves — so failing open here matches the existing fallback's
> reasoning rather than widening it.
>
> withTrashed(): User uses SoftDeletes, whose global scope makes a
> plain whereKey()->exists() return false for a deleted staff member
> or store owner too — a REAL user's rows, not a dangling id. Without
> this, any of a deactivated/removed user's un-store-scoped rows
> become writable by any authenticated sync caller who happens to
> know the id, which is exactly the "another tenant's property" case
> this fallback exists to keep denied.

### `authorizeInsertTarget`

> The INSERT counterpart of authorizeChangeTarget(): there is no stored
> row to inspect yet, so ownership is resolved from the incoming payload's
> own parent FK instead. This is what stops a caller planting rows in a
> child table that carries no store_id of its own (stock_batches,
> sale_items, sale_item_batches, return_items, prescription_items,
> purchase_order_items) under a parent id harvested off the
> unauthenticated storefront endpoints.
>
> `stores`/`users` are exempt: a brand-new row of either is the caller's
> own account/setup row, gated by validateSync() and the plan's store
> limit rather than by an owning store that doesn't exist yet.
>
> Fails open on an unresolvable parent (a child pushed before its parent
> in the same batch, or a legacy row with no store_id), matching
> authorizeChangeTarget()'s reasoning: the attack this closes only ever
> yields parents that do resolve to a real, foreign store.

### `guardedRowStoreId`

> The store a row being written belongs to, for CrossStoreReferenceGuard: a batch's is its product's, looked up only when it names a supplier.

### `resolveChangeStoreId`

> Resolves the store_id a change target belongs to: its parent's store for
> a child table, else the row's own `store_id` where it has one, else null.
>
> The second step exists because the first can legitimately yield nothing —
> an absent parent, or one whose own `store_id` is NULL — and a child table
> with no `user_id` then reached authorizeChangeTarget()'s fall-open and was
> deletable by any tenant (A-297). The child's own `store_id` stays
> non-authoritative for *scoping* (A-288); it is consulted here only as a
> second ownership opinion when the parent has none.
>
> Returns null when nothing can be determined, which authorizeChangeTarget()
> treats as "fall back to user_id ownership," not "denied" — a child pushed
> before its parent must still work (§11).

### `resolveParentStoreId`

> @see resolveChangeStoreId() — the parent-FK half, kept separate so the fallback cannot shadow it.

## `StockBatchDeltaApplier`

`laravel-server/app/Services/Sync/StockBatchDeltaApplier.php`

### `applyStockBatchDeltas`

> Applies every accumulated stock_movements delta. See push()'s own
> comments (preserved verbatim below) for why this runs after the main
> loop, per-delta-savepointed, as a single atomic floored UPDATE.

Above `foreach ($stockBatchDeltas as $stockBatchId => $delta) {`:

> Apply every accumulated stock_movements delta, now that every
> change in this push has been processed and any batch created
> earlier in the same payload definitely exists. Each delta
> gets its own savepoint, exactly like each change in the main
> loop above — a single atomic UPDATE (not load-mutate-save) so
> concurrent syncs from different devices can't race and
> clobber each other's deltas, but isolated so a failure on ONE
> delta (a deadlock, a constraint violation) can't roll back
> every other change already committed in this push. Before
> this, any exception here propagated to the outer catch,
> rolling back the entire transaction — since Laravel's nested
> DB::commit() only releases a savepoint rather than truly
> committing until the outermost level, that undid every
> change in the batch, not just the one behind the failing
> delta, so the whole backlog got re-queued and hit the same
> failure again on retry (see docs/KNOWN_BUGS.md).
>
> Floored at 0, mirroring the client's own local deduction
> (lib/db/queries/inventory.ts's deductFromBatch: "the batch's
> own running balance should never be written negative" — an
> oversell is surfaced via getOversoldAlerts(), not a negative
> quantity). Before this, an oversell left the selling device's
> local batch at 0 while this server-side increment (and every
> OTHER device's pull-side `quantity + delta` application, see
> client's pull.ts) computed a negative quantity from the exact
> same movement — a permanent per-device divergence, since pull
> deliberately never trusts a pulled quantity snapshot to
> reconcile it back. CASE WHEN instead of MySQL's GREATEST()/
> SQLite's scalar MAX() so the same expression works against
> both engines (production is MySQL, tests run on sqlite — see
> phpunit.xml).

## `SyncPayloadSanitizer`

`laravel-server/app/Services/Sync/SyncPayloadSanitizer.php`

### `USER_SYNC_FORBIDDEN_FIELDS`

> users columns that must never be settable from a client-originated
> sync payload at all: platform-attribution/referral bookkeeping
> (registered_by_id, platform_referral_code, account_manager_id,
> referral_code/referred_by_id/referral_credits), verification/security
> state (email_verified_at, remember_token), account-deletion request
> state, and — critically — role_id, which could point at a privileged
> Role row (hasRole()/hasPermission() both consult the role_id
> relation, not just the `role` string column) even while `role` itself
> passes the allow-list below.

### `USER_SYNC_SELF_ALLOWED_FIELDS`

> users columns a SELF-edit sync push (recordId === currentUser->id) may
> ever set. Deliberately excludes role/store_id/is_active — a user must
> never be able to change their own role, store assignment or active
> status via sync, full stop (that's exactly the "cashier self-promotes
> to admin" exploit this allow-list closes). Sync bookkeeping fields
> (id/_version/_synced_at) and last_login_at are harmless passthrough
> the client always resends.

### `USER_SYNC_ASSIGNABLE_ROLES`

> Role slugs assignable to someone ELSE via sync, in ascending order of
> privilege, mirroring RolesAndPermissionsSeeder's store-level roles.
> super_admin/platform_admin/agent (platform-level) are never assignable
> via sync regardless of caller privilege. 'store_owner' is excluded
> here too — it's only ever reachable via the self-edit passthrough
> above (which now strips 'role' entirely), never assignable to
> another record via sync.

### `sanitizeUserSyncPayload`

> Privilege-limits a client-originated `users` sync payload for a
> non-super-admin caller (a super_admin's own push bypasses this, same
> as every other ownership check in this controller). True allow-list,
> not a deny-list: self-edits are capped to a narrow safe-fields set
> (see USER_SYNC_SELF_ALLOWED_FIELDS), and edits to someone else's row
> are rejected outright unless the caller holds manage_staff — matching
> StaffController's own gate — with any `role` value additionally
> capped so a caller can never grant a role with MORE permissions than
> their own current role holds (never lateral-or-up beyond what they
> themselves have).
>
> Throws (caught by push()'s per-change savepoint, reported in
> `failed`) rather than silently dropping/keeping a stale value, so a
> rejected privilege-escalation attempt gets clear signal instead of a
> payload that silently didn't do what it asked.

Above `return array_intersect_key($payload, array_flip(self::USER_SYNC_SELF_ALLOWED_FIELDS));`:

> Self-edit: allow-list down to the safe self-service fields
> only. role/store_id/is_active are never in this set, so they
> silently fall away here rather than reaching forceFill() —
> this also naturally handles the web staff table's "re-submits
> the owner's current role verbatim" case, since dropping the
> field just leaves the DB's existing value untouched.

Above `if (! $currentUser->hasPermission('manage_staff')) {`:

> Editing someone else's row (e.g. a staff device pulling the
> owner's profile down — pushing changes TO it is not a legitimate
> client flow at all): require manage_staff before permitting ANY
> field change, matching StaffController's own authorization.

### `sanitizePermissionGroupSyncPayload`

> Privilege-limits a client-originated `permission_groups` sync change
> end to end - not just the escalation check the name used to
> describe alone.
>
> Two rules apply to EVERYONE, including store_owner/admin/
> super_admin - these are structural invariants (spec's Global
> Constraints: default groups "can never be renamed or deleted, in
> the UI or at the data/sync layer"), not a privilege the owner can
> override:
>  - DELETE against a default group is rejected outright.
>  - DELETE against a group with an active staff member still
>    assigned is rejected (reassign first).
>  - UPDATE against an existing DEFAULT group strips `name`/
>    `is_default`/`based_on_role` from the payload - only its
>    checkbox set may change.
>
> The remaining rules bypass for store_owner/admin/super_admin, same
> as every other ownership check in this controller:
>  - INSERT/UPDATE granting a `permissions` key the caller doesn't
>    themselves hold is rejected (the escalation guard).
>  - Any mutation at all additionally requires the caller to hold
>    manage_roles_permissions - matching the client matrix UI's own
>    useHasPermission("manage_roles_permissions") gate. Without this,
>    a caller holding every permission they're trying to grant (so
>    the escalation check alone doesn't catch them) could still edit
>    a group they have no business touching.
>
> One deliberate exception to the escalation/manage_roles_permissions
> pair, checked before them: a genuinely new default group
> (`is_default: true`, `based_on_role` set, and no row already
> exists for that (store, role) pair) skips both. This is first-time
> seeding (ensurePermissionGroupsSeeded, client core.ts), which fires
> from ANY authenticated user's login on a fresh device - not just an
> owner's - and legitimately needs to create even the Admin default
> group despite the seeding user usually holding none of its
> permissions themselves. The `permissions` this bootstrap inserts
> come from a hardcoded client constant the UI gives the user no way
> to alter, and the (store, role) uniqueness check means this bypass
> only ever fires once per role per store; a repeat attempt is an
> ordinary UPDATE and goes through every rule above.

Above `if ($existing && ! in_array($existing->store_id, $allowedStoreIds, true)) {`:

> Ownership is authorized later (authorizeChangeTarget), but that
> check runs AFTER this method for the DELETE/UPDATE paths - so a
> cross-tenant request targeting another store's row must bail out
> here before any business-rule check fires, otherwise the specific
> rejection reason (e.g. "default groups cannot be deleted") leaks
> whether the victim's row is a default group, and masks the
> 'forbidden' reason the later ownership check is supposed to give.

Above `$ownGroup = $currentUser->permission_group_id`:

> The caller's OWN granted permissions, per the NEW store-scoped
> permission_groups system (a hardcoded catalog key like
> "manage_roles_permissions" here, not a row in the platform-level
> roles/permissions tables User::hasPermission() checks - those
> are a deliberately separate system per the feature's spec, see
> docs/superpowers/specs/2026-09-27-roles-and-permissions-design.md).

### `(class)`

> roleIsAtOrBelowCallerPrivilege() now lives on the shared
> EnforcesStaffOwnership trait (used above), so the REST staff
> endpoints (StaffController) and this sync-push path can't drift
> apart on what counts as a privilege escalation.

## `PushPayloadNormalizer`

`laravel-server/app/Services/Sync/PushPayloadNormalizer.php`

### `normalizePushPayload`

> Client-schema -> server-schema payload normalization for one pushed
> change: per-table column renames, required-field backfills and the
> store_id/user_id injection every table group needs before the row is
> written. Purely a transformation of $payload (returned, not mutated
> in place) with one deliberate exception: it THROWS when an INSERT
> payload names a store_id outside the caller's allowed stores, which
> push()'s per-change savepoint turns into a single failed change
> reported as `permission_denied`.
> Every rule below is lifted verbatim from push()'s inline pipeline —
> see the individual comments for the incident each one came from.

Above `if ($change['table_name'] === 'users' && $currentUser && ! $isSuperAdmin) {`:

> Privilege-limit a client-originated `users` payload BEFORE any of
> the backfill logic below runs, so a stripped/rejected role can't
> still influence e.g. the store_id backfill just underneath. See
> sanitizeUserSyncPayload()'s own doc comment for what this closes.

Above `if ($change['table_name'] === 'sales' && isset($payload['user_id'])) {`:

> Map user_id to cashier_id for sales table coming from client

Above `if ($change['table_name'] === 'purchase_orders') {`:

> Map vendor_id to supplier_id for purchase orders

Above `if ($change['table_name'] === 'purchase_order_items') {`:

> Map purchase_order_items fields

Above `if (isset($payload['quantity_received'])) {`:

> quantity_received is scaled by the same factor as
> quantity_ordered so the "received <= ordered" invariant
> holds server-side too; a partial-receipt update carries it
> without bulk_quantity, in which case it's already comparable
> to whatever quantity_ordered this row was stored with.

Above `if ($change['table_name'] === 'users') {`:

> Handle user specific mappings

Above `unset($payload['name']);`:

> users has no `name` column (only first_name/last_name) - leaving
> the raw key in the payload after deriving from it fails the
> INSERT/UPDATE with an unknown-column error.

Above `if ($change['table_name'] === 'feedback' && $currentUser && ! $isSuperAdmin) {`:

> `feedback` is the one synced table whose ownership is user_id and
> ONLY user_id (no store_id column, and it isn't in pull()'s table
> list either — it's push-only telemetry/support tickets). It was
> absent from both normalization lists, so whatever the client put in
> user_id was stored verbatim: in practice the literal "anonymous"
> the crash logger writes when no user is in localStorage, or a
> previous account's id after a store/account switch. The row inserts
> fine (push()'s INSERT branch has no ownership check) and is then
> permanently rejected 'forbidden' on every subsequent push, because
> push() turns an INSERT for an already-existing id into an UPDATE,
> which authorizeChangeTarget() does check. Stamp it to the caller
> instead, matching the store_id backfill convention a few lines
> below — but only when it names nobody the caller may write for, so
> a colleague's genuine ticket keeps its author.

Above `$tablesWithUserId = [`:

> Inject user_id for core tables if missing

Above `if ($change['table_name'] === 'stores') {`:

> Inject device_id for stores if missing. device_id is NOT NULL +
> UNIQUE; a shared literal fallback ('web-client' for every browser
> session with no X-Device-Id header) collides the instant a second
> store hits this same path, permanently failing that store's every
> sync (confirmed in production via a stuck-sync-item Sentry alert).
> Derived from the change's own (already-unique) record_id instead,
> so it can never collide and stays stable across retries.
> (Nested inside the $tablesWithUserId branch exactly as it was
> inline in push(); 'stores' is a member of that list, so the
> nesting is behaviourally equivalent to a top-level check.)

Above `if (in_array($change['table_name'], self::STORE_ID_BACKFILL_TABLES, true)) {`:

> Deliberately NOT gated on $currentStoreId: a caller for whom
> resolvePushStoreId() returns null (an account that owns no store
> yet) has nothing to backfill from, but their payload's explicit
> store_id must still be verified rather than trusted verbatim.

Above `if ($this->ownership->storeBelongsToTenantOwner($payload['store_id'], $ownerId)) {`:

> An explicit store_id in the payload is otherwise
> trusted as-is (only a MISSING one gets backfilled
> above) — without this check, a caller could plant
> rows directly into a store they don't own via
> INSERT, the mirror image of the UPDATE/DELETE
> ownership gap this same fix closes below.

Above `if ($change['table_name'] === 'stock_movements' && empty($payload['performed_by']) && $currentUser) {`:

> stock_movements.performed_by is a required FK on the cloud
> DB with no default, but createSale() on the client never
> set it, so every sale-triggered movement has been failing
> this INSERT and sitting stuck in _sync_queue. Fixed
> client-side too, but this backfills already-queued rows
> from devices that haven't picked up that fix yet.

Above `if ($change['table_name'] === 'products') {`:

> Prevent NULL constraint violations for products

Above `if ($change['table_name'] === 'suppliers') {`:

> Prevent NULL constraint violations for suppliers/vendors

On `$payload['payment_terms'] = 30;`:

> Default fallback

Above `if ($change['table_name'] === 'audit_logs') {`:

> Handle audit_logs specific mappings

Above `if (`:

> The client always sends a user_id (whoever was locally
> logged in when the action happened), but that id might
> not exist server-side: a local-only/offline-created
> account, or one since deleted. activity_logs.user_id
> has an ON DELETE CASCADE foreign key, so an unknown id
> isn't just wrong, it fails the insert entirely and (since
> the whole push runs in one transaction) rolls back every
> other change in the same batch along with it. Fall back
> to the authenticated user making this sync request
> whenever the client's id doesn't actually exist, not
> only when it's missing.
> withTrashed: User uses SoftDeletes, so the default scope made a
> soft-deleted actor fail exists() and the row was rewritten to the
> sync token's owner — typically the store owner. The FK accepts a
> trashed id (the users row still exists), and keeping the client's
> id is more truthful than substituting whoever happened to push.
> Matters most for an on-till admin repair: see docs/FIXED_BUGS.md
> A-201.

### `STORE_SYNC_FORBIDDEN_FIELDS`

> stores columns a device may never write over sync, in three groups:
> the ones that decide where a storefront sale's money settles plus the
> fee-propagation flag that drives it (only
> StorePaymentAccountController::createPaymentAccount() — bank
> resolution, 409 idempotency, last-4-only persistence — and
> SyncSubaccountFeeRates may write those); the account-state columns,
> which only AdminStoreService may write (a store that could push its own
> `status` could lift an admin's suspension, and `is_demo` moves it in
> and out of the admin panel's demo filtering); and the server's own
> bookkeeping/seeding watermarks. push() applies a stores payload with
> forceFill(), which bypasses $fillable, so excluding them there is not
> enough. See laravel-server/AGENTS.md.

### `STORE_ID_BACKFILL_TABLES`

> Tables whose own `store_id` column normalizePushPayload() may backfill
> from the push's active store when a NEW row's payload omits it. Read by
> push() too, so its INSERT-overridden-to-UPDATE branch can undo a
> backfill that the override invalidated. Deliberately a separate list
> from resolveChangeStoreId()'s $directStoreTables and the user_id
> backfill list — see laravel-server/AGENTS.md and docs/KNOWN_BUGS.md.
