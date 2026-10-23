# client/lib Migrated Comments

Architectural rationale and workaround explanations migrated out of inline comments in `client/lib`, per the anti-multiline-comment rule in `.agents/AGENTS.md` §3. Each section corresponds to a `// Rationale:` pointer left at the original code location.

## active-currency-L1

`client/lib/active-currency.ts:1`

The active store's currency, held at module level so the money formatters
in lib/utils.ts can default to it.

Every `formatCurrency(amount)` call that omits a code used to render naira
no matter what the store was set to - 77 of the app's ~147 call sites,
which is how a Cameroonian (XAF) store saw "N40,000" in a procurement
confirmation. Passing the code down to all of them is both a large diff
and a rule nothing enforces, so the default itself now follows the store.

Same shape as getActiveStoreId()/getCurrentUserId() in lib/db/core.ts, and
the same caveat: before StoreContext resolves the profile this is null and
the formatters fall back to NGN, so a screen rendering money in the first
moments after boot can still flash the wrong symbol. Anything whose
correctness depends on the currency (receipts, exports, PDFs) should keep
passing `storeProfile.currency` explicitly rather than relying on this.

## api-client-L10

`client/lib/api/client.ts:10`

The device/store/actor stamp every sync call carries. X-Acting-User-Id is
the locally signed-in user, which is the only place that fact exists: a
staff PIN login never mints its own API token, so the bearer always names
the account that linked the device. Self-asserted, and the server treats it
as visibility only - see A-202 and laravel-server/AGENTS.md.

X-App-Version/X-Build-Sha name the bundle, and are visibility only too:
nothing on the server gates on them. The only reader is the reconciliation
activity log's `app_version` property (`SyncController.php`), and Health
Sync is refused unconditionally by `config('dumos.health_sync_enabled')`,
not by any version floor. A version gate was considered for A-213 and
discarded - see docs/FIXED_BUGS.md A-213. Do not write code that leans on
one existing.

## api-token-manager-L11

`client/lib/api/token-manager.ts:11`

"refreshed": got a new token, safe to retry the original request.
"confirmed-invalid": the server gave a definitive 401/403 - the token is
actually dead (already cleared by the time this returns).
"unconfirmed": couldn't reach the server, or got some other status
(timeout, network error, captive portal, transient 5xx) - NOT evidence
the token is invalid; the existing token is left untouched. Callers must
not treat "didn't get a new token" as equivalent to "confirmed-invalid" -
that conflation previously caused base-client.ts to clear a perfectly
good token on a connectivity hiccup, silently and permanently unlinking
the device from cloud sync. See docs/FIXED_BUGS.md.

## constants-settings-tabs-L49

`client/lib/constants/settings-tabs.ts:49`

The Store & Settings permission key each settings tab requires, replacing
the one coarse `isAdmin` gate that used to cover all of them. The map is
the single source of truth for the desktop tab rail, the mobile menu list
and use-settings' URL resolution, so a tab can never be reachable by
typing `/settings/<tab>` after its trigger has been hidden.

Tabs deliberately absent keep the `isAdmin` fallback: `personal-info` has
no key in the catalog, `product-units` / `categories` belong to Inventory
& Stock, `staff` / `roles` to Staff & Groups, and `danger-zone` already
enforces `factory_reset` inside the panel itself.

## context-auth-context-tsx-L659

`client/lib/context/auth-context.tsx:659`

Bootstraps a local session for a user who authenticated on the cloud side
and arrived here via the one-time handoff code (/auth/callback); most
importantly the impersonated store user, who has no account (and no PIN)
in this device's local SQLite DB at all.

Deliberately does only the *session-establishing* half of login(): it does
NOT call setDbUser() (that moves the local DB's "current user" pointer,
which is the wrong DB context for a user belonging to another store), does
NOT touch dumos_recent_users (would pollute this device's lock-screen
account tiles with foreign-store staff), and does NOT logAction() (would
write into the wrong store's local audit trail (the impersonation itself
is already audited server-side by AdminService::impersonateStore).

## context-store-context-tsx-L115

`client/lib/context/store-context.tsx:115`

True for the duration of switchStore()'s async work (cancel + clear).
Consumers (LicenseGuard) show a splash for that window so nothing ever
paints mid-transition: `children` (and every query observer inside it)
unmounts the instant this flips true, and remounts once it flips back,
by which point queryClient.clear() below has already emptied the
cache, so the remount finds no data to render for any query - store-
scoped or not - rather than something stale.

(An earlier version of this used invalidateQueries() instead of
clear(), on the theory that a background refetch would land before the
splash cleared. It didn't: invalidateQueries()'s default
`refetchType: 'active'` only refetches queries with a mounted
observer, and unmounting `children` synchronously - before the awaited
invalidate call even runs - leaves zero active observers to refetch.
The "round trip" resolved almost instantly without doing any real
work, and the first render after remount read the previous store's
data straight out of cache. clear() has no such gap: it doesn't depend
on anything being mounted to do its job.)

## db-audit-actions-L23

`client/lib/db/audit-actions.ts:23`

Actions eligible for logAction()'s occurrence-count coalescing (see
core.ts): a REPEATED, machine-generated event for the same (action,
table, record_id) - a bug/failure that keeps re-firing - collapses into
one row with a growing `occurrence_count` instead of a fresh audit_logs
row (and a fresh sync-queue INSERT) every single time. Deliberately NOT
applied to every action: a genuine user action (a sale, a PIN change, a
stock adjustment) must stay one row per real-world occurrence, since
that's exactly what the Activity Log exists to show.

LOGIN_FAILED is the one case already in this codebase that fires
unboundedly for the same identifier (repeated PIN mistakes, or a
brute-force attempt) - the shape this was written for. Add a new action
here only if it's genuinely the same kind of "the same failure keeps
re-happening," not a real distinct event that happens to repeat.

## db-base-helpers-L62

`client/lib/db/base-helpers.ts:62`

Enforces per-row store ownership before update()/softDelete()/remove()
mutate a STORE_SCOPED_TABLES row, closing the cross-tenant write gap
described in docs/features/_known-bugs.md item #8: without this, any
store could edit or delete any other store's row (or a shared legacy row
forever) simply by knowing its id, since every read-side
`WHERE store_id = ?` filter is a pure UI-level convenience with nothing
enforcing it on the write path.

Three outcomes, matching the controller's ruling exactly:
 - row.store_id === activeStoreId → allowed, `{ needsClaim: false }`.
 - row.store_id is NULL (pre-migration legacy row, see
   backfillStoreIdOnLegacyRows in core.ts) → allowed, with
   `{ needsClaim: true, activeStoreId }` telling update()/softDelete()
   to claim it for the active store as part of their own write, so a
   second store touching it later hits the reject branch instead of
   clobbering it forever. remove() ignores `needsClaim`: it's a hard,
   unrecoverable DELETE, so claiming the row first only to destroy it in
   the very next statement protects nothing — there's no row left
   afterward for the claim to matter to. The delete is simply allowed
   outright.
 - row.store_id is a different, known store → rejected with a thrown
   Error, not a silent no-op, so a caller that ignores the failure can't
   mistake it for success.

This function used to perform the claim UPDATE itself, as its own bare
(non-transactional) statement, before the caller's write transaction even
started. A crash between the two committed the claim but lost the
caller's actual edit — and left the row claimed by this store, so a
SECOND store later touching the same row was then rejected as belonging
to someone else, even though nothing had visibly changed from that
store's perspective. It now only reports whether a claim is needed;
update()/softDelete() apply it as the first statement inside their own
transaction, so the claim and the edit can only ever commit or roll back
together.

Deliberately fails OPEN (does nothing, `{ needsClaim: false }`) when
getActiveStoreId() is null/undefined — early app boot, or another edge
case where the active store genuinely isn't known yet — matching
insert()'s existing "only auto-scope when storeId is truthy" behavior, so
this never blocks a legitimate write purely because store resolution
hasn't happened yet. This is a narrow allowance, not a general bypass: it
only fires when the *local* module-scope resolver has nothing set, which
is not something a caller can trigger from outside this process.

`overrideStoreId`, when passed, is checked against instead of the global
resolver — for the one real system-level caller found to need cross-store
write access (stock-transfers.ts's transferStock(), which legitimately
writes rows in two different stores within one transaction). Everything
else keeps relying on the global as before; this is deliberately narrow,
not a general bypass callers reach for out of convenience.

## db-base-helpers-L622

`client/lib/db/base-helpers.ts:622`

Handles a stuck `feedback` item without writing another `feedback` row.

Reporting it through logCrash() would create a new crash row describing the
old one's failure, embedding the failed row's own content, which then fails
the same way — an unbounded self-feeding loop (docs/FIXED_BUGS.md,
SF-CRASH-1). Crash rows are also already delivered to Sentry and to
`/logs/client-error` the moment they are captured, so a crash row that the
server has rejected five times is retried forever for no benefit: it is
dropped from the queue and settled, the same way a terminal conflict is
(see markConflictSettled), so requeueOrphanedRows() cannot resurrect it.
Genuine user-submitted feedback keeps its normal retry behaviour.

## db-base-helpers-L667

`client/lib/db/base-helpers.ts:667`

Records a sync failure with exponential backoff so a permanently-bad item
stops being retried every cycle and blocking the rest of the queue. Once
retry_count crosses the report threshold, logs to superadmins exactly once
(via the feedback table) instead of on every subsequent retry.

`reportImmediately` is for failures that are already known to be permanent
(e.g. a payload that fails client-side validation before ever reaching the
server) rather than possibly-transient (a network blip, a momentary server
error). Those would otherwise wait out the same 5-retry threshold as a
transient failure even though retrying can never fix them, silently
delaying remote visibility by up to ~waiting through 5 backoff cycles.

## db-batch-quantity-L43

`client/lib/db/batch-quantity.ts:43`

What a batch's `quantity` should hold now that its log has changed, read
from the log this device already has. `incrementalDelta` is only consulted
for a batch holding more than its inbound movements account for — stock that
was never logged (A-148), which a rebuild would write off. A-215's form of
the test: `stored > total inbound`, never `no inbound movements`, because one
adjustment logged against a legacy batch must not take it out of the
carve-out.

Returns null when this device has no such batch; the recompute that runs
when the batch arrives picks the movements up.

## db-batch-quantity-L114

`client/lib/db/batch-quantity.ts:114`

Batches whose movement log sums below zero — more went out than the log can
account for going in. The deficit is what the next inbound movement pays off
before it adds anything, which is why a cycle count on one of these reads as
having done nothing (A-265).

Read from the log rather than from a movement's reason text: the alert this
replaced matched the word "oversold" in free text inside a 30-day window, so
it reported the event and never the outstanding shortfall (A-212).

A carve-out batch is excluded even when its log sums below zero: the units it
sold were on the shelf, they were just never written down (A-148), so nothing
is owed and an inbound movement is not absorbed. The set reported here is
exactly the set `resolveBatchQuantity()` would rebuild to 0.

## db-core-L599

`client/lib/db/core.ts:599`

Runs `fn` inside a real SQL transaction so a multi-statement operation
either fully applies or fully rolls back. Every write inside `fn` must go
through query()/execute() (and so insert()/update()/etc.) against the same
`db` handle to participate in it.

Do NOT call this from inside another transaction()'s `fn`: it deadlocks by
design. If BEGIN itself fails, `fn` runs without atomicity rather than
being blocked. See client/AGENTS.md, "One connection, one writer", for
both, including the vendored Tauri plugin's `.max_connections(1)` cap.

## db-core-L696

`client/lib/db/core.ts:696`

Overwrites the current database with provided binary data: sql.js (web)
only — on desktop/mobile use restoreDatabaseFromFile(), or `db` is
silently disconnected from the file Tauri manages. Returns whether the
pre-restore snapshot succeeded, so the caller can warn that
restorePreRestoreSnapshot() will not be available. Also runs the
cold-start schema pass (SCHEMA_SQL + runSchemaMigrations) against the
restored database before persisting it, so a backup taken on an older
app version comes up on the current schema immediately. See
client/AGENTS.md, "Backup, restore, wipes and diagnostics".

## db-crash-report-sync-L3

`client/lib/db/crash-report-sync.ts:3`

Automatic crash reports (error-logger.ts's logCrash/flushPendingCrashes)
are written into the same `feedback` table as user-submitted feedback, and
are queued for sync like any other row. They are background telemetry
though, so they are deliberately invisible to the two places that speak to
the user about pending work: the "X changes unsynced" count and the
instant-sync trigger. See docs/SYNC_CRASH_REPORT_POLICY.md.

Both of those checks live here so they can never drift apart, and so they
keep matching reportStuckCrashLog()'s definition of a crash report in
base-helpers.ts: type 'bug' with a non-null fingerprint. User-submitted
feedback never carries a fingerprint, including a user-typed bug report.

## db-deterministic-id-L1

`client/lib/db/deterministic-id.ts:1`

Deterministic, UUID-shaped ids.

Most rows get a random `generateId()`, which is right when the row is a
genuinely new event. It is wrong when two devices can independently
perform the *same* real-world event: two random ids make one event look
like two, and the server — which resolves conflicts per row — has nothing
to collide them against, so both are accepted.

Deriving the id from what makes the event unique instead means the second
device's row arrives carrying the first device's id. `SyncController::push`
already turns an INSERT whose id exists into an UPDATE, so the duplicate
collapses onto the original rather than doubling it, with no new
server-side idempotency machinery to keep in step with the client.

The output is formatted as a v5 UUID (version nibble 5, RFC 4122 variant)
so it satisfies every UUID shape check in this codebase and is
indistinguishable from a random id anywhere it is stored or displayed.
The digest is four independently salted 32-bit FNV-1a passes rather than a
real SHA-1: `crypto.subtle` is async and unavailable outside a secure
context, and both callers here need a synchronous value inside a
transaction.

## db-deterministic-id-L57

`client/lib/db/deterministic-id.ts:57`

The stock batch a receipt against one purchase-order line creates.

Keyed on the line plus the quantity already received against it, which is
exactly "which receipt of this line is this": two devices booking the same
delivery both see the same prior balance and derive the same id, so the
second collapses onto the first server-side instead of doubling the stock.
A genuine *later* partial receipt starts from a different balance and so
gets a different id, as it should.

## db-movement-types-L1

`client/lib/db/movement-types.ts:1`

The movement type the server writes when it adopts this device's own
stock_batches.quantity (POST /app/sync/reconcile-quantities). It is a
real, permanent record of a sync correction — not a stock event — so the
owner-facing movement lists and the stock-value summaries deliberately
exclude it. pull.ts replays it like any other movement on every device
except the one that originated it, which seeds its own copy as
already-synced (`storeReconciliationMovementLocally`) so its pull takes the
UPDATE branch. See client/AGENTS.md, "Stock quantity reconciliation".

## db-procurement-receiving-L1

`client/lib/db/procurement-receiving.ts:1`

Purchase Order Receiving

Split out from procurement.ts (which keeps PO/supplier CRUD): everything
here is specifically about turning an order into real stock — creating
stock_batches/stock_movements rows and marking the order received, for
both a Standard PO (receivePurchaseOrder, after createPurchaseOrder) and
an Immediate Purchase (createAndReceivePurchaseOrder, order + receipt in
one atomic step).

## db-procurement-L156

`client/lib/db/procurement.ts:156`

Loads every purchase order, not a page of them: the caller runs search/filter
over the result, and this data set is small enough (dozens to low hundreds per
store) that in-memory filtering stays correct without needing SQL-level WHERE
clauses, matching the pattern used by getCustomers()/getDebtors() etc.

@param viewerId - when provided, restricts results to orders placed by this
user (pass undefined for viewers allowed to see everyone's activity, i.e.
checkCanViewAllActivity(role) === true).

## db-queries-auth-L6

`client/lib/db/queries/auth.ts:6`

Deliberately NOT scoped to the currently-active store. On a multi-store
device (an owner/admin who has synced staff from more than one store) the
product decision is "authenticate first, then follow the account": a
successful login by a store-pinned user makes THEIR store the active one
(see auth-context.tsx's login()), rather than the previously-selected
store filtering who is allowed to log in. Scoping this query instead
would lock a cashier out of a device whose switcher happens to be
pointing at a sibling store.

Known limit: usernames are unique per store, not globally -
`UNIQUE(store_id, username)` in schema.ts, matching the server's
2026_08_01_000001_scope_username_uniqueness_to_store migration - so on a
multi-store device two rows can legitimately share a username. Returns
EVERY matching row (not just the first) precisely so a caller can detect
that ambiguity — see getUserByUsernameOrEmail below for the single-row
convenience wrapper, and auth-context.tsx's login() for how it uses this
to fail closed instead of silently picking one on a genuine collision
(same username AND the same PIN at two of this device's stores).

## db-queries-auth-L99

`client/lib/db/queries/auth.ts:99`

The lazy half of the plaintext-PIN migration: called right after a
successful login that matched a LEGACY plaintext `users.pin`, it rewrites
that row's PIN as a bcrypt hash of the very PIN just verified.

Deliberately never throws - the login it follows has already succeeded,
and a failed rewrite only means this row stays plaintext until the next
login tries again. Nothing user-visible happens either way: no forced
reset, no prompt.

## db-queries-categories-L11

`client/lib/db/queries/categories.ts:11`

All active categories, flat: matches how her current tool (Moniebook)
models categories, and avoids the cognitive overhead of a parent/child
tree for a business this size. A `parent_id` column exists on the table
(kept for potential future use) but nothing here reads or writes it.

Store-scoped like the rest of the domain tables (see customers.ts /
products.ts for the same pattern), with one deliberate difference: rows
with a NULL store_id (categories created before store_id existed on this
table, or left unbackfilled) stay visible to every store rather than
being filtered out, so a device that already has real data doesn't
suddenly lose access to categories it was using. New categories always
get a store_id (see createCategory), so NULL rows only ever come from
pre-fix history, not from an ongoing gap.

## db-queries-customers-L53

`client/lib/db/queries/customers.ts:53`

Combined feed of every customer's transactions store-wide: grows the same way
stock_movements does (a row per sale), so `sinceDays` bounds the default recent
view. Omit it for full history, which the caller should only do when the user
is actively searching or filtering to a specific customer, so those still
match against every record, not just what's been loaded for browsing.

`from`/`to` (YYYY-MM-DD) take precedence over `sinceDays` when both are passed:
an explicit date-range pick from the UI overrides the relative window.

## db-queries-customers-L270

`client/lib/db/queries/customers.ts:270`

Purchase-engagement metrics over the trailing 30 days, restricted to sales
that carry a customer_id (walk-in/anonymous sales are excluded from every
numerator and denominator here).

The returned field names are historical; what they actually measure is:
 - `retentionRate`: customers with more than one sale inside the 30-day
   window / customers with at least one sale inside it, as a percentage.
   This is a repeat-purchase rate *within a single window* - it says nothing
   about retention of a prior cohort or of the store's customer base, so the
   UI labels it "Repeat Purchase Rate" (same resolution as the dashboard
   tile in lib/hooks/use-bi-data.ts). Computing true retention would need a
   cohort/baseline definition this app does not have, so the calculation is
   deliberately left as-is and only described accurately.
 - `avgVisits`: sales in the window / customers who bought in the window,
   i.e. visits per *buying* customer over ~one month. Not per registered
   customer, and not store-wide visits - hence "Avg Visits/Customer".
 - `avgTransactionValue`: net revenue (refunds deducted) / sales in the
   window.

## db-queries-finance-L63

`client/lib/db/queries/finance.ts:63`

Cost value of the stock written off as damaged or lost in a [from, to]
window: SUM(|quantity| * unit_cost) over the `adjustment` movements whose
reason is one of STOCK_LOSS_REASON_LABELS.

`to` is INCLUSIVE, matching {@link getSmoothedExpensesTotal} and every
getBIMetrics query this sits alongside (rather than the [from, to) window
getCurrentMonthRevenue/getCurrentMonthCOGS take). Reasons are persisted as
the form's labels, optionally followed by a free-text note, so each label is
matched either exactly or as that note's prefix. Rationale and the reason
this figure is reported beside the P&L rather than inside it:
docs/STOCK_LOSS_METRIC.md.

## db-queries-finance-L105

`client/lib/db/queries/finance.ts:105`

How much of a single expense counts toward a [windowStart, windowEnd)
period. A plain expense counts in full if its date falls in the window.
A "prepaid" expense (`covers_months` set) is never counted as a lump sum
in whichever single period it was logged; it's split into
`covers_months` equal calendar-month installments starting from its own
date, and only the installments whose calendar month overlaps the window
are counted. A ₦270,000 rent payment logged in January with
covers_months=12 contributes ₦22,500 to January's total, ₦22,500 to
February's, and so on through December; never the full ₦270,000 to any
single period. Pure/synchronous so it works equally on a DB row or an
already-loaded in-memory `Expense`, without a second query.

## db-queries-inventory-L110

`client/lib/db/queries/inventory.ts:110`

Same as getBatchesForProduct but without the `quantity > 0` filter — used
where the caller needs to know "does this product have an existing,
genuinely sellable batch to attach to" rather than "which batches can I
pick stock from right now" (FEFO sale/deduction paths correctly want the
filtered version; see submitStockAudit's restock branch below for why the
unfiltered-on-quantity version matters there). Despite the name, this
previously filtered only `_deleted = 0` — not `is_active = 1` or expiry —
which let a stock audit's "found extra stock" branch write found units
into an already-expired or deactivated batch, where they become
permanently unsellable (the FEFO sale path excludes such batches) while
still counting toward on-hand quantity/valuation. It also ordered by
`expiry_date ASC` alone, and SQLite sorts NULL first under ASC, so a
batch with no expiry date (common for non-perishables) would be picked
ahead of one actually expiring soon. Both are fixed to match
getBatchesForProduct's filtering/ordering convention.

## db-queries-inventory-L137

`client/lib/db/queries/inventory.ts:137`

Fallback for sale processing: getBatchesForProduct's `quantity > 0` filter
is correct for FEFO picking, but if the product's true stock has already
been fully depleted (e.g. a stale on-screen stock count let the cashier
add one more unit than actually exists), that filter returns an empty
list. Callers that only consult getBatchesForProduct then skip the whole
stock_batches/stock_movements write for that line item — the sale still
completes and is recorded as revenue, but the unit sold leaves no trace in
the stock ledger at all (see use-pos-payment.ts's handlePayment). This
returns the single most-recently-touched active batch regardless of its
quantity, so that deduction can still be attributed and logged (batch and
on-hand stock going negative, same way an already-negative batch does
today) instead of vanishing untracked.

## db-queries-inventory-L429

`client/lib/db/queries/inventory.ts:429`

Products carrying an oversell shortfall, biggest first, for the dashboard
action centre and the stock-batch alerts. Derived from the movement log via
getBatchDeficits(): a product appears while its ledger is actually short,
and stops appearing once the shortfall is cleared. Previously matched the
word "oversold" in a movement's reason inside a 30-day window, which
reported the event rather than the outstanding deficit and went quiet after
a month whether or not anything had been reconciled (A-212).

Silent until this device's movement log is complete, the same condition the
counting screen uses: mid-catch-up, a batch's sales can arrive pages before
the receipt that covers them, and "Reconcile Now" against a deficit the next
page explains sends staff to count a shelf that is fine.

## db-queries-inventory-L558

`client/lib/db/queries/inventory.ts:558`

Finds a genuinely active, non-expired batch to land newly-found or
restored stock into, or creates one if none exists. Shared by
submitStockAudit's "found extra stock" branch and
restoreReturnedStock's no-recorded-batch fallback (see returns.ts) so
neither writes stock into an expired/deactivated batch — where it would
be permanently unsellable (the FEFO sale path excludes such batches)
while still counting toward on-hand quantity/valuation — nor leaves the
write untracked. The new batch (when one has to be created) is valued at
`unitCost` and scoped to the product's own store_id, not whatever store
happens to be active on this device.

## db-queries-inventory-L641

`client/lib/db/queries/inventory.ts:641`

Persists a completed cycle count: for each product whose counted quantity
and/or counted cost/selling price differs from what's on record, records a
reconciled stock_audits entry capturing every deviation. Quantity
differences are applied to stock_batches (FEFO: soonest-expiring batch
first, same convention as sale consumption/returns) with a matching
stock_movements("adjustment") entry; a corrected cost price is applied to
the product's active batches (cost is a per-batch acquisition cost, but an
audit-time correction is a master-data fix, not a new purchase); a
corrected selling price is applied to products.selling_price (the single
source of truth for selling price, unlike cost).

## db-queries-loyalty-L129

`client/lib/db/queries/loyalty.ts:129`

Seeds the app's default tiers/redemption options as real, editable rows the
first time settings are opened on a store that has never customized them;
keeps existing stores' behavior unchanged until they actually edit something.

Gated on `stores.loyalty_defaults_seeded_at` rather than "are there zero
tiers/options right now" — that count-based check couldn't tell "never
seeded" apart from "a store deliberately deleted every tier," so it
silently reseeded a store that had cleared its tiers on purpose every time
the settings dialog was reopened. Once this flag is set, seeding never
runs again for that store, even if it later has zero tiers. A store
upgrading from before this flag existed still gets exactly one more
grandfather seed-or-skip decision (zero tiers seeds once more, any tiers
present just sets the flag) — an accepted, one-time transition edge case.

## db-queries-permission-groups-L10

`client/lib/db/queries/permission-groups.ts:10`

Deterministic, UUID-shaped id derived from (storeId, role) - NOT random,
unlike generateId(). Two devices seeding the same store's default groups
independently, before either has synced (seeding fires from
auth-context on login, with no guarantee a sync round-trip has
happened yet), would otherwise mint different ids for "the same"
default group - permanently divergent Manager/Specialist/... rows, one
per device, with staff split across them. Deriving the id instead means
both devices compute the SAME id, so when their INSERTs eventually
reach the server, the sync engine's existing "INSERT against an
already-existing id becomes an UPDATE" handling (SyncController::push)
collapses the race into one row per role, not a duplicate.

Not cryptographic - four independent FNV-1a-style 32-bit lanes over the
same seed give 128 bits of spread from one pass, comfortably enough to
avoid collisions across the tiny (store, role) space this app actually
has (one store, 5 roles).

## db-queries-permission-groups-L42

`client/lib/db/queries/permission-groups.ts:42`

Seeds the 5 default permission groups (Manager, Specialist, Sales Staff,
Auditor, Admin) the first time this feature touches a store, exactly
mirroring ensureLoyaltyDefaultsSeeded's gate-on-timestamp pattern (see
lib/db/queries/loyalty.ts) - gated on stores.permission_groups_seeded_at
rather than "zero groups exist right now", so a store that deliberately
deletes a custom group (or, in principle, all groups) never gets
silently reseeded. Also backfills every existing staff member's
permission_group_id to the default group matching their current role,
in the same pass - without this, editing a default group's checkboxes
changes nothing for any staff member who existed before this feature
shipped, since they'd have no group assigned at all.

## db-queries-permission-groups-L139

`client/lib/db/queries/permission-groups.ts:139`

Brings an ALREADY-seeded store's default groups forward to the current
catalog. ensurePermissionGroupsSeeded() only ever runs once per store, so
without this a store seeded under an older catalog is frozen on the
permission lists that catalog shipped with - which is how the live
production store's cashiers would have lost Hold Sale, Recent Sales,
receipt reprinting, the reseller price override and the customer balance
block the moment enforcement landed.

Add-only, delta-scoped and idempotent by construction: it unions in the
keys listed for each role under every catalog version newer than the
store's stamp, never removes anything, and writes a group only when its
stored array actually changes. See client/AGENTS.md's "Catalog versioning
and the default-group backfill" for the race-resolution design the
write-only-on-change rule and the stamp-last ordering belong to.

## db-queries-product-import-L8

`client/lib/db/queries/product-import.ts:8`

Groups row indexes that would collide on import. findExistingProductId()
only trusts a barcode when it actually hits an existing DB row — when it
doesn't, that row falls through to a name+category lookup instead. So a
barcode-only (or name+category-only) key can't predict every real
collision: two rows sharing a barcode that doesn't exist in the DB yet
would only be caught by name+category, and two rows sharing a barcode
that DOES exist would only be caught by the barcode key. Both keys are
computed and unioned (not a single fallback key) so a row is flagged as a
duplicate if it collides under EITHER one. The barcode key is compared
exact/case-sensitive (only trimmed) to match findExistingProductId()'s
`barcode = ?` lookup, which has no COLLATE NOCASE.

## db-queries-product-import-L139

`client/lib/db/queries/product-import.ts:139`

Upserts every row inside a single transaction. Matched products only have
their fields updated — existing stock_batches are never touched by
default, so re-running the same import twice can't double-count quantity
(see docs/superpowers/specs/2026-08-31-stock-import-export-design.md).
Passing `updateStockForMatched: true` opts into applying the file's
quantity to matched products too, as a proper stock-audit adjustment
(logged in Stock Movements) rather than silently rewriting stock_batches —
for the deliberate "re-sync my counts from this file" case, distinct from
the accidental-re-import case the default protects against.

## db-queries-product-visibility-L3

`client/lib/db/queries/product-visibility.ts:3`

Bulk publish/unpublish for the online storefront. `products.show_online`
defaults off and the only other way to change it is the per-product switch in
the add/edit dialog, so a store that imported hundreds of products and then
enabled its online store had an empty storefront and no way out but opening
every dialog (see docs/STOREFRONT_REVIEW.md, feature #7).

`productIds` is the catalog table's currently-filtered set, matching the
export toolbar's convention of acting on what's on screen; undefined means
the whole store. Rows already in the target state are skipped so this doesn't
queue a no-op sync push per product.

@returns how many products actually changed

## db-queries-reports-L42

`client/lib/db/queries/reports.ts:42`

Expenses per calendar month for a report window, SMOOTHED the same way
getSmoothedExpensesTotal/getCurrentMonthExpensesByCategory smooth them:
a prepaid expense (`covers_months` set) is recognised as equal calendar-
month installments from its own date rather than as a lump sum in the
single month it happened to be logged. A raw SUM(amount) per month (what
the P&L and the monthly analytics chart both used to do) disagreed with
the BI dashboard's expense figure - which already smooths - for the same
period, and made a month that merely happened to contain the annual rent
payment look catastrophically unprofitable.

Reuses getSmoothedAmountInWindow() per installment rather than
reimplementing the proration, so the two can't drift apart. Each
installment's window is its own calendar month, CLIPPED to the report
range, so a range that only partially covers a month recognises only that
fraction of the installment.

The returned map's keys are every month with any expense activity in the
window, including months whose only activity is an installment of an
expense logged long before the window - so a caller building a monthly
report can union these months with its revenue months and never drop an
expense-only month.

## db-queries-reports-L454

`client/lib/db/queries/reports.ts:454`

@param dateFilter - inclusive lower bound of the selected period.
@param prevDateFilter - lower bound of the previous-period comparison
window; its upper bound is `dateFilter` (see the prev-* queries below).
@param toFilter - inclusive UPPER bound of the selected period. Optional:
callers that genuinely want an open-ended "from X up to today" window
(the dashboard's default, and most tests) can leave it unset and get
"now". When it IS passed it is still capped at "now", so a range whose
end is in the future can't pull future-dated/clock-skewed sales into
revenue while the expense side (getSmoothedExpensesTotal) excludes them.

## db-queries-stock-transfers-L11

`client/lib/db/queries/stock-transfers.ts:11`

Data-model decision (see docs/superpowers or PR description for the
fuller writeup): transfers are NOT given a dedicated `stock_transfers`
header table. They're represented purely as a paired `movement_type:
'transfer_out'` / `'transfer_in'` row in the already-synced
`stock_movements` table, sharing a generated id as `reference_id` with
`reference_type: 'stock_transfer'` — exactly the pattern the rest of the
app already uses to cross-reference a sale or a stock audit. A header
table was considered (and is explicitly the "recommended" shape per the
feature spec) but rejected for now: this repo's sync engine has no
generic per-table plumbing gap, but a brand-new table still needs a
matching Laravel migration on the server side (laravel-server/) before it
can round-trip through cloud sync, and this change is client-only. Adding
an un-synced local table on a live production account (see task
instructions) would mean transfer history silently fails to appear on any
other device/terminal until that server work lands — worse than not
having a header table at all. `getStockTransferHistory()` below
reconstructs the same "one row per transfer" view by grouping
stock_movements on reference_id, so the UI doesn't need one.

"Cashier requests, owner reviews later": rather than a real approval gate
(nothing here is ever blocked pending approval - the transfer always
takes effect immediately, same as an admin-initiated one), a
non-admin-initiated transfer's two rows are flagged
`status: "needs_review"` (see `initiatedByRole` below) so an owner can
spot it after the fact, and `markStockTransferReviewed()` below is what
clears that flag. Added directly to stock_movements rather than a new
header table, for the same already-synced-table reasoning above. See
client/AGENTS.md's Inventory & Stock block for why this is a review
mechanism rather than a gate-before-it-lands approval queue.

## db-queries-stock-transfers-L106

`client/lib/db/queries/stock-transfers.ts:106`

Available (positive-quantity, active, non-deleted, non-expired) batches
for a product, FEFO-ordered — the exact same "soonest-expiring first"
convention getBatchesForProduct() (lib/db/queries/inventory.ts) already
uses for deducting stock on a sale, reused here rather than inventing a
second deduction order for transfers. Also scoped to storeId directly
(not just via product_id): a batch can be attributed to another store
(or be a store_id-less legacy row) while still hanging off this
product_id, the same leak fixed in getStockBatchStats/
fetchStockBatchReportData.

## db-queries-stock-transfers-L210

`client/lib/db/queries/stock-transfers.ts:210`

Creates the destination-store product row the first time a product is
transferred to a store that's never carried it before. Copies static,
product-identity fields (name, category, manufacturer/dosage metadata,
barcode, unit config, an initial selling price) so the new row is usable
immediately; deliberately does NOT copy `reorder_level` (a per-branch
reorder threshold — two branches can have very different turnover for the
same product, so it should start at this table's own default, not
whatever the source branch happened to have it set to).

## db-queries-stock-transfers-L259

`client/lib/db/queries/stock-transfers.ts:259`

Moves `quantity` units of one product from `sourceStoreId` to
`destStoreId`, deducting FEFO from the source's batches, auto-creating (or
reusing) the matching product on the destination store, opening a single
new destination batch carrying the weighted-average cost of everything
drawn from, and writing the paired transfer_out/transfer_in
stock_movements rows. Fully atomic: any failure (store not found,
insufficient stock) throws before any write and the whole transaction
rolls back.

## db-reconcile-identity-L5

`client/lib/db/reconcile-identity.ts:5`

One-time recovery tool for devices that hit the pre-fix local-first setup
bug: `handleRegister()` used to generate local-only user/store ids that
were never reconciled to the server once the device later linked to a
cloud account (see use-onboarding.ts and the Aug 2026 multi-store
investigation). Every row referencing those local-only ids as a foreign
key (sales.cashier_id, stock_movements.performed_by, etc.) became
permanently unsyncable, since the server never had a matching row to
satisfy the FK constraint.

Not a permanent code path: new setups can no longer create this state
(handleRegister now always creates the account+store in the cloud first),
so this only exists to repair devices affected before that fix shipped.
Invoke manually (e.g. via a temporary browser debug hook), not from any
normal app flow.

## db-reconcile-identity-L71

`client/lib/db/reconcile-identity.ts:71`

Separate, narrower repair for a related symptom found on the same device:
some rows created during the same pre-cloud-link period are marked
`_synced = 0` locally but have no corresponding `_sync_queue` entry at
all, so `pushChanges()` (which only ever reads from `_sync_queue`, never
scans tables directly) has silently never attempted to push them. Backfill
a fresh INSERT queue entry for any such row so it's picked up on the next
push, using the row's current column values as the payload (matching the
shape `insert()` in base-helpers.ts already produces).

Also called directly at plain app-boot now (DatabaseProvider), not just
nested inside remapForeignKey()'s callers (pull.ts/push.ts's own open
transaction()). transaction() has no reliable way to tell a genuinely
nested call (safe to run inline) apart from two merely concurrent,
unrelated top-level calls (which must never share one BEGIN/COMMIT — see
transaction()'s own comment for the bug that caused) and deadlocks on
nesting, so each table's requeue-insert batch below checks
isInTransaction() itself: runs inline when already nested, opens its own
transaction() when called at the top level (batching a table's N inserts
into one lock+saveDatabase() cycle instead of N).

## db-reconcile-identity-L196

`client/lib/db/reconcile-identity.ts:196`

Rewrites every reference to `oldId` (across the given table/column pairs)
to `newId`, including any already-queued `_sync_queue` payload that still
has the old id baked into its frozen JSON snapshot: marking a live row
`_synced = 0` alone doesn't requeue it, since push only ever reads from
`_sync_queue`, never re-scans the table. Shared by both the one-time
device-identity repair below and the ongoing duplicate-name reconciliation
for categories/suppliers in pull.ts and push.ts.

Callers must run inside `transaction()` (both current call sites do) so
this composes into one export/save at commit instead of one per statement.

## db-requeue-payload-L1

`client/lib/db/requeue-payload.ts:1`

Shared payload builder for the two whole-row requeue paths
(requeueOrphanedRows in reconcile-identity.ts and forceSyncAllData in
local-database.ts), both of which rebuild a sync payload from a
`SELECT *` rather than from the write that produced the row.

Why null keys are dropped rather than sent: several columns are nullable
in the local SQLite schema but NOT NULL with a server-side DEFAULT in
MySQL (stock_batches.cost_price is the one that bit us). The original
INSERT simply omitted them, so the server applied its default; a requeue
that resends them as explicit nulls turns into an UPDATE that writes a
literal NULL and is rejected outright. A stale re-queue must never
override a server-side default. See docs/FIXED_BUGS.md A-128.

## db-retention-L29

`client/lib/db/retention.ts:29`

An upper bound on real time, for deriving the cutoff. `_sync_state`'s
`last_synced_at` is the server's own `server_timestamp`, so it can never run
ahead of real time however wrong this device's clock is; taking the lower of
the two means a clock reading years ahead cannot push the cutoff past the
retention window and delete the whole local trail. A device that has never
synced has nothing to bound with and also nothing to prune — the prune only
touches rows already `_synced = 1`.

Lagging by the time since the last sync is the whole cost, against a 730-day
window.

## db-retention-L58

`client/lib/db/retention.ts:58`

Drops `audit_logs` rows this device has already pushed and that are older
than the local retention window. The server keeps the full trail, so this
is a local storage bound, not a data deletion: the rows are gone from this
device's IndexedDB blob only.

Runs at most once a day and deliberately uses raw `execute()` rather than
`softDelete()`, so nothing lands in `_sync_queue` and no other device ever
sees a delete for these rows.

## db-schema-migrations-L662

`client/lib/db/schema-migrations.ts:662`

`_sync_state` was keyed by `table_name` alone, so one watermark served every
store a device held — and nothing reset it on a store switch. A device that
spent a week on one store then switched never pulled what the other store
changed in that week, while every watermark read current. Measured on
production: 518 undelivered `sale_items`, 520 `sale_item_batches`, 17
`sales`. See docs/KNOWN_BUGS.md A-305.

SQLite cannot alter a primary key, so this rebuilds the table. Existing rows
are stamped with the device's single store where it has exactly one — the
common case, which then re-pulls nothing. A device with none, or with
several, keeps rows under '' which matches no real store, so the first pull
per store starts from scratch: correct, and the only safe reading of a
watermark whose store cannot be known.

## db-sync-engine-conflict-log-L9

`client/lib/db/sync-engine/conflict-log.ts:9`

Every table is logged now, not just `purchase_order_items`. A terminal drop
(`version_conflict`, `stale_timestamp`) left no local trace for any other
table, so the "50 changes could not be saved" loop was invisible the moment
the push finished: the queue was empty and the conflict count was zero.

The ledger is bounded instead of allowlisted — see pruneConflictLedger().
The device diagnostics console is the reader for the widened set; the
purchase-order panel still filters to its own table and record ids.

## db-sync-engine-deferred-stock-deltas-L57

`client/lib/db/sync-engine/deferred-stock-deltas.ts:57`

Settles every deferred delta whose batch has since arrived by rebuilding
that batch from its own movement log, deleting the rows in the same
transaction. Must be called inside a `transaction()`. Returns the deltas whose
batch has been unreachable long enough to be worth reporting; they stay
pending, since only a batch arriving can settle them.

`countAttempts: false` applies whatever is resolvable without charging an
attempt against what is not — for the mid-round drains, which run several
times per round and would otherwise race a long first sync to the
reporting threshold while the batches were still on their way.

## db-sync-engine-device-report-command-L11

`client/lib/db/sync-engine/device-report-command.ts:11`

A super_admin asks one device, once, to send its own diagnostics report.

This exists because the ordinary telemetry channel fails exactly when it is
needed: crash rows live in `feedback`, which rides the sync queue, so a till
whose push is jammed stops reporting at the moment it has most to say. The
report instead goes out over a plain POST that never touches the queue,
which lands as a support ticket and is the only channel that delivers it.

The command rides the PUSH response (SyncController::exchangeSyncCommands),
not the pull. So a device whose rows fail individually — the "50 changes
could not be saved" shape, where the request succeeds and `failed[]` is
populated — does receive it. A device whose push REQUEST fails outright
(413, 500, timeout) never does, and nor does one with no connection at all.
Those are what the on-till inspection session is for.

## db-sync-engine-health-check-L59

`client/lib/db/sync-engine/health-check.ts:59`

Periodic (once per CHECK_INTERVAL_MS per device) verification that this
device's local row counts actually match the server's, independent of
whatever its own pull cursor believes. Exists because a pull cursor can
get stuck - advance past content it never actually applied, e.g. after a
crash mid-round - and every SUBSEQUENT delta pull then "succeeds" while
silently never re-offering the missed rows, with nothing anywhere to
notice it by (see docs/KNOWN_BUGS.md, and the production incident that
led to this file existing at all: caught only by manually running SQL
against the server to compare against what the device was showing).

Only ever checks LOCAL < SERVER (this device missing rows the server
has) - LOCAL > SERVER is normal and expected (records created on this
device that haven't pushed yet) and must never trigger a resync over.
A real deficit triggers forceFullResync() silently in the background and
logs the specifics to Sentry (area: sync-health-check) either way, so a
future occurrence is a searchable signal instead of something only found
by hand.

Backs off after MAX_NON_IMPROVING_RESYNCS consecutive checks whose gap
didn't shrink: a resync re-runs the exact same pull scoping that
produced the gap, so a deficit that survives one resync unchanged is a
genuinely unrecoverable row (e.g. a permanent UNIQUE-constraint
collision pull.ts already gave up retrying), not a stuck cursor - and
without this, that single bad row would trigger a full catalog re-
download every single day, forever, for no benefit. Still logs every
time either way, tagged givingUp so the two cases stay distinguishable
in Sentry.

## db-sync-engine-pull-L115

`client/lib/db/sync-engine/pull.ts:115`

Pull changes from server.

`onCriticalTablesReady`, when passed, fires exactly once — the first time
every table in SETUP_CRITICAL_TABLES has drained for this round, or at
the very end as a fallback. No-op for a normal pull that omits it. Always
passed whether the pull actually succeeded: a thrown pull still fires it,
but with `false`, since the page transaction carrying stores/users rolls
back as a unit and there is no identity to move on with. See
client/AGENTS.md, "Pull details (sync-engine/pull.ts)".

## db-sync-engine-push-L215

`client/lib/db/sync-engine/push.ts:215`

A push with no changes, sent only to exchange command outcomes and reports.

Two cases need it, and both are the ones the command channel exists for:
the commonest successful outcome EMPTIES the queue, leaving the outcome
nothing to ride along with; and a stuck row is by definition one whose
retries have backed off, which getPendingSyncItems() excludes from an
auto-sync — so the device would send nothing and the command issued for
that very row could never reach it.

Returns without a request when there is genuinely nothing to say or ask,
so an idle device with an empty queue generates no traffic.

## db-sync-engine-queue-state-L54

`client/lib/db/sync-engine/queue-state.ts:54`

What this device has sitting in `_sync_queue`. The server has never seen a
stuck row — that is what being stuck means — so without this "what is
stuck" can only be inferred from refusals the server happened to witness.

Metadata only, and the reason is canonicalised HERE rather than sent raw.
The server canonicalises on storage too, but a raw driver error embeds the
failing SQL and its bindings — customer names, amounts — and would still
be in transit and in any future request log.

## db-sync-engine-reconcile-quantities-L62

`client/lib/db/sync-engine/reconcile-quantities.ts:62`

Hands the server this device's own stock_batches quantities so it can
adopt any it never derived from a movement delta. The server decides what
needs correcting and records each correction as a real, labelled
'sync_reconciliation' movement, then returns it so this device can store
its own copy locally (see storeReconciliationMovementLocally above - this
is load-bearing, not a convenience: without it, a second pull of this same
row would double-apply its delta on this device). See client/AGENTS.md,
"Stock quantity reconciliation".

Forces a real push+pull first: this action asserts the device's own
quantities as authoritative, so a device that's been sitting unsynced
(missing other devices' sales/movements) must catch up before that
assertion is trustworthy. Refuses to proceed if that sync fails, rather
than reconciling against a snapshot that might already be stale — and,
since a succeeded round is not a complete one, also refuses while the
movement-log pull window is mid-stream (A-214).

Refuses outright when any batch's quantity disagrees with its own movement
No divergence interlock here — one was written and withdrawn before
shipping; see the spec's §4 for why a quantity floored at 0 and a legacy
A-148 batch both read as diverged and would have blocked this repair for
the whole store.

## db-sync-engine-stock-integrity-L215

`client/lib/db/sync-engine/stock-integrity.ts:215`

Rebuilds each diverged batch's `quantity` from its own movement log.

The log is the authority: `stock_movements` is append-only and never
pruned, and it already includes anything this device created but has not
pushed, so a fold cannot discard unsynced work the way a factory reset
can. `unreconstructable` batches are refused, never folded — a batch holding
more units than its inbound movements can account for would be folded down
past stock that was never logged (A-148).

Local-only and deliberately not queued: the server derives
`stock_batches.quantity` from movement deltas and ignores a pushed value,
so there is nothing to send. This brings the device back in line with a
log it already holds; it is not a claim about the truth, which is why it
writes no `sync_reconciliation` movement.

## db-sync-engine-sync-outcome-L45

`client/lib/db/sync-engine/sync-outcome.ts:45`

The last sync ATTEMPT, not the last success. `last_sync_time` is stamped
only when a round succeeds, so a device failing every round for two days
looked identical to one that simply had not synced — and the reason lived in
the indicator's React state and died on navigation. "Why do 50 changes keep
failing" was never answerable because of this gap.

The reason is canonicalised: a raw sync error can be a driver message
quoting the attempted statement, which the diagnostics report must not carry.

## db-sync-engine-table-fingerprint-L72

`client/lib/db/sync-engine/table-fingerprint.ts:72`

What this device holds, per synced table: how many rows and the sum of
their `_version`. The server compares each against the rows a pull would
send the same device, so a table that has silently stopped agreeing is
visible without anyone reading code.

Soft-deleted rows are counted: the device keeps them with `_deleted = 1`
and the server keeps them with `deleted_at` set, so excluding them here
would read as a divergence on every store — and a server that HARD-deletes
where the device soft-deletes is exactly the bug class this detects.

Returns null when there is nothing to say, which is also what the throttle
window returns: a report is only ever sent in the push that computed it,
so the server never compares a stale device reading against a live cloud.

## db-tab-lock-L1

`client/lib/db/tab-lock.ts:1`

Single-writer-tab coordination for the web/PWA build (docs/KNOWN_BUGS.md
C1). sql.js keeps one independent in-memory database per browser tab and
persists by overwriting a single shared IndexedDB key wholesale, with no
version/CAS check — two tabs open at once can silently destroy each
other's committed writes, with no error or retry path. This module elects
exactly one tab as the writer via the Web Locks API; every other tab is
read-only until the writer tab closes (or reloads), at which point the
next queued tab is promoted and re-hydrates from whatever the writer last
persisted.

Not used on Tauri (desktop/mobile): that build talks to a real file-backed
SQLite database via the Tauri SQL plugin, which has its own WAL-mode
concurrency story and isn't affected by this in-memory-per-tab problem.

## db-tab-lock-L165

`client/lib/db/tab-lock.ts:165`

Asks the current writer (over the handoff BroadcastChannel) to force a
save and voluntarily release the lock, rather than waiting for it to
close on its own. Resolves "acked" once the writer confirms it saved and
dropped to read-only - this tab's own already-queued lock request (from
initWriterLock's read-only branch) then gets granted exactly like a
natural close would, running the normal rehydrate-then-promote path.
Resolves "timeout" if nothing acks within TAKEOVER_ACK_TIMEOUT_MS (the
writer may be frozen, crashed, or simply gone with the channel GC'd) -
callers should offer stealWriterLock() as the fallback in that case.
Resolves "unsupported" if this browser has no BroadcastChannel at all.

## db-tab-lock-L208

`client/lib/db/tab-lock.ts:208`

Fallback for when requestWriterTakeover() times out - forcibly takes the
Web Lock via the {steal: true} option (breaking whatever unresponsive
context is still holding it) rather than waiting indefinitely. Unlike the
graceful handoff, this does NOT wait for the previous holder to save
first, since by definition it didn't respond to the polite request - the
outgoing tab's last unsaved changes (if any) are lost, which is the
accepted tradeoff for an otherwise permanently-stuck read-only tab. Still
goes through the same rehydrate-or-refuse promoteToWriter() gate as
normal promotion, so a stolen lock never lets this tab write over
IndexedDB with a stale copy either. Returns whether this tab became
writer.

## db-tab-lock-L248

`client/lib/db/tab-lock.ts:248`

Call once, right after this tab's local database is first loaded from
IndexedDB. Decides whether this tab is the writer (no contending tab holds
the lock yet) or read-only (another tab already does), and if read-only,
queues for the lock so this tab is promoted the moment the current writer
releases it - calling `onPromoted` first so it can re-read whatever the
outgoing writer last persisted before this tab starts writing itself.

The returned promise resolves as soon as this tab's *initial* role
(writer or read-only) is known - it does not wait for an eventual
promotion, which may never happen or may take as long as the current
writer tab stays open. Callers (initDatabase()) can safely await it before
returning, since the `ifAvailable` check below never blocks on another
tab's lifetime.

`onPromoted` must resolve `true` only if it actually caught this tab's
local database up to what the outgoing writer last persisted - resolving
`false` (or rejecting) means this tab releases the lock it was just
granted WITHOUT ever becoming writer, rather than risk overwriting the
shared IndexedDB snapshot with this tab's now-known-stale copy the next
time it saves (exactly the C1 data loss this module exists to prevent,
just re-opened on the rehydrate-failure path instead of the no-election-
at-all path). The lock then sits released - a differently-timed retry
(e.g. the user reloading this tab) can still win it later; see
onPromotionFailed() for how the UI is told to prompt that.

`onTakeoverRequested` is called only if/when this tab is (or becomes) the
writer and another tab asks for a graceful handoff via
requestWriterTakeover() - see holdUntilTakeover() above. It must force a
save before returning, since the requester rehydrates from IndexedDB
immediately after being granted the lock.

## demo-template-L1

`client/lib/demo/template.ts:1`

Demo data template: declarative description of what a "Seed Demo Data"
run creates for a store flagged `is_demo`.

Modeled on the real test@dumosrx.com demo account (see
refs/dumomvte_dumosrx_db.sql), but kept as data (not a frozen SQL dump) so
it's replayed through the app's real create functions in lib/demo/loader.ts.
When a schema/field changes, fix it once in the loader/create-functions and
this template keeps working, which is the whole point of not just
replaying the dump.

All dates are expressed as day offsets from "now" (the moment the seed
runs), not fixed calendar dates, so the demo always looks current and the
expiry-alert states (urgent/close/healthy/long-dated/already-expired)
stay correct no matter when it's run.

## hooks-use-analytics-L29

`client/lib/hooks/use-analytics.ts:29`

The "+x% from last month" figure on the Total stock value card.

In react-query (not a bare useState/useEffect([]) fetch) so it is keyed by
the active store and invalidated by stock_movements/stock_batches writes
like every other inventory figure: the one-shot effect resolved
getActiveStoreId() once at mount and never re-ran, so after a store switch
the percentage kept describing the previous store's inventory next to the
new store's value - two different stores in one card.

## hooks-use-arrow-key-scroll-L95

`client/lib/hooks/use-arrow-key-scroll.ts:95`

Lets the arrow keys scroll one region the way a browser scrolls a plain
page, for pages and tabs whose content lives in a single `overflow-auto`
container rather than in the document scroller — where the arrow keys
otherwise do nothing at all until the user clicks into the list first.

Opt in per page/tab by calling it with that container's ref; it is
deliberately not a global listener, because arrow keys are already spoken
for on plenty of screens. It stays out of the way when:

- focus (or the keydown's target) is in a text field, select, contenteditable,
  or any component that handles arrow keys itself (combobox, menu, tablist,
  grid, slider — see `ARROW_CONSUMING_SELECTOR`);
- a modifier key is held, or something upstream already handled the event;
- the event came from inside a nested scroller, which scrolls itself;
- the page has any other visible scrollable region, so an open detail panel,
  dropdown or dialog suspends it for as long as it is on screen.

## hooks-use-auto-lock-L135

`client/lib/hooks/use-auto-lock.ts:135`

Makes the auto-lock duration follow the ACCOUNT rather than just this
browser/device: whenever the authenticated user changes (fresh device,
or a shared terminal switching between staff), pulls that user's stored
`users.auto_lock_duration` and overwrites the local zustand/localStorage
value with it. Without this, a device that's never seen this account
before would silently keep whatever duration the PREVIOUS account (or the
store's own default of 5) left behind, rather than what this staff
member actually chose in Settings.

One-way (DB -> local) on account change; the other direction (local edit
-> DB) is handled by security-settings.tsx calling
updateUserAutoLockDuration() directly when the user changes the Select.

## hooks-use-auto-lock-L197

`client/lib/hooks/use-auto-lock.ts:197`

Forces the lock screen whenever the app is freshly landed on with an
existing saved account: otherwise a device that was left unlocked (isLocked
persisted as false) would open straight into the dashboard for anyone who
picks it up, with no PIN check at all. "Login as someone else" on the lock
screen remains the escape hatch if it's not the account they want.

Gated on sessionStorage's "dumos_session_authenticated" marker (set by
auth-context's login(), cleared on logout) rather than a plain in-memory
flag: a plain flag would re-fire this on every page reload, including a
harmless refresh by someone already actively using the app, and critically
it would also fire the instant DashboardLayout first mounts right after a
fresh /login success, forcing an immediate, redundant second PIN entry.
sessionStorage persists across reloads within the same tab but clears when
the tab actually closes, so a genuinely new tab/session still locks.

When more than one recent account exists on this device (shared terminal),
a fresh landing shows account SELECTION rather than defaulting straight to
the last-used user's PIN entry: otherwise a different staff member picking
up the device would have no way to reach their own account without first
unlocking as whoever used it last.

## hooks-use-feature-gate-L26

`client/lib/hooks/use-feature-gate.ts:26`

The POS cart's "Reseller sale" row (both the reseller-commission and
store-markup sub-types) is gated on BOTH the plan-tier entitlement
(`tierAllows`, from getFeature('reseller_commission', ...)) AND the
store's own on/off toggle (`stores.markup_sales_enabled`). Unlike
isLoyaltyProgramEnabled, this defaults OFF (`storeToggle === 1`, not
`!== 0`) - an owner has to explicitly turn it on before any staff can
mark up a sale at all. Extracted as a pure function for the same
unit-testability reason as isLoyaltyProgramEnabled.

## hooks-use-fulfill-online-order-mutation-L53

`client/lib/hooks/use-fulfill-online-order-mutation.ts:53`

Local-leg-first, and the local leg is one transaction. The server call used
to come first, so any failure writing the sale or deducting stock left the
order server-side `fulfilled` (and hidden from the POS's actionable list)
with no sale recorded and stock never deducted — silently unrecoverable
through the UI. This way a server failure surfaces as a retryable error with
the local books already correct and already queued in `_sync_queue`, and the
server leg is safe to retry because markFulfilled now rejects a non-`pending`
order.

That inversion creates its own retry hazard the other way round: if the
*local* leg already succeeded and only the server call failed, the order is
still `pending` server-side (so the modal still offers "Fulfill" on it), and
a second click must not record a second sale / deduct stock twice. The
transactionNumberFor() lookup below is what makes a retry a no-op on the
local leg rather than a duplicate. See docs/FIXED_BUGS.md (SF-P2-5/SF-P3-6).

## hooks-use-install-prompt-L8

`client/lib/hooks/use-install-prompt.ts:8`

Captures Chrome/Edge/Android's `beforeinstallprompt` event so we can defer
it and trigger the native install prompt from our own "Install App" button
instead of relying on the browser's own (easy-to-miss) mini-infobar.
Fires only on Chromium-based browsers that judge the site installable
(valid manifest + registered service worker + https). Safari/iOS never
fires this, which is why that platform gets its own instructions modal.

The listener is registered at MODULE scope, not inside useInstallPrompt()'s
effect: `beforeinstallprompt` fires once, early, during initial page load,
and this module previously was only ever imported by AndroidInstallCard -
which only mounts once a user navigates to Settings, long after the event
had already fired and been discarded. That meant the install card almost
never appeared on Chrome/Android at all. Import this module from something
mounted at the app root (see pwa-registrar.tsx) so the listener attaches
as early as the rest of the app's JS does, and expose the captured event
through a tiny external store so any component - regardless of when it
mounts - can read it.

## hooks-use-is-touch-device-L3

`client/lib/hooks/use-is-touch-device.ts:3`

Detects a touch-*primary* device (phone/tablet), not merely touch
*capability*. `navigator.maxTouchPoints`/`ontouchstart` are true for any
touchscreen device, including a touchscreen laptop/2-in-1 with a trackpad
and physical keyboard - that previously made this hook report `true` on
e.g. a Dell Latitude 2-in-1, which forced the on-screen PIN pad and
disabled the sidebar's hover-peek on a device that has a perfectly good
keyboard and trackpad. `(pointer: coarse)` reflects the *primary* input's
precision: a 2-in-1's trackpad/mouse makes its primary pointer fine even
though touch is also available, while a real phone/tablet has no fine
pointer at all. Same pointer/hover pair `app/globals.css` already uses to
gate `:hover` styles project-wide, for the same reason.

## hooks-use-my-today-sales-L11

`client/lib/hooks/use-my-today-sales.ts:11`

"My sales today": the cashier-relevant equivalent of inventory-value
metrics, which a sales_staff account has no reason to see (they don't
manage stock). Mirrors the todayMetrics calculation in
pos-transaction-history.tsx, scoped to the signed-in user's own sales.

Filters by date in SQL (via getRecentSales's dateRange param) rather
than fetching an undated, LIMIT-100 "recent sales" page and filtering
for "today" client-side afterward - a cashier who personally rings more
than 100 sales today would otherwise have the earliest ones silently
dropped before the "is today" filter even runs. A dated query also gets
getRecentSales's higher LIMIT 500 cap instead of 100.

## hooks-use-permission-groups-L17

`client/lib/hooks/use-permission-groups.ts:17`

Never deletes a default group (immutable by design - see Global
Constraints), and blocks deleting a custom group with staff still
assigned (reassign first). Both refusals throw, so a caller can always
tell a refusal from a success, and the default-group check runs first so
the reported reason is the fundamental one rather than a reassignment
instruction that would never unblock the delete. A staff row with a NULL
is_active counts as assigned, matching the NULL-tolerant boolean handling
used for _deleted throughout the query layer. Standalone/testable without
a React render harness, and reused by the hook's own deleteGroup
callback.

## hooks-use-permissions-L95

`client/lib/hooks/use-permissions.ts:95`

React hook: checks the acting session's permission group via
hasPermission(). Returns false while loading/logged out, matching how the
old precomputed booleans defaulted to false with no user.

Reads the group from AuthContext, which owns the single copy of that state
(its query, its `dumos_sync_completed` listener). This hook used to keep its
own useState/useEffect/query/listener, so all 26+ call sites re-ran the
synchronous sql.js read independently on every sync cycle and could
transiently disagree with each other and with AuthContext's own booleans.

The useMemo is load-bearing beyond memoization, and must NOT be collapsed
into a plain `return hasPermission(...)`: useContext does not occupy a slot
in React's hook list, so a useHasPermission that only read context would make
a CONDITIONAL call (e.g. the short-circuited `&&` chain that
pos-layout-header.tsx once had) fail silently instead of throwing
"Rendered more hooks than during the previous render". useMemo keeps that
tripwire armed. See __tests__/pos-layout-header-rules-of-hooks.test.tsx,
which asserts the crash still happens.

## hooks-use-pos-cart-L116

`client/lib/hooks/use-pos-cart.ts:116`

Re-points every cart line at the catalog's current selling price and
average cost. The cart is a `persist`ed store, so a line otherwise keeps
whatever the product cost and sold for at the moment it was added — a cart
held overnight, or held across a price change synced from the owner's
device, charged yesterday's price and booked COGS at yesterday's average
cost.

A line whose product isn't in `products` is left exactly as it is: that is
the catalog still loading (`usePOSData` returns `[]` until its query
resolves) far more often than it is a deleted product, and silently
re-pricing against a catalog that hasn't arrived is worse than the staleness
this fixes.

A reseller markup is carried across as a markup, not as an absolute price:
the cashier agreed a margin over the shelf price with the reseller, and
`unit_price` may never fall below `original_unit_price` (updateUnitPrice's
own floor), which the new catalog price has just moved.

## hooks-use-post-restore-cloud-link-notice-L15

`client/lib/hooks/use-post-restore-cloud-link-notice.ts:15`

Mount this once on any screen that can be the landing spot right after a
post-restore reload (currently /login and the dashboard shell - see
app/setup/use-onboarding.ts's handleLocalRestore and
hooks/use-settings-sync.ts's handleRestoreBackup /
handleRestoreBackupTauri, all of which call
markRestoredForCloudLinkNotice() right before reloading).

Fires a single, hard-to-miss toast the moment it detects the device just
restored a local backup and is NOT cloud-linked - explaining that the
data is back but sync needs a manual re-link, with a direct action into
the existing cloud-link control. Deliberately does nothing on a normal
page load, and nothing if the restore left the device linked (or on any
later load, even unlinked) - the persistent "Not Linked" state is already
covered by the dashboard header's SyncIndicator; this is only the
restore-specific, one-time call-out.

## hooks-use-prescription-management-L12

`client/lib/hooks/use-prescription-management.ts:12`

All business logic for the Prescription Management page: the prescription
queue itself (via usePrescriptionQueue), the full-screen "new prescription"
overlay's URL-driven visibility, and navigation into POS/Returns for
dispense/refill/return actions, so the component only has to render what
this hook returns.

The overlay's visibility is where "manage_prescriptions" is enforced:
?action=add and ?edit_rx=<id> are typeable, so gating the header action
and the detail panel's Edit button alone would not be a gate.

## hooks-use-sortable-data-L5

`client/lib/hooks/use-sortable-data.ts:5`

Generic column-sort state + comparator, meant to be shared across every
sortable table in the app (product catalog, and any "other relevant
tables" added later) rather than reimplemented per table. `accessors`
maps a column key to a function pulling the comparable value off a row;
strings sort via localeCompare, numbers via subtraction.

`accessors` is read through a ref, so passing a fresh object literal (what
every call site does) doesn't invalidate the sort memo. The trade-off: a
changed accessor alone doesn't re-sort — they're expected to be pure
projections of a row, not to depend on outside state.

## hooks-use-stock-audit-draft-L13

`client/lib/hooks/use-stock-audit-draft.ts:13`

Drafts written before 2026-10-13 pre-filled every row's countedQty with
the system quantity, and "has a quantity" is now what marks a row counted
- so such a draft rehydrates with the entire sheet ticked and "Total
Counted" equal to the catalog, which is the exact confusion the blank
field was introduced to remove. A row the counter actually touched in
that build carries `counted: true` (updateLedgerItem set it on every
edit) or differs from the system figure; everything else was untouched
prefill and is cleared back to blank.

Retirable once no device can still hold a v0 draft - one release after
2026-10-13.

## hooks-use-stock-batch-stats-L1

`client/lib/hooks/use-stock-batch-stats.ts:1`

useStockBatchStats

Single source of truth for all inventory stat cards across the app.
All components showing "Total Products", "Active Products", "Low Stock",
"Expiring Soon", etc., should pull from this hook to stay consistent.

Data source: `products` table (primary stock ledger).
The `stock_batch` table is used for batch/location tracking only.

## hooks-use-widget-deeplink-L4

`client/lib/hooks/use-widget-deeplink.ts:4`

Listens for a native "widget-deeplink" DOM CustomEvent, dispatched via
MainActivity's captured WebView reference (WryActivity.onWebViewCreate ->
evaluateJavascript) when the user taps a widget alert row - see
DumosRxWidgetContent.kt's PendingIntents and MainActivity.onNewIntent.
Routes the already-running app there. There's no Tauri event round-trip:
TauriActivity/WryActivity keep their WebView field private, so the
simplest reachable path from Kotlin is evaluateJavascript dispatching a
plain DOM event, not Tauri's Rust-mediated event system. Mounted once
near the app root, alongside useWidgetSnapshotSync.

## hooks-use-widget-pin-prompt-L10

`client/lib/hooks/use-widget-pin-prompt.ts:10`

Drives the Action Center "Add Widget" card: only relevant on the Android
Tauri build (the only platform with a home-screen widget to pin), and
only until the user either adds it or dismisses the prompt. There's no
reliable way to detect from JS whether the widget is already pinned
(Android exposes no such query without a matching AppWidgetManager call
on the native side, and the existing bridge is fire-and-forget), so a
click is treated as "done" and just dismisses the card the same way
explicit dismissal does.

## licensing-licensing-manager-L147

`client/lib/licensing/licensing-manager.ts:147`

The admin-present version of reconcileClockWithServer(): still requires an
authoritative server reading, so a tampered device cannot talk its way out —
but it takes that reading from readInspectionServerClock(), which the server
refuses without a live session row, and applies no device-agreement check.
Disagreement is exactly the case a physically-present admin resolves.

Only reachable from an on-till inspection session, which is online-only and
exists only for platform_admin and above. See
docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.

## licensing-licensing-manager-L191

`client/lib/licensing/licensing-manager.ts:191`

Clears a clock lock, but only against authoritative server time.

A device whose wall clock ran fast wrote that future time into
`last_monotonic_time`, so correcting the clock makes every later check read
as a rollback and the device locks out permanently (docs/KNOWN_BUGS.md
A-191). The watermark is device-local: the pull strips it and a factory
reset preserves it, so nothing else can repair it.

This is the only route out, and it is deliberately online-only — the store
owner is the party the backdating check exists to stop, so an offline
override would hand the escape hatch to the adversary. Returns true when the
watermark was reset. See
docs/superpowers/specs/2026-10-08-license-clock-recovery-design.md.

## query-keys-L1

`client/lib/query-keys.ts:1`

Query-key factory + table-dependency tagging convention.

Every entry returns `{ queryKey, meta: { tables } }`, spread straight
into useQuery's options (`useQuery({ ...queryKeys.products.all(), queryFn
})`). Bundling the key and its table dependencies into the same function
means they can't drift apart the way they would if `tables` were passed
separately at each call site.

`meta.tables` is what base-helpers.ts's mutation helpers use (via a
predicate, not prefix-matching) to invalidate exactly the queries that
could be affected by a given table's insert/update/delete, including
queries that read from several tables at once (dashboard, BI, and
daily-close all do), which a plain "queryKey starts with the table name"
convention can't express.

A query with no `meta.tables` (i.e. not yet migrated to this factory)
falls back to being invalidated on every mutation; see base-helpers.ts's
invalidateQueriesForTable. That makes adopting this factory incremental
and safe: an unmigrated query is never LESS correct than before, only
less precisely invalidated.

Every key is also suffixed with the active store id and current user id
(lib/db/core.ts); every query function reads its scope from those
module-level resolvers at execution time rather than from the query key,
so without this suffix a switch of store or user could read/write a
cache slot the previous store/user's queries already own. This makes
cross-account/cross-store leakage structural rather than dependent on
every switch/logout path remembering to clear the cache: even if a
clear() call were ever missed, the new store/user simply never resolves
to the old cache slot to begin with. Appending it here, once, means the
~40+ call sites across the app never have to think about it.

## types-global-d-ts-L36

`client/lib/types/global.d.ts:36`

Recovery tool for a device whose pull cursor has drifted ahead of
content it never actually received (e.g. after a mid-round crash) —
clears `_sync_state` so the next pull re-fetches every table from
scratch instead of resuming from a stuck delta cursor. Never touches
local data or the outbound `_sync_queue`. Exposed unconditionally,
including production, for a support session to run from DevTools on
the affected device — deliberately not wired to any in-app UI, since a
full re-pull of a large catalog isn't free on a slow connection and
shouldn't be one accidental tap away for a store owner. See
lib/db/sync-engine/index.ts.

## utils-chunk-error-L43

`client/lib/utils/chunk-error.ts:43`

One reload per deployed build, not per tab session. The old
CHUNK_RELOAD_GUARD_KEY lived in sessionStorage and was cleared on every
successful mount, so a shell that stays stale reloaded forever. See
docs/FIXED_BUGS.md A-257 for the production incident.

Keyed by build so a genuine new deploy gets its own attempt; a storage
failure permits the reload, because the reload is the remedy and a guard
must never be the thing that blocks it.

## utils-date-range-L3

`client/lib/utils/date-range.ts:3`

DateRangePicker works in plain yyyy-MM-dd date-only strings, but every
date-filtered query (getActivityLog, report queries) compares from/to
directly against a full ISO created_at/transaction_date timestamp, so a
date-only value has to be widened to the full day it represents or "to
yesterday" would silently exclude everything from today.

That widening must happen in the store's LOCAL calendar, not UTC: the
picker's date-only value represents a day on the store's own wall clock
(the same clock the dashboard/daily-close bucket by via SQLite's
'localtime' modifier - see getDashboardOverviewData). Anchoring the
bounds to literal UTC midnight instead shifted every report's day/month
boundaries by the store's UTC offset relative to the dashboard, so the
two could disagree about which day (or, at month-end, which month) a
sale belonged to. Constructing local Date objects and letting
toISOString() convert them to their UTC-equivalent instant keeps the
comparison correct against the UTC timestamps sales/returns/expenses are
actually stored with.

## utils-date-utils-L12

`client/lib/utils/date-utils.ts:12`

`new Date("YYYY-MM-DD")` parses a bare date-only string as UTC midnight,
which then compares against a local-time `now` - batches flip to
"expired" or show an off-by-one day count relative to the store's local
calendar, disagreeing with the string-comparison expiry filters the FEFO
SQL uses (`date(expiry_date) > date('now')` in
lib/db/queries/inventory.ts). `stock_batches.expiry_date` is stored as a
bare `YYYY-MM-DD`; for that shape, splitting the components and
constructing the Date from them (rather than parsing the string) treats
it as local midnight instead, consistent with `new Date()` for "now". A
string carrying an explicit time/offset (a full ISO timestamp) has no
such ambiguity and is left to native parsing.

## utils-diagnostics-delivery-L6

`client/lib/utils/diagnostics-delivery.ts:6`

Getting a device report off a broken till. Two routes, deliberately:

- Download works offline, which is exactly when a till is least able to
  send anything, and is the only route that survives a dead sync engine.
- Send posts straight to the public `/support` endpoint rather than queueing
  a `feedback` row through the sync engine. Filing it locally would put the
  report behind the very queue it is reporting on — and `insert()` refuses
  during a read-only inspection session anyway.

## utils-elapsed-L1

`client/lib/utils/elapsed.ts:1`

Whether `intervalMs` has passed since a stored timestamp.

A stamp in the future reads as **due**, not as "this just ran". A device
whose clock is ahead writes that future time into localStorage, and the
obvious `now - stored < interval` then skips the work until real time
catches up — hours on the fast till A-247 measured, and for ever on a clock
that has been reset. The work this guards includes the daily health check,
which carries the stock-drift repair, so the failure is silent and takes the
cure with it.

An absent, unparseable or non-finite stamp is also due: not knowing when
something last ran is a reason to run it, never a reason to skip it.

Only for work that is safe to repeat. Work that **deletes** on an interval
must not use this — if its cutoff comes from the same suspect clock, running
when unsure destroys more than it means to. `retention.ts` keeps its own
guard for that reason and says so.

## utils-error-description-L1

`client/lib/utils/error-description.ts:1`

The real reason a write failed, for a Sonner toast's `description` slot.
Procurement's catch blocks all reported the same shapeless
"Error creating purchase order" while the caught Error carried the actual
cause, so staff had nothing to act on and nothing to report.

Returns undefined rather than an invented string when the thrown value has
no usable message: a toast with a blank or made-up subtitle is worse than
a toast with only its title.

## utils-error-truncation-L1

`client/lib/utils/error-truncation.ts:1`

Bounds on error text that gets embedded into a NEW log message.

A database-level push failure surfaces as the driver's full error string,
which includes the entire attempted SQL statement — and therefore a
verbatim copy of the row it was inserting. Embedding that in a new crash
description, which is itself stored as a row and pushed again, makes every
generation contain all previous ones (see docs/FIXED_BUGS.md, SF-CRASH-1).
Capping the embedded text at a fixed length makes that growth impossible
regardless of how large the underlying error is.

## utils-error-truncation-L26

`client/lib/utils/error-truncation.ts:26`

Bounds on the crash `content` the local `feedback` row carries. The server
column is MySQL TEXT: 65,535 **bytes**, not characters. A character can
cost up to 4 bytes in utf8mb4, so the character cap is set at a quarter of
the byte limit — the only cap that holds for any input, since JavaScript
string length counts UTF-16 units and says nothing about encoded size.

The per-part caps exist so one oversized part cannot crowd out the others:
a 60,000-frame stack must not push the message and device out of the
report that is supposed to explain the crash.

## utils-impersonation-L2

`client/lib/utils/impersonation.ts:2`

Single source of truth for "is this session an impersonated (superadmin
handoff) session?".

Two localStorage flags describe an impersonated session, both written when
a superadmin hands off into this app (see app/auth/callback/page.tsx):

 - IMPERSONATED_USER_STORAGE_KEY: the impersonated profile itself, written
   by auth-context's loginFromHandoff() under a key distinct from
   "dumos_user" so it is never restored through setDbUser().
 - IMPERSONATOR_RETURN_CODE_KEY: the one-time code for the trip back to the
   admin panel, used by ImpersonationBanner's "End Session" button.

Either one alone is enough to mean "impersonated": the return code is only
stored when the admin panel managed to mint one (that mint can fail while
the impersonation itself still proceeds — see web/app/admin/stores/page.tsx),
and the profile key is what survives a reload. Both are cleared together by
a real PIN login, a logout, and the banner's own "End Session".

Lives in its own (React-free) module so the sync engine, the auth context
and the UI all answer this question the same way rather than each poking at
localStorage with its own hard-coded key.

## utils-login-lockout-L2

`client/lib/utils/login-lockout.ts:2`

Exponential-backoff lockout for PIN-based login attempts (client-side
only, matching this app's entirely-offline PIN check — see
docs/KNOWN_BUGS.md's now-removed "PIN login has no attempt limit" entry).
CAPTCHA isn't a fit here: this is a local POS terminal with no guaranteed
network, not a web form facing bot traffic.

Keyed by the typed identifier (username/email, lowercased) rather than a
resolved user id or the whole device, so:
 - trying many different bogus usernames doesn't help brute-force any one
   real account (each gets its own independent counter), and
 - locking out one staff member's account doesn't also lock out every
   other staff member sharing the same device.

## utils-loyalty-calculator-L99

`client/lib/utils/loyalty-calculator.ts:99`

EXPIRY SEMANTICS — read this before changing anything here.

What the schema actually gives us: `customers.loyalty_points` is the
authoritative running balance, and `loyalty_transactions` is a dated ledger
(`points`, `type` of 'earned' | 'redeemed' | 'expired', `created_at`) that
POS checkout and returns write one row per earn/redeem event. So we *do*
have per-earn dating — but only for points earned through those flows. A
balance can also arrive with no ledger rows at all (demo-data seeding,
customer import, a balance set directly on the customer row), and no schema
change is in scope for this fix.

So the policy implemented here is **FIFO per-batch expiry over the ledger,
with any un-ledgered remainder of the balance treated as non-expiring**:

 - Ledger rows are replayed oldest-first. Each earn opens a dated batch;
   each negative row (a redemption, or an expiry already materialized by an
   earlier checkout) drains the oldest open batches first.
 - Whatever is still open and was earned more than POINTS_EXPIRY_MONTHS ago
   is expired.
 - Earns with a missing/unparseable `created_at` are sorted last and never
   expire — we can't prove they're stale, and silently voiding points is the
   worse failure.
 - The result is clamped to the stored balance, so points that predate the
   ledger (or were never ledgered at all) can never be expired away. A
   customer whose 5000-point balance has zero ledger rows keeps all 5000.

This is deliberately conservative: it can under-expire (un-ledgered points
live forever) but never over-expire.

## utils-pin-hash-L3

`client/lib/utils/pin-hash.ts:3`

POS unlock PINs used to be stored (and synced, and serialized by the API)
in plaintext. They're bcrypt-hashed now - everywhere they're written,
both here and server-side (see User::hashPin() in the Laravel app).

Verification has to happen HERE, not on the server: PIN login is fully
offline by design (auth-context.tsx's login() never makes a network call
to authenticate), so the device compares the typed PIN against the hash
that synced down into local SQLite.

bcryptjs is the library because it's pure JavaScript with zero
dependencies and no native bindings - this app ships as a Next.js static
export AND inside a Tauri webview on desktop, Android and iOS, none of
which can load a native node addon.

bcrypt embeds its own cost factor in the hash string, so a hash verifies
correctly regardless of what cost either side used to produce it -
PHP-side (Laravel 11 defaults to 12, not 10) and JS-side hashes are fully
interoperable without needing to agree on a number. This constant is only
used when THIS device originates a new hash (a fresh PIN, or migrating a
legacy plaintext one on login); 10 is bcryptjs's own default and kept
deliberately lower than Laravel's 12 - hashing runs synchronously on the
main thread during PIN entry (see pinMatches below), and a 4-digit PIN's
10,000-value keyspace doesn't benefit much from the extra cost anyway.

## utils-post-restore-notice-L2

`client/lib/utils/post-restore-notice.ts:2`

Known bug #10, Part B (docs/features/_known-bugs.md): restoreDatabase()
only swaps the sql.js database - it never touches localStorage/auth_token,
so a device recovering via a local .drx backup silently loses its cloud
link with nothing on the restore screen or the post-restore dashboard
telling the owner sync is now off.

We deliberately do NOT try to make the cloud auth token survive a restore
(a portable backup file should never carry a live/expiring session
credential, let alone a plaintext password - see the known-bugs entry).
Instead we make the gap loud, once, right after a restore: a short-lived
sessionStorage marker set immediately before the post-restore reload
distinguishes "just restored" from "has always been unlinked" (which is
already covered by the persistent header SyncIndicator "Not Linked"
state - this is not meant to duplicate that as a persistent nag).

## utils-post-restore-notice-L33

`client/lib/utils/post-restore-notice.ts:33`

Call once on mount of a page that can be the landing spot right after a
post-restore reload (currently /login and the dashboard shell).

Consumes (clears) the "just restored" marker so it can only ever answer
`true` once per restore, regardless of the outcome - a normal subsequent
page load (marker absent) always returns false, and so does a restore
where the device turns out to still be cloud-linked.

`isCloudLinked` is intentionally read as a plain boolean argument, not
pulled from localStorage/context internally: callers already have it
(from useAuth() or a direct localStorage.getItem("auth_token") check),
and keeping this function pure makes the "fires once, only when
unlinked" behavior trivial to unit test.

## utils-report-pdfx-L22

`client/lib/utils/report-pdf.tsx:22`

Runs the (main-thread-blocking) PDF render in a Web Worker so a large
report doesn't freeze the UI or trigger the browser's "page unresponsive"
prompt - see lib/workers/report-pdf.worker.ts for why that's safe here.
Falls back to rendering inline if the worker can't be created at all
(e.g. an unusual embedding context that blocks Worker), so the export
still works, just without the off-thread benefit.

`signal`, when passed, lets a caller abort a slow render (e.g. a stock
audit with thousands of rows) - only honored on the worker path, since
the main-thread fallback runs synchronously and can't be interrupted
mid-render anyway.

## utils-search-L95

`client/lib/utils/search.ts:95`

Per-array cache of the lowercased searchable fields.

Without it every call re-lowercased name + generic_name + barcode for every
product (and the fuzzy tier did it again, plus a split per field), i.e. a few
thousand throwaway strings per keystroke at a realistic catalog size. Keyed on
the array reference, which is exactly the right granularity here: React Query
hands out a new array whenever the catalog changes, so a stale index is not
reachable. WeakMap so an array that goes out of scope takes its index with it.

## utils-till-inspection-audit-L10

`client/lib/utils/till-inspection-audit.ts:10`

Records a repair run from an inspection session against the ADMIN who ran
it, both as the row's actor and in its details. Two separate traps:
`logAction` defaults `user_id` to whoever the local DB points at (the staff
user, or nobody), and `SyncController` then backfills an empty or unknown id
from the sync token's owner — so the SERVER's record would name the store
owner. The admin's real id is known to the server, so passing it survives
the push intact. Spec requires admin, device, store and outcome.

Never throws: an audit failure must not undo a completed repair.

## utils-till-inspection-L3

`client/lib/utils/till-inspection.ts:3`

Single source of truth for "is this session a read-only on-till admin
inspection?". Mirrors lib/utils/impersonation.ts deliberately — the sync
engine, the write helpers and the UI must all answer this the same way
rather than each reaching for storage with its own key.

sessionStorage, not localStorage: the spec requires the session to end on
app restart, and sessionStorage gives that for free rather than through an
expiry check something could skip. See
docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.

## workers-report-pdf.worker-L6

`client/lib/workers/report-pdf.worker.ts:6`

Runs the actual PDF layout/render off the main thread. @react-pdf/renderer
has no progress hook and its layout pass is a single synchronous call -
for a large export (thousands of rows) that's long enough to freeze the
UI and trigger the browser's "page unresponsive" prompt if run inline.
Neither react (createElement only, no react-dom) nor @react-pdf/renderer's
own reconciler touch window/document, so this is safe to run in a worker.

ctx is typed `any` deliberately: this file's tsconfig pulls in the "dom"
lib project-wide, which declares a conflicting (Window-shaped) `self` -
there's no clean way to also apply "webworker" lib types to just this one
file, so the worker's actual DedicatedWorkerGlobalScope shape is accessed
through an escape hatch instead of fighting the type checker over it.


## Round 2: remaining 3+ line blocks

### api-admin-till-session-ts-L29

`client/lib/api/admin-till-session.ts:29`

True only for an identifier that looks like an email AND matches no user on
this device. The second half is load-bearing: lib/db/queries/auth.ts already
accepts an email as an ordinary login identifier, so a store owner signing
in with theirs must stay local and offline.

### api-admin-till-session-ts-L49

`client/lib/api/admin-till-session.ts:49`

Deliberately a plain fetch rather than apiClient: base-client treats a 401
on a non-auth endpoint as an expired token, silently refreshes the till's
OWN sync token, retries, and clears it on the second 401 — so a mistyped
till code would unlink the device from cloud sync. It also must not send
the till's bearer, which this endpoint neither needs nor should see.

### api-admin-till-session-ts-L101

`client/lib/api/admin-till-session.ts:101`

Server time, served only while the session row is live. The clock override
uses this rather than the public /health endpoint so the server — not a
forgeable sessionStorage flag — is what authorises it.

### api-admin-till-session-ts-L144

`client/lib/api/admin-till-session.ts:144`

Exit on tab close or app quit, where an awaited fetch is cancelled with the
page. Closing the app is the most common exit on a desktop till, and without
this the session row kept no exit row and no duration.

### api-base-client-ts-L57

`client/lib/api/base-client.ts:57`

A-171/A-206: a 2xx whose body will not parse made `.json()` throw an error
naming nothing. Rationale for what this reports, and how to read it, is in
client/AGENTS.md under "Non-JSON 2xx responses".

### api-client-fleet-billing-ts-L13

`client/lib/api/client-fleet-billing.ts:13`

Fleet (multi-store management), subscription/billing, notifications,
online orders, and account-deletion endpoints — split out from ApiClient
(client.ts) purely to keep that file's line count down. ApiClient extends
this class, so every method here is still called as e.g.
`apiClient.getStores()`; no call site needs to know this split exists.

### api-retry-on-network-error-ts-L1

`client/lib/api/retry-on-network-error.ts:1`

Retries a request only when no HTTP response was ever received (a thrown
network/timeout error, which `base-client.ts`'s `request()` never attaches
a `.status` to) - never on an HTTP status, including 5xx. A real response
means the server already decided the outcome; retrying it risks acting on
a request that can never succeed (e.g. a genuine unique-constraint race
surfaces as a 500, not a 422) and burns the shared `throttle:auth` bucket
for nothing. Exponential backoff between the (default) 3 attempts.

### constants-ts-L9

`client/lib/constants.ts:9`

Short commit SHA of the build this bundle came from, injected by CI.
APP_VERSION alone cannot answer "which build is this device running?" —
PWA deploys ship without bumping it. See docs/KNOWN_BUGS.md.

### constants-category-icons-tsx-L59

`client/lib/constants/category-icons.tsx:59`

Substring-matched first (longest keyword wins on overlap — see
KEYWORD_ICONS_BY_SPECIFICITY below): covers common pharmacy/retail
category names with a purpose-built icon. Declaration order here doesn't
affect matching, only readability.

### constants-dashboard-page-routes-ts-L15

`client/lib/constants/dashboard-page-routes.ts:15`

Additionally lets a sales_staff (cashier) account through
actionAdminOnly's baseline - for the one route (Expenses) cashiers are
also meant to reach, without opening the gate to every other
non-admin role (e.g. auditor, a read-only role that shouldn't get a
write action here either).

### constants-dashboard-page-routes-ts-L21

`client/lib/constants/dashboard-page-routes.ts:21`

On top of actionAdminOnly's canManageStockBatch baseline, `action` is
only shown to isAdmin — for a primary action that should be limited the
same way Start Audit's secondaryAction already is (e.g. Transfer Stock:
a direct, unapproved store-to-store move). A canManageStockBatch-but-
not-isAdmin account (specialist) falls through to fallbackAction.

### constants-dashboard-page-routes-ts-L27

`client/lib/constants/dashboard-page-routes.ts:27`

On top of actionAdminOnly, `action` additionally requires a multi-
store-capable account (plan entitlement AND this device actually having
2+ synced stores — see DashboardHeader's hasMultiStoreAccess). A
single-store or plan-ineligible account falls through to
fallbackAction.

### constants-dashboard-page-routes-ts-L33

`client/lib/constants/dashboard-page-routes.ts:33`

Shown instead of `action` when the account passes actionAdminOnly's
baseline but not actionRequiresIsAdmin/actionRequiresMultiStore — e.g.
Transfer Stock (ledger) falls back to Add Product for an admin-capable
account that isn't multi-store-qualified, rather than showing nothing.

### constants-dashboard-page-routes-ts-L38

`client/lib/constants/dashboard-page-routes.ts:38`

A specific permission key `action` additionally requires, on top of
actionAdminOnly's coarse canManageStockBatch baseline — the per-key
replacement for that baseline as categories are migrated off role
gates (see client/AGENTS.md's "Enforced permissions").

### constants-dashboard-page-routes-ts-L43

`client/lib/constants/dashboard-page-routes.ts:43`

An outline button shown before the primary action, desktop only (see
DashboardHeader) — for a page's other common action that isn't worth a
full second row of its own (e.g. Inventory's "Start Audit" next to "Add
Product"). `path` can point anywhere the target page already knows how
to react to (a query param like `action`, or — as Start Audit does — a
dedicated route the page's own effect already redirects out of).

### constants-dashboard-page-routes-ts-L53

`client/lib/constants/dashboard-page-routes.ts:53`

Drives DashboardHeader's title/description/action button per route.
Matched by prefix (see getPageRoute), so list more specific paths (e.g.
"/inventory/catalog") before their parent ("/inventory").

### constants-dashboard-page-routes-ts-L199

`client/lib/constants/dashboard-page-routes.ts:199`

Null on the dashboard home route, which uses the time-of-day greeting
instead of a page title. Falls back to a bare app-name/no-desc/no-action
shell for any route not listed above.

### constants-dashboard-page-routes-ts-L210

`client/lib/constants/dashboard-page-routes.ts:210`

Resolves the header's "+ Add X" action for the current route, honoring
actionAdminOnly's canManageStockBatch baseline first, then narrowing via
actionRequiresIsAdmin/actionRequiresMultiStore — an account that clears
the baseline but not the narrower requirements gets fallbackAction
instead of nothing. Greeting pages (dashboard home) don't use pageInfo
for title/desc, but can still declare an explicit action via PAGE_ROUTES,
so this re-looks-up the route rather than relying solely on pageInfo.

### constants-dashboard-page-routes-ts-L248

`client/lib/constants/dashboard-page-routes.ts:248`

Same resolution as resolveHeaderAction, for the outline button shown
before it (desktop only — see DashboardHeader). `hasAccess` is whatever
role check the specific secondaryAction actually needs (not necessarily
canManageStockBatch — Start Audit, for instance, gates on the
"perform_stock_audit" permission).

### constants-roles-ts-L1

`client/lib/constants/roles.ts:1`

The fixed set of staff system roles: shared between the staff editor
(assigning a role) and anywhere roles need to be listed/filtered (e.g.
Activity Log), so the two can't drift out of sync.

### constants-settings-tabs-ts-L3

`client/lib/constants/settings-tabs.ts:3`

Every settings tab that was hidden behind the coarse `isAdmin` check
(i.e. `manage_staff`) before the Store & Settings enforcement pass.
Tabs listed in SETTINGS_TAB_PERMISSIONS below are resolved by their own
key instead; the rest still fall back to this list.

### constants-settings-tabs-ts-L62

`client/lib/constants/settings-tabs.ts:62`

Pure so the whole tab-visibility rule is unit-testable without an auth
render harness. `hasKey` is the caller's own permission check
(useHasPermission in a component, hasPermission() in a hook).

### constants-settings-tabs-ts-L67

`client/lib/constants/settings-tabs.ts:67`

The two support sessions that can see the diagnostics console. They differ:
an on-till inspection is read-only and must be denied every other tab,
while an impersonation handoff keeps the tabs it always had.

### constants-smart-suggestions-rules-ts-L8

`client/lib/constants/smart-suggestions-rules.ts:8`

Symptom/condition clusters: categories customers commonly buy together for the
same ailment episode (e.g. malaria + typhoid are frequently treated together,
plus fever and immune support). Unlike SMART_SUGGESTIONS_RULES (one-directional
"trigger X, suggest Y"), every category in a cluster suggests every other
category in the same cluster: buying any one of them surfaces the rest.

### constants-stock-adjustments-ts-L1

`client/lib/constants/stock-adjustments.ts:1`

The two stock_movements.reference_type values that mean "a stock
correction outside a sale/purchase/transfer": a full cycle count writes
AUDIT_REFERENCE_TYPE, the quick Adjust Stock flow writes
ADJUSTMENT_REFERENCE_TYPE. Both carry movement_type "adjustment" and both
appear in the Adjustments ledger - see client/AGENTS.md.

### constants-stock-adjustments-ts-L9

`client/lib/constants/stock-adjustments.ts:9`

Bulk CSV/XLSX import also corrects a product's quantity via
submitStockAudit, but tagged with this reference_type instead of
AUDIT_REFERENCE_TYPE - an import side effect isn't something a person
deliberately recorded, so the Adjustments ledger excludes it. Reuses the
same value product-import.ts already stamps on its opening-stock
movement, rather than a second near-synonym. See client/AGENTS.md.

### constants-stock-adjustments-ts-L17

`client/lib/constants/stock-adjustments.ts:17`

Rows written by product-import.ts before commit 3b7ce8b8 still carry
AUDIT_REFERENCE_TYPE instead of PRODUCT_IMPORT_REFERENCE_TYPE - a raw
client-side UPDATE can't reach the server's copy through the sync queue,
so the ledger also matches this legacy reason as a heal-on-read fallback
(same ruling as A-29/A-30) rather than backfilling stored bytes.

### constants-stock-adjustments-ts-L24

`client/lib/constants/stock-adjustments.ts:24`

stock_movements has no note column, so an adjustment's optional note rides
along inside `reason` behind this separator - see buildAdjustmentReason and
parseAdjustmentReason in components/stock-batch/adjustment-derivations.ts.

### constants-stock-adjustments-ts-L29

`client/lib/constants/stock-adjustments.ts:29`

The ADJUSTMENT_REASONS entries whose direction is "decrease", i.e. the ones
that mean stock is gone rather than sold - these are what the Stock Loss
figure values (see docs/STOCK_LOSS_METRIC.md). Held as the persisted LABELS
rather than the form's `value` keys because that is what
buildAdjustmentReason writes into stock_movements.reason; kept in step with
ADJUSTMENT_REASONS by adjustment-derivations.test.ts.

### constants-subscription-plans-catalog-ts-L3

`client/lib/constants/subscription-plans-catalog.ts:3`

Server plan strings are descriptive ("Pro Monthly", "pro_yearly") rather
than exact tier ids, so callers must match by substring/token instead of
an exact `.toLowerCase()` equality check (which silently falls back to
"free" on anything descriptive). Enterprise and pro are checked before
starter/free so a string that happens to also contain "pro" tokens still
resolves to the more specific tier first.

### context-auth-context-tsx-L133

`client/lib/context/auth-context.tsx:133`

True once the mount-time localStorage read has completed, regardless
of whether a saved user was found. See its declaration in
AuthProvider for why `user !== null` alone can't distinguish
"not hydrated yet" from "genuinely logged out".

### context-auth-context-tsx-L139

`client/lib/context/auth-context.tsx:139`

Establishes a local session directly from a cross-origin handoff
(impersonation / dashboard → app), bypassing PIN entry. See the
implementation for why it deliberately does less than login().

### context-auth-context-tsx-L149

`client/lib/context/auth-context.tsx:149`

The acting session's resolved permission group, or null when they have
none yet (pre-sync gap, or a store_owner/super_admin, who are never
group-assigned). THE single copy of this state: useHasPermission and
useOwnPermissionGroupId read it from here rather than each running their
own query and sync listener, so all 26+ call sites can never transiently
disagree with each other or with the booleans computed just below.

### context-auth-context-tsx-L160

`client/lib/context/auth-context.tsx:160`

True while this session came from a superadmin impersonation handoff
(see loginFromHandoff). Read by any consumer that must behave
differently under impersonation — e.g. SyncIndicator, which disables
sync entirely — so nothing has to re-derive it from localStorage on its
own. Backed by lib/utils/impersonation.ts's isImpersonatedSession(),
the same check the sync engine itself uses.

### context-auth-context-tsx-L170

`client/lib/context/auth-context.tsx:170`

Plain role-tier utility, NOT a permission gate - kept only for the two
call sites that inspect a role belonging to someone OTHER than the
acting user (staff-list.tsx's per-row admin badge, stock-transfers.ts's
original initiator), where "which permission group is this OTHER
record's role" doesn't apply. Every current-actor permission check uses
useHasPermission()/hasPermission() (lib/hooks/use-permissions.ts)
instead - do not call this from new gating code.

### context-auth-context-tsx-L189

`client/lib/context/auth-context.tsx:189`

Plain role-tier utility, NOT a permission gate - kept only for
cloud-danger-zone.tsx, whose `role` comes from the cloud-authenticated
dashboard account (useCurrentUser()), not the local PIN-authenticated
POS session useHasPermission()/hasPermission() resolve against. Gates
Factory Reset (Settings > Data): narrower than checkIsAdmin (which also
passes "manager") - wiping local data and disconnecting cloud sync
shouldn't be unilateral for anyone but the owner/main admin account. Do
not call this from new gating code on the local session's own user.

### context-inventory-audit-context-tsx-L12

`client/lib/context/inventory-audit-context.tsx:12`

Instantiated in app/(dashboard)/layout.tsx, wrapping DashboardLayout from
the outside. DashboardLayout keys its page-content wrapper on `pathname`
(see dashboard-layout.tsx) to retrigger the route-transition animation on
every navigation, which force-remounts everything below it on every
navigation - including the "/inventory/audits" -> router.replace
("/inventory/overview") bounce in useStockBatchManagement. State living
anywhere below that boundary gets wiped before the audit overlay ever got
a chance to stay open, so this context (and the overlay it drives) must
live above it instead.

### context-pull-to-refresh-context-tsx-L43

`client/lib/context/pull-to-refresh-context.tsx:43`

Lets the currently-mounted page register extra refresh logic (e.g. its own
manual refetch function) that runs when the user pulls-to-refresh at the
DashboardLayout level. Only one page's handler is active at a time: the
most recently mounted one wins, and it's cleared on unmount so a stale
page's refresh logic doesn't run after navigating away.

### context-store-context-tsx-L73

`client/lib/context/store-context.tsx:73`

Server-set by the online-payment onboarding endpoint and pulled down by
sync; read-only here (nothing in this app may write them, see
client/AGENTS.md). The bank code and last 4 exist purely so the settings
panel can show which account a connected store settles to.

### context-store-context-tsx-L80

`client/lib/context/store-context.tsx:80`

Server-set the last time store_slug actually changed (not on the
first-ever set) - drives the Settings UI's "you can change this again
on [date]" cooldown message. Read-only: nothing in this app writes it.

### context-store-context-tsx-L91

`client/lib/context/store-context.tsx:91`

Off by default: whether non-admin staff (specialist, sales_staff) can
use the POS header's "Request stock from another store" button.
Admin-tier roles (see checkIsAdmin) can always request transfers
regardless of this setting.

### context-store-context-tsx-L96

`client/lib/context/store-context.tsx:96`

Off by default: gates the POS cart's "Reseller sale" row (both the
reseller-commission and store-markup sub-types) - see
isMarkupSalesEnabled in use-feature-gate.ts.

### db-audit-actions-ts-L1

`client/lib/db/audit-actions.ts:1`

Named audit-log action types, for the mutations where "INSERT"/"UPDATE" on
a table name isn't specific enough to tell what actually happened without
parsing the details blob. Pass one of these to insert()/update()/remove()'s
`options.action` to override the generic default.

### db-base-helpers-ts-L52

`client/lib/db/base-helpers.ts:52`

Return type of assertStoreOwnership() — see its doc comment. A
discriminated union (rather than an optional `activeStoreId`) so
TypeScript itself enforces that a claim is never applied without the id
to claim it for.

### db-base-helpers-ts-L121

`client/lib/db/base-helpers.ts:121`

Every local writer of a `stock_movements` row passes through insert() or
softDelete(), so rebuilding the batch here covers all ten of them — and any
future one, which is the property the per-caller delta writes lacked. Must
run inside the caller's transaction, after the movement row.

### db-base-helpers-ts-L428

`client/lib/db/base-helpers.ts:428`

The record's pending UPDATE, if it has exactly one and nothing else queued.
Narrow on purpose: an INSERT must stay an INSERT, a DELETE must not be
overwritten, and a pre-existing multi-row backlog is left for
`withheldRecordsWithBackedOffSiblingsRemoved()` to order. See
client/AGENTS.md, "Queue collapsing", and docs/FIXED_BUGS.md A-203.

### db-base-helpers-ts-L495

`client/lib/db/base-helpers.ts:495`

`ignoreBackoff` lets an explicit, user-clicked "Sync Now" attempt the
whole queue immediately: a background auto-sync should respect each
item's exponential backoff (see recordSyncFailure), but a manual sync is
the user explicitly asking to retry right now, and should not silently
skip the entire queue (and still report "success") just because a prior
failure's backoff window hasn't elapsed yet.

### db-base-helpers-ts-L547

`client/lib/db/base-helpers.ts:547`

Flags a source row as settled after the server terminally rejected its
push (version_conflict/stale_timestamp) and the queue row was dropped.

Only for tables where no future pull can reconcile the row by id — see
TERMINAL_CONFLICT_SETTLES_SOURCE_ROW in sync-engine/push.ts. Without it the
row keeps _synced = 0 with no queue entry, which requeueOrphanedRows()
re-queues on every app boot into the same conflict, forever.

### db-batch-quantity-ts-L3

`client/lib/db/batch-quantity.ts:3`

`stock_batches.quantity` is a cache of its own movement log, not a running
total maintained by deltas. See
docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md.

### db-batch-quantity-ts-L9

`client/lib/db/batch-quantity.ts:9`

What a change did to a batch's log, so the carve-out can be judged against
the log as it stood *before* it: `inbound` grows with the very movement
being applied, and reading it afterwards writes off a legacy batch whose
stored quantity sales have worn down below it.

### db-batch-quantity-ts-L75

`client/lib/db/batch-quantity.ts:75`

Rebuilds each touched batch from its log, keyed by batch id with the net
delta of the movements that touched it — used only for the deltas the pull
applies, so the write stays raw: a pulled batch must not be re-queued for
push, and `_synced` must not be reset. Local writers go through
`insert()`/`softDelete()`, which keep the batch's `update()`.

### db-core-ts-L35

`client/lib/db/core.ts:35`

UI entry point for the graceful writer handoff (tab-lock.ts's
`requestWriterTakeover()`): asks the current writer to force-save and drop
to read-only. Callers should offer `forceWriterTakeover()` on "timeout"
(unresponsive holder) or "unsupported" (no BroadcastChannel).

### db-core-ts-L45

`client/lib/db/core.ts:45`

Fallback for `requestWriterHandoff()` timing out or being unsupported:
steals the Web Lock, rehydrating first. The outgoing holder's unsaved
changes are lost here, unlike the graceful path — see `stealWriterLock()`.

### db-core-ts-L95

`client/lib/db/core.ts:95`

Test-only: injects a bare database instance directly, bypassing
initDatabase()'s IndexedDB persistence and schema-migration machinery, so
unit tests can exercise query()/execute()/transaction() against a real
SQLite engine (e.g. a throwaway sql.js instance) instead of mocks. Never
called from production code paths.

### db-core-ts-L121

`client/lib/db/core.ts:121`

A short, human-scannable unique id for display fields people read
(receipt/transaction numbers). 48 random bits: short enough to print,
with enough headroom that collisions need tens of millions of rows.

### db-core-ts-L246

`client/lib/db/core.ts:246`

Re-reads the shared IndexedDB snapshot into `db`. Called by tab-lock.ts
once per tab, at promotion to writer. Returns `true` after a successful
rehydrate or when no snapshot exists at all; `false` only on a real read
failure, which tab-lock.ts treats as "refuse to promote". Deliberately
does not re-run schema migrations. See client/AGENTS.md, "One connection,
one writer".

### db-core-ts-L376

`client/lib/db/core.ts:376`

Bumped by every write, so a query() suspended at a yield point can tell
its read may have been torn. See client/AGENTS.md, "One connection, one
writer".

### db-core-ts-L574

`client/lib/db/core.ts:574`

Reserves the next slot in the shared connection-wide FIFO queue and
returns this caller's `previous`/`release` pair. Used by transaction(),
execute() and query(). Reserves synchronously, before the caller awaits
anything. See client/AGENTS.md, "One connection, one writer".

### db-core-ts-L589

`client/lib/db/core.ts:589`

Waits for every transaction() reserved so far to commit or roll back.
Await this before a bare query() whose rows leave the device (see
`getPendingSyncItems()`); it narrows, but does not close, the window.
See client/AGENTS.md, "One connection, one writer".

### db-core-ts-L673

`client/lib/db/core.ts:673`

Returns the raw database binary for export: sql.js (web) only. `db` is a
real Tauri SQL plugin connection on desktop/mobile, which has no
`.export()` method; use backupDatabaseToFile() there instead.

### db-core-ts-L763

`client/lib/db/core.ts:763`

Recovers the database as it stood immediately before the most recent
restoreDatabase() call (web only) — the one-generation-deep safety net
that restoreDatabase() snapshots into on every restore. Returns false
(does nothing) if no snapshot exists yet.

### db-core-ts-L776

`client/lib/db/core.ts:776`

Last-resort recovery for a local database that cannot be opened at all
(web/PWA only): snapshots the blob to `dumosrx_db_pre_reset_backup`, then
deletes the live key so the next boot starts fresh and re-pulls.
Deliberately does not touch `db` — it runs on the init-failure screen.

### db-core-ts-L839

`client/lib/db/core.ts:839`

Desktop/mobile-only restore: native open dialog, header validation,
snapshot of the live file, close, then overwrite `dumosrx.db`. The caller
must reload the app afterwards so initDatabase() reconnects. See
client/AGENTS.md, "Backup, restore, wipes and diagnostics".

### db-core-ts-L904

`client/lib/db/core.ts:904`

Read-only audit of legacy schema artifacts on this device. Run as
`await window.diagnoseLegacySchema()` from the console; safe anywhere,
including production, since it never writes. `findings` lists problems
present; `retirable` gives the per-migration verdict on whether THIS
device blocks deleting it. See client/AGENTS.md, "Backup, restore, wipes
and diagnostics", and docs/KNOWN_BUGS.md's deferred-work entry.

### db-core-ts-L1164

`client/lib/db/core.ts:1164`

Caches describing this device's relationship with the account/store being
replaced, as opposed to the device itself. Device-level keys (deviceId,
apiUrl, UI preferences, and especially loginLockout, which is a
brute-force control) are deliberately absent — see client/AGENTS.md, A-153.

### db-crash-report-sync-ts-L7

`client/lib/db/crash-report-sync.ts:7`

Matched against `_sync_queue q`. Resolved against the live `feedback` row
rather than the queue row's JSON payload because an UPDATE's payload holds
only the changed columns (a coalesced crash repeat sends content and
occurrence_count, never type/fingerprint) and a DELETE's holds only the id.

### db-crash-report-sync-ts-L21

`client/lib/db/crash-report-sync.ts:21`

Whether the pending `feedback` queue holds anything a user deliberately
submitted, as opposed to crash telemetry alone. A crash-only batch must not
earn a sync round of its own; user-submitted feedback must.

### db-deterministic-id-ts-L20

`client/lib/db/deterministic-id.ts:20`

A stable id for `parts`. The same parts always produce the same id, on
every device; different parts practically never collide (128 bits across
four salted lanes).

### db-deterministic-id-ts-L42

`client/lib/db/deterministic-id.ts:42`

The stock movement accompanying that batch — same key, so it collapses
with it. This is the one that actually matters for on-hand quantity: the
server derives `stock_batches.quantity` from movement deltas, and only an
INSERT contributes one.

### db-hooks-useLocalMutation-ts-L1

`client/lib/db/hooks/useLocalMutation.ts:1`

useLocalMutation - React hook for writing to local SQLite

Provides optimistic writes that are queued for sync.

### db-local-database-ts-L1

`client/lib/db/local-database.ts:1`

LocalDatabase - SQLite wrapper for offline-first operation

This file serves as the main entry point for database operations,
re-exporting core logic and specialized helpers.

### db-local-database-ts-L104

`client/lib/db/local-database.ts:104`

The category a product names is created on demand when it doesn't exist
yet, so this is a two-row write and belongs in one transaction() (same
reason as createPrescription below): committing the category and then
dying before the product leaves an empty category behind, already queued
for sync, that nothing will ever fill.

### db-local-database-ts-L291

`client/lib/db/local-database.ts:291`

Stock movements log a row per sale/receive/adjustment, so it's the fastest-growing
table in the schema; unlike other lists, we can't just load the full table forever.
Pass `sinceDays` for the default recent-activity view (cheap, bounded); omit it to
load full history, which the caller should only do when the user is actively
searching/filtering, so those still match against every record, not just what's
been loaded for browsing.

### db-movement-types-ts-L5

`client/lib/db/movement-types.ts:5`

Written by `sync:repair-health-sync-reconciliation` to cancel one of the
A-214 movements. Same kind of row for the same reason, so it is hidden
wherever the type above is.

### db-procurement-receiving-ts-L27

`client/lib/db/procurement-receiving.ts:27`

Overrides the PO line's cost for this receipt, if the actual invoiced
cost differs from what was ordered. Per BASE unit (per tablet/bag), not
per bulk unit - the same scale as products' catalog cost and as the
Immediate Purchase flow's "New Cost".

### db-procurement-receiving-ts-L32

`client/lib/db/procurement-receiving.ts:32`

When set, updates the product's global selling price; lets a price
change discovered while receiving stock be applied immediately instead
of requiring a separate trip to the product's edit screen.

### db-procurement-receiving-ts-L36

`client/lib/db/procurement-receiving.ts:36`

The product's live selling_price when the receive panel was opened -
not written anywhere, just carried through so a caller can tell
whether `selling_price` above is a real change.

### db-procurement-receiving-ts-L208

`client/lib/db/procurement-receiving.ts:208`

What the line costs on the ORDER - the figure the owner is invoiced for -
not item.subtotal, which is only set when the row is first added. Priced
from the per-bulk cost as typed when there is no override, so a ₦1,000
carton of 3 reads ₦1,000 and not 3 x ₦333.33; the batch keeps the rounded
per-unit cost for valuation. See client/AGENTS.md.

### db-procurement-receiving-ts-L217

`client/lib/db/procurement-receiving.ts:217`

Immediate Purchase: order and receipt happen in one transaction. Unlike
createPurchaseOrder() + receivePurchaseOrder(), this never leaves the PO
sitting in "pending" — it's created already "received", with its stock
batches, in a single atomic step. Reuses the exact per-item batch/cost/
expiry math receivePurchaseOrder() uses for Standard POs.

### db-procurement-ts-L11

`client/lib/db/procurement.ts:11`

Line-item form fields (selling_price, cost_price_override) come in as
`number | string | undefined` from raw form inputs - blank/undefined
means "not overridden," not zero. Also accepts `null` even though the
declared type doesn't advertise it: a PO reloaded from the DB via
getPurchaseOrderById() genuinely hands back SQL NULL for an unset
override (not `undefined`), and re-saving that PO (e.g. via
updatePurchaseOrder after editing something else) routes the same value
straight back through this function - `Number(null) === 0` would
silently turn "no override" into a literal, permanent 0 override.

### db-procurement-ts-L30

`client/lib/db/procurement.ts:30`

`partially_received` sits between `sent` and `received`: at least one
line has some stock in, but at least one line still has an outstanding
balance, so the order stays receivable.

### db-procurement-ts-L74

`client/lib/db/procurement.ts:74`

Cumulative quantity received so far against this line, in the same
unit as bulk_quantity. A line is outstanding while it's below
bulk_quantity, which is what keeps a short-delivered PO receivable.

### db-procurement-ts-L87

`client/lib/db/procurement.ts:87`

The product's live selling_price at read time (not the value stored on
this line item, which is whatever was submitted with the PO) - lets a
receive-time override be compared against what's actually on file
right now, rather than assuming any override differs from it.

### db-procurement-ts-L98

`client/lib/db/procurement.ts:98`

Weighted-average cost across the product's active batches right now -
the same figure the catalog shows, and the scale ("per base unit") the
receive panel's Cost Price input is read at.

### db-procurement-ts-L102

`client/lib/db/procurement.ts:102`

The cost of the most recent real (non-adjustment) batch, so the
receive panel can show what was actually last paid rather than only the
blended average.

### db-procurement-ts-L108

`client/lib/db/procurement.ts:108`

A line item as it exists in the create/edit PO form before submission:
not yet persisted, so it has no `id`/`po_id` (those are assigned by
createPurchaseOrder()/updatePurchaseOrder()). Immediate-purchase-only
fields are optional here (rather than only on ImmediateLineItemDraft)
so a Standard PO's items - which never set them - and an Immediate
Purchase's - which do - can share one persistence path and both survive
being saved as a draft.

### db-procurement-ts-L347

`client/lib/db/procurement.ts:347`

Loads every supplier, not a page of them: the caller runs search/filter over
the result, and suppliers stay small by nature (tens, rarely hundreds), so
in-memory filtering stays correct without needing SQL-level WHERE clauses,
matching the pattern used by getCustomers()/getPurchaseOrders() etc.

### db-queries-activity-log-ts-L35

`client/lib/db/queries/activity-log.ts:35`

The general-purpose, paginated version of what getProductHistory() does
for a single product: every audit_logs row, across every table, with
optional date/action/user filters. Distinct from the dashboard's small
"Recent Activity" widget (which reads from sales/stock_movements/etc.
directly, not audit_logs); this is the full trail.

### db-queries-auth-ts-L17

`client/lib/db/queries/auth.ts:17`

Single-row convenience wrapper around getUsersByUsernameOrEmail. Returns
whichever SQLite yields first when more than one row matches (a genuine
multi-store username collision) — callers that need to authenticate a PIN
against a possibly-ambiguous identifier MUST use getUsersByUsernameOrEmail
directly instead, so they can detect and refuse an ambiguous match rather
than silently authenticating against a random one. See auth-context.tsx's
login().

### db-queries-auth-ts-L74

`client/lib/db/queries/auth.ts:74`

Stores a PIN hashed, never raw - see lib/utils/pin-hash.ts. Goes through
update() so it queues for sync push like any other local write, which is
also how a hash reaches the server and, from there, every other device.

### db-queries-auth-ts-L93

`client/lib/db/queries/auth.ts:93`

Null means "no row" or "column not yet backfilled on this device" -
callers should treat that the same as "use the local default", not as
an explicit 0 (off).

### db-queries-customers-ts-L29

`client/lib/db/queries/customers.ts:29`

Net-of-refunds lifetime spend for one customer, as of right now - used at
POS checkout to find which loyalty tier a sale's points should earn at
(see getApplicableTierMultiplier). Same netting logic as getCustomers(),
scoped to a single customer instead of aggregating the whole store.
Scoped by store_id (not just customer_id) the same way
getCustomerTransactions() is - on a device with multi-store access, a
device-wide cache can hold another store's sales too, and customer_id
alone doesn't rule those out at the SQL level.

### db-queries-customers-ts-L135

`client/lib/db/queries/customers.ts:135`

Applies a credit payment to a customer's oldest outstanding credit sales
first (FIFO): a sale is marked "completed" once its cumulative amount_paid
reaches its total, otherwise "partial". Doesn't touch the customer's
outstanding_balance; the caller (recordCustomerPayment) does that.

### db-queries-customers-ts-L205

`client/lib/db/queries/customers.ts:205`

Single source of truth for recording a customer debt payment: used by
both the Customer Directory and the Record Payment button on a specific
sale's transaction details. Self-contained (re-reads the customer's
current balance rather than trusting caller-held state) since it's called
from more than one page.

### db-queries-diagnostics-detail-ts-L6

`client/lib/db/queries/diagnostics-detail.ts:6`

The half of a device's state the server cannot see: stuck payloads, rows
that will be re-queued on the next boot, the crash log, the clock watermark
and which tables actually exist. Driven by the 2026-10-09 coverage audit
against past incidents — see docs/superpowers/specs and docs/FIXED_BUGS.md.

Every query here is a SELECT.

### db-queries-diagnostics-detail-ts-L82

`client/lib/db/queries/diagnostics-detail.ts:82`

Terminal drops, grouped. Every table writes to the ledger now, so this is
the first view of a change the server refused outright — the "50 changes
could not be saved" shape, previously invisible once the push finished.

### db-queries-diagnostics-detail-ts-L96

`client/lib/db/queries/diagnostics-detail.ts:96`

Unlike unresolvedConflicts(), this keeps the resolved rows: a sale on the
same batch marks a dropped cost edit resolved seconds later without the cost
ever reaching the server (A-268), so the resolved ones are the evidence.

### db-queries-diagnostics-detail-ts-L109

`client/lib/db/queries/diagnostics-detail.ts:109`

Costs for the batches a device can disagree with the server about: the ones
the pull skips (pending queue row or unsynced), plus the highest-value rows,
since a valuation gap the owner notices is dominated by a few of those.
Capped so the report stays well inside the support endpoint's size limit.

### db-queries-diagnostics-detail-ts-L136

`client/lib/db/queries/diagnostics-detail.ts:136`

A-162/A-165/A-167: the one datum nobody had was the `store_id` INSIDE the
frozen payloads. `last_error` is deliberately reduced to a class — its first
300 chars can be a driver error quoting a whole row.

### db-queries-diagnostics-detail-ts-L171

`client/lib/db/queries/diagnostics-detail.ts:171`

Rows this device will silently re-queue on its next boot: `_synced = 0`
with no queue entry. The shape behind the "50 changes could not be saved"
loop and the markSynced regressions, invisible between boots.

### db-queries-diagnostics-ts-L29

`client/lib/db/queries/diagnostics.ts:29`

Read-only snapshot of one device's own sync state. Every query here is a
SELECT — see docs/superpowers/specs/2026-10-08-device-diagnostics-console-design.md
for why this exists and what it is allowed to do.

### db-queries-finance-ts-L26

`client/lib/db/queries/finance.ts:26`

Net Sales for a [from, to) window: total_amount already excludes discounts
(see pos-calculations.ts), so this only needs to also back out tax
collected (pass-through, not real revenue) and refunds - same definition
used by the Analytics BI dashboard's netSales, see use-bi-data.ts.
Takes an explicit local-timezone window (rather than SQLite's UTC-based
strftime('now')) so "this month" agrees with the expense side of the P&L
report, which is windowed the same way.

### db-queries-finance-ts-L139

`client/lib/db/queries/finance.ts:139`

Sums expenses for a [from, to) window using {@link getSmoothedAmountInWindow}
for each row.

@param viewerId - when provided, restricts results to expenses recorded by
this user (pass undefined for viewers allowed to see everyone's activity,
i.e. checkCanViewAllActivity(role) === true).

### db-queries-finance-ts-L210

`client/lib/db/queries/finance.ts:210`

Per-category breakdown for a [from, to) window, smoothed the same way as
{@link getSmoothedExpensesTotal} so the two agree — the breakdown summing
to something other than the headline P&L expense total would otherwise
read as a report bug, not the intentional design it's meant to be.

### db-queries-finance-ts-L272

`client/lib/db/queries/finance.ts:272`

One page of the expense ledger, newest first. Follows the rows/total shape
getActivityLog() uses.

Reads a table that grows every day for the life of the store, so the Expenses page walks it a page at a time instead. The figures shown
alongside the list deliberately do NOT come from the loaded page - see
getExpensesLifetimeTotal, getSmoothedExpensesTotal and
getCurrentMonthExpensesByCategory, which all aggregate over everything.

### db-queries-finance-ts-L289

`client/lib/db/queries/finance.ts:289`

Matched against the description, the same field the Expenses page's search
box has always filtered on - in SQL rather than client-side, so searching
reaches the whole ledger and not just the loaded page.

### db-queries-finance-ts-L335

`client/lib/db/queries/finance.ts:335`

The lifetime expense figure, summed in SQL.

Deliberately NOT smoothed, matching what the Expenses page has always shown:
this is a real ledger figure (how much has actually been recorded as spent,
ever), and smoothing only makes sense when attributing an expense to a
period. In SQL rather than reduced over the loaded list, so paginating the
list can't change the number on screen.

### db-queries-finance-ts-L360

`client/lib/db/queries/finance.ts:360`

Cash that physically left the drawer on `reportDate` ("YYYY-MM-DD"), for
till reconciliation. Deliberately NOT smoothed the way
getSmoothedExpensesTotal is: a prepaid expense paid in cash today takes
its whole amount out of today's till, whatever period it covers.
A blank/legacy payment_method counts as cash - the expense form's own
default is "Cash", and missing one that was cash would leave the drawer
short against this figure.

### db-queries-inventory-ts-L152

`client/lib/db/queries/inventory.ts:152`

Inserts the sale_items row for one cart line and deducts/logs the stock it
consumed. Extracted out of use-pos-payment.ts's handlePayment so the
getBatchesForProduct-empty-list case (see getAnyActiveBatchForProduct) has
a single, unit-testable place to fix and guard against regressing: every
completed sale must leave a stock_movements trace for what it sold, even
when the product's real stock was already fully depleted.

### db-queries-inventory-ts-L160

`client/lib/db/queries/inventory.ts:160`

The quantity write and its `stock_movements` row must land together or a
concurrent stock fold reads the batch as diverged and writes the pre-sale
number back — see docs/FIXED_BUGS.md A-219. Nested `transaction()` calls
deadlock on core.ts's FIFO queue, so a caller that already opened one runs
this inline.

### db-queries-inventory-ts-L560

`client/lib/db/queries/inventory.ts:560`

The product's live quantity: the SUM of its active, non-deleted batches,
i.e. the same aggregate getProducts() derives stock_quantity from. Used
both inside submitStockAudit's transaction and by the cycle-count ledger
to stamp a row's baseline when a figure is entered (A-263).

### db-queries-inventory-ts-L578

`client/lib/db/queries/inventory.ts:578`

What the system believed this product held at the moment `countedQty`
was observed. The discrepancy is measured against this, not against
stock at submit time, so movements between the count and the submit are
preserved rather than reversed. Omitted by callers whose semantics are
"the stock is X right now" (catalog quick edit, CSV import), which keep
the re-read behaviour. See A-263.

### db-queries-inventory-ts-L719

`client/lib/db/queries/inventory.ts:719`

The one implementation of "move a product's on-hand stock by `delta`,
spread across its batches, leaving a stock_movements trail". Shared by the
cycle count (submitStockAudit) and the quick Adjust Stock flow
(submitStockAdjustment) so the two can never drift apart - see
client/AGENTS.md. Must run inside an existing transaction.

### db-queries-inventory-ts-L839

`client/lib/db/queries/inventory.ts:839`

Persists a quick Adjust Stock submission: every item moves under one
shared reference_id so the Adjustments ledger can show the whole
submission as a single row, tagged reference_type ADJUSTMENT_REFERENCE_TYPE
to stay distinguishable from a full cycle count. Returns that reference id.

### db-queries-loyalty-ts-L18

`client/lib/db/queries/loyalty.ts:18`

Value, in the store's currency, this option discounts off a sale at
checkout. 0 for non-monetary perks (e.g. "Free Delivery"), which are
configurable here but not selectable as a POS checkout redemption.

### db-queries-loyalty-ts-L63

`client/lib/db/queries/loyalty.ts:63`

currencySymbol defaults to Naira for callers that predate per-store
currency (e.g. tests seeding without a store currency in scope) — pass the
store's actual symbol (getCurrencySymbol(storeProfile.currency)) wherever
one is available.

### db-queries-loyalty-ts-L101

`client/lib/db/queries/loyalty.ts:101`

The customer's dated points ledger, oldest first — the input to FIFO
points-expiry math (see calculateExpiredPoints). Not store-scoped: the
table has no store_id column, and customer_id is already store-unique.

### db-queries-permission-groups-ts-L100

`client/lib/db/queries/permission-groups.ts:100`

The keys a default group for `role` is owed by every catalog version
newer than `fromVersion`, in catalog order. Exported for the sync-engine
and server-parity tests.

### db-queries-prescriptions-ts-L52

`client/lib/db/queries/prescriptions.ts:52`

Soft-deletes a single item row (one medication line removed while editing
a prescription), leaving the prescription's other items — and their refill
history — untouched.

### db-queries-prescriptions-ts-L59

`client/lib/db/queries/prescriptions.ts:59`

Updates an existing item row in place. Deliberately never touches id,
refills_used or next_refill_date: re-editing a prescription must not reset
how many refills a patient has already collected, or when the next one is
due.

### db-queries-prescriptions-ts-L171

`client/lib/db/queries/prescriptions.ts:171`

Items for a known set of prescriptions.

Replaces a whole-table read: prescription_items grows by a row per dispensed
medication line for the life of the store, and the queue only ever needs the
lines belonging to the prescriptions it actually loaded.

### db-queries-prescriptions-ts-L211

`client/lib/db/queries/prescriptions.ts:211`

Records a refill dispense on an already-completed/dispensed prescription:
bumps refills_used and pushes next_refill_date forward for every item that
still has refills remaining, and stamps the prescription's dispensed_at so
it counts toward "filled today" stats.

### db-queries-procurement-ts-L23

`client/lib/db/queries/procurement.ts:23`

Catalog fields the PO item search needs. They are here so the builder
can hand this one list to its ProductCombobox instead of every combobox
querying the whole catalog again under its own key - without them, the
combobox would silently lose generic-name matching.

### db-queries-procurement-ts-L59

`client/lib/db/queries/procurement.ts:59`

Promotes any leftover "draft" purchase orders to "pending" - a status
this app no longer creates, but old local rows (or rows from a device that
hasn't picked up this migration) can still carry it. Runs once at app
boot (see DatabaseProvider). Goes through update() (not a raw UPDATE) so
the change actually syncs to the cloud and isn't silently local-only.

### db-queries-procurement-ts-L99

`client/lib/db/queries/procurement.ts:99`

A-26: a stale device's legitimate second partial receipt derives the same
deterministic ids as the first, so the server collapses its stock rows into
the first receipt's and drops its `quantity_received` UPDATE as a terminal
conflict. The stock is on the shelf and not in the system, and the PO just
reads as having an ordinary outstanding balance. This reports whether any
such drop is still outstanding against this order's lines so the receiving
screen can say so. See client/AGENTS.md, "The terminal-conflict ledger".

### db-queries-product-export-ts-L18

`client/lib/db/queries/product-export.ts:18`

One row per product. Supplier comes from whichever active batch happens to
be picked by SQLite's GROUP BY when a product has batches from more than
one supplier — acceptable for an export snapshot; batch-level supplier
detail is already visible in Batch Management.

### db-queries-products-ts-L69

`client/lib/db/queries/products.ts:69`

The weighted-average cost across a product's active batches - the same
DISPLAY figure getProductsWithDetails() derives for the catalog. Nothing
computes on it (margin/COGS and FEFO deduction read each batch's own
cost_price); it is read here only so the post-receive confirmation can
state what the catalog will now show alongside the singular batch cost
that was actually typed.

### db-queries-products-ts-L141

`client/lib/db/queries/products.ts:141`

Earliest audit_logs entry for this product, for the Details tab's
"Created by / Date created" line; the fuller trail lives in the
History tab via getProductHistory() below.

### db-queries-products-ts-L159

`client/lib/db/queries/products.ts:159`

@param viewerId - when provided, restricts results to entries performed by this
user (pass undefined for viewers allowed to see everyone's activity, i.e.
checkCanViewAllActivity(role) === true).

### db-queries-reports-ts-L24

`client/lib/db/queries/reports.ts:24`

Builds the " AND alias.user_id = ? AND alias.payment_method = ?" tail
(plus matching params, in the same order) shared by every report/BI query
that aggregates the `sales` table - alias is "" for queries that select
FROM sales with no alias, or "s." for queries that join it as `s`.

### db-queries-reports-ts-L117

`client/lib/db/queries/reports.ts:117`

@param viewerId - when provided, restricts the recent-activity feed (sales,
stock movements, purchase orders, expenses, prescriptions) to entries
performed by this user (pass undefined for viewers allowed to see everyone's
activity, i.e. checkCanViewAllActivity(role) === true). Today's revenue/
refund totals are NOT scoped by this: those stay store-wide regardless of
role, since cashiers need accurate shift/till totals for reconciliation.
Product-catalog additions have no creator/user column to scope by, so a
scoped viewer sees none of that feed source rather than everyone else's
additions.

### db-queries-reports-ts-L396

`client/lib/db/queries/reports.ts:396`

Ranked by revenue, not quantity: a product that sells a lot of cheap
units and one that sells fewer expensive units both matter to the
business, and revenue is the one number that makes them comparable.
Unlike getFastMovers() (inventory.ts: a fixed rolling-N-days window with
a week-over-week trend, capped at 5, for a small dashboard widget), this
takes an arbitrary date range for a full report.

### db-queries-returns-ts-L13

`client/lib/db/queries/returns.ts:13`

The parent sale, used to scope how much of this product's per-batch
split a *prior* return already restored (see the comment in
restoreReturnedStock below). Optional only for callers that predate
this field - omitting it disables the already-returned-quantity netting
and restores the old (buggy on a second partial return) behavior.

### db-queries-returns-ts-L22

`client/lib/db/queries/returns.ts:22`

How much of each of this sale_item's original per-batch split has
already been restored by an *earlier* return of the same product within
the same sale. Scoped to `saleId` (not just `productId`) so a return of
the same product from a *different* sale that happens to share a batch
(routine under FEFO) is never counted - and to `saleId` rather than
`saleItemId` directly because return_items has no sale_item_id column;
this is safe because the POS cart merges duplicate products into one
line, so at most one sale_item per product exists within a given sale.

### db-queries-returns-ts-L80

`client/lib/db/queries/returns.ts:80`

Restores stock for a returned sale line to the exact batches it was drawn
from, in the proportions recorded at sale time (FEFO splits may span >1
batch). Falls back to the legacy single stock_batch_id for sales made
before sale_item_batches existed.

### db-queries-sales-ts-L245

`client/lib/db/queries/sales.ts:245`

With no dateRange, returns the 100 most recent sales (the default POS
Recent Sales view). Once a dateRange is picked, the query is bounded by
that range instead of the row snapshot - matching getStockMovements()'s
same-shaped default-window/explicit-range split - so a range that reaches
past the last 100 sales doesn't silently come back empty/incomplete.

### db-queries-setup-ts-L21

`client/lib/db/queries/setup.ts:21`

The single source for every "X changes unsynced" surface (sync indicator,
Action Center alert, the logout warning dialog). Automatic crash reports
are excluded: they are background telemetry the user never asked to send,
so counting them tells someone they have unsaved work when they don't —
and a crash row the server keeps rejecting would otherwise pin the
indicator to "Pending Sync" forever. They still sync, as a passenger on
the next sync run; see docs/SYNC_CRASH_REPORT_POLICY.md.

### db-queries-setup-ts-L35

`client/lib/db/queries/setup.ts:35`

Per-table/operation breakdown of what's actually sitting in `_sync_queue`,
for the sync indicator's "what's pending" detail view — the plain count
alone gives no way to tell "351 tiny stock movements" from "351 products",
which matters for judging whether a slow sync is expected or stuck.

### db-queries-stock-transfers-ts-L26

`client/lib/db/queries/stock-transfers.ts:26`

The initiating user's role. When not admin-tier (e.g. a cashier
requesting stock from another store, no owner immediately available),
both rows this transfer writes are flagged `status: "needs_review"` so
an owner can check it after the fact — the transfer itself still takes
effect immediately either way; nothing here blocks it.

### db-queries-stock-transfers-ts-L103

`client/lib/db/queries/stock-transfers.ts:103`

Mirrors findExistingProductId's precedence in product-import.ts (barcode
-> name+category -> name), just scoped to an explicit destStoreId instead
of the active-store resolver, since a transfer's destination store is
very often NOT the store currently active in the UI.

### db-queries-stock-transfers-ts-L381

`client/lib/db/queries/stock-transfers.ts:381`

Clears the `needs_review` flag on every leg of one transfer, marking it
`reviewed` rather than blanking it so the record still shows the transfer
was flagged and then checked. Idempotent: it only ever touches rows still
sitting at `needs_review`, so a second call (or two devices reviewing the
same transfer) writes nothing and returns 0. Each leg is updated under its
OWN `store_id`, never the acting store's, because the out and in legs live
in two different stores by definition.

### db-queries-stock-transfers-ts-L428

`client/lib/db/queries/stock-transfers.ts:428`

Products with positive stock in `storeId`, for the transfer dialog's
product picker — deliberately takes an explicit store id rather than
reading the active-store resolver, since the dialog's chosen source store
is very often not the store currently active in the rest of the UI.

### db-queries-stock-transfers-ts-L466

`client/lib/db/queries/stock-transfers.ts:466`

Reconstructs one row per transfer by grouping the transfer_out side of
stock_movements on reference_id and joining in its paired transfer_in row
— see the header-table decision note at the top of this file for why
there's no dedicated table to just SELECT * from instead.

### db-reconcile-identity-ts-L8

`client/lib/db/reconcile-identity.ts:8`

Tables whose server-side push handling silently skips an INSERT when the
name collides with an existing row for the same owner (see
SyncController::push's "duplicate name" handling for categories and
suppliers) rather than creating a second row. Shared by pull.ts's ongoing
delta-pull reconciliation and push.ts's immediate id_map-based fixup
(see PushResponse.id_map in sync-engine/types.ts).

### db-reconcile-identity-ts-L122

`client/lib/db/reconcile-identity.ts:122`

Runs requeueOrphanedRows() once per install. Returns null when skipped.
Why it takes no re-arming trigger: client/AGENTS.md, "The boot-time orphan
scan".

### db-reconcile-identity-ts-L207

`client/lib/db/reconcile-identity.ts:207`

Remaps every local row referencing `oldStoreId`/`oldUserId` to the real
server ids, marks touched rows unsynced so they get re-pushed with valid
foreign keys, and soft-deletes the now-orphaned local-only store/user rows.

### db-schema-migrations-ts-L1

`client/lib/db/schema-migrations.ts:1`

Schema Migration Machinery

Extracted from lib/db/core.ts: the dual-backend adapter shim and the
idempotent, run-on-every-launch schema/data migration steps that
initDatabase() applies to an existing local database.

### db-sync-engine-conflict-log-ts-L3

`client/lib/db/sync-engine/conflict-log.ts:3`

Local-only ledger of terminal push conflicts, so a dropped change leaves a
durable trace instead of only a transient toast. See client/AGENTS.md,
"The terminal-conflict ledger (A-26)", for why it exists and what reads it.

### db-sync-engine-conflict-log-ts-L63

`client/lib/db/sync-engine/conflict-log.ts:63`

Keeps the ledger bounded now that every table writes to it. Resolved rows
go first and oldest-first within that, so an unresolved drop survives until
something settles it — the whole point of the ledger.

### db-sync-engine-conflict-log-ts-L85

`client/lib/db/sync-engine/conflict-log.ts:85`

A later change to the same record reaching the server means whatever the
dropped one carried has been superseded by something the store did since,
so the outstanding signal is settled rather than left on screen forever.

### db-sync-engine-deferred-stock-deltas-ts-L4

`client/lib/db/sync-engine/deferred-stock-deltas.ts:4`

Deferred `stock_movements` quantity deltas, persisted rather than held in
memory so an interrupted pull round cannot lose one. See client/AGENTS.md,
"Deferred movement deltas".

### db-sync-engine-deferred-stock-deltas-ts-L12

`client/lib/db/sync-engine/deferred-stock-deltas.ts:12`

A delta whose batch never arrives never resolves, so reporting it once and
falling silent reads as "it fixed itself". It is re-reported on this
interval afterwards: often enough that a chronic divergence stays visible,
rarely enough that it doesn't drown the issue it belongs to.

### db-sync-engine-deferred-stock-deltas-ts-L120

`client/lib/db/sync-engine/deferred-stock-deltas.ts:120`

Drops deltas for movements the server has voided. The drain already does
this from the local row, but a mid-round drain runs before that page's own
soft-deletes have been written, so the void has to be read off the payload.

### db-sync-engine-delivery-age-ts-L31

`client/lib/db/sync-engine/delivery-age.ts:31`

Reads without clearing, for the pasteable support ticket. The per-push
report owns the drain; a second drain here would silently halve what the
admin panel sees.

### db-sync-engine-delivery-age-ts-L61

`client/lib/db/sync-engine/delivery-age.ts:61`

How long each just-accepted edit waited between being queued and being
delivered. Counted here because the queue row is deleted moments later and
nothing else ever knew an edit's age; a per-attempt success rate cannot
tell a push that worked from one that has been failing for a day.

### db-sync-engine-delivery-age-ts-L88

`client/lib/db/sync-engine/delivery-age.ts:88`

Reads and clears, so each report describes the interval since the last one
rather than a cumulative total that only ever grows. Null when nothing was
delivered, which is not the same as everything being delivered instantly.

### db-sync-engine-devtools-hooks-ts-L7

`client/lib/db/sync-engine/devtools-hooks.ts:7`

Support tools for a DevTools session, deliberately not in-app buttons.
Extracted from index.ts to keep it under the 350-line limit (AGENTS.md §4).

This forms a cycle with index.ts, which imports this file for its side
effect. Safe only because the imports below are hoisted function
declarations — see __tests__/devtools-hooks-binding.test.ts.

### db-sync-engine-index-ts-L42

`client/lib/db/sync-engine/index.ts:42`

Opaque per-sync-run token. crypto.randomUUID is unavailable on insecure
origins and older webviews, so it falls back to timestamp+random; only
per-device uniqueness within one short run window matters.

### db-sync-engine-index-ts-L49

`client/lib/db/sync-engine/index.ts:49`

Escape hatch for a device whose pull cursor has drifted ahead of rows it
never received: clears `_sync_state` only, forcing a full re-fetch. The
cleared windows are stashed and put back if the resync commits no page at
all, so a pull that cannot succeed leaves the device no worse off than it
started (A-243). See client/AGENTS.md, "`sync()` and friends".

### db-sync-engine-index-ts-L73

`client/lib/db/sync-engine/index.ts:73`

See reconcile-quantities.ts for the implementation; re-exported here so
every other sync-engine entry point (including the `window.*` DevTools
hooks below) lives in one place.

### db-sync-engine-index-ts-L87

`client/lib/db/sync-engine/index.ts:87`

Records every attempt's outcome, then returns it. A wrapper rather than a
line at each `return` so an exit path added later cannot forget — see
sync-outcome.ts for why the last ATTEMPT is the number that was missing.

### db-sync-engine-index-ts-L264

`client/lib/db/sync-engine/index.ts:264`

Privileged Subscription Status Sync

Pulls ONLY the `stores` table (subscription_tier, status,
suspension_reason, license_token), regardless of plan tier, so downgrades,
suspensions and renewals still land when full sync is disabled.

### db-sync-engine-pull-skip-report-ts-L11

`client/lib/db/sync-engine/pull-skip-report.ts:11`

One report per pull run instead of one per skipped row. The record ids stay
out of the message so a recurring skip keeps a single crash fingerprint and
a single Sentry issue; the sample in the context is what identifies them.
See client/AGENTS.md, "What reaches Sentry".

### db-sync-engine-pull-window-ts-L4

`client/lib/db/sync-engine/pull-window.ts:4`

Consecutive full-table rewinds allowed before a table's baseline is put
back and the device reports instead of grinding. Reset to zero whenever
the table drains skip-free (PULL_PROGRESS.completeWindow), so this only
bites a table that genuinely cannot re-stamp its window. Rationale and
the A-218/A-229 failure paths: client/AGENTS.md, "Pull window rewinds".

### db-sync-engine-pull-window-ts-L13

`client/lib/db/sync-engine/pull-window.ts:13`

Tables the server never sends, so a pull window for them is meaningless.
`feedback` is the crash log: write-only telemetry, absent from pull()'s
table list, so its window can never drain clean and can never have its
rewind budget refreshed by `completeWindow`. Left in place it reports
"budget still exhausted" on every round for ever - and each report is
itself a crash log, which is the row that keeps the condition alive. See
docs/FIXED_BUGS.md A-256.

### db-sync-engine-pull-window-ts-L40

`client/lib/db/sync-engine/pull-window.ts:40`

The only way a caller outside this module may advance a pull window. It
names the one column it owns — an INSERT OR REPLACE reverted the rewind
bookkeeping to its schema defaults (A-228) — and refuses to stamp over a
rewind in flight, because a newer stamp cancels the re-pull.

### db-sync-engine-pull-window-ts-L67

`client/lib/db/sync-engine/pull-window.ts:67`

Runs at the start of every pull round, unconditionally: the budget is spent
by live faults, but the fault may never fire again, and until this ran only
inside rewindPullWindow() such a table kept a null window for ever. See
client/AGENTS.md, "Pull window rewinds".

### db-sync-engine-pull-window-ts-L121

`client/lib/db/sync-engine/pull-window.ts:121`

Restores a stash, but only while `_sync_state` is still empty: any row means
the resync committed a page, so its fresh positions must win. Returns
whether it restored anything.

### db-sync-engine-pull-window-ts-L156

`client/lib/db/sync-engine/pull-window.ts:156`

shortcut: rewinds the whole table's window rather than re-requesting the
one row, because the sync API has no by-id re-send endpoint. Upgrade to a
targeted request when one exists — A-176 needs the same endpoint, and it
would remove the need for this budget entirely.

### db-sync-engine-pull-ts-L48

`client/lib/db/sync-engine/pull.ts:48`

Whether this pull's `stores` response can be read as a snapshot of every
store the ACCOUNT owns — the premise the prune below rests on. It cannot
for a staff identity. See client/AGENTS.md, "The `stores` prune and how a
store disappears".

### db-sync-engine-pull-ts-L70

`client/lib/db/sync-engine/pull.ts:70`

Columns each device owns privately: written locally, never pushed, so the
server's copy is meaningless and must never be written back. See
client/AGENTS.md, "Pull details (sync-engine/pull.ts)".

### db-sync-engine-push-ts-L55

`client/lib/db/sync-engine/push.ts:55`

Reasons where the server kept a row this device now disagrees with, so the
device has to be made to re-pull it. `permission_denied` is excluded on
purpose: no pull can settle it (REASONS_SETTLING_SOURCE_ROW), and a
plan-gated queue would retrigger the rewind every single round. See
client/AGENTS.md, "Push details", and docs/FIXED_BUGS.md A-205.

### db-sync-engine-push-ts-L66

`client/lib/db/sync-engine/push.ts:66`

Sorts categories to the front of the queue, leaving every other row's
relative order untouched. Must stay a *consistent* comparator — see
client/AGENTS.md, "Push details (sync-engine/push.ts)".

### db-sync-engine-push-ts-L109

`client/lib/db/sync-engine/push.ts:109`

Folds every pending UPDATE for the same (table_name, record_id) into one
merged change: later fields win, the merged payload keeps the EARLIEST
entry's `_version`, and `mergedIdsByRepId` maps the representative queue
row id to every row folded into it so callers settle them all together.
INSERT/DELETE are untouched. Why this is required, and why it must run
before batch slicing: client/AGENTS.md, "Push details".

### db-sync-engine-push-ts-L168

`client/lib/db/sync-engine/push.ts:168`

Removes every currently-due UPDATE from `pending` whose record has ANY
sibling UPDATE still backed off in `_sync_queue`; INSERT/DELETE are never
held back. One query per distinct record — a correctness-critical path,
not a hot loop. Rationale: client/AGENTS.md, "Push details".

### db-sync-engine-reconcile-quantities-ts-L20

`client/lib/db/sync-engine/reconcile-quantities.ts:20`

Inserts a server-created reconciliation movement as already-synced, so
this device's next pull finds the row already present (the UPDATE branch
in pull.ts, which never replays a delta) instead of inserting it fresh and
re-applying the very delta it was derived from. This is the same
idempotency every other locally-originated movement already gets from
push() round-tripping through pull() - the only difference here is the
row was created by the server, not this device, so it has to be seeded
locally by hand. A UNIQUE-constraint failure means it's already present
(e.g. a retried request) and is ignored, matching pull.ts's own handling.

### db-sync-engine-schema-ts-L6

`client/lib/db/sync-engine/schema.ts:6`

Retrieves and caches the valid columns for a given table.

An empty result means the table does not exist locally: PRAGMA
table_info on an unknown table returns no rows rather than erroring.
That answer is deliberately never cached, so a table created by a
migration (or by a later initDatabase running SCHEMA_SQL) is picked up
instead of being treated as missing for the rest of the session.

### db-sync-engine-stock-auto-heal-ts-L11

`client/lib/db/sync-engine/stock-auto-heal.ts:11`

Automatic repair of this device's own stock drift, run from the 24-hourly
sync health check. Rationale, refusals and failure modes:
docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md, "Phase 3".

### db-sync-engine-stock-auto-heal-ts-L19

`client/lib/db/sync-engine/stock-auto-heal.ts:19`

Whether this device holds the whole movement log up to a server timestamp:
a stamped window with no mid-window cursor left over. Mid-window, the log
is known-incomplete and a fold would mass-rewrite quantities the rest of
the window is about to correct anyway.

### db-sync-engine-stock-auto-heal-ts-L67

`client/lib/db/sync-engine/stock-auto-heal.ts:67`

Verifies, repairs what the log can rebuild, re-verifies, and reports once.
Silent to the owner by design; the Sentry report and the audit row the fold
writes are the record. Swallows its own failures so it can never break the
row-count deficit path that follows it in the health check.

### db-sync-engine-stock-fingerprint-ts-L10

`client/lib/db/sync-engine/stock-fingerprint.ts:10`

What this device believes about its stock: how many batches, how many units,
and what they are worth at cost. The server compares these against what it
derives itself, so a divergence between two devices of one store is visible
without anyone counting shelves. See docs/superpowers/specs/2026-10-07-stuck-data-and-
divergence-visibility-design.md, Phase 1.

### db-sync-engine-stock-integrity-ts-L14

`client/lib/db/sync-engine/stock-integrity.ts:14`

Divergence between a batch's stored `quantity` and the sum of its own
`stock_movements`. See
docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md.

### db-sync-engine-stock-integrity-ts-L22

`client/lib/db/sync-engine/stock-integrity.ts:22`

Disagrees with the log, but has a delta still queued to apply — so the
disagreement may be the queued work, and folding it would let the drain
apply the same delta twice. Reported, never folded.

### db-sync-engine-stock-integrity-ts-L26

`client/lib/db/sync-engine/stock-integrity.ts:26`

Holds more units than its inbound movements can account for, so part of
its stock was never logged (A-148); folding one would write that part off.
Reported, never folded.

### db-sync-engine-stock-integrity-ts-L203

`client/lib/db/sync-engine/stock-integrity.ts:203`

An automatic heal is audited under its own action: an admin-attributed
repair row for a run no admin triggered would misname who changed the
numbers, which is the question a staff dispute turns on.

### db-sync-engine-sync-commands-ts-L20

`client/lib/db/sync-engine/sync-commands.ts:20`

Tables whose queued rows this device will discard on request. An
ALLOWLIST, mirroring the server's: a business record exists only here, so
discarding one permanently loses revenue data or falsifies stock. The
server refuses these too — this is the second of two locks, not the only
one, because a client must never rely on a server check it cannot see.

### db-sync-engine-sync-commands-ts-L29

`client/lib/db/sync-engine/sync-commands.ts:29`

Applies operator commands to `_sync_queue` and nothing else. The vocabulary
is a closed switch rather than a lookup: an unrecognised action is refused,
never dispatched.

### db-sync-engine-sync-commands-ts-L54

`client/lib/db/sync-engine/sync-commands.ts:54`

Outcomes are persisted rather than held in memory. A push run is usually a
single batch, so an in-memory buffer was discarded before it could ever be
sent — the operator saw the command stuck at "sent" forever, which is
precisely the issued-vs-applied ambiguity this feature exists to remove.
They survive a failed request and an app restart, and the server's
recordOutcome() is an idempotent update, so re-delivery is harmless.

### db-sync-engine-sync-outcome-ts-L6

`client/lib/db/sync-engine/sync-outcome.ts:6`

Defined here rather than in index.ts, which imports this module: the
NOT_AN_ATTEMPT set below needs it and a cycle would be fragile. index.ts
re-exports it, so its public name is unchanged.

### db-sync-engine-sync-outcome-ts-L14

`client/lib/db/sync-engine/sync-outcome.ts:14`

Pre-flight refusals, not attempts. Recording one would overwrite the real
outcome — and the two worst offenders fire during the very session that
reads it: an inspection session's own mount tick is refused as impersonated,
and a second PWA tab is refused as read-only while sharing this localStorage
key with the writer tab.

### db-sync-engine-sync-outcome-ts-L27

`client/lib/db/sync-engine/sync-outcome.ts:27`

`canonicaliseReason` knows the SERVER's refusal vocabulary, so every
sync-level failure collapsed to "other" — including the stuck-push case this
exists to diagnose. These are classified first, then it falls through.

### db-sync-engine-sync-run-ts-L4

`client/lib/db/sync-engine/sync-run.ts:4`

A sync run's identity: the token the server throttles by, and the store the
whole run belongs to. Why the store is decided once rather than read when
each request or report is built: docs/KNOWN_BUGS.md A-304.

### db-sync-engine-sync-run-ts-L20

`client/lib/db/sync-engine/sync-run.ts:20`

The one place in the sync engine that reads the ambient active store —
pinned by `__tests__/sync-engine-store-identity.test.ts`. Everything else
takes the store from the run it was handed.

### db-sync-engine-table-fingerprint-ts-L4

`client/lib/db/sync-engine/table-fingerprint.ts:4`

One table's digest. Short keys because this rides on every eligible push
and 26 tables of long keys is most of a kilobyte of nothing.

`t` table, `r` rows, `v` sum of `_version`, `p` unpushed queue rows.

### db-sync-engine-table-fingerprint-ts-L21

`client/lib/db/sync-engine/table-fingerprint.ts:21`

Tables the server does not compare, so computing a digest for them is a
scan with no reader. `audit_logs` is the only one: the server's allowlist
omits it because the sync engine maps it onto `activity_logs`, a different
physical table, and comparing the two produced a large false delta. It is
also the device's longest-retained table (730 days), so the saved scan is
the biggest of the 26. Keep this in step with
`CountsSyncedTableRows::AGREEMENT_TABLES`, which is the authority.

### db-sync-engine-types-ts-L13

`client/lib/db/sync-engine/types.ts:13`

Changes the server isolated to their own savepoint and skipped
individually rather than failing the whole batch; see
SyncController::push.

### db-sync-engine-types-ts-L17

`client/lib/db/sync-engine/types.ts:17`

Local id -> server id, grouped by table, for INSERTs the server silently
skipped because the name collided with an existing row (see
SyncController::push's "duplicate name" handling for categories and
suppliers). Lets the client fix up its own local rows immediately
instead of depending on a future pull to ever surface the collision
(see lib/db/reconcile-identity.ts's DUPLICATE_NAME_TABLES).

### db-sync-engine-types-ts-L24

`client/lib/db/sync-engine/types.ts:24`

Record id -> server-assigned new `_version`, grouped by table_name, for
UPDATE changes accepted via SyncController::push's strict version-
equality check. Applied immediately to the local row (see push.ts) so
this device's very next edit is based on the true current server
version instead of a stale local counter — see
docs/features/_known-bugs.md #11.

### db-tab-lock-ts-L36

`client/lib/db/tab-lock.ts:36`

Fires when this tab won the lock on promotion but refused to become
writer because rehydrating from IndexedDB failed (see initWriterLock's
promoted branch below) - this tab is permanently stuck read-only until
reloaded, since the lock was released back rather than held on stale
data. Lets the UI tell the user to reload, rather than leaving them on a
silently-still-read-only tab with no explanation.

### db-tab-lock-ts-L91

`client/lib/db/tab-lock.ts:91`

Holds a granted writer lock open (like holdForever()) but also listens
for a takeover request from another tab. On request: force-saves via
`forceSaveForHandoff` (so the requester never rehydrates before this
tab's own last changes landed in IndexedDB), acks, drops this tab to
read-only, then resolves - which returns control to the Web Locks
callback that's holding this open, releasing the lock for real.

### db-tab-lock-ts-L121

`client/lib/db/tab-lock.ts:121`

Idempotent promotion shared by the natural (queued-lock) promotion path
and stealWriterLock() - guards against a tab getting promoted twice (once
via each path racing) by short-circuiting once writerTab is already true.
See initWriterLock's doc comment for what `onPromoted` must guarantee.

### demo-loader-ts-L1

`client/lib/demo/loader.ts:1`

Demo data loader: replays lib/demo/template.ts through the app's real
local-database create functions (the same ones the UI calls), so seeded
data gets the same batches/movements/sync-queue side effects as data a
real user would enter by hand. Only ever run against a store flagged
`is_demo` — enforced by the UI gate in `demo-data-settings.tsx` and
re-checked inside `runDemoSeed` itself as defense-in-depth.

### demo-loader-ts-L71

`client/lib/demo/loader.ts:71`

Re-checks the active store is actually flagged `is_demo` in the database,
rather than trusting the caller to have replicated the UI's own
`storeProfile?.is_demo` gate — the one existing call site
(`demo-data-settings.tsx`) already does that check, but this is the last
line of defense against a future second call site (an admin tool, a dev
script) seeding fabricated data into a real paying customer's store.

### demo-loader-ts-L85

`client/lib/demo/loader.ts:85`

Cheap guard against accidentally double-seeding a store that already has
real/seeded data; the caller should surface this as a confirm dialog and
retry with `force: true` if the operator really wants to layer on more.

### demo-template-activity-ts-L1

`client/lib/demo/template-activity.ts:1`

Demo activity data: customers, sales, expenses, staff, and in-flight
purchase orders. Split out from template.ts purely to stay under the
project's max-lines lint rule; see template.ts for the catalog
(categories/supplier/products/receiving plan) this data references by ref.

### demo-template-ts-L280

`client/lib/demo/template.ts:280`

One row per product in the fully-received seed PO: the batch/expiry
spread deliberately covers every expiry-alert state, including one
already-expired batch (Gaviscon) kept on purpose so expiry alerts/
notifications have something to show immediately after seeding.

### hooks-use-admin-till-code-mode-ts-L10

`client/lib/hooks/use-admin-till-code-mode.ts:10`

True once the typed identifier is one only the on-till admin path can serve:
an email that matches no user on this device. Drives the login form's switch
from the 4-slot PIN to a 12-digit till access code field.

Runs on a debounce AND is re-evaluated on every identifier change, because
if it never fires the admin cannot submit at all — the submit button stays
gated on a 4-digit length.

### hooks-use-auto-lock-ts-L164

`client/lib/hooks/use-auto-lock.ts:164`

Ctrl+L (Cmd+L on Mac) manually locks the app on demand: deliberately not
Win+L, which is the OS's own lock-the-whole-machine shortcut on Windows and
can't be (and shouldn't be) intercepted by a single app.

### hooks-use-bi-data-ts-L18

`client/lib/hooks/use-bi-data.ts:18`

@param dateRange - defaults to the last 180 days when `from` is unset, and
to "up to now" when `to` is unset. Both ends are honoured: the selected
range's END is the upper bound of every current-period query, not "now"
(a range ending last month used to silently include everything since).
The previous-period comparison window is the same length as the SELECTED
range, immediately before it (e.g. 1-31 March compares against 29 Jan -
28 Feb), rather than a "now minus from"-wide window anchored to now.

### hooks-use-broadcasts-ts-L5

`client/lib/hooks/use-broadcasts.ts:5`

Shared by BroadcastBanner and NotificationBell: both need the same
broadcasts list (banner shows danger/warning as a top banner, the
notification dropdown shows everything else), so this is one query instead
of each component independently fetching + polling on its own interval.

### hooks-use-business-intelligence-dashboard-ts-L9

`client/lib/hooks/use-business-intelligence-dashboard.ts:9`

All business logic for the Analytics/BI dashboard: shared filter state
(date range, staff, payment method - no branch/store filter, since
switching stores via the header selector already re-scopes every query),
export, and BI data.

### hooks-use-customer-management-ts-L79

`client/lib/hooks/use-customer-management.ts:79`

Client-side preview of the Loyalty tab's redemption options for a store
that has never opened Loyalty Settings (which is what actually seeds
`loyalty_redemption_options` via ensureLoyaltyDefaultsSeeded()). Mirrors
buildDefaultRedemptionOptions() (lib/db/queries/loyalty.ts) content exactly
so what's previewed here matches what a user gets once it's really seeded —
same mechanism/shape as buildFallbackTiers() above for loyalty tiers.

### hooks-use-customer-management-ts-L124

`client/lib/hooks/use-customer-management.ts:124`

All business logic for the Customer Management page: data fetching, tab/URL
sync, search/filter derivation, and modal/selection state, so the component
itself only has to render what this hook returns.

The ?action=add opener is where "manage_customers" is enforced: that URL is
typeable and is also what the dashboard header's "Add Customer" navigates
to, so gating the header action alone would not be a gate.

### hooks-use-customer-mutations-ts-L22

`client/lib/hooks/use-customer-mutations.ts:22`

Returns the full row it created, since callers (customer management)
transform it into their own view model immediately rather than waiting on
a refetch.

### hooks-use-customer-mutations-ts-L86

`client/lib/hooks/use-customer-mutations.ts:86`

Shared by every "Record Payment" call site (Customer Management, POS
transaction details) so they go through one mutation instead of separate
copies of the same call + toast.

### hooks-use-debounced-value-ts-L5

`client/lib/hooks/use-debounced-value.ts:5`

Publishes `value` only once it has stopped changing for `delayMs`.

Meant for search boxes and anything else whose downstream work (a fuzzy
search over the catalog, a re-group of several hundred rows, a query) is far
more expensive than the keystroke that triggered it: bind the input to raw
state so typing stays instant, and drive the expensive work off the
debounced value instead.

### hooks-use-dropped-receipt-signal-ts-L8

`client/lib/hooks/use-dropped-receipt-signal.ts:8`

A-26: reports an outstanding dropped receipt against this purchase order,
so the receiving screen can tell the store to re-check the received figure
instead of the shortfall staying silent until the next cycle count.

### hooks-use-feature-gate-ts-L10

`client/lib/hooks/use-feature-gate.ts:10`

The Loyalty Program is gated on BOTH the plan-tier entitlement
(`tierAllows`, from getFeature('loyalty_program', ...)) AND the store's
own on/off toggle (`stores.loyalty_program_enabled`, DEFAULT 1 so
existing Pro/Enterprise stores see no behavior change). `!== 0` treats
undefined/null (pre-migration rows) as "on", matching that DEFAULT 1.
Extracted as a pure function so the AND logic is unit-testable without a
StoreContext/useSystemConfigStore render harness.

### hooks-use-feature-gate-ts-L35

`client/lib/hooks/use-feature-gate.ts:35`

Fallback used only when the server's subscription_plans config has no
explicit `limits.sync_interval` for the current tier (see getLimit()
below). Extracted as a pure function (same reasoning as
isLoyaltyProgramEnabled above) so the tier->default mapping is
unit-testable without a StoreContext/useSystemConfigStore render harness.

### hooks-use-feature-gate-ts-L50

`client/lib/hooks/use-feature-gate.ts:50`

A store limit of 1 can never support more than one store; anything above
that always can. Extracted as a pure function (same reasoning as
isLoyaltyProgramEnabled/getDefaultMinimumSyncIntervalMinutes above) so the
derivation is unit-testable without a render harness.

### hooks-use-finance-data-ts-L70

`client/lib/hooks/use-finance-data.ts:70`

The expense ledger, newest first, read a page at a time with the search and
category filters applied in SQL so they reach the whole ledger rather than
only the loaded page.

`limit` is how many rows to load; raising it is the "load older" affordance.
The query is keyed on it, so a wider window is a new cache entry rather than
a mutation of the current one.

### hooks-use-fleet-mutations-ts-L17

`client/lib/hooks/use-fleet-mutations.ts:17`

The store this device is actually running as, if any — used to keep the
local `stores` row in sync with a cloud edit to the same store (see
comment in the mutation body).

### hooks-use-fulfill-online-order-mutation-ts-L29

`client/lib/hooks/use-fulfill-online-order-mutation.ts:29`

Lines the store cannot actually dispense: the product's sellable (active,
unexpired, positive-quantity) batches don't cover the ordered quantity.
recordSaleItemStock still attributes such a line so it never leaves the
stock ledger untouched, but fulfilling it is an oversell, so the caller
warns and asks for confirmation first - see docs/FIXED_BUGS.md (A-57).

### hooks-use-has-touch-capability-ts-L3

`client/lib/hooks/use-has-touch-capability.ts:3`

Detects whether *any* available input mechanism is touch/coarse, unlike
useIsTouchDevice's `(pointer: coarse)` which only reflects the *primary*
pointer (deliberately `false` on a 2-in-1 with a trackpad). Hover-reveal
affordances (e.g. a row's edit pencil) need this instead: a 2-in-1's
trackpad makes it primary-pointer-fine, but a user tapping its touchscreen
directly still never fires `:hover`, so the affordance must stay visible
whenever touch is available at all, not just when it's the primary input.

### hooks-use-permission-groups-ts-L36

`client/lib/hooks/use-permission-groups.ts:36`

Restores a default group's original seeded permission set - standalone/
testable without a React render harness, and reused by the hook's own
revertToDefault callback. No-op for a custom (non-default) group.

### hooks-use-permission-groups-ts-L73

`client/lib/hooks/use-permission-groups.ts:73`

One write for a whole category's worth of keys. Calling toggle() in a
loop would not work: each call reads the `groups` state captured by
this render, so every write after the first would overwrite the one
before it with a set that predates it.

### hooks-use-permissions-ts-L11

`client/lib/hooks/use-permissions.ts:11`

A group loaded for another user must never govern the acting one: on a
lock-screen account switch (user -> user, no logout) AuthContext still
holds the outgoing user's group until the async read for the incoming user
resolves. A mismatch is treated as "no group yet" so the acting user falls
back to their own role tier - see docs/FIXED_BUGS.md (A-55).

### hooks-use-permissions-ts-L21

`client/lib/hooks/use-permissions.ts:21`

Fallback used whenever a user has no synced permission_groups row yet
(brand-new device before first sync, or a store that predates this
feature) - reproduces today's exact 6-helper behavior by role, so no
device is ever fully locked out or wide open during that gap. Once real
group data exists locally, hasPermission() uses it instead (see below).

### hooks-use-permissions-ts-L40

`client/lib/hooks/use-permissions.ts:40`

Pure, usable outside React (sync engine, plain query files) - same
shape checkIsAdmin etc. already had. store_owner/super_admin always
grant everything, matching today's behavior where the owner can never
lock themselves out.

### hooks-use-permissions-ts-L60

`client/lib/hooks/use-permissions.ts:60`

The acting session's own permission group id, or null when they have
none (store_owner/super_admin are never group-assigned, and so is a user
whose store's groups haven't synced down yet). Lets the Roles &
Permissions matrix single out the column the acting user themselves
belongs to - see its self-lockout guard.

### hooks-use-permissions-ts-L76

`client/lib/hooks/use-permissions.ts:76`

What the acting session is allowed to GRANT to a permission group, as
opposed to what it is allowed to do. The two differ: the sync server lets
store_owner/admin/super_admin grant anything and holds everyone else to
the keys their own group row carries, with no role-based fallback. Used
by the Roles & Permissions matrix to disable what the server would
reject - see lib/permissions/grant-scope.ts.

### hooks-use-pos-cart-ts-L42

`client/lib/hooks/use-pos-cart.ts:42`

Which kind of markup this is: a real reseller/agent (commission owed)
or a store-kept markup. Only meaningful while isResellerSale is true;
null until the cashier picks one (see pos-cart.tsx).

### hooks-use-pos-data-ts-L14

`client/lib/hooks/use-pos-data.ts:14`

Whether the History tab is the active one. getRecentSales() reads 100
sales with three correlated subqueries per row and nothing outside that
tab consumes it, so leave this false while it isn't showing. Defaults to
true, so a caller with no tab context keeps the old behaviour.

### hooks-use-pos-fullscreen-ts-L3

`client/lib/hooks/use-pos-fullscreen.ts:3`

Whether the POS screen is in its "fullscreen" focus mode (browser
Fullscreen API active + the app's own sidebar hidden). Deliberately not
persisted: fullscreen never survives a reload/navigation on its own (the
browser exits it), so a stale "true" here would hide the sidebar with no
way back in until the toggle is clicked again. Session-only, shared
between POSLayoutHeader (which drives it) and DashboardLayout (which
reads it to hide the sidebar).

### hooks-use-pos-payment-helpers-ts-L26

`client/lib/hooks/use-pos-payment-helpers.ts:26`

Thrown by applyLoyaltyPointsForSale when the customer's real current
balance can't cover a redemption picked earlier in checkout (e.g. a
second terminal already spent the points, or a stale cached balance) -
distinguished from a generic Error so the caller can show an actionable
message and clear the stale redemption instead of a bare failure toast.

### hooks-use-pos-payment-helpers-ts-L38

`client/lib/hooks/use-pos-payment-helpers.ts:38`

Thrown when a redemption is below LOYALTY_RULES.MIN_REDEMPTION_POINTS.
Distinct from InsufficientLoyaltyPointsError because the fix is different:
the customer's balance is fine, the reward itself is too cheap to redeem,
so the cashier should pick a different reward rather than wait for points
to accrue.

### hooks-use-pos-payment-helpers-ts-L56

`client/lib/hooks/use-pos-payment-helpers.ts:56`

Returns an error message if checkout isn't ready to proceed, or null when
every method-specific requirement (notes, amount covered, destination
account) is satisfied.

### hooks-use-pos-payment-helpers-ts-L130

`client/lib/hooks/use-pos-payment-helpers.ts:130`

Defense-in-depth: when the Loyalty Program gate (plan tier AND the
store's own on/off toggle) is closed, no points are earned at all. Tier is
based on spend *before* this sale - a customer's standing history
determines the rate this transaction earns at, not the transaction
itself.

### hooks-use-pos-payment-helpers-ts-L153

`client/lib/hooks/use-pos-payment-helpers.ts:153`

Commission is on the sale's net markup: cuts offset markups across
lines and the total is floored at 0 (updateUnitPrice allows cuts since
the reseller price floor was removed). Sales recorded before 2026-10-21
were computed per line, with cuts counted as 0.

### hooks-use-pos-payment-helpers-ts-L186

`client/lib/hooks/use-pos-payment-helpers.ts:186`

Writes the customer's new points balance plus one loyalty_transactions
row per earn/redeem event on this sale. No-ops entirely (no writes at all)
when the loyalty gate is closed or nothing was earned/redeemed.

### hooks-use-pos-payment-ts-L49

`client/lib/hooks/use-pos-payment.ts:49`

Defense-in-depth: even if the POS UI's Redeem Reward control is somehow
bypassed (stale tab, plan downgrade mid-session), no loyalty_transactions
write — earn or redeem — happens unless the caller confirms the gate
(plan tier AND the store's own on/off toggle) is currently open. Fails
closed (defaults to false) — a caller that forgets to pass it gets no
loyalty writes rather than silently bypassing the gate.

### hooks-use-pos-payment-ts-L57

`client/lib/hooks/use-pos-payment.ts:57`

"reseller" (commission owed, goes through the redeem/store-claim
flow) or "store" (markup kept by the store, pre-settled at checkout -
see use-pos-payment-helpers.ts's computeResellerCommission). Required
whenever isResellerSale is true - validatePaymentReadiness blocks
checkout otherwise.

### hooks-use-pos-payment-ts-L69

`client/lib/hooks/use-pos-payment.ts:69`

Called when the sale is rejected because the customer's real current
points balance can't cover the redemption picked earlier in checkout
(see InsufficientLoyaltyPointsError) - the caller should clear the
stale redemption so retrying the same sale doesn't hit the same
rejection again.

### hooks-use-pos-prescription-ts-L19

`client/lib/hooks/use-pos-prescription.ts:19`

Loads a prescription's items onto the till from ?dispense_rx=<id>. That
URL is the dispense action itself and is typeable, so it requires
"dispense_prescriptions" independently of the Dispense button that
normally produces it.

### hooks-use-pos-return-deep-link-ts-L15

`client/lib/hooks/use-pos-return-deep-link.ts:15`

Deep-link from the prescription detail panel's "Process Return" action
(?return_sale=<id>): jumps straight into the return dialog for that sale
instead of making the cashier hunt for it in the history tab.

### hooks-use-pos-system-ts-L23

`client/lib/hooks/use-pos-system.ts:23`

Orchestrates every POS business-logic hook (cart, payment, prescriptions,
held sales, scanning, keyboard shortcuts, pull-to-refresh) plus the
remaining local glue state, so the POSSystem component only has to render
what this hook returns.

### hooks-use-post-restore-cloud-link-notice-ts-L9

`client/lib/hooks/use-post-restore-cloud-link-notice.ts:9`

Opens whatever the "Link DumosRx Cloud" control already is for this
screen (the CloudLinkDialog in-app, or the pre-login cloud step in the
setup wizard) - this hook never builds its own linking UI.

### hooks-use-product-delete-ts-L14

`client/lib/hooks/use-product-delete.ts:14`

Reads the two dependencies that stop a product being deleted, so the
confirmation dialog can say which one is in the way. deleteProduct()
re-checks them itself - this is for wording, not enforcement.

### hooks-use-product-list-ts-L5

`client/lib/hooks/use-product-list.ts:5`

`enabled: false` lets a consumer that was handed a catalog from outside
skip the query entirely rather than fetching the same full product list a
second time (see ProductCombobox's optional `products` prop).

### hooks-use-product-mutations-ts-L5

`client/lib/hooks/use-product-mutations.ts:5`

Shared by every "quick add product" call site (Procurement's new/edit PO
pages) so they go through one mutation instead of separate copies of the
same try/catch. Each caller supplies its own onSuccess/onError for its own
toast wording / refetch / selection behavior.

### hooks-use-product-quick-edit-mutation-ts-L8

`client/lib/hooks/use-product-quick-edit-mutation.ts:8`

Each field is independently optional: the catalog table's per-cell
quick edit saves one field at a time (category, selling price, or
reorder level), not the whole row at once.

### hooks-use-product-quick-edit-mutation-ts-L16

`client/lib/hooks/use-product-quick-edit-mutation.ts:16`

The product catalog table's inline "quick edit" cells patch selling
price, reorder level, or category one at a time — a narrower mutation
than the full add/edit product dialog's payload. Stock quantity is
deliberately not here: it's a derived SUM(stock_batches.quantity), not a
raw column, so changing it goes through the stock-audit mutation instead
(see useSubmitStockAuditMutation), which also keeps the stock_movements
ledger consistent.

### hooks-use-pull-to-refresh-ts-L20

`client/lib/hooks/use-pull-to-refresh.ts:20`

Gated to pointerType === "touch": this is the mobile-only signal we want
(unlike viewport-width checks, it also correctly fires under Chrome's
mobile device emulation and ignores mouse/trackpad drags on desktop).

### hooks-use-purchase-order-mutations-ts-L20

`client/lib/hooks/use-purchase-order-mutations.ts:20`

Shared by every "save as draft" call site (Standard PO, and an Immediate
Purchase parked as a draft instead of received right away) — both go
through the same underlying createPurchaseOrder() call. Each caller
supplies its own onSuccess for its own toast wording / navigation.

### hooks-use-purchase-orders-ts-L25

`client/lib/hooks/use-purchase-orders.ts:25`

Each stock batch keeps the singular cost it was received at, and that is
the figure margin/COGS and FEFO deduction use - the catalog's Avg. Cost is
a display/reporting summary across batches, which a small new batch barely
moves, so a correctly-saved cost still reads as "nothing happened". This
confirmation states both, mirroring the selling-price-override toast right
above its call site.

### hooks-use-purchase-orders-ts-L95

`client/lib/hooks/use-purchase-orders.ts:95`

Resolves true only when the write actually landed, so the caller can
keep the receiving panel (and its spinner) on screen until then and
leave it open on failure instead of navigating away from an order that
was never received.

### hooks-use-receipt-paper-size-ts-L8

`client/lib/hooks/use-receipt-paper-size.ts:8`

Which physical paper the receipt prints to. Defaults to thermal (58/80mm
roll) since that's what a POS terminal is printing to day-to-day; a store
owner who wants a standard-paper copy (e.g. for filing/invoicing) can
switch to A4 instead. Device-local: a receipt printer is a property of
the physical terminal, not the account.

### hooks-use-redeem-reseller-commission-mutation-ts-L14

`client/lib/hooks/use-redeem-reseller-commission-mutation.ts:14`

"commission" (default) pays the reseller their usual percentage cut of
the markup. "store_claim" pays the reseller nothing - the store keeps
the entire markup as its own profit instead. This covers a store
sometimes pricing a sale above normal for a particular customer (the
reseller toggle used purely as a price-override mechanism) without
intending to pay anyone a commission on it.

### hooks-use-redeem-reseller-commission-mutation-ts-L23

`client/lib/hooks/use-redeem-reseller-commission-mutation.ts:23`

Settles a reseller sale's commission - either paid out to the reseller, or
kept by the store. Not a payout/ledger mutation - there is no till/cash-
drawer model in this app - just a status flag + timestamp + who processed
it, guarded so the same commission can't be settled twice. Snapshots the
amount that actually left the store (0 when the store claims the markup
for itself) so profit reporting can subtract exactly that.

### hooks-use-report-export-ts-L98

`client/lib/hooks/use-report-export.ts:98`

Whether a report's query takes dateFrom/dateTo at all - Inventory
Valuation and Customer Loyalty are point-in-time snapshots, so the report
view renders no date control for them rather than an inert one.

### hooks-use-report-export-ts-L105

`client/lib/hooks/use-report-export.ts:105`

Whether a report's query takes a SalesFilters object (staff id + payment
method). Same contract as reportSupportsDateRange, read from the one
config both the exports and the on-screen view already run on.

### hooks-use-report-export-ts-L116

`client/lib/hooks/use-report-export.ts:116`

The column holding the reference a row drills down on, or undefined for
a report whose rows stand for no single openable record (see
client/AGENTS.md, "Report row drill-down").

### hooks-use-report-export-ts-L133

`client/lib/hooks/use-report-export.ts:133`

A filtered Profit & Loss reports 0 expenses on purpose - an expense carries
no staff/payment-method attribution that means the same thing as the sales
filter (see the "JUDGEMENT CALL" comment on fetchProfitLossReportData in
lib/db/queries/reports.ts). That's deliberate, but silent: this is the copy
that says so, shared by the CSV, the PDF and the on-screen Report Center
banner so all three read the same.

### hooks-use-report-export-ts-L144

`client/lib/hooks/use-report-export.ts:144`

The note a report carries for the filters it was run with, if any.
Returns undefined when nothing needs saying (every report but a filtered
Profit & Loss, today).

### hooks-use-reveal-changed-cart-line-ts-L8

`client/lib/hooks/use-reveal-changed-cart-line.ts:8`

Keeps the cart line a cashier just affected in view, and marks it briefly.

The cart is a receipt in progress, so its order stays exactly as rung up —
only the viewport moves, and only when the line is actually off-screen.
Keyed off the quantity rising rather than a tap handler so a card tap, a
barcode scan, a search result and a suggestion chip all behave the same.

### hooks-use-sales-data-ts-L20

`client/lib/hooks/use-sales-data.ts:20`

`mutation.variables` (the held transaction id currently being deleted)
lets a caller show a per-row spinner/disabled state without needing its
own local "which id is busy" state — there's only ever one delete in
flight per dialog instance.

### hooks-use-save-product-mutation-ts-L10

`client/lib/hooks/use-save-product-mutation.ts:10`

Extracted out of the useMutation call so it can be exercised directly in
a test against a real database (no React/QueryClient tree required) —
see __tests__/save-product-no-category.test.ts, a regression test for the
`category_id = undefined` bug below.

### hooks-use-sidebar-peek-preference-ts-L6

`client/lib/hooks/use-sidebar-peek-preference.ts:6`

Whether the collapsed sidebar expands on hover ("peek"), or stays fully
collapsed. Independent from the collapsed/expanded state itself: combined,
they produce the three states: expanded, collapsed+peek, collapsed+locked.
Device-local (localStorage), matching how sidebar_collapsed is stored.

### hooks-use-stock-adjustment-draft-ts-L26

`client/lib/hooks/use-stock-adjustment-draft.ts:26`

Persisted for the same reason the cycle-count draft is (see
use-stock-audit-draft.ts): a half-entered adjustment must survive a
reload or an accidental navigation.

### hooks-use-stock-adjustment-draft-ts-L57

`client/lib/hooks/use-stock-adjustment-draft.ts:57`

Called on a store switch and on logout, alongside clearPOSCartStorage()
and clearStockAuditDraft(): the draft is staged against one store's
product ids under a single global key, so it must not survive into a
newly-active store or a different cashier on a shared terminal.

### hooks-use-stock-adjustment-mutation-ts-L18

`client/lib/hooks/use-stock-adjustment-mutation.ts:18`

Turns a draft (a fixed reason, an optional note, and per-item quantities
entered as plain positive numbers) into the signed deltas the DB layer
writes. Under Inventory count the entered number is the counted on-shelf
quantity rather than an amount to move, so its delta is the difference from
current stock and can be negative - see resolveAdjustmentDelta. The note
rides in `reason` behind a separator, since stock_movements has no note
column (see adjustment-derivations.ts).

### hooks-use-stock-audit-draft-ts-L31

`client/lib/hooks/use-stock-audit-draft.ts:31`

An in-progress cycle count, persisted the same way the POS cart is (see
use-pos-cart.ts): a count can span a whole shift across hundreds of rows,
and a reload, crash or accidental navigation used to lose all of it.

### hooks-use-stock-batch-alerts-ts-L10

`client/lib/hooks/use-stock-batch-alerts.ts:10`

@param enabled - these three reads feed only the Analytics dashboard's
Stock Batches tab, so its caller gates them on that tab being the active
one. Returns an empty list (render-safe) while gated off.

### hooks-use-supplier-mutations-ts-L7

`client/lib/hooks/use-supplier-mutations.ts:7`

Shared by every "Add Supplier" call site (Procurement's new/edit PO
pages, the Supplier Directory) so they all go through one mutation
instead of three separate copies of the same try/catch. Each caller
still supplies its own onSuccess/onError via mutate()'s second argument
for its own toast wording / dialog-closing / selection behavior — this
hook only owns the actual createSupplier() call and its pending state.

### hooks-use-supplier-mutations-ts-L49

`client/lib/hooks/use-supplier-mutations.ts:49`

The Supplier Directory table's inline "quick edit rating" affordance only
ever patches this one field — a separate, narrower mutation than the full
add/edit dialog's payload.

### hooks-use-uppercase-display-ts-L4

`client/lib/hooks/use-uppercase-display.ts:4`

Product/category names are always stored lowercase (see withNormalizedName
in base-helpers.ts); this per-store setting controls whether they render
uppercase via CSS or plain lowercase. Defaults to on (matches the
`uppercase_display_enabled` column's `DEFAULT 1`) so a store that hasn't
touched the setting yet sees the same uppercase look this shipped with.

### hooks-use-uppercase-display-ts-L14

`client/lib/hooks/use-uppercase-display.ts:14`

Convenience for JSX className props: the Tailwind `uppercase` utility, or
`capitalize` when the store has turned the setting off — raw lowercase
(e.g. "cypri gold small syrup") reads as broken/unfinished, so "off" means
sentence-style capitalization, not literally untouched storage casing.

### hooks-use-uppercase-display-ts-L22

`client/lib/hooks/use-uppercase-display.ts:22`

String-level equivalent of the `capitalize` CSS utility, for the plain-
text export paths (CSV, PDF, printed labels) that have no CSS layer to
apply it at render time — see product-export.ts, use-report-export.ts,
purchase-order-details.tsx.

### hooks-use-uppercase-display-ts-L30

`client/lib/hooks/use-uppercase-display.ts:30`

Capitalizes only the first letter of a string, leaving the rest
unchanged — sentence-style casing, not the per-word title casing of
capitalizeWords() above.

### hooks-use-uppercase-display-ts-L37

`client/lib/hooks/use-uppercase-display.ts:37`

String-level equivalent of useUppercaseDisplayClass(), for text that goes
somewhere CSS cannot reach it — a toast body, a printed line, an aria
label. Mirrors that hook exactly: uppercase when the store wants it,
otherwise per-word capitalization, never raw storage lowercase.

### hooks-use-widget-snapshot-sync-ts-L10

`client/lib/hooks/use-widget-snapshot-sync.ts:10`

Keeps the Android widget's local data snapshot fresh whenever the app is
open: fetches /dashboard/widget-snapshot and writes the result to native
storage. Mounted once near the app root (see use-widget-deeplink.ts for
the sibling hook it's wired alongside). The WorkManager background job
(RefreshWorker, native) covers refreshes while the app isn't open.

### licensing-licensing-manager-ts-L19

`client/lib/licensing/licensing-manager.ts:19`

Narrows a raw tier string (from the store profile or a license token) to a
known LicenseTier, falling back to "free" for anything unrecognized:
this gates paid-feature access, so an unchecked cast could grant tiers
that don't exist.

### licensing-licensing-manager-ts-L34

`client/lib/licensing/licensing-manager.ts:34`

True only when the store account itself was suspended (stores.status ===
"Suspended"), as opposed to an expired/absent subscription. Branch on
this, never on `message` — that field is display text and its wording
may change.

### licensing-monotonic-clock-ts-L1

`client/lib/licensing/monotonic-clock.ts:1`

Forward bound for anything that records "now" into durable state.

`performance.now()` is monotonic and unaffected by wall-clock changes, so
comparing its delta against the wall clock's delta reveals a clock that
jumped rather than advanced. See
docs/superpowers/specs/2026-10-08-license-clock-recovery-design.md §2.

### licensing-monotonic-clock-ts-L36

`client/lib/licensing/monotonic-clock.ts:36`

The highest wall-clock value worth recording, given what the monotonic
clock can actually justify. A clock that leaps forward is clamped to the
projected value rather than written as-is.

Clamping only ever lowers the result, so the failure mode is a slightly
conservative watermark — weaker rollback detection, never a lockout. That
direction is deliberate: A-191 was a store unable to sell.

### licensing-server-clock-ts-L4

`client/lib/licensing/server-clock.ts:4`

Tolerance for "this device's clock agrees with the server". Wide enough to
absorb ordinary RTC drift and request latency, far narrower than any skew
capable of poisoning the monotonic watermark.

### licensing-server-clock-ts-L20

`client/lib/licensing/server-clock.ts:20`

Authoritative time from the public `/health` endpoint, which is
unauthenticated and returns `{status, timestamp}` — reachable even when a
full sync is failing, which is the state a clock-locked device is in.

### payment-methods-ts-L3

`client/lib/payment-methods.ts:3`

stores.enabled_payment_methods is TEXT holding JSON, not a real array
column. NULL/absent means the store never chose, which enables every
method; a malformed or double-encoded value (docs/FIXED_BUGS.md A-29,
A-31, A-42) must fall back the same way rather than throwing mid-render.

### permissions-grant-scope-ts-L1

`client/lib/permissions/grant-scope.ts:1`

Who may grant which permission keys, mirroring the server's own rule in
SyncController::sanitizePermissionGroupSyncPayload() so the Roles &
Permissions matrix can show the truth up front instead of letting a push
be rejected as `permission_denied` and silently reverted by the next pull.

This is a UX honesty layer, not a security boundary - the server check is
the boundary, and this file exists only to say the same thing the server
would say, before the edit is made.

### permissions-grant-scope-ts-L11

`client/lib/permissions/grant-scope.ts:11`

The roles the server lets through before it ever compares payload keys
against the caller's own grants. `admin` is in the server's list next to
store_owner/super_admin even though hasPermission()'s short-circuit omits
it, and this list follows the server, not hasPermission().

### permissions-grant-scope-ts-L30

`client/lib/permissions/grant-scope.ts:30`

The server reads the caller's own keys from their permission group row
alone - it has no role-based fallback - so a caller with no group can
grant nothing, and this mirrors that rather than hasPermission()'s
fallbackPermissions().

### permissions-grant-scope-ts-L48

`client/lib/permissions/grant-scope.ts:48`

The keys a group already holds that this caller could not grant. The
server checks the WHOLE resulting `permissions` array, not just the key
that changed, so any edit at all to such a group is rejected - which is
why a non-empty result locks the group's entire column, not one cell.

### query-keys-ts-L130

`client/lib/query-keys.ts:130`

One page of the ledger. Keyed on the loaded row count as well as the
filters, so "load older" widens the window rather than replacing a
cached page.

### storage-keys-ts-L145

`client/lib/storage-keys.ts:145`

The store id the API client stamps on `X-Store-Id`. Named `…Stored…` to
keep it distinct from `core.ts`'s `getActiveStoreId()`, which resolves the
store id used for local queries — the two having drifted apart is the bug
class A-23 exists to prevent (see `auth-context.tsx`).

### storage-keys-ts-L165

`client/lib/storage-keys.ts:165`

Whether anything is stored under the last-sync key, readable or not. The
difference matters: `getLastSyncTime()` returns null both for a device that
has never synced and for one whose stored value cannot be parsed, and a
guard that treats the second as the first stops running (A-234).

### types-audit-log-ts-L13

`client/lib/types/audit-log.ts:13`

How many times this exact (action, table, record_id) has repeated
since this row started - see logAction()'s dedup path in core.ts.
1 (or undefined, on a row from before this column existed) for a
normal, non-repeating action.

### types-dashboard-activity-ts-L1

`client/lib/types/dashboard-activity.ts:1`

A recent-activity feed row: the shared shape after tagging heterogeneous
rows (sales, stock movements, purchase orders, expenses, prescriptions)
with `activity_type` and merging them into one sorted feed. Every field
beyond `id`/`activity_type` only applies to some activity types.

### types-global-d-ts-L18

`client/lib/types/global.d.ts:18`

Test-only (development builds only): elevates the local `stores` row's
subscription_tier directly, for e2e specs that need a paid-tier-gated
module unlocked without racing LockedModuleOverlay's mount timing or
mutating the shared free-tier e2e fixture. See lib/db/core.ts.

### types-global-d-ts-L23

`client/lib/types/global.d.ts:23`

Read-only audit of which legacy migration artifacts (old table/column
names, unmigrated stock_quantity, missing store_id backfill, etc.)
remain on this device's local database. Safe to run anywhere,
including production, since it never writes. `retirable` additionally
reports, per still-active legacy-repair migration, whether THIS device
blocks deleting it (all active devices must report ok).

### types-global-d-ts-L39

`client/lib/types/global.d.ts:39`

Repair tool for a batch whose server-side quantity was never derived
from a movement delta (a pre-`a36b00e7` bulk import): posts this
device's own stock_batches quantities so the server can adopt them,
recording each correction as a real 'sync_reconciliation' movement.
Also wired to Settings > Data > "Health Sync"; exposed
here as well so a support session can run it from DevTools. See
lib/db/sync-engine/index.ts.

### types-global-d-ts-L50

`client/lib/types/global.d.ts:50`

Read-only audit of every active batch against its own movement log.
Safe anywhere, including production: it never writes. Exposed for a
support session; see lib/db/sync-engine/stock-integrity.ts.

### types-global-d-ts-L54

`client/lib/types/global.d.ts:54`

Rebuilds each diverged batch's quantity from its own movement log,
refusing any batch the log cannot account for. Local-only; nothing is
pushed. See lib/db/sync-engine/stock-integrity.ts.

### types-global-d-ts-L63

`client/lib/types/global.d.ts:63`

Non-standard Safari property: true when running as an installed PWA
launched from the Home Screen (iOS has no `display-mode: standalone`
media query support prior to detecting this).

### types-prescription-ts-L16

`client/lib/types/prescription.ts:16`

Narrows a raw DB string to a known PrescriptionPriority, falling back to
"normal" for anything unrecognized: prescriptions are healthcare data, so
an unchecked cast here could silently misrepresent urgency.

### types-prescription-ts-L93

`client/lib/types/prescription.ts:93`

Payload accepted by updatePrescriptionItem(): the editable fields from the
medication form, plus the caller-supplied updated_at timestamp. Excludes
refills_used/next_refill_date on purpose — those are refill history and must
survive an edit untouched.

### types-product-ts-L23

`client/lib/types/product.ts:23`

Row shape returned by getProductsWithDetails(): the `products` table
joined with its category name and current stock_batches aggregates
(on-hand quantity, latest cost, soonest-expiring batch).

### types-product-ts-L35

`client/lib/types/product.ts:35`

Row shape returned by getProductsWithStock()'s raw query: `products`
joined with the category name and stock_batches aggregates (on-hand
quantity, concatenated batch numbers, average cost across active batches).

### types-sale-ts-L23

`client/lib/types/sale.ts:23`

Distinguishes a real reseller/agent sale (commission owed, goes
through the redeem/store-claim decision) from a store staff member
pricing above normal for their own reasons (markup pre-settled
straight to the store - see use-pos-payment.ts). Only meaningful when
is_reseller_sale is set.

### types-sale-ts-L35

`client/lib/types/sale.ts:35`

The amount that actually left the store at settlement time: either
reseller_commission_amount (paid to the reseller), or 0 when the store
claimed the entire markup for itself (reseller_commission_claim_type ===
"store_claim") - snapshotted so profit reporting doesn't have to
re-derive it.

### types-stock-batch-ts-L16

`client/lib/types/stock-batch.ts:16`

Row shape returned by getAvailableStockBatches(): active stock_batches
joined with their product's name/strength/selling price, for pickers that
need to prescribe/sell against available batches.

### types-stock-movement-ts-L1

`client/lib/types/stock-movement.ts:1`

Row shape returned by getStockMovements()/getStockAdjustments(): the raw
`stock_movements` table joined with the product's name, the performing
user's display name, and (via stock_batch_id) the batch number and its
originating supplier's name.

### types-store-ts-L1

`client/lib/types/store.ts:1`

Store shape returned by the server's `/stores` list. The onboarding store
picker only reads `id`/`name`, but the endpoint's underlying Eloquent Store
model (laravel-server's Api/Web/StoreController::index) always includes the
fleet-management fields too, so they're typed here as optional rather than
hidden behind a cast.

### types-store-ts-L15

`client/lib/types/store.ts:15`

Fields returned/accepted by the fleet-management (Settings > Store Profile)
store CRUD endpoints — matches the server's Store model validation in
laravel-server's Api/Web/StoreController. Extends `StoreOption` with the
optional fleet-overview stats-table fields returned by `/dashboard/stats`.

### types-subscription-plans-ts-L1

`client/lib/types/subscription-plans.ts:1`

A single subscription tier's config: feature flags and numeric limits
are open-ended (server-defined), so keyed access is left loose on purpose;
callers already guard every lookup with a fallback (see useFeatureGate()).

### types-supplier-ts-L36

`client/lib/types/supplier.ts:36`

Row shape returned by getSuppliers(): the raw `suppliers` table joined
with each supplier's total outstanding debt across unpaid purchase orders,
plus its overall order count/value across all (non-deleted) purchase orders.

### types-user-ts-L12

`client/lib/types/user.ts:12`

Raw `users` table row, including the PIN hash. Never pass this around
app state directly (use the auth context's `User` for that); only the
login flow that verifies the PIN should see this shape.

### types-user-ts-L50

`client/lib/types/user.ts:50`

Staff directory row: UserDbRow without the PIN hash, since the staff
list/edit-form never needs it (edits always start with a blank PIN field) —
only `has_pin`, derived query-side, so the list can show whether an account
actually has a PIN rather than assuming every account does.

### types-user-ts-L56

`client/lib/types/user.ts:56`

The cloud Sanctum-authenticated account (store owner/admin), distinct
from the auth-context `User`, which represents the local, PIN-authenticated
device user. Only the store owner/admin has one of these; staff members
log in locally and have no cloud session of their own.

### utils-ts-L13

`client/lib/utils.ts:13`

CFA-zone currencies are conventionally written with the symbol after the
amount (e.g. "1,123,456 F"), unlike Intl's locale-driven placement which
puts "FCFA"/"CFA" as a prefix — also more compact on receipts and cart rows.

### utils-ts-L18

`client/lib/utils.ts:18`

Normalizes a currency code before it's used anywhere below. Uppercases
FIRST so a valid lowercase code (e.g. "usd", as a store setting might be
saved) isn't stripped down to "" by the letters-only filter and silently
replaced with the NGN fallback — the filter only exists to drop stray
whitespace/punctuation, not to reject case.

### utils-ts-L28

`client/lib/utils.ts:28`

True for currencies whose symbol is placed after the amount (see
CFA_SUFFIX_CODES) — for callers building their own "symbol + value"
strings (e.g. compact chart-axis labels) that need to flip the order.

### utils-ts-L72

`client/lib/utils.ts:72`

Same as formatCurrency, but always rounds to whole units for currencies
where sub-unit precision is no longer practically used (Naira, since kobo
has fallen out of everyday use) — for dashboard/report metric cards where
a rounded headline figure reads cleaner than an exact-to-the-kobo total.
Line-item prices, cart totals, and receipts should keep using
formatCurrency() so accounting precision isn't lost there.

### utils-ts-L101

`client/lib/utils.ts:101`

Just the currency symbol/prefix (e.g. "₦", "$"), for compact chart-axis
labels ("₦12k") where the full formatCurrency() output would be too wide.
Derived from the same Intl formatter as formatCurrency() so the two never
disagree on which currency a store is actually using.

### utils-ts-L164

`client/lib/utils.ts:164`

True only for a genuine Tauri-built binary running on a mobile OS —
i.e. the real native mobile app, not a phone browser tab or an installed
PWA (both stay fully functional on every plan tier; only the native app
build is what "Mobile App" as a plan feature actually restricts). Pure
function so the platform->boolean mapping is unit-testable without
mocking Tauri's async plugin-os import.

### utils-billing-pricing-ts-L6

`client/lib/utils/billing-pricing.ts:6`

Price shown on the card after applying the coupon discount and, when no
coupon is applied, referral credits too (matching the referral tab's copy:
"Automatically applied at checkout"). This is a display estimate only --
it must never be passed as the `amount` sent to `pay()`. The server
applies referral credits itself via `use_credits`, so subtracting them
here AND sending `use_credits: true` would double-count them. Use
`getChargeAmount` for the amount actually sent to `pay()`.

### utils-billing-pricing-ts-L51

`client/lib/utils/billing-pricing.ts:51`

Amount to actually charge via `pay()`. Only the coupon discount reduces
this figure client-side; referral credits are intentionally NOT
subtracted here since `use_credits: true` already tells the server to
apply them -- the server is the source of truth for the final charge.

### utils-chunk-error-ts-L2

`client/lib/utils/chunk-error.ts:2`

A stale tab holding chunk hashes from before the last auto-deploy (see
the debounced storefront rebuild) will 404 the moment it lazy-loads a
route it doesn't already have in memory - not a real crash, just the
browser needing a fresh copy of the app. Shared between error-boundary.tsx
(the React-throw path) and global-error-listener.tsx (the dynamic-import
rejection path), so the two never drift apart on when to reload.

### utils-clear-local-drafts-ts-L5

`client/lib/utils/clear-local-drafts.ts:5`

Every device-local, in-progress draft staged against the store/account
being left behind. Each lives under its own single global localStorage key
(no store or user in it), so all of them must be dropped together on a
store switch, a logout, a different user signing in, a new-store link and
a factory reset. Called as one function because the list kept growing and
two of the five transition paths had been left clearing only the cart -
see client/AGENTS.md.

### utils-count-freshness-ts-L1

`client/lib/utils/count-freshness.ts:1`

How stale this device's view of the cloud may be before a stock count
stops being trustworthy. Justified in client/AGENTS.md, "Counting on a
device that is behind sync (A-211)".

### utils-date-utils-ts-L73

`client/lib/utils/date-utils.ts:73`

Format a date string or object as a long, unambiguously day-first string,
e.g. "14th August, 2026", for contexts that don't use DD/MM/YYYY or
DD-MM-YYYY but still shouldn't read as the US month-first convention.

### utils-date-utils-ts-L103

`client/lib/utils/date-utils.ts:103`

Format a date string with an arbitrary date-fns pattern, falling back to
`fallback` instead of throwing/rendering "Invalid Date" for a null,
unparseable, or invalid value.

### utils-date-utils-ts-L123

`client/lib/utils/date-utils.ts:123`

Relative ("3 hours ago") counterpart to formatDateSafe: date-fns throws a
RangeError on an invalid date, which takes down the whole render tree
rather than one label.

### utils-dev-log-ts-L1

`client/lib/utils/dev-log.ts:1`

console.log gated to non-production builds: keeps debug/trace output out
of the console on app.dumosrx.com while still showing during `next dev`.
Use console.error/warn directly for things that should surface regardless
of environment.

### utils-device-id-ts-L4

`client/lib/utils/device-id.ts:4`

Stable per-device identifier used to correlate remote logs (Sentry,
/logs/client-error) and the X-Device-Id sync header with a specific
physical device, since store_id/user_id alone can't distinguish which
terminal at a multi-device store is the one failing.

### utils-device-label-ts-L21

`client/lib/utils/device-label.ts:21`

Human-readable device label sent as X-Device-Label alongside the opaque
X-Device-Id, purely so the admin panel's staff sync view can show
something a non-developer can read (e.g. "Chrome on Windows") instead of
a random id like "DRX-9F3A2C1D". Best-effort UA sniffing - never used for
any access-control or sync-correctness decision.

### utils-download-blob-ts-L1

`client/lib/utils/download-blob.ts:1`

Kept in its own module, deliberately: this is ten lines with no
dependencies, but it used to live in report-pdf.tsx alongside the actual
PDF-generation code. Importing it from there pulled @react-pdf/renderer into
the catalog, daily-close and purchase-order-details chunks for callers that
only ever wanted to hand the browser a Blob.

### utils-download-blob-ts-L20

`client/lib/utils/download-blob.ts:20`

Opens a PDF in a new tab so the user can print from the browser's native
PDF viewer: same document as the download, so "Print" and "Download PDF"
can never produce different-looking output for the same report.

### utils-error-logger-ts-L48

`client/lib/utils/error-logger.ts:48`

Groups repeat occurrences of "the same" crash for both dedup paths below.
Deliberately excludes the timestamp/device/URL noise `content` embeds -
those differ on every call even when it's genuinely the same recurring
bug, which is exactly the case this needs to recognize.

### utils-error-truncation-ts-L5

`client/lib/utils/error-truncation.ts:5`

Matches the server's `/logs/client-error` `message` rule
(ActivityLogController::MAX_MESSAGE_LENGTH), so an oversized crash message
is truncated rather than silently 422-rejected on arrival.

### utils-error-truncation-ts-L10

`client/lib/utils/error-truncation.ts:10`

Matches the server's `feedback.fingerprint` column width
(VARCHAR(255), widened to match this by
2026_10_02_000006_widen_feedback_fingerprint_column after A-149 found it
silently 191), so a long area/message/stack combination cannot push a row
the server rejects forever with SQLSTATE[22001].

### utils-error-truncation-ts-L34

`client/lib/utils/error-truncation.ts:34`

Unlike truncateForLog, the result never exceeds `maxLength` — the marker is
accounted for inside the budget rather than appended past it, so the output
can be handed straight to a fixed-width column.

### utils-export-filename-ts-L26

`client/lib/utils/export-filename.ts:26`

`DumosRx_<Store>_<Kind>_<YYYY-MM-DD_HHmm>.<ext>`. Two exports on the same
day, or from two stores, must not collide — a date-only name silently
overwrote the earlier file. See docs/KNOWN_BUGS.md.

### utils-impersonation-ts-L7

`client/lib/utils/impersonation.ts:7`

True when this device currently holds an impersonated (superadmin handoff)
session. Safe to call during SSR/prerender and when localStorage access
itself throws (private-mode Safari, blocked storage): both answer false.

### utils-login-lockout-ts-L43

`client/lib/utils/login-lockout.ts:43`

Call BEFORE checking the PIN. Locked callers must not reach the PIN
comparison at all — this both blocks the login and avoids extending the
lockout further just from being retried while still locked.

### utils-login-lockout-ts-L74

`client/lib/utils/login-lockout.ts:74`

Call after a successful login. Clears any accumulated failure history
for this identifier so a legitimate user isn't left one mistake away
from a lockout indefinitely.

### utils-loyalty-calculator-ts-L13

`client/lib/utils/loyalty-calculator.ts:13`

The highest tier a customer qualifies for given their spend *before* this
sale (tiers reward standing history, not the transaction that's earning
points right now), used to multiply the points that transaction earns.
Falls back to 1x when there are no tiers configured yet (e.g. a store that
has never opened Loyalty Settings, so ensureLoyaltyDefaultsSeeded hasn't
run) so earning behaves exactly as it did before tiers existed.

### utils-loyalty-calculator-ts-L33

`client/lib/utils/loyalty-calculator.ts:33`

A sale can both earn and redeem points in the same checkout, and both
updates land in a single `customers.loyalty_points` write (rather than two
separate reads-then-writes that could stomp each other) — this computes
that one resulting balance. Floored at 0 so a redemption can never leave a
customer with a negative balance even in a race with another concurrent
spend of the same points.

### utils-loyalty-calculator-ts-L47

`client/lib/utils/loyalty-calculator.ts:47`

A return must undo its proportional share of whatever the original sale
did to points — points earned on returned merchandise get clawed back,
and points spent on a reward get refunded since the discount it bought is
being reversed too. `returnShare` is the same items-returned fraction used
to prorate the refund itself (1 for a full return, less for a partial
one), so a partial return only undoes its matching partial share.

### utils-loyalty-calculator-ts-L67

`client/lib/utils/loyalty-calculator.ts:67`

One `loyalty_transactions` row, as far as expiry math cares: positive
`points` for an earn, negative for a redemption or a previously-materialized
expiry.

### utils-loyalty-calculator-ts-L76

`client/lib/utils/loyalty-calculator.ts:76`

Shifts a date back/forward by whole months, clamping to the last day of the
target month (so a cutoff computed from the 31st doesn't roll into the next
month on a 30-day month).

### utils-loyalty-calculator-ts-L151

`client/lib/utils/loyalty-calculator.ts:151`

The balance a customer can actually spend right now: their stored balance
less whatever FIFO expiry (see calculateExpiredPoints) has voided but no
checkout has materialized into the balance yet.

### utils-loyalty-calculator-ts-L165

`client/lib/utils/loyalty-calculator.ts:165`

Returns an error message when a redemption can't go through, or null when
it can. Enforces LOYALTY_RULES.MIN_REDEMPTION_POINTS as a hard floor on the
reward's cost (a reject, never a silent no-op or a cap — capping would mean
handing over a discount the points don't pay for) and checks the cost
against the expiry-adjusted available balance.

### utils-pin-hash-ts-L10

`client/lib/utils/pin-hash.ts:10`

Whether a stored `users.pin` value is already a bcrypt hash, as opposed
to a legacy plaintext PIN written before this change (or synced down from
a device still running an older build).

### utils-pin-hash-ts-L26

`client/lib/utils/pin-hash.ts:26`

Verifies a typed PIN against whatever is stored, hashed or legacy
plaintext. Synchronous on purpose: the call sites filter a handful of
candidate user rows, and a sync compare keeps that code a plain
predicate instead of an async reduce. One bcrypt compare at cost 10 is a
few tens of milliseconds, against at most a couple of rows.

### utils-pin-hash-ts-L52

`client/lib/utils/pin-hash.ts:52`

True when a stored value matched but is still plaintext - i.e. this
successful login is the moment to rewrite it as a hash. See
migrateLegacyPinToHash() in lib/db/queries/auth.ts.

### utils-pos-calculations-ts-L62

`client/lib/utils/pos-calculations.ts:62`

How much is still owed on a cash tender, 0 once it covers the total.
Mirrors calculateChangeDue for the other direction so the payment dialog
can report a shortfall inline while typing instead of only after submit.

### utils-pos-calculations-ts-L139

`client/lib/utils/pos-calculations.ts:139`

How much of a mixed-payment sale was actually collected at sale time —
excludes any credit split, since that portion is owed, not paid. Using
the raw split total here (including credit) is what previously made a
mixed sale with an unpaid credit portion look fully paid. Negative split
amounts are floored to 0: no tender can subtract from what was collected.

### utils-pos-calculations-ts-L153

`client/lib/utils/pos-calculations.ts:153`

Change due for a mixed-payment sale, computed against non-credit tender
only. A credit split is money the customer still owes, not money they
handed over, so it can never produce change - using the raw split total
here (including credit) previously let an over-allocated credit split
make the sale look overpaid, handing real cash back for an "overpayment"
that was never actually tendered.

### utils-pos-calculations-ts-L163

`client/lib/utils/pos-calculations.ts:163`

The largest credit split a mixed sale can carry: whatever the sale still
owes once every non-credit tender is counted. applyCreditPaymentFIFO() can
only ever settle `total_amount - amount_paid` against this sale, so any
credit beyond this is debt with no sale behind it.

### utils-pos-calculations-ts-L187

`client/lib/utils/pos-calculations.ts:187`

A mixed sale with a nonzero credit split still owes that amount, so it
must be "partial" — the same status recordCustomerPayment()/
applyCreditPaymentFIFO() already look for — not "completed", or debt
repayment later can never find and settle it.

### utils-post-restore-notice-ts-L7

`client/lib/utils/post-restore-notice.ts:7`

Call immediately before the post-restore reload/navigation (both the
pre-login setup flow in app/setup/use-onboarding.ts and the in-app
Settings > Data flow in hooks/use-settings-sync.ts).

### utils-prescription-calculations-ts-L8

`client/lib/utils/prescription-calculations.ts:8`

A prescription medication line's total cost is always unit cost × quantity
— computed, never separately typed, so there's no way for staff to enter a
per-unit price where a line total was expected (or vice versa). Rounded to
the cent like every other money value written to a REAL column (see
pos-calculations.ts's roundMoney), otherwise float drift compounds across
a multi-line prescription and a report's SUM() stops tying out to the
displayed line totals.

### utils-print-node-ts-L1

`client/lib/utils/print-node.ts:1`

Prints a single DOM node in isolation via a hidden iframe, instead of
printing the whole page and hiding everything else with CSS. The iframe
gets its own document containing only the cloned node plus the app's
compiled stylesheets, so Tailwind classes render correctly but nothing
else on the page (sidebar, dialogs, other components) is ever at risk of
bleeding into the printed output or needing a print:hidden escape hatch.

### utils-print-node-ts-L11

`client/lib/utils/print-node.ts:11`

Resolves once every external stylesheet in `doc` has either loaded or
failed, or after the timeout — whichever comes first. Doesn't depend on
the iframe's own `onload`, which may already have fired for the initial
`about:blank` document (never firing again for the `doc.write()`d one) or
may never fire at all in some browsers for a document written this way.

### utils-print-node-ts-L41

`client/lib/utils/print-node.ts:41`

Returns once the print dialog has been invoked, or rejects if the node
couldn't be printed (no iframe document/window access). Always removes the
iframe afterward, so a failure never leaks it.

### utils-product-import-export-ts-L33

`client/lib/utils/product-import-export.ts:33`

Known header strings from QuickBooks POS's "Export Templates" dialog,
Moniebook's inventory export, and DumosRx's own export — seeded from the
actual files reviewed while designing this feature (see
docs/superpowers/specs/2026-08-31-stock-import-export-design.md). Any
header not listed here falls back to "ignore" and the user maps it by hand.

### utils-product-import-export-ts-L82

`client/lib/utils/product-import-export.ts:82`

Strips bracket suffixes like " [Main branch]" (Moniebook's per-branch
columns) and "( % )" (Moniebook's margin columns) before matching, since
DumosRx is single-store and doesn't need the branch qualifier.

### utils-product-import-export-ts-L98

`client/lib/utils/product-import-export.ts:98`

Auto-maps a file's header row to internal fields. Fields that can
legitimately repeat across columns (e.g. Moniebook's "Stock [Branch]" per
branch) only take their FIRST matching column — DumosRx tracks one
quantity per product, not one per branch — so every later column that
would map to an already-claimed field falls back to "ignore".

### utils-product-import-export-ts-L137

`client/lib/utils/product-import-export.ts:137`

Accepts the spellings a store owner actually types in a spreadsheet
("Yes"/"TRUE"/1/"online"), and returns undefined rather than guessing for
anything else — an unrecognised value must not silently publish a product to
the public storefront.

### utils-product-import-export-ts-L151

`client/lib/utils/product-import-export.ts:151`

Accepts "1500", 1500, "1,500.00", "₦1,500.00"; rejects blank/non-numeric/
negative. Every field this feeds (cost/selling price, quantity, reorder
level) is a real-world quantity that can never legitimately be negative,
so a negative parse is treated the same as an unparseable one (undefined)
rather than being imported as-is — previously a "-500" in a price column
silently wrote negative money/stock with no validation at all.

### utils-product-import-export-ts-L244

`client/lib/utils/product-import-export.ts:244`

Printable physical stock-count sheet: system quantity plus blank columns
for a staff member to write the counted quantity and any notes while
walking the floor. Modeled on the sheet clients migrating from other
inventory apps already use for this (checkbox + blank counted-qty/notes
columns next to the system quantity). Takes the minimal shape shared by
ExportableProduct and the Cycle Count screen's AuditItem, since the
"Print" action lives inside that screen (client/lib/hooks/
use-audit-sheet-export.ts) rather than the general product export menu.
Since A-318 (2026-10-23) a row that carries a `countedQty` prints it in
the Counted Qty column; a row without one stays blank, so a fresh count
sheet is unchanged. `#` numbers 1..n within whatever (filtered) set the
caller passes.

### utils-returns-calculations-ts-L14

`client/lib/utils/returns-calculations.ts:14`

Whether every line item on the sale has had its full remaining balance
returned once this return (the given selections) is applied — across
both this return and any prior ones, not just what's touched right now.
An item with nothing left to return (already fully returned before this
action) doesn't need to be selected to count as "done".

### utils-search-ts-L40

`client/lib/utils/search.ts:40`

Levenshtein distance, skipped entirely when the two lengths are already
further apart than the caller can accept. Distance is never less than the
difference in lengths, so the answer in that case is only ever "too far" -
and the matrix that would prove it is the expensive part. Returns Infinity
for a candidate rejected on length, which compares correctly against any
maximum the caller is filtering on.

### utils-search-ts-L128

`client/lib/utils/search.ts:128`

Strips everything that isn't a letter or digit, so the spellings a
cashier types interchangeably — "M&B", "M B", "M & B", "MB" — collapse to
one key. Punctuation-only differences must not hide a product at the till.
See docs/KNOWN_BUGS.md.

### utils-sentry-config-ts-L1

`client/lib/utils/sentry-config.ts:1`

The one place that decides whether this build reports to Sentry, and at
what rate. Rationale and the per-environment table: client/AGENTS.md,
"What reaches Sentry".

### utils-spreadsheet-io-ts-L7

`client/lib/utils/spreadsheet-io.ts:7`

CSV/XLSX plumbing, split out of product-import-export.ts (which had grown
past the 350-line limit in .agents/AGENTS.md §4) and re-exported from there
so existing call sites don't change. This half is format mechanics only —
nothing here knows what a product is.

### utils-spreadsheet-io-ts-L18

`client/lib/utils/spreadsheet-io.ts:18`

Opaque handle returned by readWorkbookFile() and consumed by
parseWorkbookSheet(). Deliberately doesn't leak exceljs's own Workbook
type to callers (unlike the old xlsx-based version, which returned
XLSX.WorkBook directly) - callers only ever need sheetNames plus the
ability to parse one of them, and keeping the underlying library's type
out of the public API means it can change again later without touching
every call site.

### utils-spreadsheet-io-ts-L33

`client/lib/utils/spreadsheet-io.ts:33`

Minimal RFC 4180 CSV parser (quoted fields, doubled-quote escaping,
CRLF/LF line endings). Written directly rather than pulling in a CSV
library: exceljs's own CSV support is Node-stream-oriented and awkward to
drive from a browser File, and this project's only other spreadsheet
dependency (xlsx) was removed entirely for its unpatched CVEs — no reason
to reach for a third library for a format this simple.

### utils-spreadsheet-io-ts-L135

`client/lib/utils/spreadsheet-io.ts:135`

Plain JS value out of an exceljs cell — mirrors what sheet_to_json used
to hand back (raw numbers/strings), not exceljs's own richer cell-value
shapes (formula results, rich text runs, hyperlink objects, Dates).

### utils-spreadsheet-io-ts-L192

`client/lib/utils/spreadsheet-io.ts:192`

Reads a CSV/XLSX File (from an <input type="file">) for sheet selection.
Legacy .xls (the pre-2007 binary Excel format) is deliberately not
supported — exceljs (unlike the xlsx package this replaced, which had
unpatched prototype-pollution/ReDoS CVEs with no upstream fix) only reads
.xlsx/.csv. Real store owners' QuickBooks POS/Moniebook exports can be
.xls, so this throws a clear, actionable error rather than a confusing
parse failure - the caller (ImportMappingDialog) surfaces it as a toast.

### utils-spreadsheet-io-ts-L246

`client/lib/utils/spreadsheet-io.ts:246`

Shared by buildExportBlob (product columns) and any other flat
headers/rows export (e.g. the Stock Audit sheet) that isn't shaped like
ExportableProduct - same CSV/XLSX writer, just not tied to product columns.
Async (unlike the old xlsx-based version) since exceljs's own writer is
promise-based.

### utils-uuid-ts-L1

`client/lib/utils/uuid.ts:1`

Structural UUID check shared by every place that has to tell an id from a
free-text name. The version nibble accepts 1-8: Laravel's `HasUuids` emits
v7, so a `[1-5]` pattern rejects ids this app's own server generates.
See docs/KNOWN_BUGS.md A-192.

### utils-widget-snapshot-ts-L20

`client/lib/utils/widget-snapshot.ts:20`

Converts the backend's snake_case /dashboard/widget-snapshot response into
the camelCase JSON written to native Android storage (see the "Canonical
widget snapshot schema" in the implementation plan) - the single shape
shared by the app's foreground writer and the WorkManager background
writer, so the Glance widget never needs to know which one produced it.


## Round 3: multi-line `//` comment runs

### line-api-admin-till-session-ts-L76

`client/lib/api/admin-till-session.ts:76`

Both deadlines come off THIS device's clock, from the server's duration
rather than its absolute timestamp: a till whose clock runs hours fast
would otherwise read a brand-new session as already expired — on exactly
the misconfigured-clock device this feature exists to inspect.

### line-api-base-client-ts-L197

`client/lib/api/base-client.ts:197`

A 401 doesn't necessarily mean the session is truly dead; most
of the time it just means the access token expired sooner than
the proactive 7-day age check above expected. Try one silent
refresh-and-retry before forcing the user to re-link; clearing
unconditionally on every 401 logged store owners out far more
often than the token was actually invalid.

### line-api-base-client-ts-L204

`client/lib/api/base-client.ts:204`

Trusts refreshTokenSilently()'s own outcome instead of
inferring it from whether the token changed. The previous
"clear whenever we didn't get a *new* token" logic also
fired on a network blip, timeout, captive portal, or
transient 5xx during the refresh call itself - exactly the
cases refreshTokenSilently() is deliberately hardened to NOT
treat as proof of invalidity - undoing that hardening one
call frame up and silently, permanently unlinking the device
from cloud sync over a connectivity hiccup rather than an
actual invalid session. Also no longer gated on
navigator.onLine (unreliable - see the PWA offline-audit
findings elsewhere in this codebase): attempting anyway just
costs a bounded 5s timeout via refreshTokenSilently's own
AbortController if genuinely offline, landing on
"unconfirmed" below, which is the correct outcome either way
- whereas skipping the attempt on a false "offline" reading
previously cleared the token immediately with zero chance to
confirm it first.

### line-api-base-client-ts-L262

`client/lib/api/base-client.ts:262`

status/code let callers (e.g. sync-engine's logCrash calls)
distinguish an expected, server-enforced plan restriction
(SYNC_THROTTLED, SYNC_DISABLED, STORE_LIMIT_EXCEEDED - see
SyncController::validateSync) from an actual bug, without
resorting to matching on the human-readable message text.

### line-api-client-fleet-billing-ts-L147

`client/lib/api/client-fleet-billing.ts:147`

payment_confirmed is explicit because the server no longer infers payment
from fulfilment alone: "Fulfill & Deduct Stock" is pressed at the counter,
as the goods are handed over and the money is taken.

### line-api-client-ts-L109

`client/lib/api/client.ts:109`

The request body's `token` is the sole credential here; the endpoint
does not read the Authorization header at all (see AuthHandoffController),
so no explicit header override is set.

### line-api-client-ts-L155

`client/lib/api/client.ts:155`

One token per sync() call, repeated on every batch of that run. The
server measures the plan's sync-interval throttle per RUN rather than
per request, so a backlog spanning many batches isn't rejected by its
own first batch — see SyncController::validateSync.

### line-api-client-ts-L193

`client/lib/api/client.ts:193`

Authoritative row counts, per table, for the caller's store - not a
pull, just COUNT(*)s a device periodically checks itself against. See
lib/db/sync-engine/health-check.ts for why this exists.

### line-api-client-ts-L202

`client/lib/api/client.ts:202`

Hands the server this device's own stock_batches.quantity snapshot so it
can adopt any value it never derived from a movement delta. See
lib/db/sync-engine/reconcile-quantities.ts.

### line-api-token-manager-ts-L64

`client/lib/api/token-manager.ts:64`

base-client.ts awaits this before every API request once the token
is stale, so an un-timed fetch here blocks every request behind it -
the same "iOS Safari can leave a doomed fetch pending far longer
than Chrome before it rejects" issue already fixed in
license-guard.tsx's sync call and the service worker's navigate
handler, just left open here.

### line-api-token-manager-ts-L90

`client/lib/api/token-manager.ts:90`

Only a 401 should unlink the store from cloud sync. A 403 is not a
dead token: `/refresh` sits behind the account-status and
email-verified middleware, which answer 403 (`ACCOUNT_SUSPENDED`,
`STORE_ARCHIVED`, `email_not_verified`) while the token is still
valid, so clearing on 403 permanently unlinked every till of a
temporarily suspended store. Any other status - a captive portal's
511, a proxy's 407, a transient 502/503 - is not evidence the
token is dead, and clearing it here silently and permanently
dropped the device out of sync (sync() then returns
"Unauthenticated" forever) until the user manually re-links.

### line-api-token-manager-ts-L103

`client/lib/api/token-manager.ts:103`

Network errors (offline, timeout/abort above, DNS failure, etc.)
are not evidence the token is invalid either - same reasoning as
the non-401 branch above. Leave the token in place; the next
successful request or refresh attempt will sort it out.

### line-constants-category-icons-tsx-L154

`client/lib/constants/category-icons.tsx:154`

Construction/hardware-store categories (e.g. a building-materials
retailer) — a domain the pharmacy and grocery/retail sets above don't
cover at all, previously landing on an arbitrary FALLBACK_ICONS
rotation or, worse, a fuzzy-matched icon from an unrelated domain
("wine" for "site"/"ware"/"pipe" — see the fuzzy-matcher fix below).

### line-constants-category-icons-tsx-L223

`client/lib/constants/category-icons.tsx:223`

Catches misspellings/import noise that share no substring with a canonical
keyword (e.g. "BUSICUIT" for "biscuit") by allowing a few edits, scaled to
keyword length so short keywords like "tea" don't match everything.

Keywords under 5 letters are excluded entirely (not just given a tighter
threshold): a 4-letter keyword like "wine" is short enough that ordinary,
unrelated English words routinely land within 2 edits of it by pure
coincidence - "site", "ware" (from "sanitary WARE"), and "pipe" (from
"PIPE fittings") all did, each wrongly picking up the Wine icon. Exact
substring matches for short keywords still work via KEYWORD_ICONS above;
only the fuzzy/misspelling path needs the longer floor.

The threshold itself is a flat ~30% of keyword length (floored), not
ceil(length / 3): that was loose enough to let "electrical" fuzzy-match
"electronics" (distance 4 out of 11 - the ceil formula's threshold was
also 4) despite the two naming unrelated things (wiring/lighting
hardware vs. consumer electronics). 30% still catches genuine
misspellings the flooring was built for ("BUSICUIT" vs "biscuit" is
distance 2 of 7, comfortably under floor(7*0.3)=2) while rejecting
same-ballpark-length words that just happen to share a stem.

### line-constants-category-icons-tsx-L257

`client/lib/constants/category-icons.tsx:257`

Checked longest-keyword-first rather than in KEYWORD_ICONS' declared
order: a short keyword that happens to be a substring of a longer,
unrelated one (e.g. "pain" inside "paint") would otherwise win just
because it was declared earlier, regardless of which one actually
describes the category. Sorting once by length means a new keyword added
anywhere in the list above automatically gets correct priority without
anyone having to reason about array position.

### line-constants-dashboard-page-routes-ts-L67

`client/lib/constants/dashboard-page-routes.ts:67`

Doesn't navigate anywhere: stock-adjustments-ledger.tsx reads
?action=create on this same page (same pattern as Transfer Stock's
?action=transfer) and opens the Adjust Stock flow.

### line-constants-dashboard-page-routes-ts-L71

`client/lib/constants/dashboard-page-routes.ts:71`

No actionAdminOnly: adjust_stock_counts is the precise replacement for
that coarse manage_products baseline, and stacking both left a user
holding only adjust_stock_counts with no reachable entry point at all
above `md`, where the ledger's own button is hidden.

### line-constants-dashboard-page-routes-ts-L83

`client/lib/constants/dashboard-page-routes.ts:83`

Unlike every other action.path here, this doesn't navigate anywhere —
stock-movements.tsx reads ?action=transfer on this same page (same
pattern as Add Product's ?action=add) and opens the transfer dialog.

### line-constants-dashboard-page-routes-ts-L144

`client/lib/constants/dashboard-page-routes.ts:144`

No header action: the page itself already has a back button, title,
and item count in its own panel header (desktop), and this header is
hidden entirely on mobile for this route (full-screen takeover).

### line-constants-settings-tabs-ts-L73

`client/lib/constants/settings-tabs.ts:73`

Both support sessions, not just inspection: the impersonation handoff was
the ONLY path that ever reached this console, and gating it on inspection
alone sent an impersonating superadmin to Appearance instead.

### line-constants-settings-tabs-ts-L80

`client/lib/constants/settings-tabs.ts:80`

An on-till inspection is read-only, so it is denied the tabs whose actions
bypass the write guard. Granting diagnostics was not enough on its own:
the fall-through below grants every admin-only tab on `isAdmin`, which is
the *locked staff user's* role — so on an owner's device an inspecting
admin still reached Data's restore and Danger Zone's factory reset, both
raw `execute`, both able to destroy the evidence. Impersonation is
deliberately NOT denied here; it keeps the access it has always had.

### line-constants-smart-suggestions-rules-ts-L30

`client/lib/constants/smart-suggestions-rules.ts:30`

==========================================
PHARMACY / CLINICAL RULES
==========================================

### line-constants-smart-suggestions-rules-ts-L152

`client/lib/constants/smart-suggestions-rules.ts:152`

==========================================
GENERAL GROCERY & RETAIL RULES
==========================================

### line-context-auth-context-tsx-L67

`client/lib/context/auth-context.tsx:67`

Polls until any in-flight sync finishes, so a caller that just triggered
(or piggybacked on) a sync can safely read fresh local data afterward.
isSyncing() flips false the instant the in-flight sync's finally block
runs, so this only ever waits out the current run; it never itself starts one.

### line-context-auth-context-tsx-L78

`client/lib/context/auth-context.tsx:78`

Throttles the PIN-mismatch recovery sync below (module-scope, not per
component instance, since a locked screen can remount). Without this, a
user mashing a genuinely wrong PIN would fire a network sync on every
single attempt.

### line-context-auth-context-tsx-L85

`client/lib/context/auth-context.tsx:85`

The documented default PIN for the zero-users bootstrap admin (see
login()'s fallback branch below). Requiring the typed PIN match this,
rather than accepting any 4 digits, means the bootstrap flow can't double
as a PIN-less login even in the one case it's allowed to fire.

### line-context-auth-context-tsx-L91

`client/lib/context/auth-context.tsx:91`

Re-exported from lib/utils/impersonation.ts (the React-free single source
of truth, so the sync engine, this context and the UI all agree on what an
impersonated session is) rather than re-declared here.

Separate from "dumos_user": an impersonated profile (see loginFromHandoff)
must never be restored via the normal mount-effect path below, which also
calls setDbUser() - that moves the local DB's "current user" pointer to a
user belonging to another store, corrupting audit-log/performed_by
attribution for every write made in that session. Writing it under this
distinct key means the mount effect can restore it into React state ONLY
(session persists across a reload) without ever routing it through
setDbUser(). Previously it was written to "dumos_user" itself, so the
very next reload silently re-hydrated it through the normal path anyway,
defeating the separation loginFromHandoff's own doc comment describes.
(declared in lib/utils/impersonation.ts, imported above)

### line-context-auth-context-tsx-L164

`client/lib/context/auth-context.tsx:164`

super_admin must stay included: it's the platform's own top role (see
checkCanFactoryReset below, which also lists it explicitly), and a
prior fix specifically switched pos-transaction-history.tsx's return
handling to checkIsAdmin BECAUSE the old exact-match-only check locked
super_admin out of processing a return. Losing it here would silently
revert that fix.

### line-context-auth-context-tsx-L183

`client/lib/context/auth-context.tsx:183`

Distinguishes "user is null because nobody's logged in" from "user is
null because the mount effect below hasn't read localStorage yet" -
consumers that need to know a staff member's fixed store_id (see
store-context.tsx's hydration-race fix) can't tell those two apart from
`user` alone. Flips true once, at the end of the mount effect,
regardless of whether a saved user was actually found.

### line-context-auth-context-tsx-L190

`client/lib/context/auth-context.tsx:190`

Starts false rather than reading localStorage in the initializer: this
renders on the server/prerender too, where localStorage doesn't exist,
and a value derived from it would mismatch on hydration. The mount
effect below sets it, and login/loginFromHandoff/logout keep it current.

### line-context-auth-context-tsx-L204

`client/lib/context/auth-context.tsx:204`

Backfill: anyone already logged in when the widget feature ships has
their token sitting in localStorage with nothing to trigger a mirror
into native TokenStore (mirrorAuthToken() otherwise only fires from
setToken(), which only runs on a fresh login/silent refresh). Without
this, TokenStore.load() stays null on the native side until this
device's next login, which may be weeks away, and in the meantime
RefreshWorker's no-token branch actively overwrites a good cached
widget snapshot with linked:false. Only meaningful under Tauri.

### line-context-auth-context-tsx-L219

`client/lib/context/auth-context.tsx:219`

Checked BEFORE the normal savedUser branch below: an impersonated
session (see loginFromHandoff / IMPERSONATED_USER_STORAGE_KEY's doc
comment) restores into React state only, never through setDbUser().

### line-context-auth-context-tsx-L235

`client/lib/context/auth-context.tsx:235`

Corrupted/partial write (e.g. interrupted by a connection drop
mid-save) - getStoredUser() returned null for a key that is set.
Clear it so the next reload doesn't repeat the same failure.

### line-context-auth-context-tsx-L242

`client/lib/context/auth-context.tsx:242`

Evaluated after the branch above (not inside it) so a session that
holds only the impersonator return code — e.g. the profile key was
cleared but "End Session" never completed — still reads as
impersonated, exactly as the sync engine's own gate sees it.

### line-context-auth-context-tsx-L269

`client/lib/context/auth-context.tsx:269`

Captured before any state changes below: distinguishes the ordinary
"same cashier unlocks with their own PIN after auto-lock/idle timeout"
flow (lock-screen calls login() directly, without logout() first, and
`user` is still the same person who was locked out) from a genuine
switch to a DIFFERENT user (lock-screen's "switch account" tile, or a
fresh login after logout() already cleared `user` to null). Only the
latter should wipe the in-progress POS cart below.

### line-context-auth-context-tsx-L278

`client/lib/context/auth-context.tsx:278`

Only a genuine PIN-based attempt is throttled - login(email) with no
pin (the post-cloud-sync auto-login in app/setup/use-onboarding.ts)
never guesses a secret, so it's not subject to this at all. Checked
BEFORE the DB lookup so a locked-out caller gets instant feedback and
can't extend their own lockout just by retrying while still locked.

### line-context-auth-context-tsx-L294

`client/lib/context/auth-context.tsx:294`

An email that matches no user on this device is the on-till admin path.
Deliberately AFTER the local lookup, so a store owner signing in with
their own email stays local and offline (lib/db/queries/auth.ts:26
already accepts an email as an ordinary identifier). Nothing here calls
setDbUser/setStoredUser/setUser: an inspection session is an overlay,
not a login. See
docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.

### line-context-auth-context-tsx-L325

`client/lib/context/auth-context.tsx:325`

Deliberately does NOT unlock() or set dumos_session_authenticated.
/inspect sits outside the dashboard and needs neither, and setting
them turned a till code into a way to unlock whatever staff session
was locked on the device: on exit, /login -> /dashboard would find
the marker and skip the lock. The staff session must resume exactly
as it was, which means still locked.

### line-context-auth-context-tsx-L333

`client/lib/context/auth-context.tsx:333`

Usernames are unique per store, not globally (UNIQUE(store_id,
username)) — on a multi-store device, more than one row can share this
identifier. Narrow to whichever of them actually match the PIN typed;
if a PIN was provided, that's who we're prepared to accept.
pinMatches() (not `u.pin === pin`) because a stored PIN is a bcrypt
hash now; it still accepts a legacy plaintext value, which is what
makes the lazy migration below possible without locking anyone out.

### line-context-auth-context-tsx-L346

`client/lib/context/auth-context.tsx:346`

A PIN reset via the web dashboard writes straight to the cloud
DB; this device only sees it once it next syncs down, which
could otherwise be minutes away. Rather than make a locked-out
owner know to reload the app, pull once on a mismatch (throttled,
and only when there's a cloud link to pull from) and recheck
before actually failing the login.

### line-context-auth-context-tsx-L362

`client/lib/context/auth-context.tsx:362`

If a background/setup sync was already in flight, our call above
was a no-op; the pull we're relying on may still be running.
Wait for it instead of rechecking against data it hasn't written yet.

### line-context-auth-context-tsx-L374

`client/lib/context/auth-context.tsx:374`

More than one of this device's stores has a user with this exact
identifier AND this exact PIN — a genuine collision (plausible with
defaults like admin/1234). There is no trustworthy "intended store"
to break the tie with here, so this fails closed rather than
silently logging the caller in as whichever row SQLite yielded
first (which could be a different store's staff member entirely).

### line-context-auth-context-tsx-L393

`client/lib/context/auth-context.tsx:393`

The acting user_id on this row will be whoever was previously
logged in on this device (or null), not the failed identifier:
audit_logs attributes actions to the current session, and there
isn't one yet at this point. record_id + details.username still
identify which account the attempt was against. Falls back to the
typed identifier itself in the (practically unreachable) case
where the recovery sync above made the user row disappear.

### line-context-auth-context-tsx-L408

`client/lib/context/auth-context.tsx:408`

The PIN just verified against a LEGACY plaintext value: this
successful login is where it becomes a hash. Fire-and-forget (the
login must not depend on the write landing) and it goes through the
ordinary update() path, so it queues for sync push and from there
propagates to the server and down to this account's other devices.
Nothing is user-visible: no reset, no prompt.

### line-context-auth-context-tsx-L427

`client/lib/context/auth-context.tsx:427`

A store-pinned account (staff whose users.store_id is set, as
opposed to an owner/admin with access to every store on this device)
makes their own store the active store, immediately, as part of
authenticating. store-context.tsx already gives `user.store_id`
precedence over the switcher state for its own derived
activeStoreId/targetId, but that is derived React state only - it
never writes the persisted choice. Two things read the persisted
value directly instead of going through useStore():

 1. lib/api/client.ts's pushChanges()/pullChanges(), which stamp
    X-Store-Id straight off localStorage["dumos_active_store_id"].
    On an owner's device that had switched to store B, a store-A
    cashier logging in would sync (push AND pull) against store B
    for their entire session - the one place the derived-state
    precedence doesn't reach.
 2. store-context.tsx's own lazy initializer on the next mount, so
    a stale value also survives into whatever session comes next.

Setting the module-scope query resolver here too (rather than
leaving it to StoreProvider's targetId effect) closes the window
between login() returning and React committing that re-render:
child effects - including React Query's own fetch subscriptions -
run before the provider's effect, so a query firing in that gap
would read the OUTGOING store's id. Same reasoning switchStore()
documents for calling setResolvedStoreId() synchronously.

Owners/admins (no fixed store_id) are deliberately untouched: their
active store is their switcher choice, which store-context.tsx
persists on their behalf.

### line-context-auth-context-tsx-L461

`client/lib/context/auth-context.tsx:461`

Covers the "switch user" lock-screen flow (selecting a different
recent user and unlocking with their PIN), which calls login()
directly without ever going through logout() first. Without this,
the outgoing user's cached queries (dashboard, BI, etc.) would keep
rendering under the incoming user's session until they went stale.
cancelQueries() first since clear() alone doesn't abort a fetch
already in flight from the outgoing user.

This also fires for the ordinary same-user unlock (lock-screen calls
login() there too), which is harmless: clearing cached queries just
means they refetch, unlike the POS cart clear below.

### line-context-auth-context-tsx-L474

`client/lib/context/auth-context.tsx:474`

Same shared-terminal risk as logout(): the "switch user" path never
goes through logout(), so without this the outgoing cashier's
in-progress POS cart (and any staged discount/redeemed reward)
would carry straight over into the incoming cashier's session.

Gated on the login actually being a DIFFERENT user: login() is also
how the lock-screen's ordinary "same cashier unlocks with their own
PIN after auto-lock/idle timeout" flow re-authenticates. Clearing
unconditionally here wiped a cashier's in-progress cart (items,
discount, redeemed loyalty reward) every time they simply stepped
away and came back - a daily-workflow data-loss regression. Only
clear when we can tell this is genuinely a different person than
whoever was previously logged in.

### line-context-auth-context-tsx-L495

`client/lib/context/auth-context.tsx:495`

Marks this tab as already having gone through a real auth/unlock this
session. DashboardLayout's fresh-load lock check reads this so it
doesn't immediately re-lock right after a login/unlock that just
succeeded. Cleared on logout; sessionStorage itself clears on tab
close, so a genuinely new tab/session still locks correctly.

### line-context-auth-context-tsx-L501

`client/lib/context/auth-context.tsx:501`

Any successful login means "not locked", full stop, regardless of
which screen triggered it. Without this, a stale isLocked=true left
over from an earlier auto-lock timeout (persisted in localStorage)
would survive a fresh login untouched and immediately re-show the
dashboard's lock overlay right after login just succeeded.

### line-context-auth-context-tsx-L507

`client/lib/context/auth-context.tsx:507`

Same idea for a stale impersonation banner: the return-code flag
(see ImpersonationBanner) is only ever meant to mean "this exact
session came from a superadmin handoff." It's written once by
app/auth/callback/page.tsx and only ever cleared by successfully
clicking "End Session" — a normal logout, a crash, or simply
closing the impersonated tab all leave it behind in localStorage
forever. Without this, ANY ordinary PIN login on that same device
afterward — by anyone, not just the original impersonator — shows
a permanent, undismissable "Impersonation Mode" banner.
Same idea, for the impersonated profile itself: without this, a
leftover impersonated session (never properly ended) would win over
THIS real login on the very next reload, since the mount effect
checks IMPERSONATED_USER_STORAGE_KEY before "dumos_user". Both flags
go together (clearImpersonatedSession), which also re-enables sync:
the engine refuses to run while either is present.

### line-context-auth-context-tsx-L537

`client/lib/context/auth-context.tsx:537`

Dedupe by username, not id: if this device's local DB was ever
rebuilt/restored, the same real-world person can come back with a
brand new user id but the same username, and login() itself matches
by username anyway. Deduping by id alone left stale ghost tiles for
the old id permanently stuck in this cache, showing as duplicate
"accounts" on the lock screen that were really all the same person.

### line-context-auth-context-tsx-L559

`client/lib/context/auth-context.tsx:559`

Fallback: bootstrap a default admin, but ONLY on a genuinely fresh
device with zero local users - previously this fired for ANY typed PIN
whenever "admin" simply didn't match a local row, which a mid-sync or
post-deletion device could hit with real users present. Also now
requires the PIN match the documented default instead of accepting
anything, so this can't double as a PIN-less login.

### line-context-auth-context-tsx-L650

`client/lib/context/auth-context.tsx:650`

Same reasoning as login(): whoever was on this device before must not
have their cached queries served to the incoming session. cancelQueries()
first since clear() alone doesn't abort an in-flight fetch.

### line-context-auth-context-tsx-L676

`client/lib/context/auth-context.tsx:676`

Fire-and-forget so the server closes the row and records a duration;
without this any logout mid-inspection left an open session with no
exit audit entry at all.

### line-context-auth-context-tsx-L689

`client/lib/context/auth-context.tsx:689`

Without this, a shared terminal's POS cart (items, discount, redeemed
reward, reseller flag — all persisted under this one global key by
use-pos-cart.ts's zustand store) survives logout and is inherited by
whichever cashier signs in next.

### line-context-auth-context-tsx-L694

`client/lib/context/auth-context.tsx:694`

See the matching comment in login(): an impersonated session that
ends via the ordinary "Sign Out" button instead of the banner's "End
Session" button would otherwise leave these flags behind forever.

### line-context-auth-context-tsx-L699

`client/lib/context/auth-context.tsx:699`

Without this, cached query results (dashboard metrics, BI, etc.) from
the outgoing account stay in memory and get served to whichever
account logs in next, until their staleTime/gcTime lapses.
cancelQueries() first: clear() alone doesn't abort an in-flight
fetch, which could otherwise resolve after the next login and
repopulate a store/user-unscoped query key.

### line-context-auth-context-tsx-L762

`client/lib/hooks/use-cloud-link.ts` (`adoptCloudToken()`, shared by the email/password and re-link code paths; moved from `auth-context.tsx:762`)

A credentialed cloud login is by definition not a superadmin
handoff, and it replaces whatever token an impersonated session
was carrying. Clearing the impersonation flags here matters
because sync() now refuses to run while they're set: the
onboarding cloud-restore flow (app/setup/use-onboarding.ts's
startSyncProcess) runs immediately after this call and would
otherwise be permanently blocked by leftover flags from an
impersonated session that was never ended properly.

### line-context-auth-context-tsx-L789

`client/lib/context/auth-context.tsx:789`

Seeds the active store's 5 default permission groups (idempotent, see
ensurePermissionGroupsSeeded) the moment a session is established -
covers login, a restored session, and a cross-origin handoff
uniformly, since all three end in setUser(...).

### line-context-auth-context-tsx-L805

`client/lib/context/auth-context.tsx:805`

A user-to-user switch (the lock screen's "switch account", which never
goes through logout()) must not leave the outgoing user's group in
state while the incoming user's read is in flight - see A-55.

### line-context-auth-context-tsx-L815

`client/lib/context/auth-context.tsx:815`

A pull can bring down a permission_groups edit made from another
device (or another admin) affecting this user's own group - without
this, the change wouldn't be reflected until the user logs out and
back in, since the effect otherwise only re-runs on user id change.

### line-context-auth-context-tsx-L826

`client/lib/context/auth-context.tsx:826`

Deliberate, spec-sanctioned change from the deleted checkIsAdmin/
checkCanManageStockBatch/checkCanViewAllActivity helpers, which never
listed super_admin and so returned false for it: hasPermission()
short-circuits to "everything granted" for store_owner/super_admin, so
a super_admin (i.e. an impersonation session) now gets isAdmin,
canManageStockBatch and canViewAllActivity too. Not a regression -
pinned by auth-context-permission-booleans.test.ts.

### line-context-pull-to-refresh-context-tsx-L23

`client/lib/context/pull-to-refresh-context.tsx:23`

Stable for the provider's lifetime: this only ever closes over a ref, and
the provider sits at the top of the dashboard tree, so a fresh object here
would invalidate every consumer on any re-render of that layout.

### line-context-store-context-tsx-L117

`client/lib/context/store-context.tsx:117`

Upper bound on how long a store switch may hold the transition splash.
Purely a stuck-state guard, not a tuned delay - the local-first query
layer normally settles far inside it.

### line-context-store-context-tsx-L159

`client/lib/context/store-context.tsx:159`

Lazy-initialized (not a useEffect) so the saved choice is already in
state on the very first render, before `user` has even hydrated from
its own localStorage read. Previously this started at null and was
only populated by a later effect gated on `user`. During that gap,
targetId below was null, so the profile query fell back to
getFirstStore() (arbitrary row), and the "sync activeStoreId back"
effect further down then persisted THAT as the real choice, silently
overwriting a real selection (e.g. from the multi-store cloud-restore
picker) with whatever SQLite happened to return first. Reading
synchronously here closes that window instead of racing it.

### line-context-store-context-tsx-L177

`client/lib/context/store-context.tsx:177`

Mirror this same precedence into the query layer's module-scope resolver
(lib/db/core.ts): plain async query functions have no React context, so
this is how they learn which store to filter by. Must stay in lockstep
with `targetId` above: a staff member's fixed store_id always wins.

Gated on isAuthHydrated: on the very first render, `user` is still null
(AuthProvider's own localStorage read hasn't run its effect yet), so
`targetId` falls back to `activeStoreId` even for a staff member whose
real (different) store_id just hasn't loaded yet. Any query that fired
in that window - and the storeProfile query right below is exactly one
- would resolve/scope against the WRONG store for that device. Waiting
for isAuthHydrated closes the window; it flips true in the same tick
AuthProvider's mount effect runs, so this costs no perceptible delay.

### line-context-store-context-tsx-L203

`client/lib/context/store-context.tsx:203`

The active/fixed store no longer exists locally, most likely
pruned by the sync-engine's reconciliation step because the
server no longer recognizes it (a stale local-only store, or one
this account lost access to). For an owner/admin (no fixed
store_id), fall back to whatever store IS still known rather than
getting stuck showing nothing. A staff member's fixed store_id
genuinely disappearing is a deeper problem worth surfacing, not
papering over the same way.

Clearing the stale id is NOT done here: a query function can be
re-invoked on retry without a real change in circumstances, and
doing it here previously fired setActiveStoreId(null) (a React
state update) on every such invocation - which flips `targetId`
mid-fetch, produces a new query key, and triggers a second fetch
on every miss. The effect below runs once React Query has settled
on a confirmed result instead.

### line-context-store-context-tsx-L228

`client/lib/context/store-context.tsx:228`

Not just isStoreProfileLoading: with `enabled: isAuthHydrated`, React
Query's own isLoading (isPending && isFetching) reads false while
disabled and not yet fetched - it would otherwise briefly report "not
loading" during the pre-hydration window despite storeProfile still
being undefined, letting a consumer treat that gap as "confirmed no
store" rather than "still resolving."

### line-context-store-context-tsx-L247

`client/lib/context/store-context.tsx:247`

Set once on mount: distinguishes which physical device/terminal at a
multi-device store a remote log came from, since store_id/user_id alone
are shared across every device tied to that store.

### line-context-store-context-tsx-L270

`client/lib/context/store-context.tsx:270`

Sync activeStoreId back whenever the resolved profile doesn't match
targetId, for an owner/admin with no fixed store_id - covers both
falling back to LIMIT 1 (no targetId at all) and a targetId that no
longer resolves to a real store (queryFn's fallback returned a
*different* store than requested; see the comment on the fallback
branch above). Setting the resolved id directly, in one state update,
rather than clearing to null first and letting a second effect pass
pick that up - the two-step version doubled the number of query
cycles this settles through (null is itself a distinct targetId,
producing its own queryKey/fetch before this effect could fire again
to land on the real value). Naturally runs at most once per mismatch:
once synced, storeProfile.id === targetId and this can't fire again
until a new mismatch appears.

### line-context-store-context-tsx-L304

`client/lib/context/store-context.tsx:304`

Every store-scoped query reads the active store from lib/db/core.ts's
module-scope resolver at call time, not from its React Query key
(queryKeys.ts's factory DOES suffix keys with the active store id,
but plenty of call sites still hand-roll their own useQuery key and
aren't covered by that), so without clearing the cache below, screens
would keep showing the previous store's cached results indefinitely.

Must set the resolver synchronously here rather than relying on the
useEffect above (which mirrors targetId into it): that effect only
runs after React commits the re-render, which is after the async work
below has already kicked off. Without this, work started in that gap
would read the OLD store id (stale resolver), cache the old store's
data under the same query keys, and never refetch again: the exact
"needs a reload to reflect" bug.

### line-context-store-context-tsx-L319

`client/lib/context/store-context.tsx:319`

Cancels in-flight fetches from the outgoing store before clearing:
clear() alone doesn't abort a request already in flight, and every
query function reads the active store id from lib/db/core.ts's
module-level resolver at execution time rather than from its React
Query key. Without this, a request issued (and still pending) before
the switch could resolve after resolvedStoreId flips and get cached
as "fresh" under a store-unscoped key, momentarily showing the
previous store's data.

Hold a transition state until this settles, so nothing renders the
outgoing store's still-cached data while cancellation is in flight.
Capped by a timeout on the cancelQueries() step only: a fetch that
never settles must not strand the app on the splash screen - falling
back to the (at worst briefly stale) UI is better than a stuck one.
clear() itself is synchronous (no network round trip, unlike the
invalidateQueries() this used to call) and always runs after the
race below, timeout or not, so the cache is never left un-cleared.

clear() rather than invalidateQueries(): invalidateQueries() only
marks queries stale and its default refetchType only refetches
queries with an ACTIVE (mounted) observer - and setIsSwitchingStore
below unmounts `children`, and every observer in it, synchronously,
before any of this async work even starts. With zero active
observers, invalidateQueries() did nothing but resolve immediately,
and the remount after the splash cleared read the previous store's
data straight out of cache. clear() doesn't depend on anything being
mounted: it empties the cache outright, so the remount finds nothing
to serve for any query and fetches fresh under the new store - the
same approach the working multi-staff PIN "Switch Account" path
already uses via auth-context.tsx's login()/logout().

### line-context-store-context-tsx-L357

`client/lib/context/store-context.tsx:357`

A POS cart staged against the outgoing store's product ids must
not survive into the newly-active store — it isn't scoped by
store, and checking it out against the new store would sell
product ids/prices that belong to a different store entirely.

### line-context-store-context-tsx-L367

`client/lib/context/store-context.tsx:367`

Pulls this store's data down if this device has never synced it
before (X-Store-Id now points at the newly-selected store; see
lib/api/client.ts). Best-effort: offline/unauthenticated devices still
work from whatever's already local. Guarded on navigator.onLine (like
the mount-time triggerSync effect below) so switching stores while
offline doesn't attempt a doomed fetch — every queued item across
however many tables have pending changes would otherwise fail with
"Failed to fetch" and burn through the sync-queue's retry backoff for
no reason, eventually firing a spurious "stuck sync" crash report for
what is, correctly, just this being an offline-first app.

### line-context-store-context-tsx-L447

`client/lib/context/store-context.tsx:447`

Privileged subscription status sync: always runs regardless of tier,
so plan downgrades, suspensions, and renewals written on the server
are reflected locally even when full cloud sync is gated off.

### line-context-store-context-tsx-L489

`client/lib/context/store-context.tsx:489`

Every real caller of this is a settings write against an ALREADY
onboarded store (theme toggle, loyalty settings, payment config, ...)
- onboarding creates the very first store through its own explicit
path (app/setup/use-onboarding.ts), not through here. `storeProfile`
being null at this point means its query hasn't resolved yet (or a
staff member's fixed store was pruned), not "no store exists on this
account yet" - minting a hardcoded id "default"/"My Store" row here
silently created a phantom store (that then synced to the server)
for what's actually a loading-state race or a data problem that
deserves to be surfaced, not papered over.

### line-context-store-context-tsx-L511

`client/lib/context/store-context.tsx:511`

Fire-and-forget by design (the UI applies the theme immediately,
optimistically) — but a failed write must not fail silently, or the
displayed theme and the persisted/synced one quietly diverge with no
signal to the user.

### line-db-DatabaseProvider-tsx-L69

`client/lib/db/DatabaseProvider.tsx:69`

Drives the read-only banner's "Use this window" flow (see
requestWriterHandoff()/forceWriterTakeover() in core.ts): "idle" (not
attempted, or a previous attempt is done), "requesting" (waiting on the
graceful handoff's ack), "offer-force" (it timed out or this browser
has no BroadcastChannel - offer the steal fallback instead), "forcing"
(steal in progress).

### line-db-DatabaseProvider-tsx-L99

`client/lib/db/DatabaseProvider.tsx:99`

On "acked" this tab's own queued lock request still has to actually
get granted and rehydrate (asynchronously, via onWriterTabChange
below) before isReadOnlyTab flips - leave handoffState "requesting"
rather than reset to "idle" here, so the button doesn't flash back to
its initial label for the brief gap before that happens.

### line-db-DatabaseProvider-tsx-L126

`client/lib/db/DatabaseProvider.tsx:126`

Reflects tab-lock.ts's single-writer election (see C1 in
docs/KNOWN_BUGS.md) - initDatabase() has already registered this
tab's lock request by the time it resolves, so isWriterTab()'s
current value plus this subscription together cover both the
initial state and any later promotion.

### line-db-DatabaseProvider-tsx-L181

`client/lib/db/DatabaseProvider.tsx:181`

Tracks this tab's writer/read-only role (see tab-lock.ts / C1 in
docs/KNOWN_BUGS.md) for as long as the provider is mounted, so a
promotion (the writer tab elsewhere closing) updates the UI without
needing a reload.

### line-db-DatabaseProvider-tsx-L195

`client/lib/db/DatabaseProvider.tsx:195`

Fires only when this tab won the writer-lock queue but then refused to
actually take over, because rehydrating its local database from
IndexedDB failed (see tab-lock.ts's initWriterLock() doc comment) -
deliberately fail-closed, so this tab never risks persisting a stale
copy over the real one. Without this, the tab would just look stuck
read-only forever with no explanation; a reload gets it back in line
for promotion (or becomes the writer outright, if it's now the only
tab open).

### line-db-DatabaseProvider-tsx-L215

`client/lib/db/DatabaseProvider.tsx:215`

Every write attempt from a read-only tab throws (core.ts's
assertWritable()) so nothing is silently dropped, but a thrown error
alone can look like a generic failure. Rate-limited the same way
dumos_db_save_failed is below, so repeatedly tapping a disabled-looking
action doesn't spam toasts.

### line-db-DatabaseProvider-tsx-L235

`client/lib/db/DatabaseProvider.tsx:235`

core.ts's saveDatabase() previously only console.error'd a failed local
persist (most plausibly a full IndexedDB quota, on the same per-origin
storage budget the PWA's precache competes against) - the app kept
looking completely healthy while writes silently stopped persisting.
Surfaced here (rate-limited at the dispatch site in core.ts) so the user
has some signal before everything since the last successful save is
lost on next launch.

### line-db-DatabaseProvider-tsx-L313

`client/lib/db/DatabaseProvider.tsx:313`

z-[9500]: must render above every other full-screen overlay this
app can show while a tab is read-only - SplashScreen's z-[100]
(components/ui/splash-screen.tsx, shown by LicenseGuard while
loading) AND dashboard-layout.tsx's PIN-lock screen at z-[9000].
This banner sat at z-50 before, underneath both, making the "Use
this window instead" handoff button invisible and unclickable on
a read-only tab stuck behind either one. 9500 matches this
codebase's existing "above everything except TauriTitleBar"
convention (see dashboard-layout.tsx's own skip-link, also
z-[9500]) - TauriTitleBar's z-[9999] doesn't need to be beaten.

### line-db-base-helpers-ts-L29

`client/lib/db/base-helpers.ts:29`

Invalidates exactly the queries that could be affected by a mutation on
`table`, matched via each query's `meta.tables` (see lib/query-keys.ts),
not queryKey prefix matching, since several queries (dashboard, BI,
daily-close) legitimately depend on more than one table and a prefix
match can only ever express one. A query with no `meta.tables` hasn't
been migrated to the factory yet, so it falls back to always invalidating.
That's the same broad behavior this replaced, just scoped down to the
queries that haven't opted into precise tagging yet, so adopting the
factory anywhere is strictly an improvement, never a regression.

### line-db-base-helpers-ts-L90

`client/lib/db/base-helpers.ts:90`

Every products.name / categories.name write funnels through insert()/
update() below (local-database.ts just re-exports these), so normalizing
here once — instead of at each of the half-dozen call sites that create or
rename a product/category — is the single choke point that can't be missed
by a future caller the way the case-insensitive category lookup was.
Canonical storage is lowercase; the UI renders it uppercase via CSS
(toggleable per store), so the stored casing never needs to match display.

### line-db-base-helpers-ts-L128

`client/lib/db/base-helpers.ts:128`

A batch created holding its first movement's quantity (a receipt, an
import row, a transfer-in) is already right, and writing it again costs a
push row and an audit row per batch.

### line-db-base-helpers-ts-L133

`client/lib/db/base-helpers.ts:133`

The movement's own options are forwarded: a cross-store transfer writes
each leg under its own store_id, and the batch must be claimed under the
same one or assertStoreOwnership rejects it.

### line-db-base-helpers-ts-L157

`client/lib/db/base-helpers.ts:157`

Auto-scope to the active store unless the caller already set one
explicitly (e.g. an owner creating a user/product for a store other
than the one they're currently viewing). `== null` deliberately covers
an explicit null too: a store owner's own users.store_id is always null
by design, so callers forwarding `user.store_id` were writing NULL-scoped
rows that every store-scoped report then filtered out (see
docs/FIXED_BUGS.md, SF-P2-6).

### line-db-base-helpers-ts-L178

`client/lib/db/base-helpers.ts:178`

The row write, its sync-queue entry, and its audit-log entry must land
together: outside a transaction, execute() persists (saveDatabase()) after
EACH statement independently, so the app being killed between any two of
them (iOS backgrounding a PWA tab is aggressive about this) could leave
the row committed with no _sync_queue entry - silently and permanently
unsynced, since pushChanges() only ever reads the queue, never the table
itself. Wrapping in transaction() makes all three one atomic unit with a
single save. Skipped when already inside a caller's transaction() (e.g.
createSale() doing several inserts) since transaction() calls can't
nest - execute() there already participates in the outer transaction and
is just as atomic.

### line-db-base-helpers-ts-L196

`client/lib/db/base-helpers.ts:196`

"feedback" holds background crash/error telemetry (see error-logger.ts),
not a user action; logging it here would surface every silent crash
report as a "Created feedback" entry in the Activity Log.

### line-db-base-helpers-ts-L235

`client/lib/db/base-helpers.ts:235`

_version is deliberately NOT incremented here. This is a local-edit
counter that must stay in lockstep with the value sent to the server for
conflict detection (see SyncController::push's strict-equality check),
not an independent local tally: two devices editing the same row from
the same shared ancestor version would otherwise always compute the
identical "next" version (pure arithmetic on the same starting number),
guaranteeing an undetected collision instead of a rare one — see
docs/features/_known-bugs.md #11. The row's `_version` now only ever
changes when explicitly set by a confirmed server response (push
acceptance — see sync-engine/push.ts's `versions` handling) or a pull
bringing in a newer row (pull.ts). This UPDATE still sends/stores the
unchanged current version as-is, so the server can tell "this edit was
based on the server's actual current state" (accept) from "this edit
was based on something stale" (reject) instead of the two colliding
silently.

### line-db-base-helpers-ts-L261

`client/lib/db/base-helpers.ts:261`

Folded into the same record as the rest of the edit (rather than a
separate UPDATE statement) so the claim is included in BOTH the
local write AND the addToSyncQueue() payload below — previously the
claim was a second, separate statement whose column was never part
of `record`, so the server never learned about it: it committed
locally (atomically with the edit, as of the earlier fix for this)
but stayed invisible to every other device pulling this row later.
Overrides any store_id the caller's own `data` might have set,
matching the claim's existing semantics of always using the active
store, not a caller-supplied value.

### line-db-base-helpers-ts-L284

`client/lib/db/base-helpers.ts:284`

See insert()'s comment above: the row write, its sync-queue entry, and
its audit-log entry must land together, or a kill between them can leave
an updated row that never reaches the server. The legacy-row claim (if
needed — see assertStoreOwnership()'s doc comment) is folded into
`record` above for the same reason: it must commit atomically with the
actual edit, and it must reach the server the same way the rest of the
edit does.

### line-db-base-helpers-ts-L295

`client/lib/db/base-helpers.ts:295`

See insert()'s matching exclusion above - "feedback" is background
crash/error telemetry, not a user action. Previously unguarded here
(only insert() excluded it), latent until error-logger.ts's dedup
path started calling update() on an existing feedback row to bump
its occurrence_count - without this, every coalesced crash repeat
would surface as an "Updated feedback" Activity Log entry.

### line-db-base-helpers-ts-L332

`client/lib/db/base-helpers.ts:332`

Claim column/value folded into the same statement (rather than a
separate UPDATE) so it's included in the DELETE sync payload below too
— see update()'s identical fix/comment above for why a separate,
un-synced claim statement left the server never learning about it.

### line-db-base-helpers-ts-L384

`client/lib/db/base-helpers.ts:384`

Ignores the returned needsClaim (if the row is a legacy row) — this is
a hard, unrecoverable DELETE, so claiming it first only to destroy it
in the very next statement protects nothing.

### line-db-base-helpers-ts-L389

`client/lib/db/base-helpers.ts:389`

Fetched before the delete so the audit trail still has a record of what
was destroyed. This is a hard, unrecoverable delete (unlike softDelete),
so it's the one place where NOT capturing this would leave a real blind
spot in the audit log.

### line-db-base-helpers-ts-L402

`client/lib/db/base-helpers.ts:402`

Also remove any pending (not-yet-synced) queue entries for this record
before queueing our own DELETE below, so a still-pending INSERT/UPDATE
doesn't race the DELETE to the server.

### line-db-base-helpers-ts-L485

`client/lib/db/base-helpers.ts:485`

See awaitSettledTransactions()'s doc comment: without this, a
background auto-sync tick that lands mid-transaction (e.g. a bulk
import) can read and push that transaction's not-yet-committed rows,
orphaning them on the server if the transaction later rolls back.

### line-db-base-helpers-ts-L513

`client/lib/db/base-helpers.ts:513`

insert()/update() always set _synced = 0 at write time; nothing else
ever flipped it back once the queue row above is deleted. Left unfixed,
every successfully-synced row still reads as "unsynced with no queue
entry" forever - exactly what requeueOrphanedRows() (reconcile-
identity.ts, run every app boot) treats as needing a fresh queue entry,
mass-requeuing a device's entire already-synced history on every boot.

### line-db-base-helpers-ts-L603

`client/lib/db/base-helpers.ts:603`

Preserve the "[REPORTED]" marker once it's set: writing the bare
errorMessage here unconditionally used to clobber it on every later
call, so `alreadyReported` flipped back to false every other retry and
logCrash() fired again and again instead of exactly once.
Bounded before it is stored or embedded anywhere: a DB-level failure
arrives as the full driver error INCLUDING the entire attempted SQL
statement, i.e. a verbatim copy of the row being pushed.

### line-db-base-helpers-ts-L624

`client/lib/db/base-helpers.ts:624`

Checked before BOTH paths below. logCrash() already filters these,
but reportStuckCrashLog() calls Sentry.captureException directly and
so bypasses that filter entirely — which is the path a plan-refused
`feedback` row actually takes.

### line-db-core-ts-L117

`client/lib/db/core.ts:117`

STORE_SCOPED_TABLES and the schema-migration machinery now live in
./schema-migrations; re-exported here so existing importers of
`STORE_SCOPED_TABLES` from "./core" keep working unchanged.

### line-db-core-ts-L693

`client/lib/db/core.ts:693`

Reserves the same connection-wide lock query()/execute()/transaction()
use (see reserveDbSlot()), for the same reason rehydrateFromIndexedDb()
does: nothing in flight may resume against the outgoing `db` once it has
been close()d, and nothing may read the restored one until its schema
pass below has finished.

### line-db-core-ts-L715

`client/lib/db/core.ts:715`

A backup taken on an older app version carries that version's schema,
which leaves the live process running against a database missing
whatever tables/columns have shipped since (the permission_groups
drift traced in docs/KNOWN_BUGS.md) until the next cold start. Apply
the exact pass initDatabaseInternal() applies to an existing database:
CREATE TABLE IF NOT EXISTS plus the idempotent migrations, both
additive against the restored rows.

### line-db-local-database-ts-L134

`client/lib/db/local-database.ts:134`

Demo-data-seeding only (reachable only from lib/demo/loader.ts); intentionally
NOT routed through the shared recordSaleItemStock() helper (lib/db/queries/inventory.ts)
that every production sale-recording path now uses — don't mistake this for a
second production sale-recording path that needs fixing to match it.

### line-db-local-database-ts-L141

`client/lib/db/local-database.ts:141`

stock_movements.performed_by is a required foreign key on the cloud
DB (no default); reading it here the same way receivePurchaseOrder()
does, since it was never set on this insert before and every sale's
movement row was silently failing to sync as a result.

### line-db-local-database-ts-L194

`client/lib/db/local-database.ts:194`

One transaction, like createSale/receivePurchaseOrder: a prescription
header committed without its medications is a clinically empty record
that is nonetheless already in _sync_queue, so the gap propagates to
every other device and can never be reconstructed from what survived.

### line-db-local-database-ts-L211

`client/lib/db/local-database.ts:211`

insert("prescriptions", ...) above already invalidated the prescriptions
query and refetched, but that refetch can race the prescription_items
inserts still running in this loop, caching a partial medications list.
Invalidate again now that all items exist.

### line-db-local-database-ts-L225

`client/lib/db/local-database.ts:225`

`has_pin` is derived, never the hash itself: the staff list needs to know
whether a PIN exists (a newly created account may have none) and nothing
more. See lib/types/user.ts's StaffListItem.

### line-db-local-database-ts-L233

`client/lib/db/local-database.ts:233`

Only fall back to the module-scope resolver when the caller omits the
argument entirely. An explicit `null` means "no filter, all stores" and
must not be coerced back into the active store id.

### line-db-local-database-ts-L238

`client/lib/db/local-database.ts:238`

`role = 'store_owner'` is deliberately business-wide: it's the fleet
account owner (assigned at signup, one per account, see
RegistersAccounts::registerStoreOwner server-side), not tied to any
one store, and must appear in every store's staff list regardless of
its own store_id. `role = 'admin'` was previously OR'd in here too,
but that's a per-store "local master" role created at onboarding with
a real store_id — leaking it into every OTHER store's list was a bug,
not intended fleet visibility (see docs/KNOWN_BUGS.md history).

### line-db-local-database-ts-L259

`client/lib/db/local-database.ts:259`

Staff created here are created LOCALLY and pushed up by the sync
engine, so this is a real PIN write site: hash it, never store the
raw digits. See lib/utils/pin-hash.ts.

### line-db-procurement-receiving-ts-L63

`client/lib/db/procurement-receiving.ts:63`

Re-read the line's received balance INSIDE the transaction rather
than trusting the poData snapshot taken before it: that snapshot was
read before this transaction's turn in the queue, so a receipt
racing this one (two tabs, or the same delivery submitted twice)
computes the full outstanding balance from a balance that is no
longer true and books the delivery again. Same fix shape as
submitStockAudit's system-quantity re-read.

### line-db-procurement-receiving-ts-L80

`client/lib/db/procurement-receiving.ts:80`

Default to the whole outstanding balance if not provided in payload.
A submitted quantity is floored at 0 (the form clamps too, but a negative
reaching here would silently corrupt on-hand stock at the moment of receipt)
and capped at the outstanding balance, so a typo can't book more stock
than was ever ordered.

### line-db-procurement-receiving-ts-L102

`client/lib/db/procurement-receiving.ts:102`

Same helper the Immediate Purchase flow uses, so the two paths can't
drift on what "cost" means: a typed override is per base unit, an
absent one falls back to the line's per-bulk unit_cost divided down.

### line-db-procurement-receiving-ts-L111

`client/lib/db/procurement-receiving.ts:111`

Deterministic, not random: two devices booking the same delivery
derive the same pair of ids (this PO line, this already-received
balance), so the second device's push collapses onto the first's
rows server-side — SyncController::push turns an INSERT whose id
already exists into an UPDATE, which for stock_batches drops the
quantity outright and for stock_movements contributes no delta.
Without this, both receipts are independent rows the server has no
way to recognise as one delivery, and on-hand stock doubles while
the PO still shows a single receipt (one of the two
quantity_received updates loses the version check). A genuine later
partial receipt starts from a different balance and so keeps its own
ids. See lib/db/deterministic-id.ts.

### line-db-procurement-receiving-ts-L166

`client/lib/db/procurement-receiving.ts:166`

bulk_quantity/units_per_bulk are re-sent unchanged so the sync
push's purchase_order_items mapping (SyncController::push) can scale
quantity_received into base units the same way it scales
quantity_ordered — it only does so when both are present in the
payload, and a sync-queue UPDATE payload carries changed fields only.

### line-db-procurement-receiving-ts-L178

`client/lib/db/procurement-receiving.ts:178`

A submit with every line left at 0 against a PO that has nothing
received yet isn't a partial receipt, it's a no-op — the order stays
exactly where it was rather than moving into the partial state.

### line-db-procurement-ts-L216

`client/lib/db/procurement.ts:216`

Via immediateLineAmount, not a bare bulk_quantity * unit_cost: an
Immediate Purchase parked as a draft carries per-base-unit overrides that
the screen already bills for, and ignoring them stored a total the owner
never saw. Identical for a standard line, which has no override.

### line-db-queries-activity-log-ts-L7

`client/lib/db/queries/activity-log.ts:7`

Whitelisted, not interpolated from arbitrary caller input: sortKey/
sortDirection end up inside the SQL string directly (SQLite doesn't
support parameterized ORDER BY column/direction), so only values that
resolve through this map/ternary can ever reach the query.

### line-db-queries-auth-ts-L34

`client/lib/db/queries/auth.ts:34`

Goes through insert() (not a raw query) so this bootstrap account is
actually pushed to the cloud like any other user - previously it was a
raw INSERT OR IGNORE that never touched _sync_queue, so it stayed
invisible to every other device/the server, and a factory-reset device
would silently mint an independent, never-reconciled duplicate. The id
stays the fixed "default-admin" sentinel: it's relied on elsewhere
(staff-list.tsx disables editing/deleting this specific row) and the
caller (auth-context.tsx's login()) only reaches this once it has
already confirmed zero local users exist, so a same-id collision here
would only happen from a genuine double-submit race, not routine use.

### line-db-queries-auth-ts-L51

`client/lib/db/queries/auth.ts:51`

Hashed like every other stored PIN, even though the bootstrap
value itself is a documented constant (DEFAULT_ADMIN_PIN) - once
this row exists, ordinary login verifies against this column.

### line-db-queries-auth-ts-L102

`client/lib/db/queries/auth.ts:102`

Excludes the store owner's own row (role = 'store_owner') so a plan's
advertised staff limit means "N employees you can add," not "you +
N-1 employees." Also still excludes the hardcoded 'default-admin'
bootstrap id (a local fallback account, unrelated to ownership — see
auth-context.tsx's login() fallback branch).

### line-db-queries-categories-ts-L15

`client/lib/db/queries/categories.ts:15`

Correlated subquery (not a LEFT JOIN + GROUP BY) so a category with zero
products still returns exactly one row, and every other selected column
stays a plain scalar instead of needing MAX()/ANY_VALUE() workarounds.

### line-db-queries-customers-ts-L90

`client/lib/db/queries/customers.ts:90`

Money is stored/compared in float columns, so a debt paid off exactly can
leave sub-cent rounding dust (e.g. 2.8e-14) instead of a clean zero. 0.01
treats anything below a cent as fully settled, both here and wherever a
balance/payment amount is written (see recordCustomerPayment,
applyCreditPaymentFIFO).

### line-db-queries-customers-ts-L133

`client/lib/db/queries/customers.ts:133`

Includes 'refunded'/'partially_refunded': a return against a credit sale
overwrites payment_status with one of those (see
use-process-return-mutation.ts), which would otherwise drop a sale that
still has a nonzero balance (partial return, credit portion only
partly forgiven) out of this ledger forever. The `owed <= 0` guard below
is what keeps a fully-settled/fully-forgiven sale from being touched.

The payment_method guard on the refunded/partially_refunded branch below
protects against a legacy edge: a cash/card/transfer sale's amount_paid
can be left at the schema default of 0 (e.g. old synced rows predating
stricter writes), and once 'refunded'/'partially_refunded' are included
here, such a sale would otherwise look like it owes its full
total_amount and get swept into this credit ledger even though it was
never actually sold on credit. 'pending'/'partial' sales aren't gated on
payment_method - by construction (see calculateSalePaymentStatus) only a
credit/mixed-with-credit sale ever gets those statuses in the first
place.

### line-db-queries-customers-ts-L173

`client/lib/db/queries/customers.ts:173`

A sale already marked 'refunded'/'partially_refunded' carries
information the Refunded tab/badge (pos-transaction-history.tsx,
transaction-item.tsx) key off of - overwriting it to
'completed'/'partial' here would silently erase that a return ever
happened, even though this payment only settled the sale's remaining
(unforgiven) debt. Leave those statuses alone; only 'pending'/'partial'
sales get the normal completed/partial transition.

### line-db-queries-customers-ts-L205

`client/lib/db/queries/customers.ts:205`

The payment receipt, the balance reduction, and the FIFO settlement of
individual sales must land together: without a transaction, a throw
partway through (e.g. inside applyCreditPaymentFIFO's per-sale update
loop) could leave the balance already reduced and a payment receipt
already recorded while the underlying sales stay pending/partial - the
debtor ledger and the per-sale settlement then permanently disagree,
and the next payment re-settles sales that were already paid for.

### line-db-queries-finance-ts-L96

`client/lib/db/queries/finance.ts:96`

expense.date is a bare "YYYY-MM-DD" column; parsing it with `new Date()`
reads it as UTC midnight while windowStart/windowEnd and the
startOfMonth/endOfMonth buckets below are local-time, shifting the first
installment a month early in negative-UTC timezones (same class of bug
fixed for expiry dates in date-utils.ts).

### line-db-queries-finance-ts-L118

`client/lib/db/queries/finance.ts:118`

Prorate by the fraction of this installment's month that actually
falls inside the window, rather than counting the full monthly amount
for any month the window merely touches. A calendar-month window
(from = startOfMonth, to = startOfMonth(next)) still gets the full
installment since it fully contains the bucket, but a rolling window
(e.g. "last 30 days") that straddles two calendar months no longer
double-counts by claiming the full installment from both months.

### line-db-queries-finance-ts-L148

`client/lib/db/queries/finance.ts:148`

date() on both sides: expenses.date is a date-only "YYYY-MM-DD" column,
but from/to here are full UTC ISO instants representing LOCAL midnight/
end-of-day (see toQueryRange) - a plain string compare silently drops
any expense dated exactly on the window's start day. date() normalizes
either form, but bare `date(?)` truncates the UTC instant in UTC, which
shifts the boundary by the store's own UTC offset relative to the sales
side (every sales/refund query below buckets with 'localtime' - see
reports.ts). For a UTC+1 store, local midnight Sep 1 is
"2026-08-31T23:00:00Z", so bare `date(?)` reads it as 2026-08-31,
pulling an Aug 31 expense into a September-only window one day early
(and, in a negative-offset timezone, doing the same at the range's end
instead). `'localtime'` reproduces the same shift toQueryRange applied
when building the instant, cancelling it back out.

`to` is INCLUSIVE, matching every other dateTo in these reports (see
reports.ts). A strict "< date(?)" here meant that when a caller passed
`to = now` (the common case - see getBIMetrics), every expense dated
TODAY was silently excluded from the BI dashboard's expense total, no
matter how far into the day it was logged.

### line-db-queries-finance-ts-L174

`client/lib/db/queries/finance.ts:174`

Fetched unconditionally by date, not windowed: a prepaid expense
logged well before this window can still have unrecognized months
falling inside it.

### line-db-queries-finance-ts-L185

`client/lib/db/queries/finance.ts:185`

getSmoothedAmountInWindow treats windowEnd as EXCLUSIVE; +1ms turns the
inclusive `to` above into that exclusive bound, so an amortized
installment overlapping the instant `to` itself is still counted -
matching the plain-expense query's now-inclusive semantics above.

### line-db-queries-finance-ts-L213

`client/lib/db/queries/finance.ts:213`

See the matching comment in getSmoothedExpensesTotal above - `to` is
inclusive here too, and 'localtime' is needed for the same reason
(from/to are UTC instants representing local calendar boundaries).

### line-db-queries-inventory-ts-L97

`client/lib/db/queries/inventory.ts:97`

Excludes deactivated batches and already-expired stock outright (FEFO
prioritizes near-expiry stock, it doesn't dispense already-expired stock);
NULL-expiry batches sort last, not first (SQLite's default for ASC).

### line-db-queries-inventory-ts-L171

`client/lib/db/queries/inventory.ts:171`

Prefer FEFO picking among batches that still show positive stock; if the
product's true stock is already fully depleted, fall back to whatever
batch was touched most recently so the sale still leaves a trace in
stock_batches/stock_movements instead of silently untracked shrinkage.

### line-db-queries-inventory-ts-L179

`client/lib/db/queries/inventory.ts:179`

Last resort, in order: an expired batch, then a batch opened here.
Without it, a product whose only batches are expired (or which has none
at all) produced a sale line with revenue, no COGS and no stock ledger
trace whatsoever — see docs/FIXED_BUGS.md (A-57).

### line-db-queries-inventory-ts-L198

`client/lib/db/queries/inventory.ts:198`

Primary/first batch consumed; retained for backward-compat display
only. Accurate per-batch accounting (for FEFO splits) lives in
sale_item_batches below.

### line-db-queries-inventory-ts-L210

`client/lib/db/queries/inventory.ts:210`

Accumulates the total quantity deducted per unique batch id across BOTH
the main positive-stock loop below and the partial-shortfall fallback
loop that can follow it. The fallback (getAnyActiveBatchForProduct,
ordered by updated_at DESC) is very likely to re-select the very batch
the main loop just partially deducted from, since deductFromBatch just
bumped that batch's updated_at — so a batch can legitimately be touched
twice in one call. Writing sale_item_batches/stock_movements rows once
per touch would then produce two rows for the same (sale_item, batch)
pair with the deduction split across them. Deferring those two inserts
until every batch has been fully deducted, keyed by batch id, ensures
exactly one row per unique batch with the correctly summed quantity.

### line-db-queries-inventory-ts-L223

`client/lib/db/queries/inventory.ts:223`

Batches touched by a deduction that exceeded what they actually had
available (deduction > batch.quantity at the time it was applied) —
i.e. a genuine oversell, not merely "this batch was already low." A
batch can be touched more than once in one call (see the fallback loop
comment below), so this is a set: one oversold touch is enough to tag
the batch's summed stock_movements row.

### line-db-queries-inventory-ts-L231

`client/lib/db/queries/inventory.ts:231`

What each touched batch has left as this call proceeds. The fallback loop
below re-reads the batches from the database, where the quantity is not
written until the movement row is (see base-helpers' recompute), so
without this a batch already emptied by the first loop would read as full
and absorb the remainder twice.

### line-db-queries-inventory-ts-L238

`client/lib/db/queries/inventory.ts:238`

batch.quantity can be <= 0 when this batch only turned up via the
getAnyActiveBatchForProduct fallback (nothing with positive stock left
for this product); clamping to it in that case would silently drop some
or all of the deduction again. Only clamp against genuinely available
stock when computing `deduction`; otherwise the batch absorbs the full
remainder so sale_item_batches/stock_movements still record the true
amount sold. The STORED stock_batches.quantity, however, is floored at
0 (product decision: "floor + alert" — a stale on-screen stock count
can let a sale legitimately oversell, but the batch's own running
balance should never be written negative); the oversell itself is
surfaced via the oversoldBatchIds tag below and getOversoldAlerts().

### line-db-queries-inventory-ts-L273

`client/lib/db/queries/inventory.ts:273`

Partial shortfall: the positive-stock batches above didn't cover the
whole quantity — e.g. a stale on-screen stock count let the cashier sell
more than a single batch (or the sum of all positive batches) actually
has left. This is the same untracked-shrinkage risk the zero-batches
fallback above guards against, just arrived at a different way, so it
gets the same fallback: attribute the leftover to the most-recently-
touched active batch instead of leaving it undeducted and unlogged.

### line-db-queries-inventory-ts-L430

`client/lib/db/queries/inventory.ts:430`

Default 90, matching `expiry_warning_days INTEGER DEFAULT 90` in the schema
and every UI caption/fallback. A 30 here silently re-introduced the
count-vs-caption mismatch for any caller that omits the argument.

### line-db-queries-inventory-ts-L517

`client/lib/db/queries/inventory.ts:517`

store_id is added to `products` via a schema migration rather than the
base CREATE TABLE, so a device/test harness that hasn't (or doesn't
need to) run migrations may not have the column yet - fall back to no
explicit store_id (insert()'s own active-store auto-scoping still
applies) rather than let a missing column abort the whole restore/
restock.

### line-db-queries-inventory-ts-L539

`client/lib/db/queries/inventory.ts:539`

Only set explicitly when known — an explicit `store_id: undefined`
key would still make it into the INSERT's column list and fail
against a `stock_batches` table that predates the store_id migration
column; omitting the key entirely instead lets insert()'s own
active-store auto-scoping (or a legacy NULL) apply normally.

### line-db-queries-inventory-ts-L582

`client/lib/db/queries/inventory.ts:582`

stock_audits.user_id is a constrained foreign key server-side. Writing a
"system" sentinel here saved fine locally and then failed every push on
the FK, retried through backoff, and surfaced as a permanently stuck
sync item. Every caller — the cycle-count screen, the catalog quick
edit, the CSV import dialog — reads it from useAuth().user?.id on a
route-guarded screen, so there is no legitimate performer-less audit.

### line-db-queries-inventory-ts-L594

`client/lib/db/queries/inventory.ts:594`

Re-read the product's ACTUAL current system quantity inside the
transaction rather than trusting item.systemQty as-is: that value
was read by the caller when the audit list was rendered, and a sale
(or any other stock movement) landing between then and this submit
would make the caller-supplied figure stale - the resulting
adjustment would silently be off by exactly the concurrent
movement's quantity. Same fix shape as the loyalty-redemption
balance check. Matches getProducts()' own stock_quantity aggregate
(SUM of active, non-deleted batches).

### line-db-queries-inventory-ts-L609

`client/lib/db/queries/inventory.ts:609`

The baseline only applies to a row that was actually counted: a
price-only row has no observation, so measuring its (absent) count
against a stale baseline would post a phantom adjustment.

### line-db-queries-inventory-ts-L648

`client/lib/db/queries/inventory.ts:648`

A cost-price audit correction is a master-data fix, not a new
purchase at a new cost; apply it to every active batch of this
product rather than trying to attribute it to one batch.

### line-db-queries-inventory-ts-L667

`client/lib/db/queries/inventory.ts:667`

Without unit_cost/total_cost, a cycle-count adjustment's real value
impact was invisible to getStockMoM()'s 30-day added/removed-value
sums (they read IFNULL(unit_cost, 0)), silently treating every
write-off as ₦0 regardless of the stock actually lost.

### line-db-queries-inventory-ts-L721

`client/lib/db/queries/inventory.ts:721`

Found more stock than recorded: add it to the soonest-expiring,
genuinely active/non-expired *existing* batch (regardless of its
current quantity — including zero, e.g. a batch a sync pull raced
to zero, or one a prior audit/sale already depleted), or open a
new one only if the product genuinely has no valid batch at all.
getOrCreateTargetBatchForProduct excludes expired/deactivated
batches (writing found stock into one would make it permanently
unsellable, since the FEFO sale path refuses to dispense it, while
it still counted toward on-hand quantity/valuation), and values a
newly-created batch at unitCost/the product's real store_id
instead of defaulting to 0 and whatever store happens to be
active on this device.

### line-db-queries-inventory-ts-L776

`client/lib/db/queries/inventory.ts:776`

The removal was larger than every active batch's summed quantity could
cover (system quantity was already spread thinner across batches than
reality) - same situation recordSaleItemStock guards against for a sale.
Attribute the remainder to the most recently touched batch rather than
silently dropping it: the batch's own quantity is floored at 0 (it never
goes negative), but this still leaves a
stock_movements record explaining the full shortfall - without this, the
submitted figure doesn't match any recorded movement, and there's no
trace of where the rest of it went.

### line-db-queries-inventory-ts-L786

`client/lib/db/queries/inventory.ts:786`

includeExpired: true - unlike the sale-dispensing fallback (which
correctly excludes expired stock), a correction needs to be able to
write off a shortfall even when the product's only remaining batches
are expired. Without this, a product whose entire stock has expired
would return no fallback batch here and this whole write would be
silently skipped.

### line-db-queries-inventory-ts-L914

`client/lib/db/queries/inventory.ts:914`

previous_period deliberately carries no store filter of its own: it is
only ever reached through the LEFT JOIN on current_period's already
store-scoped product ids, so both sides of percentageChange draw on the
same population (every sale of that product within each window).

### line-db-queries-inventory-ts-L964

`client/lib/db/queries/inventory.ts:964`

Same population as getStockBatchStats's total_stock_batch_value (every
non-deleted batch, no is_active filter): this value is the baseline the
"+x% from last month" figure on the "Total stock value" card is measured
against, and that card's value comes from getStockBatchStats. Filtering
on is_active = 1 here made the percentage a ratio between two different
populations - and silently dropped every batch synced down without an
is_active value (NULL), which is neither active nor inactive to SQLite.

### line-db-queries-permission-groups-ts-L39

`client/lib/db/queries/permission-groups.ts:39`

Second guard, matching ensureLoyaltyDefaultsSeeded's own double-check
(tiers.length === 0 in addition to the timestamp): a device that
crashed between inserting the groups and stamping the timestamp
(or one that pulled another device's already-seeded groups down
before its own timestamp update landed) must not insert a second
set on top of rows that already exist for this store.

### line-db-queries-permission-groups-ts-L74

`client/lib/db/queries/permission-groups.ts:74`

Backfill: every existing staff member with no group yet gets the
default group matching their current `role` string. Never touches a
user who already has a permission_group_id (e.g. one assigned via
the staff form, or from an earlier seed pass). Goes through
update() (not a raw bulk UPDATE) so each assignment is queued for
sync like any other write - other devices/the server need to learn
it too, not just this device's local copy.

### line-db-queries-permission-groups-ts-L170

`client/lib/db/queries/permission-groups.ts:170`

A present-but-corrupt row denies, rather than returning null and letting
hasPermission's `?? fallbackPermissions(role)` silently restore the whole
role tier. That fallback is for the offline/pre-sync gap, where no row
exists yet; a malformed row is the opposite case and is distinguishable,
so the two must not be conflated. Matches getStorePermissionGroups below.
A store_owner/super_admin is still never locked out - hasPermission
short-circuits for those roles before any group is consulted.

### line-db-queries-permission-groups-ts-L198

`client/lib/db/queries/permission-groups.ts:198`

One malformed/legacy row must degrade to "grants nothing" rather
than take out the whole matrix/staff-form dropdown for every
OTHER group in this store - matches getUserPermissionGroup's own
guard above.

### line-db-queries-prescriptions-ts-L77

`client/lib/db/queries/prescriptions.ts:77`

insert() (base-helpers) auto-attaches store_id for STORE_SCOPED_TABLES
(prescription_items is one) and enqueues the row for sync - unlike a raw
query(), which did neither.

### line-db-queries-prescriptions-ts-L146

`client/lib/db/queries/prescriptions.ts:146`

Includes completed prescriptions too: the queue view filters by status
client-side (including the "History" chip), so excluding completed here
made that chip always render empty.

### line-db-queries-product-export-ts-L25

`client/lib/db/queries/product-export.ts:25`

Exports whatever the catalog table is currently showing (search/category/
status filters applied) rather than always the whole store — callers pass
the filtered id list when a filter is active, undefined otherwise.

### line-db-queries-product-export-ts-L33

`client/lib/db/queries/product-export.ts:33`

CSV/XLS is plain text — there's no CSS layer to uppercase it at render
time the way the in-app UI does, so the store's uppercase-display
preference has to be applied to the string itself here.

### line-db-queries-product-import-ts-L29

`client/lib/db/queries/product-import.ts:29`

Union-find: a row can belong to both a barcode group and a
name+category group, and those two groups need merging whenever they
share a row, so the reported clusters reflect every transitive
collision rather than just one key at a time.

### line-db-queries-product-import-ts-L128

`client/lib/db/queries/product-import.ts:128`

How often (in rows) to yield to the event loop during a bulk import. Each
query on the web (sql.js/WASM) path resolves synchronously, so without an
explicit yield a 1000+ row import runs as one uninterruptible block and
freezes the tab for its entire duration — this hands control back to the
browser periodically so it can repaint (e.g. a progress bar) and stay
responsive, without adding per-row overhead from yielding every iteration.

### line-db-queries-product-import-ts-L143

`client/lib/db/queries/product-import.ts:143`

The matched-stock branch below reconciles through submitStockAudit(),
whose stock_audits.user_id is a constrained foreign key server-side —
it now refuses a performer-less audit rather than writing a sentinel
that can only fail on push. Checked here, before a single row is
written, so an import can't commit its products and then abort on the
stock phase. Not a legitimate state: the only caller
(import-mapping-dialog.tsx) is a route-guarded screen that passes
useAuth().user.id.

### line-db-queries-product-import-ts-L158

`client/lib/db/queries/product-import.ts:158`

Collected during the main transaction, applied after it commits: submitStockAudit()
opens its own transaction, and this codebase's transaction() serializes
via a queue that a nested call would deadlock against (the inner call
waits on the outer's own queue slot, which only clears once the outer
transaction's fn() — still awaiting the inner call — finishes).
Keyed by productId so an in-file duplicate (same product matched by
multiple rows) only ever contributes one audit entry — last row wins,
consistent with how duplicate rows are already merged elsewhere in this
import. Without this, submitStockAudit() below computes every entry's
delta against the SAME pre-import systemQty snapshot (it's captured
once, before any adjustment is applied), so two rows for one product
each apply their full delta on top of that same stale baseline instead
of the second seeing the first's result — double-applying the
difference and silently driving real stock negative.

### line-db-queries-product-import-ts-L198

`client/lib/db/queries/product-import.ts:198`

cost_price lives on stock_batches, not products - there's no
column here to include in the update() above. Re-importing a
corrected price list used to leave margin/COGS reporting on
the stale cost while reporting the row as "updated." Only
correct it when unambiguous (exactly one active batch) - with
more than one, which specific batch(es) a blanket file-level
cost is meant to correct isn't something this import can infer,
and guessing would misattribute cost the same way the
now-fixed returned-COGS averaging bug did.

### line-db-queries-product-import-ts-L239

`client/lib/db/queries/product-import.ts:239`

The server never trusts stock_batches.quantity from a client
payload (INSERT or UPDATE) — it's forced to 0 and re-derived by
replaying stock_movements deltas on top, so quantity commutes
correctly across concurrent devices/terminals instead of one
write silently clobbering another (see SyncController::push's
stock_batches handling). Writing the batch row alone is enough
to show the right count locally, but without a matching
movement the server-side quantity stays permanently 0 for
every bulk-imported product once synced. Every other code path
that creates an initial batch (procurement receiving, setup's
seed data) logs this movement; import must too.

### line-db-queries-reports-ts-L48

`client/lib/db/queries/reports.ts:48`

date() on both sides: expenses.date is a date-only "YYYY-MM-DD" column,
but dateFrom/dateTo (toQueryRange()) are full UTC ISO timestamps like
"2026-09-21T00:00:00.000Z" representing LOCAL midnight/end-of-day - a
plain string compare made '2026-09-21' >= '2026-09-21T00:00:00.000Z'
false, silently dropping every expense dated exactly on the range's
first day. Bare `date(?)` fixes that but truncates the instant in UTC,
which shifts the boundary by the store's own UTC offset (e.g. a UTC+1
store's local midnight Sep 1 is "...T23:00:00Z", read by bare date() as
Aug 31) relative to the sales side, which buckets with 'localtime'
everywhere else in this file - `'localtime'` here cancels that shift
back out.

### line-db-queries-reports-ts-L71

`client/lib/db/queries/reports.ts:71`

Fetched unconditionally by date, not windowed - same rationale as
getSmoothedExpensesTotal: a prepaid expense logged well before this
window can still have unrecognised installments falling inside it.

### line-db-queries-reports-ts-L125

`client/lib/db/queries/reports.ts:125`

None of the reads below depend on each other's results, so they go out
together rather than one await at a time - the same shape as
getCurrentMonthRevenue in finance.ts.

### line-db-queries-reports-ts-L186

`client/lib/db/queries/reports.ts:186`

Excludes movements already represented by their own richer feed entry
below (a sale's stock deduction, a PO's receipt, a return's restock);
otherwise every one of those events produced two feed rows for the same
action, one showing revenue/refund and one showing cost basis, with
nothing distinguishing them. Movements with no reference_type (manual
adjustments, stock audit reconciliation) have no other feed
representation, so they still show up here.

### line-db-queries-reports-ts-L248

`client/lib/db/queries/reports.ts:248`

Products have no creator/user column, so unlike every other feed source
above, this can't be scoped to the viewer's own actions - skip it
entirely for a scoped viewer rather than showing everyone else's
catalog additions (e.g. a cashier seeing products the store owner added).

### line-db-queries-reports-ts-L279

`client/lib/db/queries/reports.ts:279`

Yesterday's refunds, so the dashboard's "x% vs yesterday" comparison
divides a net-of-refunds today by a net-of-refunds yesterday. Today's
side (salesToday - refundsToday, see use-dashboard-overview.ts) has
always netted refunds out; without this the denominator was gross
revenue, so a day with any refund at all reported a fake drop (or a
muted rise) against yesterday. Same date basis as refundsToday above:
the return's own created_at, i.e. refunds *issued* yesterday, not
refunds against sales made yesterday.

### line-db-queries-reports-ts-L431

`client/lib/db/queries/reports.ts:431`

Bare-table queries (FROM sales, no alias) vs. joined queries (FROM
sale_items si JOIN sales s) need the filter clause/params on different
sides of the alias, but both append after the dateFilter(+to)+storeId
params already in the capped variants below/sPrev, since that's where
they land in the WHERE text.

### line-db-queries-reports-ts-L439

`client/lib/db/queries/reports.ts:439`

Refunds/returned-COGS are filtered through the return's ORIGINAL SALE
(returns has no payment_method of its own, and its user_id is whoever
processed the refund, not whoever made the sale) - so a staff- or
payment-method-filtered report nets out the refunds against that
staff member's / that method's sales, the same rows its revenue side
counts. Same alias as the other joined queries.

### line-db-queries-reports-ts-L447

`client/lib/db/queries/reports.ts:447`

Upper bound of the current period: the caller's selected range end when
given, otherwise "now" - and never later than "now" (see the @param
note above). This is also the upper bound getSmoothedExpensesTotal gets,
so revenue and expenses always cover the same window.

### line-db-queries-reports-ts-L462

`client/lib/db/queries/reports.ts:462`

Every read below is independent of the others, so they all go out at
once rather than one await at a time - same shape as
getCurrentMonthRevenue in finance.ts.

### line-db-queries-reports-ts-L493

`client/lib/db/queries/reports.ts:493`

Gross Sales: list-price total before any discount, tax, or refund -
subtotal is captured pre-discount at sale time (see pos-calculations.ts:
total_amount = subtotal + tax_amount - discount_total).

### line-db-queries-reports-ts-L498

`client/lib/db/queries/reports.ts:498`

Tax collected is pass-through, not real business revenue - subtracted
out of total_amount to get Net Sales (see getBIMetrics's totalRevenue
caller, use-bi-data.ts).

### line-db-queries-reports-ts-L503

`client/lib/db/queries/reports.ts:503`

EX-VAT refunds. r.total_refunded is VAT-INCLUSIVE (calculateProportionalRefund
in pos-calculations.ts bakes the refunded line's tax share into it), but
every figure this feeds (useBIData's netSales = revenue - tax - refunds)
is ex-VAT: subtracting the raw refund from ex-VAT revenue removes the
refunded VAT a second time, since SUM(tax_amount) above already took it
out. Net out only the refund's ex-VAT share -
refund * (total_amount - tax_amount) / total_amount - the same fix
already applied in fetchProfitLossReportData's refundRows and the Daily
Close report (see use-daily-close-data.ts for the algebra). Falls back to
the full refund when the original sale row can't be joined to compute the
ratio. Deliberately NOT joined to return_items: a returns-level
SUM(total_refunded) alongside a return_items join fans out per item.

### line-db-queries-reports-ts-L519

`client/lib/db/queries/reports.ts:519`

Uses the cost_price recorded on the original sale_items row, not a
recomputed current-stock average - the product's cost basis can change
between the sale and the return, and averaging over current active
batches also silently reports 0 once a product has none left.
return_items has no sale_item_id column, so this joins on (sale_id,
product_id) - normally at-most-one-row per the POS cart's merge-
duplicates behavior, but a prescription dispense (one row per
instruction line) or an online-order fulfillment (one row per raw
payload item) can legitimately produce >1 sale_items row for the same
product within one sale. Pre-aggregating to a single quantity-weighted
average cost_price per (sale_id, product_id) before joining keeps this
correct in that case, instead of fanning the return_items row out
across every matching sale_items row and overcounting the total.

### line-db-queries-reports-ts-L534

`client/lib/db/queries/reports.ts:534`

Smoothed, not a raw SUM: a prepaid expense (covers_months set) is split
into equal calendar-month installments instead of hitting this whole
window as a lump sum wherever it happened to be logged. See
getSmoothedExpensesTotal for the "why".

### line-db-queries-reports-ts-L543

`client/lib/db/queries/reports.ts:543`

Not staff/payment-method filterable for the same reason expenses aren't
(see the JUDGEMENT CALL note on fetchProfitLossReportData): a write-off
carries no attribution meaning the same thing as the sales filter.

### line-db-queries-reports-ts-L566

`client/lib/db/queries/reports.ts:566`

The previous period's tax and refunds, so the revenue-change and
avg-transaction-change percentages compare like with like. The current
period's figure those are measured against is Net Sales (total_amount
minus tax minus refunds - see useBIData's netSales); leaving the
denominator as gross, tax-inclusive total_amount understated every
growth number by roughly the tax rate plus the refund rate.

### line-db-queries-reports-ts-L580

`client/lib/db/queries/reports.ts:580`

The customer base as it stood at the start of the current period (i.e.
every customer created before it), NOT just the customers created during
the previous window: the figure this is the baseline for is the
all-time "Total Customers" count, so a window-only denominator made the
card's "+x% vs last period" a nonsense ratio (all customers ever over
one window's new signups - routinely several hundred percent).

### line-db-queries-reports-ts-L596

`client/lib/db/queries/reports.ts:596`

Full product performance (not top-N): revenue/units/cost per product so
the UI can sort by any column and compute margin. Doesn't net returns
against a specific product, matching the existing top-selling queries
above (they don't either) - the store-wide returnedCogsData/refunds
above already cover the aggregate P&L correction.

### line-db-queries-reports-ts-L624

`client/lib/db/queries/reports.ts:624`

Per-cashier performance: mirrors productPerformance's shape/scope
(no refund netting, same as the rest of this dashboard's per-entity
breakdowns). Note: when filters.staffId is set this naturally narrows
to a single row - no separate UI change needed in the Staff tab.

### line-db-queries-reports-ts-L660

`client/lib/db/queries/reports.ts:660`

Upper bound of the range, capped at "now" like every other report query
(getBIMetrics's `to`) - without this the chart ignored the selected
range's end entirely and always rendered every month since dateFilter,
including months after a range the user deliberately narrowed to.

### line-db-queries-reports-ts-L670

`client/lib/db/queries/reports.ts:670`

Note: SUM(si.cost_price * si.quantity) alongside SUM(s.total_amount) in
one query double-counts total_amount/tax_amount once per sale_items row
(the LEFT JOIN fans sales out per item) - split into two queries to
avoid that, matching the non-monthly getBIMetrics queries above which
already keep sales-level and sale_items-level aggregates separate.

### line-db-queries-reports-ts-L686

`client/lib/db/queries/reports.ts:686`

SPLIT IN TWO, for exactly the reason rawMonthlySales/rawMonthlyCogs above
are: SUM(r.total_refunded) (a returns-level figure) in the same query as
a LEFT JOIN to return_items fans each return out once per returned line
item, multiplying its refund total by its item count. A one-line return
hid the bug entirely; a two-line return doubled the month's refunds.

EX-VAT, same as totalRefundsData in getBIMetrics above: r.total_refunded
is VAT-inclusive, but netRevenue downstream (use-monthly-sales-data.ts)
already subtracts the month's tax separately, so netting out the raw
(VAT-inclusive) refund here double-subtracted the refunded VAT. Net out
only the refund's ex-VAT share.

### line-db-queries-reports-ts-L700

`client/lib/db/queries/reports.ts:700`

See the matching comment on returnedCogsData in getBIMetrics above: uses
the sale-time cost_price (pre-aggregated per (sale_id, product_id) to
stay correct when a sale has >1 sale_items row for the same product),
not a recomputed current-stock average.

### line-db-queries-reports-ts-L707

`client/lib/db/queries/reports.ts:707`

Merged by month in JS, the same way rawMonthlyData merges its two halves.
Months are unioned: a month with a refund but no returned line items (or
vice versa) still gets a row, with 0 for the missing side.

### line-db-queries-reports-ts-L722

`client/lib/db/queries/reports.ts:722`

Smoothed, not a raw SUM(amount) per month - see getSmoothedExpensesByMonth.
Omitted entirely under a staff/payment-method filter, for the same reason
fetchProfitLossReportData omits them: an expense carries no attribution
that means the same thing as a sales filter, so charging one cashier's
revenue with the whole store's overhead would be worse than showing none.

### line-db-queries-reports-ts-L728

`client/lib/db/queries/reports.ts:728`

Capped at the same `to` as every sales/refund query above (the
selected range's end, never later than "now"): a prepaid expense's
amortized installments would otherwise be emitted all the way out to
its final covers_months bucket regardless of whether that month is
within the selected range (or has even happened yet).

### line-db-queries-reports-ts-L766

`client/lib/db/queries/reports.ts:766`

Permissive (OR IS NULL), matching retWhere below: a strict "= 0" here
paired with the permissive returns clause meant a sale row with a NULL
_deleted was excluded from Revenue/COGS while its refund was still
subtracted, producing a negative-revenue month out of nothing.

### line-db-queries-reports-ts-L778

`client/lib/db/queries/reports.ts:778`

Revenue and COGS are aggregated in separate queries rather than one
query joined to sale_items: a LEFT JOIN fans each sale out once per line
item, so SUM(s.total_amount) alongside a sale_items aggregate in the
same query double(/triple/...)-counts every multi-item sale's revenue by
its item count. Matches the pattern getAdvancedMonthlySalesData already
uses for the same reason.
Revenue excludes tax_amount: VAT/tax collected on the government's
behalf is a liability, not profit, and useBIData's netSales already
backs it out the same way - Revenue here previously included it,
inflating Gross/Net Profit and Margin % relative to the Analytics
dashboard for the same period.

### line-db-queries-reports-ts-L809

`client/lib/db/queries/reports.ts:809`

Returns/refunds, netted out of Revenue and COGS the same way every other
revenue surface in this codebase does (useBIData's netSales/totalCogs,
getCurrentMonthRevenue): without them the exported P&L reported GROSS
revenue and gross COGS while the Analytics dashboard reported net, so
the two disagreed for the same period by the whole refund volume.
Windowed on the return's own created_at (refunds ISSUED in the period),
the same basis getBIMetrics uses.
Split into two queries - a returns-level SUM(total_refunded) must never
share a query with a return_items join, which fans it out once per
returned line item.

### line-db-queries-reports-ts-L824

`client/lib/db/queries/reports.ts:824`

Same staff/payment-method filter as the revenue side, applied through the
return's ORIGINAL SALE: `returns` has no payment_method of its own, and
its user_id is whoever processed the refund rather than whoever made the
sale. A filtered P&L must filter every term that feeds it, not just
revenue - otherwise one cashier's report netted out the whole store's
refunds.

### line-db-queries-reports-ts-L832

`client/lib/db/queries/reports.ts:832`

r.total_refunded is VAT-INCLUSIVE (calculateProportionalRefund in
pos-calculations.ts bakes the refunded line's tax share into it), while
Revenue above is ex-VAT (total_amount - tax_amount). Subtracting the raw
refund from ex-VAT revenue over-subtracts by the refunded VAT share -
exactly the bug already fixed in the Daily Close report (see the
matching comment/derivation in use-daily-close-data.ts). Net out only
the ex-VAT portion here: refund * (sale.total_amount - sale.tax_amount)
/ sale.total_amount. Falls back to the full refund when the original
sale row isn't available to compute the ratio from (LEFT JOIN can miss
it) - conservative, matches the old (still-wrong-but-not-worse) behavior
only in that edge case.

### line-db-queries-reports-ts-L857

`client/lib/db/queries/reports.ts:857`

See returnedCogsData in getBIMetrics: sale-time cost_price, pre-aggregated
per (sale_id, product_id) so a sale with >1 line for the same product
doesn't fan the return_items row out.

### line-db-queries-reports-ts-L873

`client/lib/db/queries/reports.ts:873`

Expenses, amortized (see getSmoothedExpensesByMonth) rather than a raw
SUM(amount), so this agrees with the BI dashboard's expense figure.

JUDGEMENT CALL - expenses are NOT staff/payment-method filterable: an
expense carries no attribution that means the same thing as the sales
filter (expenses.user_id is whoever keyed the expense in, not whose
shift it belongs to, and expenses.payment_method is how the STORE paid a
vendor, unrelated to how a customer paid for a sale). Forcing the sales
filter onto them would answer a question nobody asked; leaving them
unfiltered would charge one cashier's revenue with the entire store's
overhead and report a wildly negative Net Profit. So a filtered P&L
reports 0 expenses and its "Net Profit" column is really the filtered
slice's CONTRIBUTION (Gross Profit), with store-wide overhead excluded.
Run the report unfiltered for a true bottom line.

### line-db-queries-reports-ts-L892

`client/lib/db/queries/reports.ts:892`

Every month with ANY financial activity gets a row - revenue, refunds, or
expenses. Mapping over revenue months alone silently dropped a month that
had expenses (or refunds) but no sales, which is exactly the month an
owner most wants to see.

### line-db-queries-reports-ts-L963

`client/lib/db/queries/reports.ts:963`

See getSmoothedExpensesByMonth's comment above for why 'localtime' is
needed here, not just bare date(?): dateFrom/dateTo are UTC instants
representing local calendar boundaries.

### line-db-queries-returns-ts-L51

`client/lib/db/queries/returns.ts:51`

unit_cost/total_cost record the stock's cost basis, matching how sale
and purchase-order movements populate these fields: using the sale's
selling price here (as this used to) mixed cost and revenue figures
under the same field, showing e.g. a refund's revenue value right next
to a sale's cost-of-goods value on the dashboard activity feed.

### line-db-queries-returns-ts-L76

`client/lib/db/queries/returns.ts:76`

A second (or third) partial return of the same sale line must not
restore batches from scratch — without this, every partial return
restarted allocation at the first batch in `consumedBatches`, so e.g. a
10-unit line split 6/batch-A + 4/batch-B returned as 6 then 4 put all
10 units back into batch A and left batch B permanently 4 short (wrong
expiry date on those 4 units, and a skewed per-batch cost valuation) —
product-level totals looked correct throughout, which is why this had
no visible symptom on any stock screen.

### line-db-queries-returns-ts-L104

`client/lib/db/queries/returns.ts:104`

No specific batch to credit (no sale_item_batches rows and no
legacy stock_batch_id) — previously this logged a stock_movements
row with stock_batch_id: null and never touched stock_batches at
all, so on-hand stock (SUM(stock_batches.quantity)) was never
credited back even though the customer was refunded. Find a
reasonable target batch for this product (or create one) and
restore into it instead, the same way a stock audit's "found extra
stock" branch picks/creates a target batch (see
getOrCreateTargetBatchForProduct) — so the ledger and the actual
on-hand total agree.

### line-db-queries-sales-ts-L37

`client/lib/db/queries/sales.ts:37`

The query above has no sale_item_id to join return_items against
(that column doesn't exist), so it gives every sale_item row for a
given product the SAME combined returned_quantity for that product
across the whole sale. That's correct as long as a sale has at most
one sale_item per product (true for a normal POS checkout - the cart
merges duplicates), but if it ever doesn't - a held transaction
restored from a stale pre-merge snapshot, say - every row for that
product would independently believe the full combined amount was
already returned against IT alone, undercounting how much is really
still returnable (getMaxReturnable = quantity - returned_quantity,
so extra rows only ever make the customer's remaining allowance look
smaller than it is, never the reverse). This redistributes that same
total sequentially across each product's sale_item rows, in a fixed
(creation) order, so returned_quantity is attributed once per unit
instead of once per row.

### line-db-queries-sales-ts-L256

`client/lib/db/queries/sales.ts:256`

`dateRange` carries plain yyyy-MM-dd calendar dates on the STORE's local
wall clock (see use-my-today-sales.ts's getLocalTodayDate() and the
DateRangePicker), but created_at is stored as a UTC instant. Appending a
literal "T00:00:00.000Z"/"T23:59:59.999Z" treated those local dates as
UTC midnight, shifting the day boundary by the store's UTC offset - in
UTC+1 a sale rung at 00:30 local (23:30Z the day before) fell into the
previous day's bucket. Widen the local day to its UTC-equivalent instant
the same way getDailyCloseData/getSalesTotalsByPaymentMethod/
getTopStaffByDate above and toQueryRange() in lib/utils/date-range.ts do.

### line-db-queries-sales-ts-L300

`client/lib/db/queries/sales.ts:300`

`SELECT DISTINCT product_id ... ORDER BY created_at` orders a column
that isn't part of the DISTINCT result set, so SQLite is free to pick an
arbitrary representative row per product - it can drop the
most-recently-sold product entirely instead of ranking by its actual
latest sale. Aggregating the true latest created_at per product first,
then ordering by that, fixes the ordering without changing the result
set (still one row per product_id).

### line-db-queries-sales-ts-L354

`client/lib/db/queries/sales.ts:354`

Uses the sale-time cost_price (pre-aggregated per (sale_id, product_id)
to stay correct when a sale has >1 sale_items row for the same
product), not a recomputed current-stock average — see the matching
fix on returnedCogsData/rawMonthlyReturns in reports.ts. return_items
has no cost_price column of its own, so a `||` fallback here would
always fire and silently use today's stock cost instead of the cost
actually recorded at sale time.

### line-db-queries-stock-transfers-ts-L284

`client/lib/db/queries/stock-transfers.ts:284`

No quantity write here: the transfer_out movement below rebuilds this
batch from its own log (see lib/db/batch-quantity.ts), and a pre-write
would be counted twice for an A-148 carve-out batch.

### line-db-queries-stock-transfers-ts-L296

`client/lib/db/queries/stock-transfers.ts:296`

Always opens a fresh batch on the destination rather than merging
into an existing one: the source draw can span multiple batches
with different expiry dates, and folding that into an arbitrary
pre-existing destination batch would blur its own FEFO ordering.
The new batch's expiry is the earliest (most conservative) of
everything it was drawn from, so the destination's FEFO picking
never overstates shelf life.

### line-db-reconcile-identity-ts-L95

`client/lib/db/reconcile-identity.ts:95`

remapForeignKey() calls this from inside its own already-open
transaction() - must not open another one (transaction() deadlocks
on nesting, see its own doc comment). Called directly at plain
app-boot, though, there's no enclosing transaction, so batching this
table's inserts into one saves N separate lock+saveDatabase() round
trips down to one.

### line-db-reconcile-identity-ts-L240

`client/lib/db/reconcile-identity.ts:240`

Rename the local user's own id in place (not soft-delete); this row
holds the only local username/PIN credential for this device's login,
so deleting it outright would lock the device out. Also point it at
the real store and re-flag for sync so the identity fix itself reaches
the server, not just the rows that referenced it.

### line-db-reconcile-identity-ts-L252

`client/lib/db/reconcile-identity.ts:252`

Marking table rows _synced = 0 above does NOT requeue them: push.ts
reads straight from `_sync_queue.payload`, a JSON snapshot frozen at
the moment the row was originally inserted/updated, independent of
the row's current `_synced` flag. Any already-queued entry for these
rows still has the old ids baked into its stored payload and would
keep failing the same FK check server-side. Rewrite those payloads in
place; a plain string substitution is safe here since UUIDs are
unique, unambiguous tokens with no risk of colliding with other JSON
content.

### line-db-retention-ts-L56

`client/lib/db/retention.ts:56`

Both the interval and the cutoff are measured in the bounded clock, and
markPruned() below stamps it too, so a device whose own clock runs ahead
neither prunes past the window nor re-reads its own future stamp as due on
every round.

### line-db-schema-migrations-ts-L6

`client/lib/db/schema-migrations.ts:6`

Cyclic by necessity (core.ts imports runSchemaMigrations from here), but
safe: this is only ever read inside a migration step at call time, long
after both modules have finished evaluating.

### line-db-schema-migrations-ts-L12

`client/lib/db/schema-migrations.ts:12`

Tables that just gained a `store_id` column (see SYNC_COLUMN_MIGRATIONS
below) and need every pre-existing local row backfilled to the device's one
pre-migration store: today's local DB is single-store-per-device by
construction, so there's exactly one store to backfill to.

### line-db-schema-migrations-ts-L45

`client/lib/db/schema-migrations.ts:45`

Thin adapter over the two incompatible database handles so the migration
steps below (identical logic on both platforms, just different execute
mechanics) can be written once instead of duplicated per-branch. `all()`
always resolves to an array of plain row objects, matching what the Tauri
SQL plugin already returns natively and what sql.js's columns/values pairs
get normalized into.

### line-db-schema-migrations-ts-L87

`client/lib/db/schema-migrations.ts:87`

Runs one statement, silently ignoring failure (e.g. "column already
exists" on a re-run) — the same tolerant, idempotent-by-retry pattern
every migration step here has always used.

### line-db-schema-migrations-ts-L98

`client/lib/db/schema-migrations.ts:98`

renameLegacyTablesAndColumns (medicines/vendors/store_profile/stock_batch
renames, owner->store_owner, shipped 2026-06-27/06-28) and
dropLegacyVendorIdColumn (the purchase_orders.vendor_id NOT NULL drop,
shipped 2026-08-04) were both removed once diagnoseLegacySchema(), run
against the account that predates them (DumosRx Pharmacies,
2026-08-01), confirmed neither legacy table names nor a vendor_id column
remained on that device.

migrateStockQuantityToBatches (the flat products.stock_quantity ->
stock_batches data migration, shipped 2026-06-28) was removed once every
real device was confirmed to postdate it by 5+ weeks; stock_quantity
isn't even in the current base schema anymore, so its guard condition
(the column existing at all) could never be true on any account created
after 2026-06-28.

### line-db-schema-migrations-ts-L113

`client/lib/db/schema-migrations.ts:113`

Declarative table -> columns-to-ensure-exist list, consumed by
runSyncColumnMigrations() below. Hoisted out of initDatabase() itself
since it's pure data with no dependency on either backend (Tauri/sql.js) -
keeping it inline there just made the function look far larger/more
complex than the actual branching logic it contains.

### line-db-schema-migrations-ts-L209

`client/lib/db/schema-migrations.ts:209`

Reseller-commission fields (see ResellerCommissionPanel / use-pos-payment.ts):
every checkout writes all three below (0-valued when the reseller
toggle is off), plus the redeemed/redeemed-at/redeemed-by trio set
once ResellerCommissionPanel marks a sale's commission paid out.

### line-db-schema-migrations-ts-L222

`client/lib/db/schema-migrations.ts:222`

Distinguishes a real reseller/agent sale (commission owed, subject
to the redeem/store-claim decision above) from a store staff
member simply pricing above normal for their own reasons (markup
goes straight to the store, pre-settled - see use-pos-payment.ts).
DEFAULT 'reseller' so every existing is_reseller_sale row keeps its
current pending-redemption behavior unchanged.

### line-db-schema-migrations-ts-L329

`client/lib/db/schema-migrations.ts:329`

Ties every audit_logs row written inside one multi-step operation
(e.g. all ~10-15 rows a single sale writes across sales,
sale_items, stock_batches, stock_movements, customers,
loyalty_transactions) together, so the Activity Log can collapse
them into one entry instead of showing each as a separate action.

### line-db-schema-migrations-ts-L335

`client/lib/db/schema-migrations.ts:335`

Coalesces a repeated dedupable action (see audit-actions.ts's
DEDUPABLE_AUDIT_ACTIONS) into one row instead of a fresh row per
occurrence - logAction() bumps this in place on a repeat rather
than inserting again.

### line-db-schema-migrations-ts-L391

`client/lib/db/schema-migrations.ts:391`

Immediate-purchase per-line-item overrides (selling price, cost
override, lot/expiry) - previously only ever consumed transiently
at receiving time and never persisted, so saving an in-progress
Immediate Purchase as a draft silently discarded them.

### line-db-schema-migrations-ts-L399

`client/lib/db/schema-migrations.ts:399`

Cumulative quantity actually received against this line, in the same
unit as bulk_quantity. Receiving used to be all-or-nothing: any
submitted quantity flipped the whole PO to "received", permanently
forfeiting the undelivered balance.

### line-db-schema-migrations-ts-L499

`client/lib/db/schema-migrations.ts:499`

DEFAULT 1 (ON) so existing Pro/Enterprise stores already using the
loyalty program see zero behavior change - only a store that
explicitly flips this off in Settings gets paused.

### line-db-schema-migrations-ts-L503

`client/lib/db/schema-migrations.ts:503`

The rate calculateEarnedPoints() multiplies a sale's total by - 0.01
preserves the previously-hardcoded 1-point-per-100-currency rate for
every existing store until they change it in Loyalty Settings.

### line-db-schema-migrations-ts-L507

`client/lib/db/schema-migrations.ts:507`

DEFAULT 1 (ON): product/category names are always stored lowercase
now, so without this every store would see an abrupt all-lowercase
catalog the moment this shipped, instead of the uppercase-via-CSS
display they're used to.

### line-db-schema-migrations-ts-L512

`client/lib/db/schema-migrations.ts:512`

For the Tax Invoice receipt print variant's header (see ReceiptView) -
a store's formal tax/VAT registration ID, distinct from
pcn_license/registration_number.

### line-db-schema-migrations-ts-L519

`client/lib/db/schema-migrations.ts:519`

One-time gate for ensureLoyaltyDefaultsSeeded() (loyalty.ts) - set
the first time default tiers/redemption options are ever seeded for
this store, so a store that later deliberately deletes every tier
doesn't get them silently reseeded next time Loyalty Settings opens.
NULL on every existing row until this migration's store's first
post-upgrade seed decision.

### line-db-schema-migrations-ts-L529

`client/lib/db/schema-migrations.ts:529`

Which revision of DEFAULT_GROUP_PERMISSIONS this store's default
groups have been brought up to. NULL on every store seeded before
this column existed, which backfillDefaultGroupPermissions()
(permission-groups.ts) reads as catalog version 1.

### line-db-schema-migrations-ts-L534

`client/lib/db/schema-migrations.ts:534`

Whether the receipt header shows the store logo above the store
name (default, matches every existing store's current receipt) or
beside it. See ReceiptView / receipt-customization-card.tsx.

### line-db-schema-migrations-ts-L541

`client/lib/db/schema-migrations.ts:541`

Server-managed bookkeeping for the storefront rebuild pipeline -
mirrored here only so pull sync's dynamic column list doesn't fail
with "no such column"; nothing in this app writes to them.

### line-db-schema-migrations-ts-L546

`client/lib/db/schema-migrations.ts:546`

Off by default: a cashier-initiated transfer request still moves
stock immediately (just flagged needs_review - see
stock-transfers.ts), so this stays opt-in rather than silently
granting every existing store's staff that ability on upgrade.

### line-db-schema-migrations-ts-L551

`client/lib/db/schema-migrations.ts:551`

Off by default: gates the POS cart's entire "Reseller sale" row
(both the reseller-commission and store-markup sub-types) behind
an explicit owner opt-in, on top of the existing plan-tier check -
see isMarkupSalesEnabled in use-feature-gate.ts.

### line-db-schema-migrations-ts-L589

`client/lib/db/schema-migrations.ts:589`

Set to "needs_review" on a cross-store transfer's two rows
(transfer_out/transfer_in) when the initiating user isn't
admin-tier - a cashier-requested transfer still takes effect
immediately, just flagged for the owner to check afterward.

### line-db-schema-migrations-ts-L637

`client/lib/db/schema-migrations.ts:637`

Backfills store_id on pre-existing rows of newly store-scoped tables to the
device's one pre-migration store. WHERE store_id IS NULL makes it naturally
idempotent. Skipped entirely once a device holds more than one store: see
A-250's neighbour A-248 in docs/FIXED_BUGS.md.

### line-db-schema-migrations-ts-L667

`client/lib/db/schema-migrations.ts:667`

Every partial state must be retryable from the still-intact old table:
without this, an interrupted first boot leaves a populated
_sync_state_scoped whose composite key then rejects the copy on every
later boot, and the device never pulls again. Silent and permanent.

### line-db-schema-migrations-ts-L697

`client/lib/db/schema-migrations.ts:697`

show_contact_on_receipt (a combined phone+address toggle) was split into
show_phone_on_receipt/show_address_on_receipt. Both new columns default to
1 on ALTER TABLE, so a store that had turned contact info off would
otherwise find both back on after this migration - this carries that
store's existing off-state onto both new columns once. WHERE
show_contact_on_receipt = 0 makes it naturally idempotent (nothing left to
backfill once the new columns already reflect it).

### line-db-schema-migrations-ts-L715

`client/lib/db/schema-migrations.ts:715`

products.name/categories.name are now written lowercase (see
withNormalizedName in base-helpers.ts) so the UI can render them uppercase
via CSS regardless of how they were typed/imported. Rows written before
that change (e.g. an ALL-CAPS QuickBooks import, or a manually-typed mixed
case name) predate the rule, so this re-lowercases them on every init. It's
idempotent (a no-op once already lowercase) like backfillStoreIdOnLegacyRows
above, so it doesn't need a one-time-run flag.

### line-db-schema-migrations-ts-L735

`client/lib/db/schema-migrations.ts:735`

deleteCategory only ever soft-deletes the categories row; it never touches
products.category_id pointing at it, and (until the sync push fix landed
server-side) a generic category name could also get silently merged into
an unrelated store's row that later got renamed/deleted out from under
this store. Either way, the product is left holding a category_id that no
longer resolves to a name — this clears it so the catalog shows
"Uncategorized" (and, crucially, the category can be re-picked from the
dropdown again) instead of the dead id staying stuck forever. Idempotent:
a product with a valid category_id is untouched.
stock_batches.cost_price is nullable here and NOT NULL DEFAULT 0 on the
server. Adjustment batches written by the bulk-import stock-audit flow
before commit e15105b1 never set it at all, so they hold a real local
NULL that a whole-row requeue would send up explicitly and the server
would reject. Idempotent, so no one-time-run flag — see FIXED_BUGS A-128.

### line-db-schema-migrations-ts-L757

`client/lib/db/schema-migrations.ts:757`

Matches getCategoryList()'s own visibility rule (store_id = mine, or
NULL for pre-multi-tenancy rows) — a category_id pointing at a row that
exists but belongs to a *different* store (the cross-store merge bug;
see 2026_09_12_000000_scope_category_uniqueness_to_store) is just as
dead to this store as one that was hard-deleted, since it'll never show
up in this store's dropdown either.
tryRun/adapter.run take a raw SQL string with no bind-param support, so
this inlines storeId directly — safe here since it's an internally
generated UUID (see getActiveStoreId), never raw user input.

### line-db-schema-migrations-ts-L778

`client/lib/db/schema-migrations.ts:778`

rebuildUsersTableForStoreScopedUsername (the users table rebuild that
scoped username uniqueness to store_id, shipped 2026-08-01 — the same day
as the earliest real account) was removed once diagnoseLegacySchema(),
run against that account, confirmed its users table already had
UNIQUE(store_id, username).

### line-db-schema-migrations-ts-L784

`client/lib/db/schema-migrations.ts:784`

Relaxes purchase_orders.supplier_id to nullable, so an Immediate Purchase
can be recorded without a real vendor (self/walk-in purchase) the same way
sales.customer_id already supports a null "Walk-in Customer". SQLite can't
ALTER a column's NOT NULL constraint, so recreate the table; must run
after the syncColumns migration so the `type` column already exists to
carry over.

### line-db-schema-migrations-ts-L833

`client/lib/db/schema-migrations.ts:833`

One-off data clear for legacy transactions (retaining products, batches,
users, and settings), gated on a localStorage flag so it only ever runs
once per device. `onCleared` lets the web caller persist the change
(Tauri writes land on disk directly, with no equivalent save step).

### line-db-schema-migrations-ts-L873

`client/lib/db/schema-migrations.ts:873`

Every index the local read paths depend on (see docs/LOCAL_DB_INDEXES.md
for which query each one serves). SCHEMA_SQL carries the subset whose
columns exist in its own CREATE TABLE bodies; the store_id-scoped ones can
only be created here, because store_id is itself a migration-added column
and is absent from SCHEMA_SQL. Listing all of them here regardless keeps
one authoritative set for both populations - fresh installs run this pass
immediately after SCHEMA_SQL, so they converge on the same indexes as a
device upgrading from a pre-index database. CREATE INDEX IF NOT EXISTS is
idempotent on both backends; tryRun is kept for consistency with the rest
of this file. None of these are UNIQUE: duplicate barcodes and duplicate
product names both exist in real catalogs today (every lookup is LIMIT 1
and dedupe is app-level), so a unique index would fail to build on exactly
the mature databases this is meant to speed up. store_id is never indexed
on its own either: a single-store device has one value for every row, and
a standalone index on it got picked over the selective one (measured: the
import's barcode lookup chose idx_products_store_id and still visited the
whole catalog), so it only ever appears as a composite's leading column.

### line-db-schema-migrations-ts-L910

`client/lib/db/schema-migrations.ts:910`

How far `sales` may outgrow the row count the last ANALYZE recorded before
the stats are rebuilt. Generous on purpose: a full ANALYZE is ~94 ms on the
one-year synthetic store, so it should run a handful of times over a
device's life, not on every launch.

### line-db-schema-migrations-ts-L917

`client/lib/db/schema-migrations.ts:917`

The indexes alone are not enough, and shipping them without this step is
worse than shipping nothing: with no sqlite_stat1 the planner falls back to
its built-in row-count guesses, and on the synthetic one-year store it then
drove getCustomers' 2,000-customer join off idx_sales_store_id_created_at
(which matches every sale on a single-store device) instead of
idx_sales_customer_id - 10.2 s unindexed became 30.5 s indexed. A full
ANALYZE turns the same query into 55 ms. Sampling it (PRAGMA
analysis_limit) is 14x cheaper but leaves the activity log's COUNT(*)
preferring a 200k-row index scan over the table scan that actually wins, so
the stats are built in full and instead rebuilt rarely: `sales` is the
proxy for how much the store has grown since the last pass, which also
covers the fresh install that ANALYZEd an empty database.

### line-db-schema-migrations-ts-L964

`client/lib/db/schema-migrations.ts:964`

The full, ordered migration sequence initDatabase() applies to an existing
local database, identical on both backends. `persist` is only supplied on
the web/sql.js path, where an in-memory write (the legacy-transaction
delete, the one-off ANALYZE) still has to be written back to IndexedDB;
Tauri's SQL plugin writes land on disk directly.

### line-db-sync-engine-deferred-stock-deltas-ts-L96

`client/lib/db/sync-engine/deferred-stock-deltas.ts:96`

Once per batch, not once per delta, and carrying NO change: the movements
these rows stand for were written to the log pages ago, so claiming their
inbound here would subtract it back off a log that already holds it, read
the batch as a carve-out and add the delta a second time. A batch with a
pending delta arrived with its quantity stripped, so it is never a
carve-out and the rebuild is all it needs.

### line-db-sync-engine-device-report-command-ts-L31

`client/lib/db/sync-engine/device-report-command.ts:31`

A breadcrumb, not an issue: a requested report is not a fault, and the
support POST below is the channel that actually delivers it. See
client/AGENTS.md, "What reaches Sentry".

### line-db-sync-engine-health-check-ts-L15

`client/lib/db/sync-engine/health-check.ts:15`

Same tables SyncController::counts() reports on server-side - see that
endpoint's own doc comment for why this list is scoped to
inventory+sales rather than every synced table.

### line-db-sync-engine-health-check-ts-L23

`client/lib/db/sync-engine/health-check.ts:23`

Tracks the previous run's per-table gap (server - local) so a deficit
that a resync genuinely can't fix - e.g. a row permanently stuck behind
a UNIQUE-constraint collision pull.ts already gives up retrying after 5
attempts (recordUniqueSkipAndCheckGiveUp) - doesn't turn this into an
unbounded once-a-day forceFullResync() forever. A resync re-runs the
exact same pull scoping that produced the gap in the first place, so if
it didn't shrink, running it again won't either.

### line-db-sync-engine-health-check-ts-L70

`client/lib/db/sync-engine/health-check.ts:70`

A device that has never completed a sync round at all (last_sync_time
unset - see sync-engine/index.ts, only stamped after a full push+pull
round finishes) isn't exhibiting a stuck cursor, it just hasn't caught
up yet - normal for a brand-new device or one still mid-first-sync on
a slow connection, not a deficit to alarm on or resync over. Its own
ordinary sync() calls already handle catching it up.

### line-db-sync-engine-health-check-ts-L89

`client/lib/db/sync-engine/health-check.ts:89`

Only stamped on a successful fetch - a failed attempt (offline,
server error) should retry on the next app open, not sit dormant
for the rest of the interval just because this one try failed.

### line-db-sync-engine-health-check-ts-L117

`client/lib/db/sync-engine/health-check.ts:117`

"Improved" means at least one previously-gapped table's gap actually
shrank - not just that the SET of gapped tables changed, since a
table recovering while a different one develops a fresh gap is still
real progress worth another resync attempt.

### line-db-sync-engine-health-check-ts-L153

`client/lib/db/sync-engine/health-check.ts:153`

Best-effort: a failed health check just means the timestamp above
wasn't stamped (already handled per-branch), so it naturally retries
next time this runs. Not worth its own crash report - it's usually
the same transient network failure sync() itself already handles.

### line-db-sync-engine-pull-window-ts-L62

`client/lib/db/sync-engine/pull-window.ts:62`

Nothing to restore a baseline for, and reporting it would write the
very row that caused the exhaustion. Drop the row instead, which also
heals a device already stuck in that loop.

### line-db-sync-engine-pull-ts-L182

`client/lib/db/sync-engine/pull.ts:182`

Deltas whose stock_batches row hadn't arrived yet live in
`_pending_stock_deltas`, written with the movement row itself and
drained below. Both cursor stamps are still held back so they commit
with the drain. See client/AGENTS.md, "Deferred movement deltas".

### line-db-sync-engine-pull-ts-L199

`client/lib/db/sync-engine/pull.ts:199`

The window a drained table is stamped with covers only what the round
actually queried, so it is the FIRST page's instant, never the last
page's (client/AGENTS.md, "Pull details").

### line-db-sync-engine-pull-ts-L203

`client/lib/db/sync-engine/pull.ts:203`

Survives the page boundary: a page can carry batches and no movements,
and the drain still owes those batches' deferred deltas priority over
the next page's movements (A-197).

### line-db-sync-engine-pull-ts-L239

`client/lib/db/sync-engine/pull.ts:239`

Every batch whose log this page changed, against the net delta of the
movements that changed it. Rebuilt once at the end of the page rather
than patched per movement, which is what makes the result independent
of the order the pages arrive in (A-197).

### line-db-sync-engine-pull-ts-L256

`client/lib/db/sync-engine/pull.ts:256`

Settles deltas an arriving batch has resolved while their rows
are still in the table. Ordering no longer matters — the drain
rebuilds from the log — so this is bookkeeping, not the A-197
correctness fix it was.

### line-db-sync-engine-pull-ts-L377

`client/lib/db/sync-engine/pull.ts:377`

Delta 0 because a pulled UPDATE changes no movement quantity
today; see client/AGENTS.md, "Pull details", before making
one that does.

### line-db-sync-engine-pull-ts-L425

`client/lib/db/sync-engine/pull.ts:425`

An arriving batch is rebuilt from the movements this device
already holds, which is what makes a batch landing after its
own movements a non-event (A-197).

### line-db-sync-engine-pull-ts-L439

`client/lib/db/sync-engine/pull.ts:439`

A batch that has not arrived is still recorded as pending,
not because the delta is owed to it — the recompute reads
the whole log whenever the batch turns up — but because a
batch that never arrives has to stay visible (A-176).

### line-db-sync-engine-pull-ts-L672

`client/lib/db/sync-engine/pull.ts:672`

In `finally`, so a round with no stores/users changes — or a thrown
pull — can never leave a caller awaiting this callback forever. The
success flag keeps a thrown (nothing-written) pull from being reported
as "identity ready". See client/AGENTS.md, "Pull details".

### line-db-sync-engine-push-ts-L43

`client/lib/db/sync-engine/push.ts:43`

No pull can ever settle these, so left unsynced they are requeued and
re-refused for ever. `audit_logs` because the server row doesn't carry the
pushed id (see docs/FIXED_BUGS.md "audit_logs conflict resurrection loop");
`feedback` because it is never pulled at all and a repeat crash coalesces
into the same stale-version row — the same reasoning, and the same remedy,
that reportStuckCrashLog() already applies after five attempts. A-256.

### line-db-sync-engine-push-ts-L491

`client/lib/db/sync-engine/push.ts:491`

Terminal: drop every merged queue row rather than retrying.
The watermark rewind below is what actually brings the
server's winning value down (A-205); the drop alone does not.

### line-db-sync-engine-push-ts-L588

`client/lib/db/sync-engine/push.ts:588`

After this batch's bookkeeping, never before: a `retry` applied
first would have its reset undone by recordSyncFailure() if the
same row is in this batch's failures.

### line-db-sync-engine-stock-integrity-ts-L65

`client/lib/db/sync-engine/stock-integrity.ts:65`

No run of logged movements can leave a balance above their total inbound,
because outbound only ever subtracts. A stored quantity above it holds
inbound that was never logged (A-148's opening stock), and the replay,
which cannot see it, would fold the batch down past it.

### line-db-sync-engine-stock-integrity-ts-L105

`client/lib/db/sync-engine/stock-integrity.ts:105`

Ordered by rowid — local insert order — because that is the order THIS
device applied the deltas in, and so the order that produced the stored
quantity. Not created_at: it is nullable, second-resolution from MySQL
so bulk imports collide, and a sale rung offline on another till arrives
days after its own timestamp. Any of those reorders the replay past a
floor event and makes a correct batch look diverged.

### line-db-sync-engine-stock-integrity-ts-L131

`client/lib/db/sync-engine/stock-integrity.ts:131`

A delta that has not been applied yet is not a disagreement, it is work
in progress — and folding it in would let the pending drain apply it a
second time.

### line-db-sync-engine-stock-integrity-ts-L214

`client/lib/db/sync-engine/stock-integrity.ts:214`

Without an active store the audit widens to every store on the device.
Harmless for a read; for a write it would rewrite another branch's
quantities (A-189 established at least one owner runs two).

### line-db-sync-engine-stock-integrity-ts-L242

`client/lib/db/sync-engine/stock-integrity.ts:242`

Inside the transaction, not before it: query() releases its queue slot
before returning, so a report taken outside could be invalidated by a
sale or a pull page landing in between — and the fold writes an
absolute value, which would silently undo it.

### line-db-sync-engine-sync-commands-ts-L149

`client/lib/db/sync-engine/sync-commands.ts:149`

Dropping the queue row alone leaves the source row _synced = 0 with no
queue entry, which requeueOrphanedRows() treats as an orphan and
re-queues on the next boot. Every other drop path in the engine pairs
the delete with this for the same reason.

### line-db-tab-lock-ts-L8

`client/lib/db/tab-lock.ts:8`

Defaults to true (not false) deliberately: most unit tests inject a
database directly via __setDatabaseForTesting() and call execute()/
transaction() without ever going through initDatabase()/initWriterLock(),
so they'd otherwise be silently treated as read-only and every write would
throw. Production code only ever sees this flip to false via
initWriterLock() itself, when a real contending tab is detected.

### line-db-tab-lock-ts-L43

`client/lib/db/tab-lock.ts:43`

Holds the lock (or the queued request) open for as long as this tab lives.
The browser releases a Web Lock automatically when the holding document is
destroyed (navigation, close, crash) - this promise is never meant to
resolve on its own, so no beforeunload plumbing is needed to release it.

### line-db-tab-lock-ts-L56

`client/lib/db/tab-lock.ts:56`

Cross-tab channel used only for the graceful writer handoff below - never
for the election itself, which stays entirely on the Web Locks API. Lazily
created (and only if BroadcastChannel exists) so environments without it
just fall back to "requestWriterTakeover always times out", not a throw.

### line-db-tab-lock-ts-L65

`client/lib/db/tab-lock.ts:65`

navigator.locks' {steal: true} revokes a lock without notifying its
holder - this is the only way a merely-slow (not dead) old writer
finds out it lost the election before its next write.

### line-db-tab-lock-ts-L81

`client/lib/db/tab-lock.ts:81`

Set once per tab by initWriterLock() - whatever it is, both the natural
writer-hold path and stealWriterLock()'s steal path reuse the same
callback, so a takeover requested while this tab is the writer always
forces the same save function regardless of which path granted the lock.

### line-db-tab-lock-ts-L134

`client/lib/db/tab-lock.ts:134`

Lets stealWriterLock() cancel this tab's own still-queued natural-
promotion request before it forces one through via {steal: true} -
otherwise both could eventually settle for the same tab and race calling
promoteToWriter() (harmless on its own thanks to the idempotency guard
above, but the abandoned queued request would sit forever behind the
steal-acquired lock this tab now holds).

### line-db-tab-lock-ts-L184

`client/lib/db/tab-lock.ts:184`

Resolves as soon as the promotion decision is made, same as
initWriterLock's resolveInitialRole() - the granted request's callback
(below) keeps the lock held indefinitely via holdUntilTakeover() in the
background for as long as this tab stays the writer, so awaiting the
whole navigator.locks.request() call itself would never return.

### line-db-tab-lock-ts-L213

`client/lib/db/tab-lock.ts:213`

Web Locks API unsupported (very old browser - it's shipped in every
major browser since early 2022). Can't coordinate across tabs at all,
so fall back to pre-fix behavior (every tab writes) rather than
wrongly locking every tab but one out of an app they can't coordinate.

### line-db-tab-lock-ts-L234

`client/lib/db/tab-lock.ts:234`

Scoped to its own try/catch (not the outer .catch() below) so
that queuedPromotionController.abort() - used by
stealWriterLock() to cancel this exact request when the graceful
handoff times out - can never be misread as "lock coordination
failed, so make this tab the writer": an AbortError here, same as
any other rejection, must leave writerTab exactly as it was.

### line-demo-loader-ts-L32

`client/lib/demo/loader.ts:32`

The `!`-worthy lookups below are all keyed off refs that come from the
same demo template that populated the map/array — always present by
construction. This throws a clear error instead of silently continuing
with `undefined` if that invariant is ever broken by a template edit.

### line-demo-loader-ts-L271

`client/lib/demo/loader.ts:271`

createSale() doesn't record which batch(es) funded each sale_item;
the POS UI does that separately. Fill it in here so returns (below)
can restore stock to the right batch via restoreReturnedStock().

### line-demo-loader-ts-L333

`client/lib/demo/loader.ts:333`

8. Expenses (recurring costs use covers_months so a lump-sum payment
like annual rent is smoothed across the months it actually covers,
instead of reading as a single month's loss).

### line-hooks-queries-use-users-ts-L21

`client/lib/hooks/queries/use-users.ts:21`

The users key now varies by storeId (see queryKeys.staff.users), so a
single mutation must invalidate every store-filtered variant at once;
matching on the shared "users" prefix does that.

### line-hooks-use-account-actions-ts-L29

`client/lib/hooks/use-account-actions.ts:29`

Shared by every surface that offers account-level actions (desktop
dropdown + its own mobile avatar drawer in user-nav.tsx, and the bottom
nav's "More" sheet in mobile-more-drawer.tsx). These used to be three
hand-copied implementations, and they drifted: one surface's plain
logout() left the recent-users tile cache intact, so it looked identical
to Switch Account instead of actually ending the session. One
implementation here means that specific drift can't happen again.

### line-hooks-use-account-actions-ts-L57

`client/lib/hooks/use-account-actions.ts:57`

Not destructive: the local session/data stays intact, this just shows
the same lock screen used for idle re-auth, forced to account-selection
mode instead of defaulting to the current user's PIN entry. No
logout/unsynced-changes warning needed since nothing is being cleared.

### line-hooks-use-auto-lock-ts-L12

`client/lib/hooks/use-auto-lock.ts:12`

True while the lock overlay should show account selection (ignoring the
current user) rather than defaulting straight to that user's PIN entry;
set by "Switch Account" so it can reuse this same overlay instead of a
separate page. Deliberately not persisted (see partialize below); it only
ever needs to survive within the current live session.

### line-hooks-use-auto-lock-ts-L25

`client/lib/hooks/use-auto-lock.ts:25`

zustand's persist middleware writes this tab's entire state to localStorage
synchronously on every set(). updateActivity() is wired to mousemove/
touchstart/scroll (see useAutoLockTimer below), so without throttling it
forces a blocking localStorage write on every single touch and scroll
frame - widening the touchstart-to-click timing window that can drop a tap
on iPad. A lock timer only needs second-ish resolution, not the write on
every event.

### line-hooks-use-auto-lock-ts-L69

`client/lib/hooks/use-auto-lock.ts:69`

persist's `set()` always writes this tab's *entire* in-memory state back
to localStorage, not just the changed field. Without this listener, a
second tab/window left open from before a Settings change (still holding
the old `duration` in memory) would silently clobber it back on that
tab's next `updateActivity()` call (i.e. its next mousemove/keydown/etc) —
this is what was causing auto-lock to "reset to 5 minutes" after being
turned off. Rehydrating on the storage event keeps every open tab's
in-memory state caught up with whichever tab wrote most recently.

### line-hooks-use-auto-lock-ts-L86

`client/lib/hooks/use-auto-lock.ts:86`

Selectors, not a destructured whole-store call: this hook runs inside
DashboardLayout, which wraps the entire app, so subscribing to the whole
store would re-render everything below it on every touchstart/mousemove/
scroll (since those all call updateActivity(), touching lastActivity).
On iPad specifically that re-render can land between a tap's touchstart
and its (delayed) synthetic click, dropping the click and requiring a
second tap to register: this is what was causing the widespread
"buttons need double-tapping" reports.

### line-hooks-use-bi-data-ts-L32

`client/lib/hooks/use-bi-data.ts:32`

toQueryRange() widens the picker's date-only values to LOCAL midnight /
end-of-day, which is the calendar every report query buckets against
(strftime(..., 'localtime')); `new Date("2026-03-01")` would anchor
them to UTC midnight and shift the boundaries by the store's offset.
Guarded because DateRangeValue can in principle already carry a full
ISO timestamp, which toQueryRange's yyyy-MM-dd parser can't read.

### line-hooks-use-bi-data-ts-L57

`client/lib/hooks/use-bi-data.ts:57`

toFilter is appended to the factory's key rather than added to the
factory itself (lib/query-keys.ts is owned elsewhere) - without it two
ranges sharing a `from` would read each other's cached metrics.

### line-hooks-use-bi-data-ts-L75

`client/lib/hooks/use-bi-data.ts:75`

Already netted to its EX-VAT share by getBIMetrics (total_refunded is
VAT-inclusive; see the comment on totalRefundsData in reports.ts), so the
subtraction below removes each refund's VAT exactly once - via totalTax -
instead of twice. Nothing extra to adjust here.

### line-hooks-use-bi-data-ts-L80

`client/lib/hooks/use-bi-data.ts:80`

Net Sales: what the business actually keeps after discounts (already
baked into total_amount), tax collected on the government's behalf
(not real revenue), and the ex-VAT value of what came back as refunds.

### line-hooks-use-bi-data-ts-L84

`client/lib/hooks/use-bi-data.ts:84`

totalRevenue kept as an alias for netSales, not a separate tax-inclusive
figure: every consumer of this hook (BIKeyMetrics' "Total Revenue" card,
avg-transaction-value, revenue-change %) should read the corrected,
tax-excluded number now, not the old tax-inclusive one.

### line-hooks-use-bi-data-ts-L109

`client/lib/hooks/use-bi-data.ts:109`

Previous-period Net Sales, defined exactly like netSales above (gross
total_amount minus tax minus refunds) so revenueChange/
avgTransactionChange divide a net figure by a net figure.

### line-hooks-use-bi-data-ts-L180

`client/lib/hooks/use-bi-data.ts:180`

Gated on their own tab: neither is displayed on the default Sales tab, so
together they were four extra reads on every mount of the dashboard. Radix
keeps the active tab mounted, so switching to one of these fetches then
and the result stays cached from there on.

### line-hooks-use-bi-data-ts-L222

`client/lib/hooks/use-bi-data.ts:222`

Labelled for what the number actually is: the share of the
customers who bought *inside this period* that bought more than
once in it (walk-in/anonymous sales carry no customer_id and are
excluded from both sides). It is not retention against the
store's customer base or against a prior period, which is what
"Customer Retention" implied.

### line-hooks-use-business-intelligence-dashboard-ts-L27

`client/lib/hooks/use-business-intelligence-dashboard.ts:27`

toQueryRange(), not manual "T00:00:00.000Z"/"T23:59:59.999Z" string
concatenation: the picker's date-only values name days on the store's
LOCAL wall clock, which is the calendar every report query buckets
against (strftime(..., 'localtime')). Pinning them to literal UTC
midnight shifted this export's day/month boundaries by the store's
UTC offset relative to the very same P&L export run from Report
Center, which already goes through toQueryRange().

### line-hooks-use-count-freshness-ts-L49

`client/lib/hooks/use-count-freshness.ts:49`

Only asserted against a complete movement log: a device still catching up
can read a deficit that the movements it has not pulled yet would explain,
which is the same freshness condition the count warning itself exists for.

### line-hooks-use-customer-data-ts-L96

`client/lib/hooks/use-customer-data.ts:96`

"Avg points / member" is per LOYALTY MEMBER, so the denominator is the
members (customers with points), not the whole customer book - dividing
by every customer, most of whom hold no points, understated the figure
by roughly the non-member share of the base.

### line-hooks-use-customer-management-ts-L142

`client/lib/hooks/use-customer-management.ts:142`

Memoized: this parses a JSON column per tier and sorts the result, and
both the array and the getTierColor closure below it are handed to every
customer row.

### line-hooks-use-customer-management-ts-L255

`client/lib/hooks/use-customer-management.ts:255`

Debounced and memoized: unmemoized this re-ran the whole fuzzy search
(including its Levenshtein fallback tier) on every render of
CustomerManagement, not just when the search term actually changed.

### line-hooks-use-customer-mutations-ts-L44

`client/lib/hooks/use-customer-mutations.ts:44`

insert()'s global cache invalidation refreshes the `customers`
query in the background, so no need to hand-splice the new row into
local state — the caller gets it back directly for immediate use.

### line-hooks-use-daily-close-data-ts-L31

`client/lib/hooks/use-daily-close-data.ts:31`

itemsToday already has every line item for the day (product_name
included) - reuse it to attach a "||"-joined item_names string per sale,
same shape as getRecentSales()'s item_names, so sales-list-modal.tsx can
search by item without a separate query.

### line-hooks-use-daily-close-data-ts-L64

`client/lib/hooks/use-daily-close-data.ts:64`

Catches any payment_method that isn't one of the four buckets above
and isn't "mobile" (folded into transfer) - a NULL/blank method, a
legacy/synced value like "pos" or "wallet", or a mixed refund whose
original sale has no usable splits to prorate against. Without this,
such a sale/refund still moved `total`, but landed in no bucket at
all, so Cash + Card + Transfer + Credit could never sum back to
Total Sales - see docs/KNOWN_BUGS.md's report-audit entry.

### line-hooks-use-daily-close-data-ts-L129

`client/lib/hooks/use-daily-close-data.ts:129`

Sales keyed by id so a refund can find the sale it belongs to - used
below for the VAT netting (see totalTaxToday). Only covers sales made
TODAY; a refund against an earlier day's sale has no row here.

### line-hooks-use-daily-close-data-ts-L140

`client/lib/hooks/use-daily-close-data.ts:140`

The VAT share already backed out of totals.total by this refund.
calculateProportionalRefund (pos-calculations.ts) builds a refund as
  R = q + (q/subtotal)*tax - (q/subtotal)*discount
for returned-items subtotal q, so with total_amount = subtotal + tax
- discount the refunded tax share collapses to
  taxShare = R * tax_amount / total_amount
without needing the return's line items at all.

### line-hooks-use-daily-close-data-ts-L161

`client/lib/hooks/use-daily-close-data.ts:161`

The return flow has no way to record which specific method(s) a
refund actually came back out of (no payment-method picker on a
return), but the original sale's own payment_details.splits tells
us how it was actually collected - reuse that instead of assuming
it was all cash. Prorated across every original split
(credit included) by its share of the sale, same treatment a
pure-credit sale's refund already gets below: reducing `credit`
here is debt forgiveness, not a cash-drawer event, but it keeps
"credit extended today" consistent with a full refund actually
writing that credit back off, the same as the non-mixed case.

### line-hooks-use-daily-close-data-ts-L181

`client/lib/hooks/use-daily-close-data.ts:181`

Decrement the specific sub-account line too, not just the
parent card/transfer total - otherwise a card's itemized
sub-lines ("Moniepoint POS", ...) stopped summing to the
card total as soon as anything was refunded. Mirrors the
sales loop's addAccountTotal call, with a negative amount.

### line-hooks-use-daily-close-data-ts-L191

`client/lib/hooks/use-daily-close-data.ts:191`

The original sale has no usable splits.accountId/amount data to
prorate against (legacy row, missing/corrupt payment_details) -
`totals.total` above was already decremented by the refund's
full amount, so this MUST land somewhere or Cash+Card+Transfer+
Credit silently stops reconciling to Total Sales.

### line-hooks-use-daily-close-data-ts-L243

`client/lib/hooks/use-daily-close-data.ts:243`

Revenue already includes any reseller markup (it's part of the sale's
selling price), so once that commission/markup has actually been paid
out, it's no longer the store's profit - only redeemed amounts count,
since an unredeemed commission is still a liability the store hasn't
settled yet.

### line-hooks-use-daily-close-data-ts-L257

`client/lib/hooks/use-daily-close-data.ts:257`

VAT/tax collected on the government's behalf is a liability, not
profit, so it's backed out of the day's revenue. It has to be backed
out EXACTLY ONCE, which is why this is net of refunded VAT:

  totals.total  = SUM(total_amount) - SUM(total_refunded)
  total_amount  = subtotal + tax - discount
  total_refunded (per calculateProportionalRefund) is VAT-INCLUSIVE:
                = q + taxShare - discountShare

so for a sale that was partly refunded, subtracting the full
SUM(tax_amount) removed the refunded portion's VAT a SECOND time - it
had already left via total_refunded inside totals.total. Netting it:

  profit = (SUM(total) - SUM(refund)) - (SUM(tax) - SUM(taxShare)) - cost
         = (subtotal - discount) - (q - discountShare) - cost

i.e. ex-VAT revenue minus the ex-VAT value of what came back, minus
cost. Each VAT component is now subtracted exactly once.

Limitation: refundedTaxToday can only be computed for refunds whose
ORIGINAL SALE is in today's set (getDailyCloseData windows sales by
transaction_date and returns by created_at, so a refund of an earlier
day's sale has no sale row to read tax_amount/total_amount from). That
case isn't double-subtracted anyway - the old sale's VAT was never in
totalTaxToday - it's merely understated by that refund's VAT share.

### line-hooks-use-dashboard-overview-ts-L37

`client/lib/hooks/use-dashboard-overview.ts:37`

Oversold products (bug #4's floor-at-zero alert): sourced separately
from `getStockBatchStats()`'s low_stock_count, since a batch floored to
exactly 0 fails that query's `total_qty > 0` guard.

### line-hooks-use-dashboard-overview-ts-L52

`client/lib/hooks/use-dashboard-overview.ts:52`

Both sides of the "vs yesterday" comparison are net of refunds: the
numerator (today) always was, and the denominator now is too - comparing
net-today against gross-yesterday made any refund look like a sales drop.

### line-hooks-use-dashboard-overview-ts-L82

`client/lib/hooks/use-dashboard-overview.ts:82`

Memoized, like getActivityColor below, because both are handed to the
activity feed's rows. The feed is capped at 5 items so the compute itself is
small; a fresh array/closure per render is what invalidates them.

### line-hooks-use-dashboard-overview-ts-L138

`client/lib/hooks/use-dashboard-overview.ts:138`

Distinguishes a prescription-dispensed sale from a walk-in sale for
icon/color purposes only; `type` stays "sale" so the transaction
details dialog click-handler (keyed on type === "sale") still works.

### line-hooks-use-expense-mutations-ts-L25

`client/lib/hooks/use-expense-mutations.ts:25`

Defense in depth: the add/edit dialog already rejects a non-numeric
or non-positive amount before calling this mutation, but a REAL
money column shouldn't rely solely on the caller having validated -
and nothing upstream rounds to the cent, so float drift (e.g.
"12.1" + floating-point rounding) could otherwise land un-rounded.

### line-hooks-use-feature-gate-ts-L145

`client/lib/hooks/use-feature-gate.ts:145`

Max stores/branches allowed — not enforced anywhere client-side yet
(nothing today caps store creation against this), but needed so
canManageMultiStore below has a real number to derive from.

### line-hooks-use-feature-gate-ts-L156

`client/lib/hooks/use-feature-gate.ts:156`

Multi-store functionality, derived directly from the `stores` limit
instead of a separately admin-configured boolean — the two could
disagree (Pro sold 3 stores while multi_store stayed false until
this fix), and a store limit of 1 can never mean "multi-store" by
definition, so there's nothing a separate toggle could express that
the limit doesn't already say.

### line-hooks-use-feature-gate-ts-L164

`client/lib/hooks/use-feature-gate.ts:164`

Advanced E-commerce — Enterprise-only: a real per-tenant storefront
needs its own domain + SSL, which the current shared-hosting setup
(no wildcard SSL) can't provision cheaply below Enterprise pricing.

### line-hooks-use-feature-gate-ts-L169

`client/lib/hooks/use-feature-gate.ts:169`

Core POS/checkout access. Every tier's `smart_pos` config value is
`true` today (no tier currently loses this), but it's wired as a
real gate — not left ungated — for parity with every other module
flag and so a future ultra-restricted tier could actually use it.
Flipping this false for a tier in production blocks checkout
entirely for that tier — treat changes to it with real caution.

### line-hooks-use-feature-gate-ts-L198

`client/lib/hooks/use-feature-gate.ts:198`

Plan-tier entitlement only (Pro/Enterprise), independent of the
store's own on/off toggle. Settings UI uses this (not
canUseLoyaltyProgram below) to decide whether to show the "Enable
Loyalty Program" switch at all — gating visibility on the combined
value would hide the switch the moment it's toggled off, making it
impossible to turn back on.

### line-hooks-use-feature-gate-ts-L211

`client/lib/hooks/use-feature-gate.ts:211`

Report Center's non-daily-close reports (other report types, cross-
report filtering) plus the BI/analytics dashboard and their CSV/PDF
exports.

### line-hooks-use-feature-gate-ts-L216

`client/lib/hooks/use-feature-gate.ts:216`

Plan-tier entitlement only, independent of the store's own toggle -
same reasoning as canAccessLoyaltyProgramPlan above. The Register
Configs settings switch uses this (not canUseMarkupSales) so it stays
visible/toggleable even while off.

### line-hooks-use-feature-gate-ts-L229

`client/lib/hooks/use-feature-gate.ts:229`

The End-of-Day / Daily Close report tab, including its own export —
deliberately Starter+ (not Pro-only), matching expenses/procurement/
prescriptions: core day-to-day ops stay available at Starter.

### line-hooks-use-finance-data-ts-L111

`client/lib/hooks/use-finance-data.ts:111`

endOfMonth, not the start of next month: getSmoothedExpensesTotal and
getCurrentMonthExpensesByCategory both treat `to` as INCLUSIVE (see their
doc comments), so next month's 1st would otherwise be counted here.

### line-hooks-use-fleet-mutations-ts-L28

`client/lib/hooks/use-fleet-mutations.ts:28`

The Business Information card writes name/address/phone to the
local `stores` row and queues a sync push independently of Fleet.
If Fleet edits the active store's fields but the local row still
holds pre-edit values, that queued push would silently revert
this edit on the next sync. Writing the same fields locally too
(only for the store this device is actually running) keeps local
state in step with what we just wrote to the cloud.

### line-hooks-use-fulfill-online-order-mutation-ts-L14

`client/lib/hooks/use-fulfill-online-order-mutation.ts:14`

Deterministic from order.id (not generateShortId()'s randomness) so a retry
after the server leg below fails can recognize its own prior local write
instead of creating a second one - see the isPending/isError note above the
mutation. Fits transaction_number's plain string column; no schema change.

### line-hooks-use-fulfill-online-order-mutation-ts-L76

`client/lib/hooks/use-fulfill-online-order-mutation.ts:76`

Written via the standard insert()/update() helpers, not raw execute(), so
this gets audit logging and cache invalidation like every other mutation.

sales has no receipt_number/status/customer_name columns (those
belong to other tables) - this insert previously wrote them anyway,
which throws a "no such column" error at the DB layer on every
fulfillment, and never set transaction_number (UNIQUE NOT NULL)
at all. transaction_number here also can't reuse order.id.split
("-")[0] alone - not unique by construction, and colliding with
POS-issued numbers is possible since both share the same id space.
customer_name has nowhere to go on `sales` (only customer_id, and
online orders don't carry a matched customer record) - recorded in
notes instead so it's still visible on the transaction.

### line-hooks-use-fulfill-online-order-mutation-ts-L93

`client/lib/hooks/use-fulfill-online-order-mutation.ts:93`

NOT NULL with no schema default (unlike tax_amount/discount_total,
which default to 0) - online orders carry no separate tax/discount
breakdown, so this mirrors amount_paid below in treating the order
total as the whole of it.

### line-hooks-use-fulfill-online-order-mutation-ts-L107

`client/lib/hooks/use-fulfill-online-order-mutation.ts:107`

Insert each sale_items row and deduct/log the stock it consumed via
the same recordSaleItemStock() used by POS checkout (see
lib/db/queries/inventory.ts), instead of this hook's own
getStockBatchesForProduct/remainingToDeduct loop. That duplicated
loop had the identical FEFO-fallback bug fixed there (a batch that
only partially covers the order line silently left the rest
undeducted) and, worse, never wrote stock_movements or
sale_item_batches rows at all — a fulfilled online order left zero
trace in the stock ledger regardless of depletion level. Routing
through the shared helper closes both gaps in one place.

### line-hooks-use-fulfill-online-order-mutation-ts-L118

`client/lib/hooks/use-fulfill-online-order-mutation.ts:118`

Online orders don't carry a per-item cost_price (unlike POS cart
items, which resolve it from batches when added to cart), so
approximate it here as the quantity-weighted average cost across
the product's active batches — the same average recordSaleItemStock's
caller convention (see use-pos-payment.ts) expects.

### line-hooks-use-monthly-sales-data-ts-L12

`client/lib/hooks/use-monthly-sales-data.ts:12`

Hard ceiling on how many months the chart will ever render, independent
of how wide a range is selected (e.g. an "all time" filter) - without
this, a multi-year range would produce a bar per month indefinitely.
Falls back to trimming to the most RECENT months within the ceiling,
same as the previous hardcoded "last 6 months" behavior for a range
that's still wider than this after the fix below.

### line-hooks-use-monthly-sales-data-ts-L32

`client/lib/hooks/use-monthly-sales-data.ts:32`

Renders the months actually covered by the SELECTED range
(dateFilter..toFilter), not a fixed "last 6 calendar months from
today" - a range narrower or older than 6 months used to show
months outside it entirely (including months after the selected
range), while the KPI cards above the chart correctly honored it.

### line-hooks-use-pos-cart-ts-L78

`client/lib/hooks/use-pos-cart.ts:78`

Clears the persisted POS cart (cart items, discount, redeemed reward,
reseller flag) both in memory and in localStorage. A plain
`localStorage.removeItem("pos-cart-storage")` alone is NOT enough: this
store's zustand module only rehydrates from storage once, on creation, so
the in-memory cart state would survive untouched (and the very next cart
mutation would just re-persist it, undoing the removal). Call this at
every point the app tears down one session's context for another's —
logout, the lock-screen "switch user" flow, and a store switch — so a
shared terminal's next cashier (or the newly-active store) never inherits
a cart staged against the outgoing session.

### line-hooks-use-pos-cart-ts-L170

`client/lib/hooks/use-pos-cart.ts:170`

A manual discount edit and a loyalty redemption share the same discount
slot (by design, to keep a single source of truth for "the" discount) —
editing the discount by hand while a reward is redeemed detaches it from
that reward, since the point cost no longer corresponds to what's typed.

### line-hooks-use-pos-cart-ts-L212

`client/lib/hooks/use-pos-cart.ts:212`

Re-price against the catalog rather than at checkout: every figure the
cashier and the customer see (line subtotal, cart subtotal, VAT, total,
the amount tendered and the change due) is derived from these lines, so
correcting a price at checkout would charge an amount that was never on
screen. Correcting it the moment the new catalog arrives keeps all of
them consistent and gives the cashier a chance to tell the customer.
Idempotent by design — it returns the same array when nothing moved —
so re-running it on every cart change costs one pass and settles.

### line-hooks-use-pos-cart-ts-L232

`client/lib/hooks/use-pos-cart.ts:232`

A redemption already staged in cart state can outlive the gate that
allowed it — a plan downgrade, or an admin flipping the store's on/off
toggle in another tab, mid-session. If that happens while a reward is
staged, clear it immediately rather than letting checkout complete with
a redemption the store is no longer entitled/willing to honor; the
discount it applied is cleared along with it via clearRedemption().

### line-hooks-use-pos-cart-ts-L250

`client/lib/hooks/use-pos-cart.ts:250`

VAT must be charged on the net-of-discount amount (this covers loyalty
redemptions too, since they share this same discount slot — see
redeemReward() above) — otherwise a discounted/redeemed sale is
overcharged VAT on money the customer was never actually charged.

### line-hooks-use-pos-cart-ts-L362

`client/lib/hooks/use-pos-cart.ts:362`

Turning reseller mode off with marked-up prices still in the cart
would silently keep charging the marked-up amount with no
commission tracked for it - revert every line back to normal.

### line-hooks-use-pos-cart-ts-L393

`client/lib/hooks/use-pos-cart.ts:393`

A held transaction never persisted a redemption (only its resulting
discount amount), so any redemption tag from before this restore is
now stale and must not carry over.

### line-hooks-use-pos-cart-ts-L399

`client/lib/hooks/use-pos-cart.ts:399`

The raw store setter, not setIsResellerSale: that wrapper reverts every
line to original_unit_price when switching the flag off, which would
undo the markup this restore is carrying.

### line-hooks-use-pos-held-transactions-ts-L54

`client/lib/hooks/use-pos-held-transactions.ts:54`

Date.now() as an explicit primary key collides across two terminals
holding a sale in the same millisecond - the losing cart silently
overwrites the other on sync. generateId() is collision-safe.

### line-hooks-use-pos-held-transactions-ts-L66

`client/lib/hooks/use-pos-held-transactions.ts:66`

Persist the discount alongside the total: clearCart() (called
right below) resets live discount state to 0, so without this the
total the customer was quoted couldn't be reconstructed on recall.

### line-hooks-use-pos-held-transactions-ts-L92

`client/lib/hooks/use-pos-held-transactions.ts:92`

1. Parse items first. The current cart is deliberately left
untouched until the parse/lookup work below has succeeded — clearing
it up front (the old behavior) meant a malformed items_json left the
cashier with neither the original cart nor the recalled one.
Discarding a non-empty cart is confirmed by the caller
(pos-dialogs.tsx) before we ever get here.

### line-hooks-use-pos-held-transactions-ts-L109

`client/lib/hooks/use-pos-held-transactions.ts:109`

Prices are rebuilt from the current catalog; a held reseller sale keeps
its agreed markup or cut relative to it (recalledUnitPrice) instead of
silently re-quoting the customer at shelf price.

### line-hooks-use-pos-held-transactions-ts-L126

`client/lib/hooks/use-pos-held-transactions.ts:126`

Items whose product was deleted/deactivated while the sale was held
are dropped by the filter above; say so rather than handing back a
quietly shorter cart than what was quoted.

### line-hooks-use-pos-held-transactions-ts-L131

`client/lib/hooks/use-pos-held-transactions.ts:131`

A genuine catalog price change, measured against the price the line
was based on (original_unit_price when present) rather than the
possibly marked-up unit_price - comparing the latter reported every
restored reseller markup as a price change.

### line-hooks-use-pos-held-transactions-ts-L141

`client/lib/hooks/use-pos-held-transactions.ts:141`

2. Delete the held row BEFORE touching cart state. remove() can fail
for reasons unrelated to the recall (a read-only second tab, an
active store that has moved), and a cart already mutated behind a
"Failed to recall" toast left the sale listed as recallable again.

### line-hooks-use-pos-payment-helpers-ts-L81

`client/lib/hooks/use-pos-payment-helpers.ts:81`

Forces the cashier to pick a lane rather than silently defaulting to
one - a "Reseller sale" with no chosen type would otherwise be
ambiguous about whether a real commission is owed or the store just
kept the markup.

### line-hooks-use-pos-payment-helpers-ts-L93

`client/lib/hooks/use-pos-payment-helpers.ts:93`

Checked before coverage: the shortage math floors negatives, so a
negative split would otherwise pass silently as "covered" while
under-recording the cash actually collected.

### line-hooks-use-pos-payment-helpers-ts-L164

`client/lib/hooks/use-pos-payment-helpers.ts:164`

Rounded because both are stored and this one is a RATE multiplication,
the same class as A-261 rather than float dust: it is also what a
reseller is actually paid out.

### line-hooks-use-pos-payment-helpers-ts-L196

`client/lib/hooks/use-pos-payment-helpers.ts:196`

Re-read the current points balance rather than trusting selectedCustomer
(captured when the cashier picked the customer, possibly stale by the
time checkout completes) — same staleness risk as the outstanding
balance write in use-pos-payment.ts.

### line-hooks-use-pos-payment-helpers-ts-L206

`client/lib/hooks/use-pos-payment-helpers.ts:206`

POINTS EXPIRY (LOYALTY_RULES.POINTS_EXPIRY_MONTHS) is materialized here,
at the only place a sale already touches a customer's points balance, so
there's no background job and no schema change.

Data granularity available: `customers.loyalty_points` is the
authoritative balance, and `loyalty_transactions` is a dated per-event
ledger (earn/redeem rows written by checkout and returns). Semantics
implemented: FIFO per-batch expiry replayed over that ledger — earn
batches older than the expiry window that redemptions haven't already
consumed are voided — with any part of the balance that has no ledger
rows behind it (demo seeding, customer import, a directly-set balance)
treated as non-expiring, since nothing dates it. See
calculateExpiredPoints for the full policy. The deduction is recorded as
a negative 'expired' ledger row so the next replay doesn't expire the
same batches twice.

### line-hooks-use-pos-payment-helpers-ts-L224

`client/lib/hooks/use-pos-payment-helpers.ts:224`

Reject rather than clamp: calculateLoyaltyPointsAfterSale floors the
resulting balance at 0, which used to mean a customer who no longer
actually has the points (a second terminal already spent them, or a
stale cached balance) still got the redemption discount applied for
free. Checked against the balance just re-read above, inside the same
transaction the sale itself runs in, so throwing here rolls back the
whole sale rather than leaving a half-applied discount.

### line-hooks-use-pos-payment-ts-L99

`client/lib/hooks/use-pos-payment.ts:99`

Synchronous re-entrancy guard: the Process Payment button's own
`disabled={processingPayment}` prop only takes effect after React
commits the setProcessingPayment(true) below - a render tick behind
the click that caused it. A close-enough double-tap/ghost-click (a
real phenomenon on the touchscreen POS tablets this app targets, see
globals.css's hover: media-query fix for the same touch/click
ambiguity) can dispatch a second handlePayment() call before that
render lands, each generating its own unique transactionNumber (so
the UNIQUE constraint doesn't catch it as a duplicate) - producing two
sales rows, double stock deduction, and double loyalty/commission for
one physical transaction. A ref updates synchronously, unlike state,
so it closes this gap where checking `processingPayment` itself would
not (both calls would still read the same pre-render value).

### line-hooks-use-pos-payment-ts-L154

`client/lib/hooks/use-pos-payment.ts:154`

Date.now() collides across two terminals checking out in the same
millisecond (or with clock skew) - transaction_number is UNIQUE NOT
NULL, so the losing terminal's sale hits a constraint violation and
never syncs. generateId() is the same collision-safe id generator
used everywhere else in the app.

### line-hooks-use-pos-payment-ts-L174

`client/lib/hooks/use-pos-payment.ts:174`

A store-markup sale has no reseller to pay, so there's nothing to
redeem later - settle it right here, at checkout, instead of
leaving it sitting in "Not yet redeemed" until someone remembers
to click Store Claims Markup in Transaction Details.

### line-hooks-use-pos-payment-ts-L180

`client/lib/hooks/use-pos-payment.ts:180`

Every write below (the sale row, its line items + stock deduction,
any credit-balance update, loyalty points) must land together or
not at all: without a transaction, an interruption partway through
(app closed, a transient lock error, storage quota exceeded) leaves
a real `sales` row with only some stock deducted and no visible
error. A cashier who then retries the sale double-books revenue and
double-decrements whatever stock did get deducted the first time.

### line-hooks-use-pos-payment-ts-L188

`client/lib/hooks/use-pos-payment.ts:188`

Pre-generated (rather than letting insert() assign one) so every
other write this sale makes - line items, stock deduction,
credit-balance update, loyalty points - can tag its audit_logs
row with the same id as the correlationId, letting the Activity
Log collapse them into one entry instead of showing each action
to a store owner separately.

### line-hooks-use-pos-payment-ts-L206

`client/lib/hooks/use-pos-payment.ts:206`

Derived from the actual charged amounts rather than hardcoded, so it
always matches whatever VAT rate was really applied (the store's
configured rate, which may not be 7.5%, or may be 0).

### line-hooks-use-pos-payment-ts-L227

`client/lib/hooks/use-pos-payment.ts:227`

Only ever set when a customer is selected — the UI gates the
redemption picker on that already, but guard here too in case a
stale redemption survives a customer being cleared mid-checkout.

### line-hooks-use-pos-payment-ts-L274

`client/lib/hooks/use-pos-payment.ts:274`

Re-read the current balance rather than trusting selectedCustomer
(captured when the cashier picked the customer, possibly stale by
the time checkout completes — e.g. another terminal recorded a
sale or payment for the same customer in between). Mirrors
recordCustomerPayment's own re-read for the same reason.

### line-hooks-use-pos-payment-ts-L290

`client/lib/hooks/use-pos-payment.ts:290`

Clamped to what this sale can actually still owe: anything beyond
it is debt applyCreditPaymentFIFO() could never settle against
this sale (validatePaymentReadiness rejects it up front; this is
the write-side guard). See docs/FIXED_BUGS.md (A-56).

### line-hooks-use-pos-payment-ts-L319

`client/lib/hooks/use-pos-payment.ts:319`

Committed inside the same transaction as the sale itself, not
after it: this used to run once the transaction had already
committed and returned, so an interruption between the sale
committing and this running left the sale durably recorded but
the prescription still "pending" - dispensable a second time.

### line-hooks-use-pos-system-ts-L29

`client/lib/hooks/use-pos-system.ts:29`

Focuses the header search on arrival at POS — it's easy to miss at a
glance since it sits in the header rather than the product grid, and
this is the input staff will use for almost every sale. A no-op on
mobile, where this same input is hidden (`hidden sm:flex` in
pos-layout-header.tsx) in favor of pos-mobile-search.tsx — focusing a
display:none input doesn't pop the on-screen keyboard.

### line-hooks-use-pos-system-ts-L89

`client/lib/hooks/use-pos-system.ts:89`

POS doesn't use the shared DashboardLayout scroll container (its routes opt out
of that entirely), so each tab wires pull-to-refresh directly onto its own
scrollable region instead of registering through the global context.

### line-hooks-use-pos-system-ts-L219

`client/lib/hooks/use-pos-system.ts:219`

Clears the search after a search-driven add so the next scan/search
starts clean, instead of leaving the previous query (and its now-stale
narrowed results) sitting there until staff notice and clear it
themselves. Only when a search was actually active: adding straight
from Suggestions/Recently Sold/All Products (searchTerm already empty)
has nothing to clear and shouldn't reset scroll position for no reason.
A fresh closure here defeated POSProductCard's React.memo entirely (it
is this component's only per-card prop), re-rendering every visible tile
on every keystroke.

### line-hooks-use-post-restore-cloud-link-notice-ts-L27

`client/lib/hooks/use-post-restore-cloud-link-notice.ts:27`

Read the raw token directly rather than via useAuth()'s isCloudLinked:
AuthProvider sets that from the same localStorage key in its own
mount effect, but effect ordering between an ancestor provider and
this hook isn't guaranteed, so relying on the context value here
could observe its pre-mount default and consume the one-shot marker
on a stale answer.

### line-hooks-use-prescription-management-ts-L29

`client/lib/hooks/use-prescription-management.ts:29`

Navigate to edit form, could just show new prescription with ID.
Close the detail side panel first; otherwise it stays open on top of
(and blocks interaction with) the full-screen edit overlay underneath.

### line-hooks-use-prescription-management-ts-L37

`client/lib/hooks/use-prescription-management.ts:37`

Hand off to POS to actually deduct stock and record the sale. POS
marks the prescription "completed" itself once payment succeeds
(see usePOSPrescription / use-pos-payment.ts).

### line-hooks-use-prescription-management-ts-L54

`client/lib/hooks/use-prescription-management.ts:54`

A prescription-linked sale is the actual source of truth for stock/
payment: "cancelling" a prescription used to just relabel its status
without touching either. Route to the real Return flow instead, which
reverses stock/payment and (on a full return) reverts the rx to
"ready" itself (see return-dialog.tsx).

### line-hooks-use-prescription-queue-ts-L117

`client/lib/hooks/use-prescription-queue.ts:117`

Tagged with meta.tables: ["prescriptions"] (see lib/query-keys.ts) so it
auto-refetches whenever insert/update/softDelete touches that table
anywhere in the app; no manual refetch wiring needed.

### line-hooks-use-prescription-queue-ts-L126

`client/lib/hooks/use-prescription-queue.ts:126`

Derived (not a separate snapshot) so an edit/refetch that changes the
selected prescription's medications, status, etc. is reflected immediately
instead of the detail panel showing whatever was selected at click-time.

### line-hooks-use-prescription-queue-ts-L166

`client/lib/hooks/use-prescription-queue.ts:166`

update() already invalidates queryKey: ["prescriptions"], triggering a
refetch. selectedPrescription is derived from that data, so it picks up
the new status automatically once the refetch lands.

### line-hooks-use-process-return-mutation-ts-L40

`client/lib/hooks/use-process-return-mutation.ts:40`

returns.user_id is a constrained foreign key server-side, so a
sentinel written here only fails much later and somewhere else: the
row saves locally, pushes, is rejected on the FK, retried through
backoff and finally reported as a permanently stuck sync item. The
return dialog is reachable for a frame while useAuth().user is still
null, which is a caller bug worth surfacing here and now.

### line-hooks-use-process-return-mutation-ts-L87

`client/lib/hooks/use-process-return-mutation.ts:87`

3. Mark sale as returned once every line item's full remaining
balance has been returned (across this and any prior returns),
not just when every original line item is touched in this one.

### line-hooks-use-process-return-mutation-ts-L98

`client/lib/hooks/use-process-return-mutation.ts:98`

A full return of a prescription-linked sale undoes the dispense.
Send it back to "ready" so it re-enters the dispense queue instead
of staying "completed" with no sale to show for it. Partial returns
(e.g. one med out of several) leave the prescription's status alone.

### line-hooks-use-process-return-mutation-ts-L106

`client/lib/hooks/use-process-return-mutation.ts:106`

If any part of this sale was paid on credit, returning goods must also
reduce what the customer owes, otherwise they're still on the hook
for items they gave back. Prorate by the credit share of the original
sale for mixed-payment sales; a plain "credit" sale is 100% credit.

### line-hooks-use-process-return-mutation-ts-L134

`client/lib/hooks/use-process-return-mutation.ts:134`

The credit portion of a return is debt forgiveness, not a
collection event, but applyCreditPaymentFIFO() computes what a
sale still owes as `total_amount - amount_paid`. Without also
crediting that forgiven amount against amount_paid here, this
sale's remaining balance would stay overstated by exactly the
returned amount even though the customer no longer owes it -
and once payment_status below flips to refunded/
partially_refunded, a later credit payment would then have
nothing left to correctly apply it against.

### line-hooks-use-process-return-mutation-ts-L147

`client/lib/hooks/use-process-return-mutation.ts:147`

Cap the debt forgiveness at what this sale actually still owes -
crediting the customer's outstanding_balance by the full
creditPortionOfRefund (rather than the capped `forgiven` amount)
would over-credit the customer whenever the sale was already
partially paid, silently eating into their other sales' debt.

### line-hooks-use-process-return-mutation-ts-L167

`client/lib/hooks/use-process-return-mutation.ts:167`

A return must also undo its proportional share of whatever this
sale did to the customer's points balance — otherwise a customer
keeps points earned on merchandise they gave back, or loses a
reward's points cost permanently even though the discount it
bought is being reversed too. Prorated by the same
items-returned share as the refund itself, for consistency with
a partial return only undoing part of the sale.

### line-hooks-use-pull-to-refresh-ts-L8

`client/lib/hooks/use-pull-to-refresh.ts:8`

Vertical travel required before a touch is treated as a pull rather than a
tap. Without this, a normal tap's 1-3px of finger jitter got claimed as a
pull and preventDefault()'d on the first pointermove - which cancels
WebKit's tap-to-click synthesis and silently drops the tap (iPad: buttons
and tabs at the top of a scroll area intermittently doing nothing).

### line-hooks-use-pull-to-refresh-ts-L66

`client/lib/hooks/use-pull-to-refresh.ts:66`

Below PULL_SLOP, diff and diffX are both still jitter-scale, so a
horizontal-intent comparison here is unreliable: a real straight-down
pull's very first frame can easily read e.g. diff=1, diffX=2 purely
from finger noise, which would wrongly and PERMANENTLY cancel the
whole gesture (pulling.current stays false for every later frame,
even once the pull becomes unambiguous). Wait for enough vertical
travel to make the comparison meaningful, and until then don't
preventDefault (cancels tap-to-click synthesis) or setState (a root
re-render between touchstart and click drops the tap too) - this may
still turn out to be a tap.

### line-hooks-use-pull-to-refresh-ts-L78

`client/lib/hooks/use-pull-to-refresh.ts:78`

Now that there's real vertical travel to compare against, a
horizontal component that still dominates it means this is a
sideways gesture, not a pull - stop watching it for the rest of
this touch (no snapping back and forth between the two).

### line-hooks-use-purchase-orders-ts-L59

`client/lib/hooks/use-purchase-orders.ts:59`

Guards against a double-click/double-tap on "Confirm & Receive" firing
receivePurchaseOrder twice for the same order (which would duplicate the
stock batch and its movement); also drives the button's loading state.

### line-hooks-use-purchase-orders-ts-L76

`client/lib/hooks/use-purchase-orders.ts:76`

poTab isn't a query param: getPurchaseOrders() always fetches
everything and filtering happens client-side below, so it doesn't
belong in the key (the old effect refetched on every tab switch for
no reason, since the underlying data never changed).

### line-hooks-use-purchase-orders-ts-L106

`client/lib/hooks/use-purchase-orders.ts:106`

receivePurchaseOrder() writes products.selling_price synchronously
for any line with a real override, same as createAndReceivePurchaseOrder -
this is the other of the two paths that actually change the live
price immediately, so it gets the same confirmation toast.

### line-hooks-use-report-export-ts-L120

`client/lib/hooks/use-report-export.ts:120`

Only these two report types carry a product or category name column, and
both alias their SQL output to the exact header name (see
fetchStockBatchReportData/fetchTopSellersReportData in lib/db/queries/
reports.ts), so this is a safe, narrow list rather than a blanket
transform over every report's differently-shaped rows.

### line-hooks-use-report-export-ts-L211

`client/lib/hooks/use-report-export.ts:211`

The DB stores these as raw date/datetime strings; format them
consistently (dd/mm/yyyy) instead of leaking whatever precision
the underlying column happens to have (e.g. full ISO timestamps)
into the exported CSV/PDF.

### line-hooks-use-report-export-ts-L256

`client/lib/hooks/use-report-export.ts:256`

Reports configured takesDateRange: false (stock_batches, customers)
are always all-time - they never actually filter by dateFrom/dateTo
even when a caller passes them (see getRows below), so stamping the
PDF with a period subtitle mislabeled all-time data as scoped to a
range it was never filtered by.

### line-hooks-use-report-export-ts-L269

`client/lib/hooks/use-report-export.ts:269`

Sits under the subtitle in the PDF's header block - same mechanism,
a second line, so a caveat about the figures travels with the
exported document instead of living only in the app's UI.

### line-hooks-use-save-prescription-mutation-ts-L40

`client/lib/hooks/use-save-prescription-mutation.ts:40`

Reconcile items instead of delete-all-then-reinsert: a blind
reinsert gives every medication a fresh row, which resets
refills_used to 0 and recomputes next_refill_date from "now",
silently wiping the refill history of a medication that's still on
the prescription. Identity here is product_name + strength + dosage
(the form doesn't round-trip a stable item id for existing rows), so
a still-present medication is updated in place — keeping its id,
refills_used and next_refill_date — while only genuinely removed
rows are deleted and genuinely new ones inserted.

### line-hooks-use-save-product-mutation-ts-L36

`client/lib/hooks/use-save-product-mutation.ts:36`

sql.js's bind() throws ("tried to bind a value of an unknown type
(undefined)") on a JS `undefined` parameter — it only accepts null
for a missing value. Category is optional (no "*" in the Add Product
dialog), so leaving it `undefined` here used to crash insert()/
update() for every product saved without one, surfacing as a silent
"Failed to save Product" toast with no row ever created.

### line-hooks-use-sortable-data-ts-L23

`client/lib/hooks/use-sortable-data.ts:23`

Held in a ref instead of the memo's dependency array: every call site
passes a fresh object literal per render, which defeated the memo
everywhere and re-sorted the whole table on every keystroke.

### line-hooks-use-stock-batch-alerts-ts-L47

`client/lib/hooks/use-stock-batch-alerts.ts:47`

Always critical: it means the batch's recorded stock and its real
stock have already diverged (a sale went through against more stock
than the batch had), not merely that stock is running low.

### line-hooks-use-stock-batch-management-ts-L16

`client/lib/hooks/use-stock-batch-management.ts:16`

Owned by app/(dashboard)/layout.tsx, not local state here: DashboardLayout
remounts everything below it on every navigation (see dashboard-layout.tsx's
key={pathname}), including the router.replace below. Local state here would
be reset before the overlay ever got a chance to render - see
inventory-audit-context.tsx.

### line-hooks-use-stock-batch-management-ts-L30

`client/lib/hooks/use-stock-batch-management.ts:30`

/inventory/batches is a generateStaticParams route with no <TabsContent>
behind it, so it rendered a blank panel. The Catalog tab is the
all-products view its three callers actually meant.

### line-hooks-use-stock-batch-management-ts-L36

`client/lib/hooks/use-stock-batch-management.ts:36`

The "Movements" tab UI is hidden entirely for roles without stock-management
access, but the /inventory/ledger route itself is still directly reachable
(typed URL, stale bookmark) - bounce those viewers back to a tab they can see.

### line-hooks-use-stock-batch-management-ts-L53

`client/lib/hooks/use-stock-batch-management.ts:53`

The sidebar's own <Link> only ever prefetches "/inventory" (wherever it
points), never the *other* tabs reachable once you're already on this
page — those switch via router.push() from handleTabChange below, which
Next never auto-prefetches the way a rendered <Link> does. Each of
"/inventory/[tab]" (catalog, ledger) is its own separate JS chunk from
"/inventory" itself, so the first click into a not-yet-visited tab pays
a real network+parse cost with nothing on screen to show for it yet —
confirmed live via a production Network-tab capture (a fresh
"catalog.txt?_rsc=" + "page-*.js" fetch firing exactly when the tab was
clicked). Warming both here, once, as soon as any inventory tab mounts
means that cost is already paid in the background by the time it's
needed, regardless of which tab the user lands on first.

### line-hooks-use-stock-batch-stats-ts-L26

`client/lib/hooks/use-stock-batch-stats.ts:26`

90, matching the schema default (`expiry_warning_days INTEGER DEFAULT
90`) and every consumer that captions this figure - stock-batch-metrics
("Within {expiry_warning_days || 90} days"), needs-attention, and
use-product-details all fall back to 90. Falling back to 30 here made
the "Expiring soon" card count a 30-day window while its own caption,
and the lists it cross-references, said 90.

### line-hooks-use-stock-batch-stats-ts-L44

`client/lib/hooks/use-stock-batch-stats.ts:44`

"Needs reordering": at or below reorder level, INCLUDING the ones that
have sold out entirely. getStockBatchStats's low_stock_count
deliberately excludes qty = 0 (that's critical_stock_count), so a
product that sold out vanished from the only count the owner sees on
the Low stock card / Action Center / sidebar badge - the most urgent
case disappearing from the reorder list. criticalStockCount stays
exposed separately for anything that needs the strict split.

### line-hooks-use-swipe-navigation-ts-L18

`client/lib/hooks/use-swipe-navigation.ts:18`

Ref, not state: this is read only inside handleTouchEnd, never rendered.
A setState here fired a root re-render between touchstart and the
browser's tap-to-click synthesis, which could drop an in-flight tap on
touch devices (iPad).

### line-hooks-use-swipe-navigation-ts-L32

`client/lib/hooks/use-swipe-navigation.ts:32`

Clear the direction once the new route has mounted with it, so a later
navigation triggered another way (e.g. a sidebar click) doesn't replay
a stale swipe animation.

### line-hooks-use-widget-snapshot-sync-ts-L22

`client/lib/hooks/use-widget-snapshot-sync.ts:22`

While cloud-linked, wait for the first successful fetch before writing
so we don't clobber native storage with a transient "unlinked" state
during the initial load.

### line-licensing-licensing-manager-ts-L156

`client/lib/licensing/licensing-manager.ts:156`

Deliberately NOT the public /health endpoint: this call carries the
session id and the server refuses it unless a live admin_till_sessions row
exists, so the authority is a server-side row rather than a sessionStorage
flag anyone could forge in devtools.

### line-licensing-monotonic-clock-ts-L41

`client/lib/licensing/monotonic-clock.ts:41`

Anchor and return the PROJECTED value, never the ceiling: the slack
decides when to clamp, and must not accumulate into what gets written.
Returning the ceiling let each clamped write add another MAX_FORWARD_DRIFT
on top of the last, so a fast clock re-poisoned the watermark by degrees.

### line-query-keys-ts-L41

`client/lib/query-keys.ts:41`

getStockBatchStats reads `FROM products p LEFT JOIN (...stock_batches)`,
so a product edit/add/deactivate changes these numbers too - without
"products" listed, the stat cards stayed stale until something happened
to touch stock_batches.

### line-query-keys-ts-L220

`client/lib/query-keys.ts:220`

Today's local date is part of the key because getDashboardOverviewData
computes "today" internally (getLocalTodayDate(), same call as here):
without it, a terminal left open overnight kept serving yesterday's
cached figures under a "Today's Sales" label. Sharing the exact same
helper means key and query function can never disagree about the day.

### line-query-keys-ts-L275

`client/lib/query-keys.ts:275`

tableName distinguishes the full Activity Log page's cache slot (no
arg) from a scoped tab's (e.g. Staff Activities passing "users") —
without it both would collide on the same key and shadow each other's
distinct actions/users list.

### line-types-user-ts-L39

`client/lib/types/user.ts:39`

null (not "") when no store is active at creation time - an empty
string matches neither `store_id = ?` nor the `store_id IS NULL`
fallback getUsers()/local-database.ts checks for, making the account
invisible in every staff list while still able to log in.

### line-utils-ts-L41

`client/lib/utils.ts:41`

XAF/XOF are zero-minor-unit currencies - maximumFractionDigits left
undefined here previously fell back to Intl's decimal-style default
of 3, rendering e.g. "1,234.567 F" on cart rows, totals and receipts.

### line-utils-ts-L46

`client/lib/utils.ts:46`

Simple mapping for common symbols if the locale doesn't handle it well
but Intl.NumberFormat is generally robust. A code that survives
sanitizeCurrencyCode (3 letters) but isn't a real ISO 4217 currency
(e.g. a typo'd store setting) still makes Intl.NumberFormat throw
uncaught - caught here so one bad code can't crash every money-
displaying screen in the app.

### line-utils-chunk-error-ts-L2

`client/lib/utils/chunk-error.ts:2`

Each browser engine phrases a stale/missing dynamic-import chunk
differently: Chromium says "Loading chunk N failed" (webpack's own
wording) or "Failed to fetch dynamically imported module"; Safari says
"Importing a module script failed"; Firefox says "error loading
dynamically imported module". All three are the same underlying failure
- a 404 on a chunk this tab's stale build references - so all three
trigger the same auto-reload.

A fourth shape, distinct from all of the above: this app is a static
export (`output: export`), and the host serving it falls back to
`index.html` (200 OK, HTML) for a path it doesn't have, rather than a
real 404 - so a stale chunk request doesn't fail to fetch at all, it
"succeeds" with an HTML document, which the browser then tries to
execute as the JS module it asked for. That throws a plain SyntaxError
whose message is just "Unexpected token '<'" (the start of
`<!DOCTYPE html>`) - confirmed live in production (Sentry: 5 of these
from one device across a single deploy window, each one a blank
/dashboard or /settings/:tab the person had to manually refresh out of,
since nothing here was recognizing it as the same stale-chunk problem
the other three patterns already auto-reload for).

### line-utils-chunk-error-ts-L28

`client/lib/utils/chunk-error.ts:28`

"Unexpected token '<'" isn't unique to a script tag being handed HTML -
V8's JSON.parse() throws the exact same wording ("Unexpected token '<',
\"<!DOCTYPE \"... is not valid JSON") whenever an API response body is
HTML instead of JSON, e.g. base-client.ts's unguarded response.json()
hitting a proxy/gateway error page. That's a real backend problem, not a
stale chunk, and must NOT trigger the auto-reload here: a persistent
backend outage misclassified as a stale chunk would reload on every
request. The per-build cap below now bounds that to one reload, but the
exclusion stays - a backend problem should never reload at all.

### line-utils-diagnostics-delivery-ts-L41

`client/lib/utils/diagnostics-delivery.ts:41`

The inspecting admin, so a reply reaches whoever is standing at the till;
otherwise DumosRx support, never the store's own address — the report goes
TO support and the owner has no use for it.

### line-utils-diagnostics-delivery-ts-L46

`client/lib/utils/diagnostics-delivery.ts:46`

Plain fetch, no bearer: `/support` is public, and routing it through
apiClient would put it on the 401 refresh-and-clear path that can unlink
the till's own sync token.

### line-utils-error-logger-ts-L82

`client/lib/utils/error-logger.ts:82`

In-memory only, not persisted: bounds how often the SAME recurring crash
fires each of the two report paths below. Sentry has its own, far longer
window because its events are billed. See client/AGENTS.md, "What reaches
Sentry".

### line-utils-error-logger-ts-L98

`client/lib/utils/error-logger.ts:98`

base-client.ts attaches `code` to the thrown Error; the message-substring
fallback covers call sites (e.g. recordSyncFailure) that only have the
message string by the time they see the error. Which consumer reads which
check, and why they differ: client/AGENTS.md, "Expected sync noise".

### line-utils-error-logger-ts-L227

`client/lib/utils/error-logger.ts:227`

Ship directly to our own server too, independent of the local SQLite
sync queue below: when the crash IS a sync failure, waiting on that same
broken sync path to eventually deliver this report would mean it never
arrives. keepalive fetch survives the tab closing right after a crash.

### line-utils-error-logger-ts-L256

`client/lib/utils/error-logger.ts:256`

Coalesces a repeat of the SAME crash (matched by fingerprint) into the
most recent still-unsynced row, same reasoning as logAction()'s
audit_logs dedup (core.ts). See client/AGENTS.md, "What reaches Sentry".

### line-utils-error-logger-ts-L329

`client/lib/utils/error-logger.ts:329`

type='bug' + a fingerprint is what marks a row as automatic crash
telemetry rather than feedback a user typed — see
lib/db/crash-report-sync.ts and reportStuckCrashLog().

### line-utils-export-staff-csv-ts-L3

`client/lib/utils/export-staff-csv.ts:3`

A leading =/+/-/@ is interpreted as a formula by Excel/Sheets when the CSV
is opened there - prefixing with a tab (invisible, doesn't shift columns)
neutralizes it without altering the visible value.

### line-utils-pos-calculations-ts-L6

`client/lib/utils/pos-calculations.ts:6`

Money is stored/summed as floats throughout (no integer minor-units), so
every function here that produces a value meant to be stored (not just
displayed) rounds to the cent/kobo - otherwise the stored value can drift
from what the receipt/UI rounds and displays, and SUM()s in reports don't
tie out to the sum of displayed line values.

### line-utils-pos-calculations-ts-L20

`client/lib/utils/pos-calculations.ts:20`

VAT is charged on the net-of-discount amount, not the raw subtotal — a
discount is a reduction in the price charged, so tax should never be
computed on money the customer isn't actually being charged. Callers that
also apply a discount MUST pass (subtotal - discountAmount) here, not the
raw subtotal, or the customer is overcharged VAT on the discounted portion.

### line-utils-pos-calculations-ts-L42

`client/lib/utils/pos-calculations.ts:42`

NOTE: this still subtracts discountAmount from the raw subtotal even
though tax should be computed net-of-discount (see calculateTax above).
That's not double-subtracting: if the caller already computed `tax` from
(subtotal - discountAmount), then subtotal + tax - discountAmount equals
(subtotal - discountAmount) + tax, i.e. discounted-subtotal-plus-tax — the
correct total. Passing a `tax` computed from the raw subtotal here (the
old, buggy call pattern) would overcharge VAT; see use-pos-cart.ts.

### line-utils-pos-calculations-ts-L118

`client/lib/utils/pos-calculations.ts:118`

Negative splits are floored here too, not just at the input: a negative
amount would otherwise offset a larger positive one and make an
under-collected sale look fully covered.

### line-utils-report-pdf-tsx-L38

`client/lib/utils/report-pdf.tsx:38`

Imported here rather than at the top of the file: @react-pdf/renderer
is the heaviest dependency in the app and this fallback almost never
runs (the worker path above handles it), but a static import put the
whole library in every chunk that touches a report.

### line-utils-search-ts-L56

`client/lib/utils/search.ts:56`

Minimum term length before the fuzzy (typo-tolerant) fallback fires at
all. Below this, a term is too short for Levenshtein distance to be a
meaningful similarity signal — a 3-character term is within distance 3 of
huge swaths of unrelated short words/codes, so it used to return noisy
"suggestions" for what should just be an empty result.

### line-utils-search-ts-L63

`client/lib/utils/search.ts:63`

A squashed term shorter than this matches too much mid-string once spaces
are gone ("nc" hits "zinc" and "vitamin c" alike), so below it only
whole-name and word-start matches count.

### line-utils-search-ts-L68

`client/lib/utils/search.ts:68`

Allowed Levenshtein distance scales with term length instead of a flat 3
for every term: a fixed cap of 3 let a 4-character term match almost
anything (up to 3 of its 4 characters could differ), which is most of the
reason short terms produced arbitrary matches.

### line-utils-search-ts-L183

`client/lib/utils/search.ts:183`

Tier 3.5: punctuation-insensitive match, graded. Every band sits
below tier 3's 20, so this only ever adds results and never reorders
existing ones — but the bands matter among themselves: squashing
deletes spaces, so a mid-string hit can straddle two words
("paracetamol tab 12s" contains "b12"). A flat score let that
outrank a real "vitamin b-12" on a till.

### line-utils-search-ts-L280

`client/lib/utils/search.ts:280`

A scanned barcode with no exact match previously fell straight
through to fuzzy-matching against product NAMES, with barcode never
scored at all — a near-miss scan (one misread digit) should match
on the barcode itself instead of surfacing unrelated products.

### line-utils-spreadsheet-io-ts-L1

`client/lib/utils/spreadsheet-io.ts:1`

Type-only: exceljs is ~1MB and every module that touches a product import
or export pulls this file in, so the library itself is loaded lazily inside
the two functions that actually run it (see below). A value import here put
it in the Inventory > Catalog route chunk for everyone.

### line-utils-spreadsheet-io-ts-L149

`client/lib/utils/spreadsheet-io.ts:149`

worksheet.actualRowCount is the count of NON-EMPTY rows, not the last
row's index - a sheet with any blank row (common in real QuickBooks/
Moniebook exports as a section separator) made this loop stop short and
silently drop every row after it. worksheet.rowCount is the real last
row number; the hasValue check below already skips blank rows within
that range, matching sheet_to_json's old blankrows:false behavior.

### line-utils-till-inspection-audit-ts-L34

`client/lib/utils/till-inspection-audit.ts:34`

The admin, so the pushed row names them rather than the sync token's
owner. Without it the server's log said the STORE OWNER ran the clock
override — backwards for the one repair whose premise is that the
owner is the suspected tamperer.

