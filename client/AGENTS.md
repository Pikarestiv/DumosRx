# AGENTS.md: DumosRx Client

This file exists so that any AI (or human) picking up this repo cold can get
oriented quickly and work consistently with existing conventions. Keep it
updated when architecture, conventions, or the current focus of work change:
it decays fast otherwise, and a stale doc is worse than no doc.

The standing rule for this — docs ship in the same change as the code that
makes them true, including moving a fixed finding from `docs/KNOWN_BUGS.md`
into `docs/FIXED_BUGS.md` — lives in `.agents/AGENTS.md` §2 and is not
repeated here (duplicating a shared rule per package is how the two copies
drift).

## What this is

**DumosRx** ("NextGen Retail & Store OS") is an offline-first point-of-sale
and inventory management system, built pharmacy-first but adaptable to
grocery/supermarket/general retail via a terminology layer. It ships as:

- A web app (Next.js, deployed normally)
- A **Tauri v2 desktop app** (Windows/Mac/Linux)
- An Android app (also via Tauri, see `dumosrx-release-key.jks` /
  `TAURI_ANDROID_*` env vars)

The defining architectural trait: **every screen works fully offline.** All
reads/writes hit a local SQLite database first; a background sync engine
pushes/pulls deltas to a remote server when connectivity is available. This
is not a caching layer bolted onto a normal CRUD app: it's the actual
architecture, and almost everything else in the codebase exists to serve it.

## Repo relationship: this is the client half of two repos

This repo (`DumosRx/client`) is the frontend only. The backend is a
**separate Laravel/MySQL repo**, expected to live as a sibling directory at
`../laravel-server` (see `scripts/verify-schema-sync.ts`, which diffs this
repo's SQLite schema against the Laravel server's MySQL schema to catch
drift, run `npm run test:schema` when either schema changes, and note it
needs the sibling repo checked out to actually run).

The client talks to that backend over REST (`NEXT_PUBLIC_API_URL`, see
`lib/api/`) purely for sync (push/pull deltas) and auth. The UI itself
never depends on the network being up.

## Tech stack

- **Next.js 15** (App Router), **React 19**, TypeScript
- **Tailwind CSS v4** (see `app/globals.css` for the `@theme`/`:root`
  design-token setup; colors are OKLCH, not hex)
- **TanStack Query v5** for all data fetching (see query-key conventions below)
- **Tauri v2** for desktop/Android packaging (`src-tauri/`)
- **sql.js** (WASM SQLite) in the browser; **`@tauri-apps/plugin-sql`**
  (native SQLite) inside Tauri: two different backends behind one API,
  see "Database" below
- **Zustand** for a small amount of non-query client state
- **Vitest** for unit tests (`__tests__/`), **Playwright** for e2e (`e2e/`)
- shadcn/Radix-based UI primitives in `components/ui/`

## Database & sync architecture

### Dual backend, one API

`lib/db/core.ts` exposes `query()`/`execute()`/`transaction()` that work
identically whether the app is running in a browser tab (sql.js) or inside
Tauri (`@tauri-apps/plugin-sql`); callers never branch on this themselves.
`isTauri()` detects which environment is active. The two underlying
Database objects have genuinely incompatible APIs (`.exec()/.run()` vs
`.execute()/.select()`), which is why `core.ts` deliberately leaves the `db`
handle untyped rather than describing a misleading union.

Schema lives in **`lib/db/schema.ts`** (`SCHEMA_SQL`, a big `CREATE TABLE IF
NOT EXISTS` string): this is the source of truth for the local DB shape.
`initDatabase()` in `core.ts` also runs an ad-hoc column-migration pass on
every boot (checking `PRAGMA table_info` and `ALTER TABLE ... ADD COLUMN`
for anything missing), so schema changes should go in *both* places: add
the column to the `CREATE TABLE` in `schema.ts` **and** to
`SYNC_COLUMN_MIGRATIONS` in `lib/db/schema-migrations.ts` if existing local
databases need to pick it up without a full reinstall.

**Indexes are the one exception to "both places".** They live only in
`READ_PATH_INDEXES` in `lib/db/schema-migrations.ts`, not in `SCHEMA_SQL`:
sql.js executes `SCHEMA_SQL` as a single blob, so a `CREATE INDEX` naming a
column that an old local table has not been migrated to yet aborts the
statements after it. The migration pass runs on fresh installs too, and runs
*after* the column migrations, so both populations converge on the same set.
Adding an index there also means updating the stats gate in the same
function — see `docs/LOCAL_DB_INDEXES.md` for which query each index serves
and why the `ANALYZE` step is not optional.

### Every table follows the same sync-tracking convention

Every syncable table has: `id` (UUID, client-generated via `generateId()`),
`created_at`, `updated_at`, `_version` (int, starts at 1, incremented on
every local write), `_synced` (0/1), `_synced_at`, `_deleted` (soft-delete
flag; most deletes are soft; see `remove()` vs `softDelete()` below).

### The generic CRUD helpers: use these, don't hand-roll SQL for mutations

`lib/db/base-helpers.ts` exports `insert()`, `update()`, `softDelete()`,
`remove()` (hard delete). Every one of them, on every call, automatically:

1. Writes the row to local SQLite
2. Appends an entry to `_sync_queue` (via `addToSyncQueue`) so the sync
   engine picks it up on the next push
3. Writes an activity-log entry (`logAction`)
4. Invalidates the right React Query caches (`invalidateQueriesForTable`,
   matched against each query's `meta.tables`, see query-keys below)

**This means any new feature that writes data gets sync, audit logging, and
cache invalidation for free just by calling `insert`/`update` instead of
raw `execute()`.** Only reach for raw SQL for reads, or for genuinely
bespoke multi-row writes (and even then, wrap them in
`transaction()` from `core.ts`, see `submitStockAudit` in
`lib/db/queries/inventory.ts` for the reference pattern: multiple
inserts/updates across `stock_audits`, `stock_batches`, `stock_movements`,
and `products` in one atomic transaction).

**`insert()`'s store auto-scope treats `null` like `undefined`.** It fills in
`store_id` from `getActiveStoreId()` when the caller passed `data.store_id ==
null` — a loose `==` on purpose, not a typo. A store **owner**'s own
`users.store_id` is deliberately always NULL (they "have" a store via
`stores.user_id`), so any caller forwarding `user.store_id` hands this an
explicit `null`; the old strict `=== undefined` let that through and wrote a
NULL-scoped row, which every store-scoped read (`... ${storeId ? " AND
store_id = ?" : ""}`, dozens of sites) then filtered out. The online-order
fulfilment path did exactly this and lost the money from every report — see
`docs/FIXED_BUGS.md` (SF-P2-6). Passing an explicit *other* store id still
wins, as before. Prefer `user?.store_id ?? storeProfile?.id` at call sites
anyway; don't rely on the helper alone.

**`options.correlationId`** (added 2026-09-23, all four helpers +
`logAction()` in `core.ts`) ties every `audit_logs` row one multi-step
operation writes together — e.g. a single sale's ~10-15 rows across
`sales`/`sale_items`/`stock_batches`/`stock_movements`/`customers`/
`loyalty_transactions` all share the sale's own id as `correlationId`, so
the Activity Log (`components/activity-log/`) can collapse them into one
"Sale processed (+N more)" entry instead of showing each write separately.
Generate the id up front (e.g. `generateId()`, then pass it as `data.id`
into the first `insert()` so the correlation id and the primary record's
own id are the same value) and thread it through every subsequent
insert/update/softDelete call in that operation — see
`lib/hooks/use-pos-payment.ts`'s `handlePayment` for the reference
pattern. Grouping is purely presentational (`groupByCorrelation` in
`activity-log-rows.tsx`, adjacency-only within the current page — no
SQL/pagination change), so it's safe to add to a new multi-step write
without touching the Activity Log's query/sort/search paths at all.

**Local `audit_logs` retention** (`lib/db/retention.ts`, added 2026-09-28
for A-20). `pruneSyncedAuditLogs()` runs from `sync()` on the writer tab,
at most once a day, and deletes `audit_logs` rows that are already
`_synced = 1`, have no pending `_sync_queue` entry, and are older than
`AUDIT_LOG_LOCAL_RETENTION_DAYS` (730). It uses raw `execute()`, never
`softDelete()` — these rows must not enter `_sync_queue`, because the
server keeps the full trail and a synced delete would destroy it for every
device. If you add another append-only local table with the same growth
shape, prune it here rather than inventing a second mechanism.

### Sync engine (`lib/db/sync-engine/`)

`sync(isManual, isSetup)` in `index.ts` does one push-then-pull cycle:

- **Push** (`push.ts`): drains `_sync_queue`, sends to the server, marks
  queue entries synced on success. Preserves `_version` (a past bug here,
  see commit `3352b5a`, stripped `_version` on push, which broke conflict
  detection).
- **Pull** (`pull.ts`): fetches server-side changes since each table's
  `_sync_state.last_synced_at`. **Conflict handling is deliberately
  conservative**: if a row being pulled has a pending entry in
  `_sync_queue` (i.e. a local edit not yet pushed), the pull *skips that
  row* rather than overwriting it; the next push resolves it properly via
  version comparison on the server. This means a pulled update can be
  briefly "invisible" locally if you have an unsynced edit in flight; that
  is intentional, not a bug.
- **Pull paging is resumable, and carries two cursors per table.**
  `_sync_state.last_synced_at` is the *delta window* and only advances when
  the server reports `has_more: false` for that table with no skipped
  record; `_sync_state.server_cursor` is the `(updated_at, id)` keyset
  *position* inside a still-undrained window and is written after every
  committed page, then cleared when the window is stamped. So an
  interrupted round (network failure, `MAX_PULL_PAGES`, app close) resumes
  instead of restarting, and nothing is ever declared synced that isn't.
  The request sends `page_cursor` and the legacy `page_offset` together so
  client and server can deploy independently. Do not collapse the two
  cursors into one — the server's window filter is `_synced_at OR
  updated_at`, and a row-ordered position cannot express it. Full design,
  including the `id` tie-break and the cursor's date format, is in
  `docs/SYNC_PULL_PAGINATION.md`.
- Sync failures use exponential backoff per queue item
  (`recordSyncFailure` in `base-helpers.ts`), with a one-time report to
  superadmins after `SYNC_FAILURE_REPORT_THRESHOLD` (5) consecutive
  failures on the same item.
- **`isManual` means "a human clicked Sync Now", and nothing else.** It
  bypasses per-item backoff (`getPendingSyncItems`) *and* the server's
  plan-tier sync-interval throttle (`?manual=1`), so passing it from an
  automatic caller turns both off for everyone — which is exactly what the
  `SyncIndicator` daemon used to do (see `docs/FIXED_BUGS.md`, A-5). Every
  background caller passes `false`.
- **Every request of one `sync()` call carries the same `X-Sync-Run-Id`**
  (minted once in `index.ts`, threaded through `pushChanges`/`pullChanges`),
  because the server measures its interval throttle per run rather than per
  request. A new sync path must thread it through too, or a multi-batch
  backlog will be throttled by its own first batch.
- `syncSubscriptionStatus()` is a separate, lighter-weight pull of just the
  `stores` table (tier/status/suspension), run even for free-tier stores
  that don't get full sync, so plan changes/suspensions still land.

Call `sync(true)` before any workflow where stale local data would be
actively misleading (e.g. `StockAudits` syncs on mount before showing
counts, see `components/stock-batch/stock-audits.tsx`).

## Cross-module events and `localStorage`: `lib/events.ts` and `lib/storage-keys.ts`

Required, not optional — this is the fix for A-23 (`docs/FIXED_BUGS.md`), and
the pattern that keeps it from coming back.

**`lib/events.ts` owns every cross-module `CustomEvent` this app dispatches.**
`APP_EVENTS` holds the names, `AppEventDetails` holds each one's payload type,
and `emitAppEvent(name, detail)` / `onAppEvent(name, handler)` are the only
supported way to fire and subscribe. `onAppEvent` returns an unsubscribe
function, so a React effect can `return onAppEvent(...)` directly.

```ts
emitAppEvent(APP_EVENTS.syncCompleted, { updatedTables });
useEffect(() => onAppEvent(APP_EVENTS.syncCompleted, handleSync), [handleSync]);
```

Do **not** write `window.dispatchEvent(new CustomEvent("dumos_…"))` or
`window.addEventListener("dumos_…")` by hand. A new cross-module signal means a
new entry in `APP_EVENTS` plus its detail type in `AppEventDetails` — that is
what makes the payload shape visible in one place and the name impossible to
typo apart. (Genuine DOM events — `online`, `offline`, `pagehide`,
`visibilitychange` — stay on `window.addEventListener`; this module is only for
the app's own events.)

**`lib/storage-keys.ts` owns every `localStorage` key.** `STORAGE_KEYS` is the
registry; the shared, multi-module values also have typed accessors
(`getAuthToken`/`setAuthToken`/`clearAuthToken`, `getStoredUser`/`setStoredUser`,
`getRecentUsers`/`setRecentUsers`, `getStoredActiveStoreId`/
`setStoredActiveStoreId`, `getLastSyncTime`/…) plus `readJsonItem`/
`writeJsonItem` for the rest. The accessors never throw: a missing or corrupt
value comes back as the fallback.

No new bare string key, anywhere. A module-private key still goes in
`STORAGE_KEYS` and the module aliases it (`const PEEK_KEY =
STORAGE_KEYS.sidebarPeekEnabled`), so the registry stays the one place that
lists what this app puts in a user's browser storage.

Note the deliberate naming split: `storage-keys.ts`'s
`getStoredActiveStoreId()` reads the id the API client stamps on `X-Store-Id`,
while `core.ts`'s `getActiveStoreId()` resolves the id local queries scope to.
They are two different things and must not be conflated — them silently
disagreeing is the bug `auth-context.tsx` already carries a comment about, and
the reason A-23 was filed.

## React Query conventions: read this before adding a new `useQuery`

**`lib/query-keys.ts` is a query-key *and* cache-dependency factory.**
Every entry looks like:

```ts
products: {
  withDetails: () =>
    resource(["productsWithDetails"] as const, ["products", "categories", "stock_batches"]),
}
```

Spread it straight into `useQuery`: `useQuery({ ...queryKeys.products.withDetails(), queryFn })`.
The second array (`meta.tables`) is what `invalidateQueriesForTable` (in
`base-helpers.ts` and `sync-engine/index.ts`) uses to invalidate *exactly*
the queries that could be affected by a mutation on a given table, via a
`predicate`, not prefix-matching, because several queries (dashboard,
reports, daily-close) legitimately read from more than one table. A query
with no `meta.tables` falls back to being invalidated on *every* mutation
(safe but wasteful), so always add new queries through this factory rather
than calling `useQuery` with a bare key.

## Directory map (feature areas)

```
app/(dashboard)/        Next.js routes: one folder per top-level nav item
  inventory/[tab]/       overview | catalog | ledger(movements) | audits, tabbed via one dynamic route
  procurement/           vendors, requests, PO create/edit
  settings/[tab]/        general | store | alerts | data | security | staff | system

components/
  ui/                    shadcn/Radix primitives + a few shared house patterns:
                          - filter-pill.tsx   "Label: value" dropdown filter (see below)
                          - responsive-tab-label.tsx   short label <md, full label >=md
                          - responsive-detail-panel.tsx   sheet-on-mobile / inline-panel-on-desktop
  products/               Product Catalog page + product detail panel (product-details/ subfolder)
  procurement/            Purchase orders (Standard + Immediate types), receiving
                           (ledger-style dense table). Create/edit flow is a
                           two-phase "details step → item entry" screen; see
                           Domain model essentials below.
  stock-batch/             "Inventory" tab group: overview, catalog table, movements (ledger), audits (cycle count)
  pos/                    Point of sale
  settings/                One file/folder per settings card, composed by store-settings.tsx etc.
  dashboard/               Home dashboard + DashboardHeader (route-based page titles, PAGE_ROUTES)

lib/
  db/                     Everything described above
    queries/               One file per domain (products.ts, inventory.ts, sales.ts, procurement.ts, ...)
  context/                 AuthProvider, StoreProvider (business vertical + multi-store), pull-to-refresh
  hooks/                   useFeatureGate, dashboard/report hooks
  licensing/               Offline-first license/tier checks (see below)
  api/                     Axios client talking to the Laravel backend (sync + auth only)
  query-keys.ts            See above, read before adding queries
  utils/                    date-utils, search (fuzzy), report-pdf, etc.

src-tauri/                 Tauri Rust shell (desktop/Android packaging), rarely touched from the client side
scripts/                   release.ts (version bump/release), verify-schema-sync.ts (client/server schema diff)
__tests__/                 Vitest unit tests (transactions, sync engine, calculations, parsers)
e2e/                       Playwright end-to-end specs
```

## Domain model essentials

- **Multi-vertical**: `StoreType = "pharmacy" | "grocery" | "supermarket" |
  "retail"`. `lib/context/store-context.tsx` has a `terminology` table that
  relabels generic concepts per vertical (e.g. "Product" → "Item",
  "NAFDAC Number" → "Registration No."). Pharmacy is the primary/default
  vertical; most domain-specific fields (NAFDAC number, controlled
  substance flag, prescription requirement) are pharmacy terms reused
  generically elsewhere.
- **Multi-store**: one account can have several stores; `StoreProvider`
  exposes `availableStores`/`switchStore`. Creating/managing additional
  stores happens on the *web dashboard*, not in this client, see
  `MultiStoreCard`.
- **Licensing/tiers**: `free | local | pro | enterprise`
  (`lib/licensing/licensing-manager.ts`). Includes offline clock-tampering
  detection (rejects local time earlier than the last recorded action) and
  account suspension handling. `useFeatureGate()` (`lib/hooks/`) is how UI
  components check `canUseX` and get an upgrade message, see
  `MultiStoreCard` for the pattern.
  **Tier-AND-store-toggle combined gates**: a feature that's both
  plan-gated *and* individually switchable per store (loyalty program,
  and — added 2026-09-23 — reseller/store-markup sales) follows
  `isLoyaltyProgramEnabled(tierAllows, storeToggle)`'s pattern: a small
  pure function (unit-testable without a StoreContext render harness) that
  ANDs the plan-tier `getFeature(...)` result with a `stores.*_enabled`
  column, exposed as a `canUseX` combined value from `useFeatureGate()`
  alongside the tier-only value (e.g. `canUseResellerCommission` next to
  `canUseMarkupSales`). **Always use the tier-only value, not the
  combined one, to decide whether the settings switch itself is even
  shown/enabled** — gating a toggle's visibility on the combined value
  hides the only way to turn it back on once it's off. Watch the
  toggle's *default*: loyalty defaults **on** (`storeToggle !== 0`, so
  existing users see no change), markup sales defaults **off**
  (`storeToggle === 1`, explicit opt-in) — pick per-feature, don't copy
  the sign blindly. A store that already had the underlying feature live
  (e.g. every Pro/Enterprise store already using reseller-commission
  sales before markup_sales_enabled existed) will lose access silently
  the moment a new default-off toggle ships, until the owner finds and
  flips it — a real rollout cost worth flagging when introducing one, not
  something to "fix" by quietly changing the requested default.
- **Stock audits / cycle counts** (`components/stock-batch/stock-audits.tsx`,
  `lib/db/queries/inventory.ts:submitStockAudit`): tracks three kinds of
  deviation per product (**qty**, **cost price**, **selling price**)
  against system records. Qty diffs post FEFO-ordered adjustments to
  `stock_batches` + a `stock_movements` row; cost diffs correct all active
  batches (master-data fix, not a new purchase); selling diffs overwrite
  `products.selling_price`. The audit ledger UI shows all three as live
  colored diff columns. `products` also now surfaces `last_audited_at`
  (derived via `MAX(stock_audits.reconciled_at)`, joined in
  `getProductsWithDetails()`), shown on the product detail panel with a
  90-day-stale warning banner.

- **Purchase Orders: Standard vs Immediate** (`lib/db/procurement.ts`,
  `components/procurement/`). `purchase_orders.type` (`'standard' |
  'immediate'`) is separate from `status` (`PURCHASE_ORDER_STATUSES` in
  `lib/db/procurement.ts`: `'pending' | 'sent' | 'partially_received' |
  'received'`) and is
  set once at creation, never changed: a **Standard** PO is created
  `pending` via `createPurchaseOrder()` and received later through the
  existing `ReceivePOPanel`; an **Immediate Purchase** is created *and*
  received in one atomic transaction via `createAndReceivePurchaseOrder()`
  (status `received` from the moment it's inserted, stock batches created
  in the same call). Both share one item-entry UI
  (`POItemBuilder`/`POItemLedgerTable`/`POItemCardList`,
  `POLineItemDraft` type), which renders a different column set per
  `poType` rather than being two separate tables.
  `purchase_orders.supplier_id` is **nullable** — a self/walk-in purchase
  (no real vendor) is represented as `NULL`, the same convention
  `sales.customer_id` uses for "Walk-in Customer"; the UI sentinel
  `SELF_PURCHASE_VENDOR_ID` (`components/procurement/po-details-fields.tsx`)
  is mapped to `null` at submit time, never stored as a real id. Never
  reintroduce a seeded "Walk-in Purchase" supplier row — it was
  deliberately rejected in favor of nullable FK, see the schema-migration
  comment in `lib/db/core.ts` (search `purchase_orders_nullable_supplier`)
  for why (per-store local DBs, sync, and the Vendors list all would have
  to special-case a fake row).
  The create/edit page is a **two-phase flow**: `PODetailsFields` (vendor,
  type, notes, payment, due date) is filled first, then item entry
  (`POItemBuilder`) becomes the dominant full-screen content; once
  confirmed, details collapse into `PODetailsSummaryBar` with an
  icon-only edit button that reopens `PODetailsDialog`. Don't put the
  details form and the item table on screen at the same time again — that
  was the exact complaint (Moniebook-inspired) this flow replaced.
  `purchase_order_items` also persists `selling_price`,
  `cost_price_override`, `lot_number`, `expiry_date` (added 2026-09-23) so
  an Immediate Purchase saved as a draft and resumed later keeps what was
  typed — coerce these via `coerceOptionalNumber()` (`lib/db/procurement.ts`),
  which explicitly treats `null` (what a reloaded row's unset override
  reads back as) the same as `undefined`/`""`: `Number(null) === 0` will
  silently turn "no override" into a real, permanent zero if you bypass
  it. The **edit page reads the PO's real `type`** (not hardcoded
  `"standard"`) to decide which columns to show — it used to assume only
  Standard POs are ever resumed via "Edit Order," which was wrong (any
  `pending`/`sent` PO gets that button, including an Immediate draft).

- **Partial PO receipts** (added 2026-09-26, `lib/db/procurement-receiving.ts`).
  Receiving used to be all-or-nothing: any submitted quantity flipped the
  whole PO to `received` and a guard (`status === "received"`) then blocked
  it forever, so a short delivery — routine in real procurement — silently
  forfeited the undelivered balance with no path back into the system.
  `purchase_order_items.quantity_received` now tracks the cumulative
  received quantity per line, **in the same unit as `bulk_quantity`**, and
  `receivePurchaseOrder()` only flips to `received` once every line reaches
  its ordered quantity; otherwise the PO becomes `partially_received` and
  stays receivable against its outstanding balance. Rules worth knowing
  before touching this:
  - `outstandingBulkQuantity()`/`clampReceivedQuantity()`
    (`components/procurement/po-line-item-math.ts`) are the single source of
    truth for "what's still expected" and for clamping the qty input. Both
    receiving surfaces (`ReceiveLedgerTable` on tablet+, `ReceiveItemCard` on
    phones) prefill and clamp to the **outstanding** balance, not the ordered
    quantity — a row written by an older build reads back null and is treated
    as fully outstanding.
  - A submit with every line at 0 against a PO with nothing received yet is a
    deliberate no-op (status untouched), not a partial receipt.
  - "Edit Order" is still gated to `pending`/`sent` only, and that matters:
    `updatePurchaseOrder()` soft-deletes and re-inserts every line, which
    would discard `quantity_received`. Don't widen that gate to
    `partially_received` without reworking that function first.
  - **Sync**: the client sends `quantity_received` in bulk units, but the
    server stores it in base units, because `SyncController::push()` scales
    `quantity_received` by `units_per_bulk` exactly as it already does for
    `quantity_ordered` — and it only does so when `bulk_quantity` and
    `units_per_bulk` are both in the payload. A sync-queue `UPDATE` payload
    carries changed fields only, so `receivePurchaseOrder()` deliberately
    re-sends those two columns unchanged alongside `quantity_received`. Drop
    that and the column syncs at the wrong scale. Server counterpart:
    `2026_09_26_000001_add_quantity_received_to_purchase_order_items.php`
    plus the mirrored branch in `Services/Web/SyncPayloadMapper.php`.

## Receiving cost scale, and what "cost" means where

`unit_cost` on a `purchase_order_items` row is **per bulk unit** (per
carton/pallet); every cost *override* a user types — the Immediate Purchase
flow's "New Cost" and the Receive panel's "Cost Price" — is **per base
unit** (per tablet/bag). `resolveBaseUnitCost()`
(`components/procurement/po-line-item-math.ts`) is the single place that
conversion happens; `getImmediateUnitCost()` delegates to it and
`receivePurchaseOrder()` (`lib/db/procurement-receiving.ts`) calls it
directly instead of re-deriving the division inline, which is how the two
flows drifted before. Both receiving surfaces label the input "per
{base_unit}" and placeholder it with the per-base-unit figure, because the
quantity field right above them is in *bulk* units and the old
`item.unit_cost` placeholder read as per-carton.

**Each `stock_batches` row keeps the singular cost it was received at, and
that is the figure margin/COGS and FEFO deduction use.** The averaged
`cost_price` that `getProductsWithDetails()` and friends derive is a
**display/reporting** figure only — nothing computes on it. A small new
batch barely moves a large displayed average, which reads as "the cost I
typed didn't save"; `notifyCostRecorded()` in `lib/hooks/use-purchase-orders.ts`
is the confirmation that says otherwise, and the receive inputs show the
product's Last Bought Price (the last real, non-`ADJ-%` batch cost)
alongside. Keep that distinction in any copy you write here.

`purchase_order_items.unit_cost` is deliberately **not** rewritten on
receipt: it is what was ordered, the PO's own total and `amount_paid`
reconcile against it, and a partial receipt would revalue the outstanding
balance. New POs already prefill from a real `AVG(cost_price)` via
`getActiveProductsForPO()`, so nothing needed it.

## Enforced permissions

`ENFORCED_PERMISSION_KEYS` (`lib/constants/permissions.ts`) lists the keys
with a real call site; the Roles & Permissions matrix reads it to mark the
rest as not-yet-wired. That mark is **customer-facing copy on a screen real
store owners use**, so it reads as a product roadmap note, not a dev TODO:
an outline `Badge` saying "Coming soon" (matching `data-settings-auto-sync.tsx`'s
"Pro Feature" badge), with the tooltip "This permission is coming in a future
update. Your choice is saved now, and will start granting or restricting
access as soon as it's available." Keep the honest meaning — an owner who
thinks they have restricted an employee and has not is worse off than one
told "not yet" — and keep the checkbox toggleable so they can pre-set it;
only the wording is product-voiced. `apply_discounts` joined it on 2026-09-28:
`components/pos/pos-cart.tsx` hoists `useHasPermission("apply_discounts")`
to an unconditional top-level const (never inside a `&&`, see the
hook-count crash documented in `pos-layout-header.tsx`) and gates the
"+ Add discount" button and the discount editor on it. A discount **already
on the cart** — a resumed held sale, or one that came from a loyalty
redemption — still renders read-only for a cashier without the permission:
only creating or editing one is gated. Loyalty redemption
(`pos-redeem-reward.tsx`) is intentionally independent of this key; it is a
customer-earned entitlement, not a staff price concession. The desktop cart
and the mobile drawer both render the same `POSCart`, so there is one gate,
not two.

The matrix's own markup changed shape on 2026-09-28: it is now div/grid/ARIA
(`role="table"` / `"rowgroup"` / `"row"` / `"columnheader"` / `"cell"`) like
every other table in the app, not a raw `<table>`. A future
permission-category pass adds rows by rendering another `role="row"` grid
with the shared `gridStyle`, and queries them in tests by `[role="row"]`
rather than `tr`. The header rowgroup carries `sticky top-0` and each row's
first cell `sticky left-0`; the scroll box is a `ScrollFade` that takes its
height from the Settings panel (`h-full` on the roles `TabsContent` plus
`flex-1 min-h-0` here), so don't reintroduce a fixed pixel height.

On phones it stays **one matrix, horizontally scrolled**, the dense-ledger
treatment (`overflow-x-auto` + pinned name column), not the card-list swap
`supplier-table.tsx`/`activity-log-page.tsx` do: a permission is only
meaningful next to the groups it is compared against, and a card per
permission with one line per group is longer and harder to scan than the
grid. The name column is `minmax(min(45vw,220px),1.5fr)` so it gives back
width on a narrow screen instead of eating it; group columns floor at
110px. If the group count ever makes this genuinely unusable, the next step
is a group filter above the matrix, not a per-permission card list.

Four more Sales & POS keys joined it on 2026-09-28, all following the same
pattern (unconditional top-level `useHasPermission()` const, existing state
still rendered read-only, only the trigger gated):

- `override_price` — `components/pos/pos-cart-item.tsx`. The reseller /
  store-markup unit-price input is the app's **only** "type a different
  price for this line" surface; without the permission the line falls back
  to the read-only `{price} each` label, so a markup already on a resumed
  cart still shows. It is floored at the product's own price (it can raise a
  line, never discount it), which is why `sales_staff` was **granted** this
  key in `DEFAULT_GROUP_PERMISSIONS` when enforcement landed — the cashier
  is who rings reseller sales, and withholding it would have made the
  Reseller toggle inert at the till. `specialist` deliberately still lacks
  it (stock role, matching its existing `apply_discounts` exclusion).
- `hold_sales` — `components/pos/pos-cart.tsx` (the "Hold Sale" button, plus
  `SECONDARY_ACTION_GRID_COLS`, a literal-class lookup that keeps the
  secondary-action grid honest now that its column count varies) and
  `components/pos/held-transactions-dialog.tsx` (the "Recall" button).
  Creating a hold and resuming one are both gated; the amber "N on hold"
  banner and the held list itself are not, so a cashier without the right
  can still see a colleague's sale is parked on this till. The dialog's
  "Discard" button is deliberately **left ungated** — discarding is neither
  holding nor resuming, and `void_refund_sales` is the nearest destructive
  key; revisit if that reads wrong in practice.
- `view_sales_history` — `components/pos/pos-main-tab-nav.tsx` (the "Recent
  Sales" trigger) and `components/pos/pos-system.tsx` (the panel itself and
  the `resolvedTab` fallback, because `?tab=history` is reachable by URL, so
  hiding the trigger alone is not a gate). This is **"does the tab exist at
  all"** and is cleanly separable from `view_activity_log`, which answers
  **"whose sales appear in it"** (`pos-transaction-history.tsx` scopes
  `getRecentSales` to the acting user without it). The two compose: no
  history key, no tab; tab but no activity-log key, own sales only.
- `reprint_receipt` — `components/pos/transaction-details-dialog.tsx`
  ("Print Receipt" and the "Print Tax Invoice" dropdown beside it). The
  receipt shown straight after checkout (`pos-receipt-dialog.tsx`) is part
  of `process_sales` and stays ungated; this is only the after-the-fact copy
  pulled out of transaction history. `proforma-preview-dialog.tsx` prints a
  quote, not a receipt, and is likewise untouched.

`run_daily_close` joined them on 2026-09-29, and the finding that got it
there **overturns the previous pass's conclusion**, which had looked only at
`daily-close-actions.tsx` (Print / Export CSV / Export PDF) and called Daily
Close a read-only report with nothing to run. The action row is not the only
thing on that screen. `daily-close/daily-close-header.tsx` — the
"Daily Close Ready … use this for end of day reconciliation" banner — carries
**two buttons that were missed**, and they are the only controls on the whole
Daily Close surface that write anything:

- **Download Local Backup** → `useSettings()`'s `handleDownloadBackup`, which
  serialises **the entire SQLite database** to a `.drx` file (via
  `backupDatabaseToFile()` under Tauri, a `Blob` download on web).
- **Cloud Sync Now** → `handleSync(true)`, a forced full push/pull round.

Those are the same two operations `data-settings.tsx` offers on the Data &
Sync tab, which sits behind `backup_restore_data` — so the Daily Close banner
was a **real leak**: every role, `sales_staff` included, could take a
complete copy of the store's database off the device from the Reports page,
by a route the Settings gate never covered. That is the strongest argument
for the key: there is no ledger-locking "close the day" write in this app
because the close **is** securing the day's data, and this banner is where it
happens.

So `run_daily_close` gates the banner's action group (one hoisted
`useHasPermission()` const, hide-the-trigger-preserve-the-state as usual);
the alert text, and the whole report below it, stay readable by every role.
The previous pass's other conclusion still stands and is **deliberately kept**:
the report *view* is **not** gated — a cashier plausibly needs to see their
own day's numbers, Daily Close is the `/reports` fallback panel for a role
without `view_reports`, and gating the view would leave such a role on a page
with no panel at all. Reading the day is open; running the close is not.

This is a **deliberate narrowing with no compensating grant** —
`specialist`, `sales_staff` and `auditor` lose both buttons — and the usual
"reproduce today's behaviour" rule is *not* applied here, because the
behaviour being reproduced is the leak. `run_daily_close`'s default holders
(admin, manager) are exactly `backup_restore_data`'s, so the two gates agree
on day one; if a store ever diverges them, AND the backup button with
`backup_restore_data` too rather than re-opening it.

The other four Sales & POS keys were **removed from the catalog** on
2026-09-29 — see "Removed from the catalog" below.

Twelve **Inventory & Stock** keys followed on 2026-09-28, in the same
category-by-category pass. This category is where the migration **from
coarse role gates to per-permission gates** actually starts paying off, so
several of these are conversions rather than brand-new gates — each one is
noted below with what it widens or narrows:

- `view_cost_fields` — `components/products/catalog-list.tsx` +
  `catalog-row.tsx` (the Avg Cost column, header and cell, removed
  together via `CATALOG_GRID_COLS` so the grid doesn't leave a blank
  column) and `components/products/product-details/product-pricing-info.tsx`
  (Avg Cost Price, Last Bought Price and the whole profit block). This
  **closes a real leak**: only the profit block was gated before (by a
  direct `user?.role !== "sales_staff"` check); the cost figures above it
  were shown to every role, cashiers included, on two screens a cashier can
  reach. The key's defaults (admin/manager/specialist/auditor, never
  `sales_staff`) reproduce that old role check exactly, so the profit block
  is behaviour-neutral and only the cost figures change.
- `edit_product_price` — `catalog-row.tsx` (the selling-price quick edit)
  and `components/stock-batch/audit-ledger-step.tsx` (the Counted Selling
  cell). `edit_product_cost` — `audit-ledger-step.tsx`'s Counted Cost cell,
  the app's only master-data cost-correction surface (cost is otherwise a
  per-batch acquisition figure set by receiving). A withheld key leaves the
  figure on screen read-only in both places, but the **two surfaces are
  protected differently**. In `catalog-row.tsx` the new key *composes* with
  the existing coarse check rather than replacing it —
  `canEdit && canEditSellingPrice`, where `canEdit` is
  `canManageStockBatch`. In `audit-ledger-step.tsx` there is **no direct
  `canManageStockBatch` check at all**: the file holds only the two
  `useHasPermission` consts, and the coarse protection sits **upstream**.
  The audit screen renders only while `isAuditing` is true
  (`components/stock-batch/inventory-audit-overlay.tsx` returns `null`
  otherwise), and `lib/hooks/use-stock-batch-management.ts` now sets
  `isAuditing` only when `perform_stock_audit` is held — so the whole audit
  flow is gated before the Counted Cost/Counted Selling cells are ever
  reached. Don't "restore" a per-cell `canManageStockBatch` composition
  there expecting parity with the catalog row; the gate is the audit
  entry point. The Add Product
  form's Selling Price input is deliberately **not** gated: it is part of
  creating the product at all, which is `manage_products`.
- `adjust_stock_counts` — `catalog-row.tsx`'s stock-quantity quick edit.
  This is a real, discrete feature and not a duplicate of
  `perform_stock_audit`: the quick edit is a single-product correction
  that goes through `submitStockAudit()` as a one-item reconciliation,
  whereas the audit is the whole cycle-count flow.
- `perform_stock_audit` — `components/dashboard/dashboard-header.tsx`
  (Start Audit, desktop), `components/stock-batch/stock-batch-management.tsx`
  (the mobile button) and `lib/hooks/use-stock-batch-management.ts` (the
  `/inventory/audits` route effect, which is the real gate — the route is
  typeable). **Converted from `isAdmin`**, which widens it to `specialist`,
  the stock-owning role that already held the key by default.
- `view_stock_adjustment_history` — `stock-batch-tab-nav.tsx` (the
  Movements tab), `stock-batch-management.tsx` (its panel) and
  `use-stock-batch-management.ts` (the `/inventory/ledger` redirect and
  prefetch). **Converted from `canManageStockBatch`**, which widens it to
  `auditor` — a read-only role gaining a read right, and nothing else.
- `manage_purchase_orders` — `components/procurement/purchase-order-details.tsx`
  (Edit Order, Delete, Mark as Sent), the `/procurement/new` and
  `/procurement/edit` routes via `RequireRole`'s new `permission` prop, and
  the Procurement header's "Create Order" via `PAGE_ROUTES.actionPermission`.
  `receive_purchase_orders` — the same panel's Receive Goods / Receive
  Balance. Splitting these two is the point: booking a delivery in is a
  different job from raising or amending the order it arrived against, and
  a stockroom account can now be allowed one without the other. Both keys'
  defaults match `canManageStockBatch`'s population exactly
  (admin/manager/specialist), so the conversion is behaviour-neutral on day
  one. Download PDF and the order itself stay ungated.
- `manage_suppliers` / `view_suppliers` — the add/edit and read thirds of
  the supplier split. `manage_suppliers` gates
  `components/stock-batch/supplier-detail-pane.tsx`'s "Edit Details" (the
  action row falls back to "New Order" across the full width),
  `supplier-table.tsx`'s inline rating quick-edit and empty-state "Add
  Supplier", `supplier-management.tsx`'s `?action=add` handler, and the
  Vendors header action. `view_suppliers` gates
  `components/procurement/procurement-tab-nav.tsx`'s Vendors tab and the
  `/procurement/vendors` route via `RequireRole`.
- `request_stock_transfers` — `components/pos/pos-layout-header.tsx`. Note
  the **two mechanisms that already existed** and how they reconcile: the
  store-wide `store_profile.staff_can_request_transfers` toggle is *not*
  an older version of this key, it is a different axis, and both still
  apply. The composition is now
  `process_sales && request_stock_transfers && (manage_staff || staff_can_request_transfers)`
  — the key is the acting group's own right, the toggle is the store's
  opt-in for non-admin-tier accounts. `sales_staff` was **granted** the key
  in `DEFAULT_GROUP_PERMISSIONS` at the same time: the toggle exists
  precisely so cashiers can pull stock in, and ANDing it with a key they
  lacked would have silently killed that feature in every store using it.
  Unticking the key now actually withholds the button, which it previously
  did not.
- `export_product_list` — `components/stock-batch/import-export-toolbar.tsx`'s
  Export dropdown (CSV / XLSX / PDF). Import is a different right and stays
  under `manage_products`, so the toolbar keeps a working control. `auditor`
  was **granted** this key in `DEFAULT_GROUP_PERMISSIONS` — the dropdown is
  reachable by every role today and an auditor already holds
  `export_reports`, so withholding it would have been a narrowing. It *is*
  a deliberate narrowing for `sales_staff`, who could previously export the
  whole catalog including its cost columns.

Two pieces of shared plumbing came out of this and are reusable for the
remaining categories:

- `RequireRole`'s `permission` prop (`components/auth/require-role.tsx`) —
  a specific key required **on top of** the coarse
  `isAdmin || canManageStockBatch` baseline, never instead of it, so
  converting a route never widens it by accident. `RequireRole` is the only
  enforcement point for these routes in a local-first app with no server
  guard, so a typeable URL must redirect, not just hide a link.
- `PAGE_ROUTES.actionPermission` + `resolveHeaderAction`'s trailing
  `hasActionPermission` callback (`lib/constants/dashboard-page-routes.ts`).
  The callback defaults to granting everything, so unannotated routes and
  existing callers are untouched.

`print_product_labels` joined the enforced list on 2026-09-29, and this too
**overturns the previous pass** — not its evidence, which was right, but what
it concluded from it. `barcode-print-dialog.tsx` and `barcode-label-sheet.ts`
are real, complete and tested; the dialog's only mount was in
`stock-overview.tsx`, keyed off a `selectedProduct` state whose setter was
never called from anywhere. That is not "no feature exists" — it is a
finished feature with no door. The previous pass left both the feature and
the key dormant; the right answer was to hang the door, which is a
four-line change:

- `components/products/catalog-detail-panel.tsx` — the overflow menu on the
  catalog detail panel already existed and held exactly one item ("Edit
  Product"). A "Print Labels" item joins it, gated on a hoisted
  `useHasPermission("print_product_labels")` const, and the panel owns the
  dialog's open state locally. The **menu button itself** is now
  `canManageStockBatch || canPrintLabels` rather than `canManageStockBatch`
  alone, with "Edit Product" gated individually underneath, so a group with
  the print right and no edit right still gets a menu instead of nothing.
  It gained an `aria-label="Product actions"`; it was an unlabelled icon
  button before.
- `components/stock-batch/barcode-print-dialog.tsx` — its prop type narrows
  from `POSProduct` to a new exported `BarcodeLabelProduct`
  (`id`/`name`/`barcode?`/`unit_price`), which is exactly the four fields a
  label carries. `POSProduct` satisfies it structurally, and the catalog's
  camelCase `ProductViewModel` maps onto it at the call site
  (`sellingPrice` → `unit_price`), so no product shape had to change.
- `components/stock-batch/stock-overview.tsx` — the dead mount, its dead
  `selectedProduct` state and the now-unused imports are gone.

Defaults are **unchanged and behaviour-neutral**: the key's holders (admin,
manager, specialist) are exactly `canManageStockBatch`'s population, which is
who could open that menu before, and the item it sits beside is new — nobody
loses anything they had.

`delete_products` and `delete_suppliers` joined the enforced list on
2026-09-29 as well, and they are the **third** reversal of that morning's
removal pass — but a different kind. `run_daily_close` and
`print_product_labels` were re-investigation errors: the feature was there
and the pass missed it. These two were not. The removal finding was
factually correct (no `deleteProduct`/`deleteSupplier` query, no
`softDelete()` call site, no menu action, `useDelete()` with zero callers)
and the conclusion drawn from it — "a key with no action does not sit in the
catalog" — still stands. What changed is the **product** decision: not being
able to delete a product or a vendor is a real gap, so the action was built
and the key came back with it, in the same commit, exactly as the standing
rule requires.

**The deactivate-vs-delete design, and why it differs per entity.** Both are
soft deletes (`softDelete()`, `_deleted = 1`, a `DELETE` on the sync queue),
never `remove()`. Neither cascades: nothing rewrites `sale_items`,
`purchase_order_items` or `stock_batches`. That is safe **only because every
historical join is a plain `JOIN`/`LEFT JOIN` with no `_deleted = 0` filter
on the joined side** — `reports.ts`'s top-products/category queries join
`products` bare, and `procurement.ts` / `local-database.ts` LEFT JOIN
`suppliers` bare — so a deleted product's or vendor's **name still resolves
on the records it already appears in**. Deleting removes it from the
catalog, the till and the directory; it does not rewrite history. If a future
change ever adds `_deleted = 0` to one of those joins, these deletes silently
start erasing report rows — that filter is load-bearing in its absence.

**That absence is pinned by tests, not just by this note** (added 2026-09-29).
Each one seeds a product/vendor, records history against it, soft-deletes it
through the real `deleteProduct()`/`deleteSupplier()`, then runs the actual
query function and asserts the historical row still resolves the name. All
sixteen go red the moment a `_deleted = 0` filter is added to the join they
protect (verified by temporarily adding one to every join below):

- `__tests__/deleted-product-report-history.test.ts` — `reports.ts`:
  `getBIMetrics()`'s `topSellingByRevenue` / `topSellingByQuantity` /
  `categoryDistribution` / `productPerformance`, `fetchTopSellersReportData()`,
  and `getPurchasePatterns()`'s `slotCategoryData`.
- `__tests__/deleted-product-sales-history.test.ts` — `sales.ts`:
  `getSaleItems()`, `getTransactionDetails()`, `getRecentSales()`'s
  `item_names`, `getDailyCloseData()`'s `itemsToday`; plus `customers.ts`'s
  `getCustomerTransactions()` `item_names`. (`getResellerCommissionSales()`
  carries the same `item_names` subquery and the same comment.)
- `__tests__/deleted-entity-procurement-history.test.ts` — `procurement.ts`:
  `getPurchaseOrders()` and `getPurchaseOrderById()` (`vendor_name`, which
  falls back to "Self / Walk-in Purchase" if the vendor join is filtered) plus
  their product joins, `getPurchaseOrderItemsForDetail()`;
  `local-database.ts`'s `getStockMovements()` / `getStockAdjustments()`
  (product **and** supplier name); and `stock-transfers.ts`'s
  `getStockTransferHistory()` source/destination product names.

Every one of those joins now also carries a two-line comment at the join
itself pointing back here, so the warning is visible where the edit would be
made. `reports.ts`'s `fetchStockBatchReportData()` and `inventory.ts`'s
expiry/oversold/fast-mover reads are **not** in that set: they already filter
`m._deleted = 0` on purpose, because they report on *current* stock rather
than on history.

- `delete_products` — `components/products/catalog-detail-panel.tsx`'s
  overflow menu (a third item beside Edit Product and Print Labels, opening
  `components/products/product-delete-dialog.tsx`), backed by
  `deleteProduct()` in `lib/db/queries/products.ts`. **Two blockers, both
  hard**: stock on hand across the product's active batches, and membership
  of a still-receivable purchase order
  (`pending`/`sent`/`partially_received`). `getProductDeletionBlockers()`
  reads both in one pass; the dialog reads it for **wording** and
  `deleteProduct()` re-checks it for **enforcement**, so a stale dialog
  cannot slip a delete through. The reasoning is the same shape as the
  customer dialog's "settle the balance first": stock batches are not
  cascaded, so deleting a product with stock leaves those units still
  counted in total stock value (`local-database.ts`'s
  `WHERE _deleted = 0 AND is_active = 1` sums batches, never joining
  `products`) with no product to show for them — an inventory figure that
  cannot be reconciled to anything. An open PO is the same harm arriving
  later: receiving books new batches against `product_id`, so the delivery
  would create stock for a product that no longer exists. **Sale history is
  deliberately not a blocker** (per the join note above). There is
  **no "deactivate" alternative offered for products, on purpose**:
  `products.is_active` is read in exactly **one** place — the inventory
  dashboard's counters in `lib/db/queries/inventory.ts`'s
  `getStockBatchStats()`, which tests `p.is_active = 1` three times, for
  `active_products`, `low_stock_count` and `critical_stock_count` — so an
  `is_active = 0` product already silently drops out of those three figures
  today, and out of nothing else. The write path can already produce a `0`:
  `components/products/add-product-dialog.tsx` sends
  `is_active: status === "active" ? 1 : 0` from a `status` form field (no
  visible control is currently wired to set it to anything but `"active"`,
  but the code path exists). So the column is neither write-only nor
  fully-read — it is a half-wired flag. Building a real deactivate feature
  on it would still mean adding a new `is_active` filter to **every**
  catalog/POS/report read before it could safely gate visibility anywhere,
  which is a much larger and riskier change than this feature warrants, and
  would silently hide products in any store whose imported rows already
  carry `is_active = 0`. That — not an unused column — is why the
  delete-feature work chose a guarded soft-delete instead.
  A product with no stock and no open order is already functionally
  "deactivated" by having nothing to sell; the delete is what removes the
  row from the picker.
- `delete_suppliers` — `components/stock-batch/supplier-detail-pane.tsx`'s
  action row (a "Delete Supplier" outline button beside Edit Details and New
  Order, opening `components/suppliers/supplier-delete-dialog.tsx`), backed
  by `deleteSupplier()` in `lib/db/procurement.ts`. The row's column count is
  now a literal-class lookup (`ACTION_GRID_COLS`, same mechanism as
  `CATALOG_GRID_COLS`/`SECONDARY_ACTION_GRID_COLS`) because it varies from
  one to three buttons with the two keys. It sits in the **detail pane, not
  `supplier-table.tsx`'s rows**: the table has no row menu at all (its only
  row affordance is the inline rating pencil), and a destructive action on a
  row you may have clicked by accident is the wrong place for one.
  **One blocker**: money still owed, summed by
  `getSupplierOutstandingBalance()` over unpaid purchase orders — the exact
  mirror of `customer-delete-dialog.tsx`'s guard, from the payable side
  instead of the receivable one. Deleting a vendor you still owe erases the
  payable from the directory's "₦X owed to N suppliers" summary while the
  orders stay on the books. **Order history is not a blocker.** Unlike
  products, suppliers **do** have a real, user-editable deactivate state —
  `suppliers.is_active`, set by the Add/Edit Supplier dialog's Active toggle
  and shown as the Active/Inactive badge on this very pane — so the
  non-blocking delete dialog **names it**: "If you only want to stop ordering
  from them, set them to Inactive under Edit Details instead." That is the
  asymmetry in one line: products get a guard because they have no softer
  option, suppliers get a signpost because they do.

Defaults follow the catalog's standing rule that `delete_*` keys are
admin/manager only: `manager` holds both, `specialist` (the stock-owning
role) holds neither despite holding every other Inventory & Stock write key,
and `sales_staff`/`auditor` hold neither. The safety-check design does not
change that calculus — the guards stop a *destructive mistake*, not an
*unauthorised* one, and a store that wants its stock specialist deleting
dead catalog rows ticks one box. Nothing narrows on day one, because neither
action existed before.

`approve_stock_transfers` joined the enforced list on 2026-09-29 too, and it
is the **fourth** reversal of that morning's removal pass — and, like the two
deletes, a product decision rather than a missed file. The removal finding
was re-traced from scratch and every line of it holds: `transferStock()`
(`lib/db/queries/stock-transfers.ts`) deducts the source batches FEFO,
opens the destination batch and writes **both** `transfer_out`/`transfer_in`
movement rows inside one `transaction()`, so the stock lands the instant the
dialog is submitted; `needs_review` is set on both legs only when
`checkIsAdmin(initiatedByRole)` is false, i.e. a non-admin initiator; and
nothing anywhere read that status except two amber badges
(`stock-movement-desktop-row.tsx`, `stock-movement-mobile-group.tsx`) that
the detail modal did not even repeat. No pending queue, no accept/reject.
The label was the lie, not the mechanism.

**Option A (a real approval queue) was considered and deliberately not
built.** The decisive argument is not risk, it is that the flow does not
have two parties in the places an approval queue assumes:

- **The requester IS the destination.** `transfer-stock-dialog.tsx` pins
  `destStoreId` to the acting store for a non-admin (`isAdmin ?
  manualDestStoreId : activeStoreId`) precisely so a cashier can only PULL
  stock in, never push it out. An "confirm it arrived at the destination"
  gate would therefore be the cashier approving their own request. The party
  with an exposure here is the **source** store, which is losing stock, and
  the person who should check is the **owner**, after the fact — which is
  exactly the shape `needs_review` already has.
- `receive_purchase_orders` is not the precedent it looks like. A supplier
  delivery has a genuine gap in time and custody between ordering and
  arrival; a store-to-store transfer in this app is one atomic local write
  across two stores on the same synced database.
- The data model actively resists it. The header note at the top of
  `stock-transfers.ts` records why there is no `stock_transfers` table: a
  new table needs a matching Laravel migration before it can round-trip
  through cloud sync, and a pending transfer held in an unsynced local table
  would be invisible on every other terminal. A pending state is exactly the
  thing that must sync. With a live multi-store customer on this flow since
  2026-09-25, that is a change that needs product sign-off and a server-side
  commit, not a permission pass.

**Option A stays on the table as a follow-up** if a store ever reports
receiving-end disputes ("it says it arrived, it never did"); it would need a
synced pending state (server migration included) and would change the
multi-store UX for anyone already using transfers. Do not ship it off the
back of this entry.

So **Option B**: the existing flag was made actionable, and the key's label
changed with it — `approve_stock_transfers` is now **"Review Stock
Transfers"**, not "Approve Incoming Stock Transfers", because the label must
describe what the key gates. It gates the **"Mark Reviewed"** action in
`components/stock-batch/stock-movement-detail-modal.tsx` (one hoisted
`useHasPermission("approve_stock_transfers")` const, as usual), backed by
`markStockTransferReviewed()` in `lib/db/queries/stock-transfers.ts`.

- The action lives in the **detail modal, not the ledger row**. The rows are
  virtualized and the whole ledger is click-to-open; the same reasoning that
  put Delete Supplier in the detail pane rather than the table applies.
- It clears **both legs by `reference_id`**, not the one row that was opened
  — reviewing the out leg and leaving the in leg flagged is meaningless. Each
  leg is updated under its **own `store_id`**, never the acting store's,
  because the two legs live in two different stores by definition and
  `update()`'s `assertStoreOwnership` would otherwise reject one of them.
- Status goes to **`"reviewed"`, not `null`**. Blanking it would make a
  reviewed transfer indistinguishable from one that was never flagged, so
  the ledger now carries a muted "Reviewed" badge beside the amber "Needs
  Review" one. `stock_movements.status` is a nullable string on **both**
  sides already (client `schema-migrations.ts`, server
  `2026_09_23_000003_add_status_to_stock_movements.php`), so this needed **no
  schema change on either side** — which is the other half of why Option B
  was safe to ship today and Option A was not.
- It is **idempotent**: it only ever selects rows still sitting at
  `needs_review`, so a second click, or two devices reviewing the same
  transfer, writes nothing and reports 0. The modal says "already reviewed"
  rather than failing.
- The amber flag itself stays visible to **every** role that can open the
  ledger; only the button to clear it is gated. A group without the key sees
  that a transfer needs checking and cannot sign it off.

Defaults: `manager` holds it (restored), admin holds everything.
`specialist` deliberately does **not**, despite holding every other
Inventory & Stock write key including `request_stock_transfers` — it is the
one key in this category that tracks `manage_staff`'s population rather than
the stock role's, because a stock specialist signing off their own transfer
request is the exact thing the flag exists to prevent. `sales_staff` and
`auditor` hold neither. Nothing narrows on day one: the action did not exist
before.

The one remaining Inventory & Stock key, `manage_stock_batches`, was
**removed from the catalog** on 2026-09-29 — see "Removed from the catalog"
below.

Both **Prescriptions** keys followed on 2026-09-28, in the same pass. The
category is small and was **completely ungated before this** — the
`storeType === "pharmacy"` nav check (`dashboard-sidebar.tsx`,
`mobile-more-drawer.tsx`) and the plan's `LockedModuleOverlay` decide
whether the *module* exists for the store, and nothing decided what a given
role could do inside it. That store-type gate is a different axis and still
applies; these keys sit on top of it, they do not replace it.

The split between the two keys is **the record's data vs. the fulfilment
pipeline**, which is the distinction their labels already draw:

- `manage_prescriptions` ("Manage Prescription Records") — what the doctor
  wrote. `lib/hooks/use-prescription-management.ts` gates
  `showNewPrescription`, which is the **real** gate: `?action=add` and
  `?edit_rx=<id>` are typeable, so the full-screen create/edit overlay has
  to require the key itself. `components/prescriptions/prescription-detail-panel.tsx`
  gates the "Edit" button, and `PAGE_ROUTES`' `/prescriptions` entry gained
  `actionPermission: "manage_prescriptions"` for the header's "New
  Prescription" (wired through `dashboard-header.tsx`'s
  `hasActionPermission` callback, same as Vendors and Procurement). Note it
  takes `actionPermission` **without** `actionAdminOnly` — the action was
  never role-gated, and adding the coarse `canManageStockBatch` baseline
  underneath would have narrowed it for reasons unrelated to this key.
- `dispense_prescriptions` ("Dispense Prescriptions") — medicine leaving
  the shelf, and the **whole pipeline** that ends in it, not just the last
  click: `prescription-detail-panel.tsx`'s "Process" (pending →
  in_progress), "Mark Ready" (in_progress → ready), "Dispense" and
  "Dispense Refill". Those status transitions are dispensing work, not
  record data — a pharmacy assistant can be allowed to walk the queue and
  hand medicine over without being allowed to alter what the prescriber
  wrote, and vice versa. `lib/hooks/use-pos-prescription.ts` gates the
  `/pos?dispense_rx=<id>` loader, which is the real gate for the same
  reason as the overlay: that URL *is* the dispense action (it pulls the
  prescription's items onto the till, and `use-pos-payment.ts` marks the rx
  completed from there), and it is typeable.

The record itself is never hidden — a role with neither key still opens a
prescription and reads the patient, prescriber, medication and cost detail;
only the action row goes away, and it collapses to nothing rather than
leaving an empty bar. "Process Return" is deliberately **left ungated**: it
is neither dispensing nor a record edit but a reversal of the linked sale,
and it hands straight off to the existing Return flow
(`/pos?tab=history&return_sale=…`), which carries its own
`void_refund_sales` / `view_sales_history` gates. Revisit only if that
reads wrong in practice.

`DEFAULT_GROUP_PERMISSIONS` is **unchanged** for this category
(admin/manager/specialist hold both; `sales_staff` and `auditor` hold
neither), which makes this the pass's first deliberate **narrowing without
a compensating grant**: a cashier on a pharmacy store could previously see
the Prescriptions nav item and create, edit and dispense freely, and now
cannot. That is the point of the key — dispensing is the regulated act the
`specialist` role exists for, and it was in `sales_staff`'s exclusion list
from the day the catalog was written. A single-till pharmacy that really
does have its cashier hand medicine over ticks either key onto the cashier
group in one click, which previously did nothing.

Four of the five **Customers & Loyalty** keys followed on 2026-09-28, in
the same pass. Like Prescriptions, the category was **almost entirely
ungated** — the only role checks anywhere in `components/customers/` were
two direct ones in `directory-tab.tsx` (`user?.role === "auditor"` on the
empty state's "Add Customer", and
`!isAuditor && user?.role !== "sales_staff"` on the delete control), plus
the coarse `canManageStockBatch` on the Loyalty tab's "Edit Settings".
Everything else — add, edit, and every customer's outstanding balance —
was open to every role, including cashiers, on a page a cashier reaches.

- `manage_customers` ("Manage Customers") — creating and editing a
  customer record. `lib/hooks/use-customer-management.ts` gates the
  `?action=add` opener, which is the **real** gate: that URL is typeable
  and is also exactly what the dashboard header's "Add Customer"
  navigates to, so hiding the header action alone would not be one.
  `PAGE_ROUTES`' `/customers` entry gained
  `actionPermission: "manage_customers"` for that header action (no
  `actionAdminOnly` underneath it, same reasoning as `/prescriptions`),
  `directory-tab.tsx` gates the empty state's "Add Customer" and the
  detail panel's "Edit Profile", and `components/pos/pos-customer-selector.tsx`
  gates the till's inline "Add new customer" form. That last one matters:
  it writes a `customers` row through `insert()` just like the Customers
  page does, so it is the same right, not an at-the-till concession. The
  record stays fully readable without the key — only the triggers go, and
  the detail footer collapses to "View History" alone.
- `manage_loyalty` ("Manage Loyalty Program") — configuring the
  **program**: tiers, earn rate and redemption options.
  `components/customers/loyalty-tab.tsx` gates the "Edit Settings" button
  and `loyalty-settings-dialog.tsx` adds the key to its existing
  defense-in-depth close-on-open effect. Both **compose** with the coarse
  `canManageStockBatch` rather than replacing it, so nothing widens. This
  is deliberately **not** the same thing as a cashier spending a
  customer's earned points at checkout (`pos-redeem-reward.tsx`), which
  stays independent of every staff-side key for the same reason it is
  independent of `apply_discounts`: a redemption is a customer-earned
  entitlement, not a staff concession, and the cashier who rings the sale
  is who applies it.
- `delete_customers` ("Delete Customers") — the trash control in
  `customer-detail-panel.tsx`, fed from `directory-tab.tsx`, which is the
  only way to reach `customer-delete-dialog.tsx` at all. The direct role
  check it replaces allowed `specialist` through; the key does not, which
  is the intended split (the defaults comment has excluded `delete_*` from
  `specialist` since the catalog was written). The dialog's own
  "outstanding balance, settle it first" guard is untouched — that is a
  data rule, not a permission.
- `view_customer_balances` ("View Customer Account Balances") — a pure
  **read** right over customer debt, and the one place this category
  closes a leak rather than adding a restriction. Before it, the
  directory's Balance column, the "Has debt" filter chip, the
  "₦X outstanding across N customers" summary and the detail panel's
  outstanding-balance block were all shown to every role. All four are now
  gated in `directory-tab.tsx`; the desktop row drops its balance **cell
  with its header**, via `CUSTOMER_GRID_COLS` in `customer-list-rows.tsx`
  (a literal-class lookup, same mechanism as `CATALOG_GRID_COLS`), rather
  than being left blank. Note that hiding the block takes the
  **"Record Payment" button with it**, which is deliberate — you cannot
  record a payment against a balance you are not allowed to see — and is
  why the defaults changed, below. The per-sale outstanding balance in
  `components/pos/transaction-details-dialog.tsx` is a **different
  figure** (one sale's remainder, not the customer's account) and stays
  ungated, so the till's own debt-payment flow is untouched either way.

`manage_customer_credit_terms` was **removed from the catalog** on
2026-09-29 — see "Removed from the catalog" below.

`DEFAULT_GROUP_PERMISSIONS` changed in exactly one way for this category:
`view_customer_balances` was **granted to `specialist` and `sales_staff`**,
which are the two roles that lacked it. That is behaviour-preserving, not a
widening — every role could already see these figures, so reproducing that
is the rule this pass has followed throughout (`view_cost_fields`,
`request_stock_transfers`, `override_price`). It matters most for
`sales_staff`: "Record Payment" lives inside the block, so withholding the
key would have silently removed over-the-counter debt collection from the
cashier, who is exactly who does it. The owner who wants balances kept from
cashiers unticks one box, which previously did nothing.

The other three keys keep their existing defaults, which means two
**deliberate narrowings** landed with enforcement: `specialist` loses
customer deletion (it was reachable through the old role check) and the
Loyalty Settings dialog (it was reachable through `canManageStockBatch`).
Both are what those keys are for — `delete_customers` and `manage_loyalty`
were scoped to admin/manager from the day the catalog was written — and
both are one tick away for a store that disagrees. `manage_customers` is
already in `sales_staff`, `specialist` and `manager`, so wiring it is a
**no-op for every role except `auditor`**, which correctly loses the
"Edit Profile" button it should never have had.

Four of the five **Reports & Activity** keys are wired, across two changes
on 2026-09-28. The whole category is described here so it reads as one
picture rather than two halves:

- `view_reports` ("View Reports & Analytics") — **does the Report Center /
  Analytics half of the Reports page exist for this role at all**.
  `app/(dashboard)/reports/reports-tab-nav.tsx` gates the "Operational
  Reports" and "Analytics & Insights" triggers and
  `app/(dashboard)/reports/page.tsx` gates both `<TabsContent>` panels
  **and** the `?tab=` resolution, which is the real gate — `/reports?tab=reports`
  is typeable, so hiding the trigger alone is not one. Without the key the
  page falls back to Daily Close, exactly as it did for a non-admin before.
  **Converted from `isAdmin`** (i.e. from `manage_staff`), which widens it
  to `auditor`: the reports-focused read-only role has held `view_reports`
  and `export_reports` by default since the catalog was written and could
  not reach a single report, which was the bug. admin and manager both hold
  the key, so nothing narrows.
  **Daily Close is deliberately not under this key** — every role,
  `sales_staff` included, reaches it by design (see the cashier-visibility
  section below; `run_daily_close` gates the *running* of the close, not
  the reading of it — see its entry above).
  The sidebar's own Reports-vs-Daily-Close split
  (`dashboard-sidebar.tsx`) is still `isAdmin || canManageStockBatch` and
  was **left alone**: it is a link, not a gate, and an auditor reaches the
  page through its Daily Close link. Convert it in whatever change next
  touches that nav.
- `export_reports` ("Export / Print Reports") — `components/reports/report-center.tsx`
  hoists `useHasPermission("export_reports")` and hides the per-report Export
  dropdown and Print button, and passes the same boolean into
  `report-view-dialog.tsx` as `canExport` so the in-dialog copies of those
  actions can't be the way round it. The "View" action is deliberately *not*
  gated on it — reading a report on screen is `view_reports`, taking a copy
  off the device is `export_reports`. **Known gap**: the Analytics
  dashboard's own "Export Reports" button
  (`business-intelligence-dashboard.tsx`) downloads the profit-loss CSV and
  has never been under `export_reports`; it is now under
  `view_financial_reports`, which is the narrower of the two for that
  button, but a role with the P&L right and no export right can still take
  that one CSV. Add `export_reports` to it in whatever change next touches
  that toolbar.
- `view_financial_reports` ("View Financial Reports (P&L, Margins)") — the
  **margin-revealing slice** of everything `view_reports` opens, and the
  reports-side extension of `view_cost_fields`: a role that may not see a
  product's cost may not pull the store's P&L either. Four surfaces, one
  hoisted const each: `report-center.tsx` drops the "Profit & Loss Summary"
  card from the report list (the other five reports, including the two also
  tagged "Financial", are operational and stay);
  `components/analytics/analytics-tab-nav.tsx` drops the "Profit & Loss"
  sub-tab; `business-intelligence-dashboard.tsx` drops its `<TabsContent>`
  and the "Export Reports" button; and `components/analytics/bi-key-metrics.tsx`
  drops the "Net Profit" card, which is the same figure condensed, taking
  its column with it via `METRIC_GRID_COLS` (a literal-class lookup, same
  mechanism as `CATALOG_GRID_COLS`) rather than leaving a gap. No `?tab=`
  fallback is needed here: the Analytics dashboard's `activeTab` is local
  state defaulting to `sales` and is not URL-driven, so hiding the trigger
  really is the gate. Defaults are **unchanged** and the key is
  behaviour-neutral on day one — admin, manager and auditor hold it and are
  exactly who could see these surfaces before; `specialist` and
  `sales_staff` lack it, and both already lack `view_reports`, so they never
  reach them either way.
- `view_activity_log` ("View Activity Log") — the oldest wired key in the
  category and a **different axis** from the three above: it answers "whose
  records does a list show", not "which screen exists". See
  `pos-transaction-history.tsx`, `use-dashboard-overview.ts` and
  `auth-context.tsx`'s `canViewAllActivity`.

`view_dashboard` ("View Dashboard Overview") stays **catalog-only, and
deliberately so — this one is not a "no surface exists" finding but a "the
gate would be wrong" one**. `/dashboard` is the post-login landing route for
every role (`app/login/use-login-page.tsx`, `hooks/use-login.ts`,
`app/page.tsx`, `app/auth/callback/page.tsx`, `app/setup/use-onboarding.ts`)
**and** the redirect target `RequireRole` sends every denied user to
(`components/auth/require-role.tsx`). Gating the page on this key would
give a denied user nowhere to land and would make `RequireRole` bounce them
into a page that bounces them back. It is also the only key in the whole
catalog that **every one of the five default groups holds**, which is the
same finding from the data side: no role is meant to be denied it. Gating
one widget under it instead was considered and rejected as inventing a
meaning the label ("View Dashboard Overview") does not carry — and the
widgets that would be candidates are already covered: the store-wide
figures on `dashboard-overview.tsx` swap to the cashier's own
"My Sales Today"/"My Transactions Today" via `useMyTodaySales`'s
`isCashier`, and the activity feed is already under `view_activity_log`.
Wire this key only if a genuinely optional dashboard ever exists — a second
landing route, or an overview that some roles are meant to start without.

Both **Expenses** keys were wired on 2026-09-28. This is the one small
category where every key had a real surface waiting, and the two split
cleanly along the write/read line:

- `record_expenses` ("Record Expenses") — **write access to the expense
  ledger**, i.e. every control on `/expenses` that changes a row, gated in
  four places because the create path has three entrances and the amend path
  two: `lib/constants/dashboard-page-routes.ts` gives the route
  `actionPermission: "record_expenses"` (the header's "Add Expense");
  `app/(dashboard)/expenses/page.tsx` hoists the const and gates the
  `?action=add` effect, which is the **real** gate since
  `/expenses?action=add` is typeable and is exactly where that header action
  navigates; `components/expenses/expense-list.tsx` ANDs the key into its
  existing `canAddExpense` (the empty state's "Add Expense" CTA) and passes
  it down as `ExpenseDesktopRow`'s new `canEdit` prop, which drops the
  row-hover quick-edit pencil; and
  `components/expenses/expense-detail-dialog.tsx` hoists its own const and
  drops the whole Edit/Delete footer. Everything else on the page — the
  list, the search and category filters, the insights strip, the detail
  dialog's body — is read and stays open, which is the usual
  hide-the-trigger-preserve-the-state shape. Edit and Delete are under this
  key rather than left ungated on purpose: there is no `edit_expenses` or
  `delete_expenses` in the catalog, and "can log a spend but can also wipe
  one they can't log" is not a coherent state to ship. It is a **no-op for
  every role that can reach the page today** — `admin`, `manager`,
  `specialist` and `sales_staff` all hold the key by default, and `auditor`
  never clears `RequireRole`'s `isAdmin || canManageStockBatch ||
  allowSalesStaff` baseline for `/expenses` at all. `RequireRole` itself was
  **not** given `permission="record_expenses"`: reading the ledger is not
  recording, and the route must stay reachable for a group that has had the
  write right taken away.
- `view_all_expenses` ("View All Expenses") — **whose expenses the ledger
  shows**, the same own-vs-all axis `view_activity_log` runs on the sales
  side, and a **conversion, not a new restriction**. `lib/hooks/use-finance-data.ts`
  has had the scope since the ledger was paginated — `useExpenseList` and
  `useExpenseTotals` both compute
  `const viewerId = <key> ? undefined : user?.id` and pass it into
  `getExpensesPage`, `getExpensesLifetimeTotal`, `getSmoothedExpensesTotal`
  and `getCurrentMonthExpensesByCategory` (all four already take an optional
  `viewerId`, in `lib/db/queries/finance.ts`) — but it hung off
  **`view_activity_log`**, the sales-side key, which is the bug: only
  `admin` holds that key, so a manager saw a ledger scoped to their own
  receipts while the catalog had said since day one that managers
  "View All Expenses". Switching the two hooks to `view_all_expenses` is a
  one-word change in two places and puts the scope on the key that names it.
  Note the figures beside the list are scoped too, not just the rows — the
  lifetime total and the month's per-category breakdown all take the same
  `viewerId`, so a scoped viewer gets a self-consistent page rather than
  their own rows under everyone's total.

  ⚠️ **The one consequential call in this pass**: this **widens `manager`**
  from own-only to the whole store's expense ledger. That is the key's
  stated meaning and `manager` has held it by default since the catalog was
  written, so the fix is restoring intent rather than granting something
  new — but it *is* a visible change for an existing store on upgrade, and
  it is the reconciliation figure at the bottom of the page that moves, not
  just a list. `specialist` and `sales_staff` are **deliberately left
  without** the key: both keep seeing only what they logged, which is
  exactly what they see today, so a cashier's own running expense total for
  their own till is unaffected. `auditor` holds the key and is unaffected
  either way — it cannot reach `/expenses`; if that route is ever opened to
  the read-only role, the key is already right for it.

  The P&L / BI expense figures (`lib/db/queries/reports.ts`,
  `usePnLReport`) pass **no** `viewerId` and are left alone: they are a
  store-wide financial report already gated by `view_financial_reports`, and
  scoping them per-viewer would silently produce a wrong P&L rather than a
  restricted one.


All seven remaining **Store & Settings** keys were wired on 2026-09-28,
closing the pass. This category is almost entirely a **conversion**: one
coarse `isAdmin` check (which is `manage_staff`, and so includes `manager`)
covered nearly every Settings tab, and the catalog had already named the
specific keys those tabs should carry.

The tab-level half lives in one map, `SETTINGS_TAB_PERMISSIONS`
(`lib/constants/settings-tabs.ts`), read by all three places that decide tab
visibility — `settings-tab-nav.tsx` (desktop rail), `settings-mobile-menu.tsx`
(the only settings nav below `md`) and `hooks/use-settings.ts`' URL-resolution
effect, which is **the real gate**: `/settings/<tab>` is typeable and is in
`generateStaticParams`, so hiding the two triggers is not one. `settings-client.tsx`
gates the matching `<TabsContent>` from the same resolver. Both nav components
take an optional `canAccessTab` prop and fall back to their old `adminOnly`
behaviour without it, so no caller had to change at once.

- `manage_store_settings` — **Business Info, Branches, Receipt Settings and
  Register Configs**, i.e. store-wide configuration that is not payments,
  data or billing. Business Info and Branches are not split further: the
  business identity form and the fleet list are one "who this store is"
  surface. It also gates **Regional Settings** (currency, VAT, reseller
  commission) in `appearance-settings.tsx` — store-wide config that happens
  to sit on the everyone-can-open General tab and was `isAdmin`-gated inline;
  the theme and sidebar-preference cards above it stay open to every role.
  Exact no-op: `manager` holds the key and cleared `isAdmin`.
- `manage_payment_accounts` — the **Payment Methods** tab (accepted methods,
  the payment-accounts list, and the require-an-account rule). Receipt
  Settings and Register Configs deliberately sit under
  `manage_store_settings` instead: they are till and print configuration, not
  where money lands, which is what "Payment Accounts" names. No-op.
- `backup_restore_data` — the **Data & Sync** tab, whole. Backup, restore,
  undo-restore, force-full-resync and the auto-sync schedule are one surface
  (`data-settings.tsx`, `data-settings-auto-sync.tsx`) and splitting sync
  configuration away from the restore buttons it feeds would gate the halves
  of a single decision separately. No-op.
- `manage_device_settings` — the **System** tab: install cards, app version,
  environment, platform and About. That is "this workstation", which is what
  the key's label says, and it is the one tab in the group that holds nothing
  store-wide. This **widens to `specialist`**, which holds the key by default
  and could not clear `isAdmin`. Low blast radius by construction — the tab's
  one actionable control was the "Manage Billing" shortcut card, which now
  carries `manage_billing` itself rather than linking a specialist into a tab
  that would bounce them straight back out.
- `manage_billing` — the **Billing** tab (subscription plans, payment
  history, coupons, referrals) and the System tab's shortcut into it.
  ⚠️ **The consequential call in this category**: this **narrows `manager`**,
  which could open every billing screen because it cleared `isAdmin`. The
  defaults comment has excluded `manage_billing` from `manager` since the
  catalog was written — subscription and payment-method changes are the
  owner's, not a shift manager's — so this is the key doing what it has
  always said, but it *is* a visible change for an existing store on upgrade,
  and it is the only tab a manager outright loses. One tick restores it, and
  that tick previously did nothing.
- `manage_online_store` — the storefront slice, and the one key here that
  **cuts across tabs rather than owning one**: the Store Profile block inside
  Business Info (`store-profile-section.tsx` — the public URL slug and the
  Enable Online Store switch) and the Paystack payout onboarding inside
  Payment Methods (`online-payments-section.tsx`, gated from
  `panels/payment-methods-panel.tsx`). Both exist only to make the public
  storefront work, so the key sits **on top of** each tab's own rather than
  replacing it. The Store Profile block returns `null` when nothing is left
  to show (a retail store whose group lacks the key and whose plan has no
  loyalty program) instead of an empty bordered box with a heading in it.
  `products.show_online` is deliberately **left under `manage_products`**: it
  is a per-product catalog attribute set in three places — the Add Product
  form, the CSV/XLSX importer and the catalog toolbar's "Online" dropdown
  (`bulk-show-online-action.tsx`) — and gating one of the three would be
  theatre while the other two stay open. Wire it here only if all three move
  together. No-op otherwise: admin and manager hold all three keys.
- `install_app_updates` — `components/tauri/auto-updater.tsx`, and the only
  key in the category with no Settings tab at all. It gates the **user-facing
  half**: the floating "Check for updates" pill and the consent /
  restart-to-apply prompts it opens. The startup check and the silent patch
  download behind it are deliberately **left running for every session** —
  they are not a user action, and stopping them would strand a till on an old
  build rather than restrict anyone. A session with **no signed-in user**
  (login screen, first run) is ungated: there is no group to check and the
  updater is the device's own. `AutoUpdater` moved inside `AuthProvider` in
  `app/layout.tsx` so it can read the acting session at all; it is
  `position: fixed`, so where it sits in the tree is not a layout decision.
  This is a **real narrowing** — the pill was reachable by anyone signed in —
  and `sales_staff` and `auditor` are the two default groups without the key,
  so on a cashier-only till a major update now waits for someone who holds
  it. That is what the key is for.

`DEFAULT_GROUP_PERMISSIONS` is **unchanged** for this whole category. Every
conversion above either reproduces the old `isAdmin` population exactly or
moves in the direction the defaults already stated, which is the point of
converting rather than inventing a gate.

Tabs deliberately **left on the `isAdmin` fallback**, so nobody re-derives it:
**Personal Info** (no key in the catalog names it), **Product Units** and
**Categories** (Inventory & Stock's `manage_products`, out of this
category's scope — convert them in whatever change next touches that
category), **Staff** and **Roles & Permissions** (Staff & Groups; the
permission matrix already enforces `manage_roles_permissions` *inside* the
panel, and moving the tab itself would take the read-only view away from a
manager), and **Danger Zone** (already enforces `factory_reset` inside
`device-danger-zone.tsx`). The **Alerts** tab is likewise untouched: low-stock
and expiry thresholds are store-wide but the tab has been open to every role
since it shipped, and putting it under `manage_store_settings` would be a
narrowing this pass has no evidence anyone wants.

### The category-by-category pass is complete

All eight categories have now been walked: Sales & POS, Inventory & Stock,
Prescriptions, Customers & Loyalty, Reports & Activity, Expenses, Staff &
Groups and Store & Settings. After the 2026-09-29 re-investigation below,
the two delete features and the transfer-review action built the same day,
**47 of the catalog's 48 keys are enforced** and exactly **one is
catalog-only**:

| Category | Enforced | Catalog-only |
| --- | --- | --- |
| Sales & POS | 8 / 8 | — |
| Inventory & Stock | 17 / 17 | — |
| Prescriptions | 2 / 2 | — |
| Customers & Loyalty | 4 / 4 | — |
| Reports & Activity | 4 / 5 | `view_dashboard` |
| Expenses | 2 / 2 | — |
| Staff & Groups | 2 / 2 | — |
| Store & Settings | 8 / 8 | — |

`view_dashboard` is the only one left, and it is **not** a "the feature does
not exist" finding: it has a real surface and the gate would simply be wrong
(see its entry above). Every key that *was* a "does not exist yet" finding
has now been resolved one way or the other — two were wired, three had their
missing feature **built** (`delete_products`, `delete_suppliers`,
`approve_stock_transfers`), and six were removed.

### Removed from the catalog (2026-09-29)

The twelve catalog-only keys were re-investigated from scratch on
2026-09-29, on the explicit premise that the first pass may have dismissed
some too quickly. It had: **two were wrong**, and both are now enforced —
`run_daily_close` (the Daily Close banner's backup/sync buttons, a real
leak the first pass never opened the file to see) and `print_product_labels`
(a finished dialog whose trigger was simply never wired). Their entries are
in the Sales & POS and Inventory & Stock blocks above.

Three more — `delete_products`, `delete_suppliers` and
`approve_stock_transfers` — were removed that day and **restored the same
day**, and these are the cases where the finding was right and the
*decision* was overturned rather than the evidence. There genuinely was no
delete anywhere, and there genuinely was no way to clear a `needs_review`
transfer; the owner's call was that each is a product gap, not a
catalog-cleanup item. So the features were built
(`deleteProduct()`/`deleteSupplier()` and their confirmation dialogs;
`markStockTransferReviewed()` and the ledger detail modal's "Mark
Reviewed") and all three keys came back **with** their enforcement, in the
same commit — which is the standing rule working as intended, in the
direction it is usually read. Their entries — the deactivate-vs-delete
safety-check design, and the Option A (approval queue) vs. Option B
(actionable review flag) reasoning that also renamed
`approve_stock_transfers` to "Review Stock Transfers" — are in the
Inventory & Stock block above.

The remaining six were re-traced file by file and confirmed dead — **no
feature, and no small safe fix available** — so they were **deleted** from
`PERMISSION_CATALOG`, `DEFAULT_GROUP_PERMISSIONS` and
`PermissionGroupSeeder.php`'s server-side copy, rather than left wearing a
"Coming soon" badge for something that is not coming. A checkbox that can
never do anything is worse than no checkbox: it tells an owner they have
restricted an employee when they have not.

| Removed key | What the re-check actually looked at |
| --- | --- |
| `open_cash_drawer` | No drawer integration in any layer: no ESC/POS kick sequence, no serial/USB/HID crate in `src-tauri` (`lib.rs`, `main.rs`, `Cargo.toml`, `capabilities/`), no "no sale" control, no till concept. |
| `view_drawer_counts` | Searched far wider than "drawer" — cash count, till count, reconcile, variance, expected cash, opening/closing balance, float. Nothing records a counted float against expected cash anywhere. |
| `edit_completed_sale` | Every `update("sales", …)` call site: the refund path (`use-process-return-mutation.ts`, already `void_refund_sales`), the reseller-commission redeem, and a debt payment (`customers.ts`). No re-assign customer, no note/reference edit, no payment-method correction; `transaction-details-dialog.tsx`'s only buttons are payment, return, reprint and commission. |
| `override_credit_limit` | `customers.credit_limit` appears in exactly two places repo-wide: `schema.ts`'s column and one report-export column in `reports.ts`. `use-pos-payment.ts` adds a credit sale straight onto `outstanding_balance` with no ceiling check — not even a soft warning. There is no block, so there is nothing to override. |
| `manage_customer_credit_terms` | The same two places, from the other side: nothing in the app ever **sets** `credit_limit` either — no field in the add/edit customer modals, no terms UI. Both keys would front a feature that is one unused column. |
| `manage_stock_batches` | No batch CRUD screen. `/inventory/batches` was in `generateStaticParams` but `stock-batch-management.tsx` rendered no `<TabsContent>` for it, and its "Add Batch" header action pointed at a `?action=add` nothing handles. `createStockBatch()`'s only caller is `getOrCreateTargetBatchForProduct()`; every other `stock_batches` write is receiving, audit restock or CSV import. Batch expiry is only ever set during receiving (`receive_purchase_orders`). The dead route itself was fixed on 2026-09-29 — see "The dead /inventory/batches route" below. |

**`open_cash_drawer` and `manage_stock_batches` predate the QuickBooks
pass** (the other four were all added in `91c3dfd3` on 2026-09-28, so no
real store could hold them), which means an already-synced
`permission_groups.permissions` array may still carry those two as strings. That is harmless — an unrecognised key grants nothing and
is never read — so no migration backfills them out. The client catalog and
the Laravel seeder were changed together so the two stay in step.

Do **not** re-add any of the six from a fresh QuickBooks comparison without
re-litigating this: the standing rule is that a key and its enforcement ship
in the **same commit**, and that rule now runs in both directions — a key
with no action does not get to sit in the catalog waiting for one.

### Catalog versioning and the default-group backfill (2026-09-29)

**The seeder only ever runs once per store, so the catalog it seeded with is
the catalog that store is stuck on.** `ensurePermissionGroupsSeeded()`
(`lib/db/queries/permission-groups.ts`) and its server counterpart
`PermissionGroupSeeder::ensureSeeded()` are both gated on
`stores.permission_groups_seeded_at`, and `hasPermission()`
(`lib/hooks/use-permissions.ts`) reads the **stored**
`permission_groups.permissions` array — it only falls back to
`DEFAULT_GROUP_PERMISSIONS` when a user has no group at all, which seeding
makes sure never happens. So every key the 2026-09-28 QuickBooks expansion
and the 2026-09-28/29 enforcement passes added to a default group reached
**new** stores only. An already-seeded store — including the live production
one, which predates the feature — would have had its cashiers lose Hold
Sale/Recall, the whole Recent Sales tab, receipt reprinting, the reseller
price override and the customer-balance block (which carries "Record
Payment"), and its managers lose Daily Close backup/sync, cost visibility,
Start Audit, the Movements tab, the Vendors tab, the deletes, P&L and the
System tab. That is the exact regression each of those grants was chosen to
avoid; it just never arrived.

Two things fix it, and both are load-bearing.

**1. The PHP seeder is a port, and parity is now a test.**
`laravel-server/app/Services/PermissionGroupSeeder.php` is a hand-maintained
copy of `lib/constants/permissions.ts`; it had only ever been edited for
removals and was 20 keys behind. `PermissionCatalogParityTest`
(`laravel-server/tests/Feature/`) parses the TypeScript constants and asserts
`DEFAULT_GROUP_PERMISSIONS`, `PERMISSION_CATALOG_VERSION` and
`DEFAULT_GROUP_PERMISSION_ADDITIONS` match the PHP copies key-for-key, plus a
guard test that the parser actually parsed a plausible catalog rather than
passing on an empty parse. **It lives on the PHP side on purpose**: the
Checks workflow's `client` job has Node but no PHP, while its `server` job
checks out the whole repo (`client/` included) and has PHP — so that is the
only one of the two jobs where both artifacts exist. The client remains the
source of truth; the test just refuses to let the copy drift again.

**2. `stores.permission_catalog_version` + an add-only, delta-scoped
backfill.** `PERMISSION_CATALOG_VERSION` (currently `2`) names the revision
the current default lists belong to — `1` is the 2026-09-27 launch lists
(`a5f40463`). `DEFAULT_GROUP_PERMISSION_ADDITIONS` records, per version, the
keys each role **gained** at that version. `backfillDefaultGroupPermissions()`
(client) and `PermissionGroupSeeder::ensureCatalogBackfilled()` (server) read
the store's stamp — NULL means 1 — and, for each `is_default = 1` group,
union in every key owed by a newer version. The column is on `stores` (not
per group) because defaults are seeded per store and the delta is the same
decision for all five groups; it is an ordinary synced column, like
`permission_groups_seeded_at`. A fresh seed stamps the current version, so
the backfill never runs against a store that never needed it.

Three properties make that safe, and each has a test on both sides:

- **Add-only.** It never removes a key, so a retired-but-still-stored key
  (`open_cash_drawer`, `manage_stock_batches`) survives untouched, as the
  removal note above promised.
- **Delta-scoped, not "revert to defaults".** Only keys from versions
  *newer* than the stamp are added, so a key the owner unticked while
  stamped at v2 is never silently restored by a v3 pass. **The known limit**:
  a legacy store has no stamp, so the whole v1→v2 delta applies to it — if
  such a store had already unticked one of those 20 keys, it comes back.
  There is no baseline that distinguishes "never had it" from "had it and
  removed it" for an unstamped store, so this is accepted and documented
  rather than guessed at.
- **Idempotent.** A group is written only when its stored array actually
  changes, so a second run is a genuine no-op — no duplicate keys, no queue
  rows, no `_version` bump.

**`is_default` does NOT track customization — do not read it that way.**
`toggle()`/`toggleMany()`/`revertToDefault()` (`lib/hooks/use-permission-groups.ts`)
never clear the flag, and the sync layer actively refuses to let a payload
change it (`sanitizePermissionGroupSyncPayload`). It means "this is one of
the five seeded role groups", full stop. So `is_default = 1` is the right
filter for *which rows the backfill may touch* (a copied or hand-made group
is `is_default = 0` and is never touched), but it is **not** what protects a
customized default group — the version delta is.

**The client/server race, and how it resolves.** Both sides can backfill the
same store minutes apart, and a third device may still be holding the
pre-backfill array.

- The operation is a **union of a fixed, version-indexed key set computed
  identically on both sides**, so it commutes: client-first and server-first
  converge on the same array. Content is never "last writer wins".
- **The server's backfill bumps `permission_groups._version`.** This is the
  piece that closes the silent-overwrite hole: a device that has not
  backfilled still holds the old array at the old version, and without the
  bump its next push would pass `SyncController::push`'s strict
  version-equality check and erase the backfill. With it, that push is
  rejected as `version_conflict`, which `sync-engine/push.ts` already treats
  as terminal — it drops the queue row (and toasts) and the next pull brings
  the server's superset down. Loud and correct, instead of silent and wrong.
- **The client writes only on change**, so a device that pulled the
  already-backfilled rows first pushes nothing at all and produces no
  conflict.
- **The stamp is queued last**, after the group rows, inside the same local
  transaction — a device can never advertise "v2 applied" ahead of the rows
  that make it true. And nothing derives *content* from the stamp: if a v2
  stamp arrives by pull before the group rows do, that side skips its own
  backfill and the rows themselves still arrive by ordinary pull.
- **The backfill push needed a sync-push exemption.** It runs on *any*
  signed-in user's login, cashiers included, and its whole job is to add keys
  that user does not hold — which
  `sanitizePermissionGroupSyncPayload`'s escalation and
  `manage_roles_permissions` checks **throw** on, and a throw lands in
  `push.ts`'s retry-with-backoff path rather than its terminal
  `version_conflict` path, permanently wedging that device's queue.
  `isCatalogBackfillOnlyPayload()` recognises the shape: an UPDATE to a
  `is_default` group that touches only `permissions`, removes nothing, and
  adds only keys `PermissionGroupSeeder::backfillableKeysForRole()` lists for
  **that stored row's own** `based_on_role`. It cannot widen anything — the
  candidate set is a server-side constant and the row's role is read from the
  database, not the payload.

Bumping `PERMISSION_CATALOG_VERSION` therefore means: add the version's entry
to `DEFAULT_GROUP_PERMISSION_ADDITIONS`, mirror both into the PHP seeder
(the parity test fails otherwise), and nothing else — the backfill, the
stamping and the race handling are already generic over the version number.

### The dead `/inventory/batches` route (2026-09-29)

`/inventory/batches` was a generated route with nothing behind it:
`app/(dashboard)/inventory/[tab]/page.tsx` lists `batches` in
`generateStaticParams`, but `stock-batch-management.tsx` renders no
`<TabsContent value="batches">`, so the page resolved to the tab bar and an
empty panel. Three things pointed at it — the `/inventory/batches` header
action ("Add Batch", `?action=add`, which nothing anywhere handles),
`needs-attention.tsx`'s "View batch" card and
`use-action-center-alerts.ts`'s expiring-items alert.

The fix is a **redirect to `/inventory/catalog`**, not a new Add Batch
dialog, because there is no batch-create flow to point the button at:
`createStockBatch()`'s only caller is `getOrCreateTargetBatchForProduct()`,
and every other `stock_batches` write is receiving, audit restock or CSV
import (this is the same finding that removed `manage_stock_batches`, and it
is still true). The Catalog tab is the all-products-with-stock view all
three callers actually meant.

It redirects **client-side, in `use-stock-batch-management.ts`**, beside the
existing `audits` and `ledger` redirects, rather than server-side in the tab
page. That is not a style choice: `next.config.mjs` sets `output: "export"`,
so a `redirect()` inside a statically generated param is evaluated at build
time, and `batches` has to stay in `generateStaticParams` or an existing
bookmark 404s instead of redirecting. The route still generates; the page
bounces on mount.

The `/inventory/batches` `PAGE_ROUTES` entry was **deleted** rather than
repointed — it existed only to title a page that never rendered and to offer
an action that landed nowhere, and `/inventory`'s own entry (Inventory
Dashboard / Add Product) already covers the prefix. The two in-app callers
were repointed at `/inventory/catalog` directly so they do not flash through
the redirect.

### The 2026-09-28 granularity pass

The catalog was compared against QuickBooks Point of Sale's own
security-rights matrix and 24 keys were added, all **catalog-only** (no
call site yet) except where noted — they are visible and settable in the
matrix but the repo's incremental-rollout rule still holds: **wire
enforcement and add the key in the same commit**, and add the key to
`ENFORCED_PERMISSION_KEYS` in that same commit.

- **Sales & POS** — `hold_sales`, `view_sales_history`,
  `edit_completed_sale`, `reprint_receipt`, `run_daily_close`,
  `view_drawer_counts`, `override_credit_limit`. (`edit_completed_sale`,
  `view_drawer_counts` and `override_credit_limit` were removed again on
  2026-09-29 — see "Removed from the catalog" above.) These split apart what
  `process_sales` and `void_refund_sales` currently cover as one lump:
  reading history vs. making a sale, parking a sale vs. completing one,
  amending a finished sale vs. voiding it, and the end-of-day/drawer
  surfaces (`daily-close-report.tsx`) which today are role-gated by a
  direct `user?.role === "sales_staff"` check rather than by a key.
  `hold_sales`, `view_sales_history` and `reprint_receipt` were wired up
  later the same day (along with `override_price`), and `run_daily_close` on
  2026-09-29 — read its entry above before re-investigating.
- **Inventory & Stock** — `view_cost_fields`, `edit_product_cost`,
  `edit_product_price`, `delete_products`, `perform_stock_audit`,
  `view_stock_adjustment_history`, `print_product_labels`,
  `export_product_list`, `view_suppliers`, `delete_suppliers`. `manage_products`
  today grants cost, price, quantity, deletion and supplier writes all at
  once; these are the pieces. All of these except `delete_products`,
  `delete_suppliers` and `print_product_labels` were wired up later the
  same day, along with `adjust_stock_counts`, `manage_purchase_orders`,
  `receive_purchase_orders`, `manage_suppliers` and
  `request_stock_transfers`; `print_product_labels` followed on 2026-09-29,
  and `delete_products`/`delete_suppliers` on the same day, once the delete
  features they front were actually built — see the Inventory & Stock block
  above before re-investigating any of them. `view_cost_fields` is the key form of the cashier cost/margin
  gating described below; that conversion has now happened for
  `product-pricing-info.tsx`, and the remaining
  `role === "sales_staff"` sites (`daily-close-report.tsx`,
  `transaction-metrics.tsx`, `transaction-details-dialog.tsx`) are the
  next ones to move.
- **Customers & Loyalty** — `delete_customers`, `view_customer_balances`,
  `manage_customer_credit_terms`. The first two were wired up later the
  same day, along with `manage_customers` and `manage_loyalty`;
  `manage_customer_credit_terms` was removed on 2026-09-29 — see the
  Customers & Loyalty block and "Removed from the catalog" above before
  re-investigating any of them.
- **Reports & Activity** — `view_dashboard`, `view_financial_reports`.
  `view_reports` stays the broad "can open Report Center" right;
  `view_financial_reports` is the P&L/margin tier on top of it (QuickBooks'
  level-3/4 report split).
- **Store & Settings** — `manage_device_settings` (this workstation's own
  preferences, as distinct from store-wide `manage_store_settings`),
  `install_app_updates` (`components/tauri/auto-updater.tsx`). Both were
  wired up later the same day, along with the rest of the category —
  `manage_store_settings`, `manage_payment_accounts`, `manage_online_store`,
  `manage_billing` and `backup_restore_data` — see the Store & Settings block
  above, and the completion note after it, before re-investigating any of
  them.

Deliberately **not** imported from QuickBooks: anything about
QuickBooks-desktop mechanics (company-file open/close/create/rename/clean-up,
convert-from-previous-version, license management, setup interview,
integrated-application login, linked QuickBooks transactions,
update/recover QuickBooks), its hardware wizards and troubleshooter, its
Dashboard-webpage rights, "Exit Point of Sale"/"Customize program
interface", and its Departments concept (DumosRx has product categories,
not departments — `manage_products` covers them).

## Roles & Permissions matrix: hierarchical categories

`permission-matrix.tsx` renders each `PermissionCatalogEntry.category` as a
collapsible section header row with a **tri-state checkbox per group
column** (`data-testid="category-checkbox"`). The maths lives in
`category-selection.ts` (pure, unit-tested): all children granted =
checked, none = unchecked, some = indeterminate (set on the native input
via a ref, since `<input type="checkbox">` exposes `indeterminate` as a DOM
property, not an attribute). Clicking a checked category clears its
children; clicking an unchecked *or* indeterminate one grants them all.

Two things a new category-level control must keep:

1. It writes through `usePermissionGroups().toggleMany(groupId, keys, granted)`,
   **not** a loop over `toggle()` — each `toggle()` reads the `groups` state
   captured by the current render, so the second write in a loop would
   overwrite the first with a set that predates it.
2. `getCategoryToggleKeys()` filters out locked keys. Today that is the
   acting user's own `manage_roles_permissions`, which the per-cell UI
   renders disabled; without the filter the category checkbox would be a
   way round that self-lockout guard.

Sections default to expanded — the matrix's job is being scannable at a
glance — and collapse state is local component state, not persisted.

## Reports: on-screen view

Every Report Center report returns the same pre-labelled
`Record<string, unknown>[]` from `useReportExport`'s `getRows()`, so one
generic `components/reports/report-table-view.tsx` (column-driven, wired to
`useSortableData` + `SortableHeaderCell`) renders all six on screen behind
the card's "View" action, with Export/Print repeated inside the view.
Column order comes from `getReportHeaders(reportId)` so the view, the CSV
and the PDF can't drift. `fetchSalesReportData` now also selects a
"Cashier" column (`LEFT JOIN users`), which the export formats already
carried a *filter* for but never showed.

### Searching and re-filtering from inside the view (2026-09-29)

The filters used to live only on the Report Center card: they were captured
in a closure when "View" was clicked and baked into the one `getRows()` call
behind the modal, so changing anything meant closing the modal, changing the
card, and clicking View again. `report-view-dialog.tsx` now carries both
kinds of control itself, and the distinction between them is the thing to
preserve:

- **Search filters the rows already on screen.** One `SearchInput` over
  `genericFuzzySearch` (`lib/utils/search.ts`, the same utility the product
  catalog and customer directory use), across every visible column, with no
  query behind it. It renders for **every** report, including the two that
  take no parameters at all.
- **Date range / staff / payment method re-fetch.** They call the *same*
  `getRows()` machinery the card's exports use: the dialog raises
  `onFiltersChange`, and `report-center.tsx`'s `loadViewRows(reportId,
  filters)` — which `openView` also calls — does the fetch and flips the
  existing `isLoading`, so a re-fetch shows the same spinner the first load
  does. The filter controls stay mounted while it runs; only the table is
  replaced.

**Which controls render is read from `REPORT_CONFIG`, not a second list.**
`reportSupportsDateRange()` / `reportSupportsSalesFilters()`
(`lib/hooks/use-report-export.ts`) expose the `takesDateRange` /
`takesSalesFilters` flags that the export path already ran on, so the view
cannot drift from what the query actually accepts. Today that means: Detailed
Sales, Top Sellers and Profit & Loss get date + staff + payment; Expense
Categories gets date only; Inventory Valuation and Customer Loyalty (pure
point-in-time snapshots) get neither, only the search box. A report whose
query gains or loses a dimension gets the right controls by changing that one
config entry. `ReportFiltersBar` grew `showDateRange`/`showStaff`/
`showPaymentMethod` (default `true`, so the card and Analytics are untouched)
plus a `compact` variant for the narrower modal row.

**The modal's filters are independent of the card's, seeded from them.** It
opens pre-populated with whatever the card had when "View" was clicked and
owns its state from then on: adjusting inside the modal never moves the card
behind it, and the card re-rendering never resets the modal. The seeding is a
`key={viewing.id}` remount in `report-center.tsx`, not a sync effect — an
effect that copied the prop back into state would undo the user's in-modal
change on any unrelated parent render. The reasoning: the card's filters are
"what the next export will use" and are shared by six reports at once, while
the modal's are "what I'm looking at right now" in one of them; silently
rewriting the card from a modal would change what the other five reports'
Export buttons do. The amber Profit & Loss note is computed from the
**modal's** filters while it is open, so the banner always describes the rows
actually on screen.

## Cashier (`sales_staff`) visibility gating — a recurring pattern, not a one-off

A cashier account should never see store-wide profit/margin figures or
manage stock/settings beyond their own sales. The established check is a
direct `user?.role === "sales_staff"` (or `!== "sales_staff"` to show
something to everyone else), matching the pattern already used in
`daily-close-report.tsx`, `transaction-metrics.tsx`,
and `transaction-details-dialog.tsx`. It is being **migrated to the
`view_cost_fields` permission key**, whose default grants
(admin/manager/specialist/auditor, never `sales_staff`) reproduce it
exactly; `product-pricing-info.tsx` moved on 2026-09-28 and the three
sites above are next. Until then, a new profit/margin display uses
whichever of the two matches its neighbours — **not**
`checkIsAdmin()`/`isAdmin`, which also excludes `auditor` and `specialist`
(read-only/stock-managing roles that have no reason to be denied a
profit figure they can already derive from data they can see elsewhere).
When adding a new profit/margin display, gate it the same way and check
sibling surfaces: profit has leaked from more than one place before
(Daily Close's aggregate was gated once, then found still visible via
drilling into an individual sale's `TransactionDetailsDialog` from three
different entry points — POS history, the dashboard activity feed, and
Daily Close's own sales list — because the dialog itself wasn't gated).
For a permission that's admin-plus-one-specific-role rather than a clean
admin/non-admin split (e.g. "cashiers can also reach this, but auditors
still can't"), see `dashboard-page-routes.ts`'s `actionAllowSalesStaff`
flag and `RequireRole`'s `allowSalesStaff` prop for the pattern — don't
just delete/loosen the existing `actionAdminOnly`/`canManageStockBatch`
check, that widens the gate for every non-admin role at once, not just
the one you meant to add.

## PWA offline precaching

`public/sw.js` does both runtime caching (stale-while-revalidate for
same-origin static assets, network-first-with-cache-fallback for
navigations) and, since 2026-09-23, install-time **precaching**: a
`postbuild` script (`scripts/generate-precache-manifest.ts`) walks the
static export's `out/` directory and writes `precache-manifest.json`,
which `sw.js`'s `install` handler fetches and caches per-URL (not the
atomic `cache.addAll()` — one bad URL degrades instead of silently
killing the whole precache) before calling `skipWaiting()`. **On any
change to the install/precache logic, an async handler that merely
`console.error`s a caught failure and returns normally still reports
"install succeeded" to the browser** — a real failure must `throw` so the
`event.waitUntil()` promise actually rejects, otherwise this SW version
activates with an empty/partial cache instead of leaving whatever worker
was previously in charge running. Bump `CACHE_VERSION` on any change to
the caching *strategy* itself (not on every deploy — the runtime-caching
half already refreshes assets on every successful fetch). This only
matters for the browser/PWA target; Tauri loads `out/` directly off disk
via its own protocol and doesn't go through this service worker at all.

**Every navigation response must be verified as real HTML before it's
cached or returned** (`isHtmlResponse` in `sw.js`, added 2026-09-23,
`CACHE_VERSION` bumped to `v3`). This app's static export
(`output: "export"`) writes each route as **both** `route.html` (the
real page) and `route.txt` (the React Server Component flight payload
Next's client router fetches for soft/client-side transitions) —
confirmed live: an iPhone home-screen install, restarted offline, showed
the raw serialized RSC text on screen instead of the app, because
something had ended up cached under the page's own URL with a non-HTML
body and the navigate handler served it back with no check. The guard
applies on **both** the network path and the offline cache-fallback
path, and deliberately does **not** also require `response.ok` — a
genuine, current 404/500 HTML error page from the network is still real
information and must be shown as-is; only its *content-type* determines
trustworthiness, not its status code. (An earlier version of this fix
did gate on `response.ok` too and was caught by code review: it made a
real current error page get treated identically to being offline,
serving stale cached content instead.)

The **catch-all stale-while-revalidate branch** (every other same-origin
GET: JS/CSS chunks, the sql.js WASM binary, manifest, icons, Next's `.txt`
RSC payloads) got the mirror-image guard on 2026-09-26, with `CACHE_VERSION`
bumped to `v4` so `activate()`'s prune also drops any already-poisoned
entry. It used to cache anything on a bare `response.ok`, so a captive
portal or misconfigured proxy answering a chunk/WASM request with its own
login page (still `200 OK`) would poison that entry under the real asset's
cache key and keep being served long after the network recovered. The check
is inverted relative to the navigation path: `expectsNonHtml` tests the
request pathname's extension, and HTML is refused only for those requests —
so a legitimately-HTML response on some other same-origin GET still caches
as before.

## Tauri webview content-security policy

`src-tauri/tauri.conf.json`'s `app.security.csp` is a real policy, not `null`,
and `withGlobalTauri` is gone. It only governs the **bundled** desktop/Android
build: Tauri applies the CSP to assets it serves over its own protocol, so
`npm run tauri dev` (which loads `devUrl` from the Next dev server) is
unaffected and Next's HMR `eval` keeps working. The web/PWA build at
`app.dumosrx.com` is served by a plain host and is not covered by this at all.

The policy and why each source is in it:

- `script-src 'self' 'wasm-unsafe-eval'` — no `'unsafe-inline'` and no
  `'unsafe-eval'`. It does **not** need them: `tauri-codegen` sha256-hashes
  every non-empty inline `<script>` in each exported HTML file at build time
  and appends those hashes to this directive, which covers Next's static
  `self.__next_f.push(...)` payload scripts (94 of them across the 47 pages in
  `out/`). `'wasm-unsafe-eval'` is for sql.js instantiating
  `public/sql-wasm.wasm`; the desktop/Android build uses native SQLite rather
  than sql.js, so it is belt-and-braces, but it costs nothing and the fallback
  path exists in `lib/db/core.ts`.
- `style-src 'self' 'unsafe-inline'` — load-bearing. `components/ui/chart.tsx`
  writes a `<style>` via `dangerouslySetInnerHTML`, React 19 hoists
  `<style precedence>` tags, and Radix's scroll-lock injects its own. Note the
  CSP-3 rule that a nonce or hash in a directive makes `'unsafe-inline'`
  ignored: this works **because** the exported HTML contains zero build-time
  `<style>` tags, so Tauri adds no style nonce. **Adding an inline `<style>` to
  the exported HTML would silently disable `'unsafe-inline'` and break every
  runtime-injected stylesheet.**
- `worker-src 'self' blob:` — `lib/utils/report-pdf.tsx` spawns the PDF worker.
- `img-src`/`media-src` with `data:` and `blob:` — receipts, barcodes and the
  generated PDFs.
- `connect-src` includes `ipc:` and `http://ipc.localhost` (Tauri v2's IPC
  channel is `ipc://localhost` on macOS/Linux, `http://ipc.localhost` on
  Windows/Android) plus `https:` and the localhost/`10.0.2.2` entries, because
  `components/ui/server-selector.tsx` lets the API host be repointed at
  runtime.
- `object-src 'none'`, `frame-src 'none'`, `base-uri 'self'`,
  `form-action 'self'` — the app embeds nothing and posts nowhere.

`withGlobalTauri` was dropped because nothing depends on it: the only two
readers of `window.__TAURI__` (`lib/db/core.ts`'s `isTauri()` and
`lib/utils/error-logger.ts`) already fall through to `window.__TAURI_INTERNALS__`,
which Tauri v2 injects regardless. `__tests__/tauri-csp-config.test.ts` pins
all of the above.

## Stale-chunk auto-recovery

A tab left open across an auto-deploy (the storefront rebuild pipeline,
or any redeploy of this app itself) holds JS chunk hashes a fresh build
has already deleted from the server — the moment it lazy-loads a route it
doesn't already have in memory, that 404s as `ChunkLoadError` (Chromium:
`"Loading chunk N failed"`; Safari: `"Importing a module script failed"`;
Firefox: `"error loading dynamically imported module"` — see
`CHUNK_ERROR_PATTERN` in `lib/utils/chunk-error.ts`, shared so the
pattern can't drift between call sites). This isn't a real crash, just
the browser needing a fresh copy, and is handled by a **one-time
auto-reload per tab session** rather than showing the crash screen:

- `components/tauri/error-boundary.tsx`'s `componentDidCatch` catches
  the **React-render-time** case (a lazy-loaded component throwing while
  mounting).
- `components/tauri/global-error-listener.tsx`'s `window` `error`/
  `unhandledrejection` handlers catch the **more common** case: most
  real `ChunkLoadError`s are a rejected dynamic `import()` promise (a
  route-level code-split chunk failing to fetch during client-side
  navigation), which never reaches a React throw at all.

Both funnel through the same `sessionStorage` guard
(`CHUNK_RELOAD_GUARD_KEY`) so a genuinely-broken deploy (the chunk still
404s after the reload) falls through to the normal crash screen instead
of reload-looping forever; `GlobalErrorListener`'s mount effect clears
the guard on every clean boot, so a *later*, unrelated chunk error in the
same tab session still gets its own fresh one-time retry.

## UI conventions worth knowing before changing shared components

- **Full-screen page takeover**: `fixed inset-0 z-50 flex flex-col
  bg-background` (no dashboard shell, no sidebar), used for
  `stock-batch/stock-audits.tsx` (Cycle Count) and both
  `app/(dashboard)/procurement/new|edit/page.tsx`. Header uses `style={{
  paddingTop: "calc(var(--tauri-top, 0px) + 1.25rem)" }}` to clear the
  Tauri title bar. Reach for this pattern (over an embedded
  `rounded-2xl border` panel inside the dashboard shell) for any
  multi-step or dense-table flow that deserves the user's full attention.
- **Search-to-create combobox pattern**: `components/ui/product-combobox.tsx`
  (generic, also used for the product name field) and
  `components/procurement/supplier-combobox.tsx` (vendor-specific) both
  follow the same shape: type to fuzzy-filter, click/scroll to pick, and a
  pinned "Create ..." row — tinted `bg-primary/10 text-primary`,
  `font-semibold` — that stays visible at the top of the dropdown
  regardless of whether matches also exist below it (a "only show create
  when zero matches" rule was tried and rejected: fuzzy search almost
  always finds *something*, so that hid the create option in practice).
  `ProductCombobox` has opt-in flags for reuse in different contexts:
  `showGlobalSuggestions` (catalog matches vs. the static
  non-catalog name-suggestion list — never mix both in one dropdown),
  `showCreateNewOption` (off for the Add/Edit Product dialog's own name
  field — "create the product you're naming" isn't meaningful there), and
  `showSearchIcon` (leading `Search` icon, hidden below `sm`, for contexts
  that are genuinely a search bar rather than a name field).

- **Category pickers read the `categories` table, never `suggestions.ts`.**
  `components/ui/category-combobox.tsx` is the one picker for *choosing* a
  category (Add/Edit Product, and the receive flow's inline fix-up). It
  queries `getCategoryList()` (`lib/db/queries/categories.ts` — the canonical
  one; the near-duplicate `getCategoriesList()` in `queries/products.ts` was
  deleted, along with `queryKeys.categories.all`, so there is only
  `queryKeys.categories.list()` now) and shows a pinned `Create "{typed}"`
  row, which is what keeps it open-ended: both save paths
  (`use-save-product-mutation.ts`, `use-product-quick-edit-mutation.ts`)
  create a missing category by name. `FORM_SUGGESTIONS.categories`
  (`lib/constants/suggestions.ts`) is only ever allowed in a category
  *creation* field (`settings/store/category-form-dialog.tsx`), never as
  options in a picker — a fresh install shows an empty list plus the create
  row rather than pharmacy reference data a construction-materials store
  will never use.
  It is deliberately an **in-DOM absolutely positioned** dropdown, not a
  `createPortal` one like `components/ui/searchable-input.tsx`: every caller
  sits inside a Radix dialog, and that dialog's `react-remove-scroll` lock
  blocks wheel/touch scrolling over a portaled sibling of the dialog
  content, so a portaled option list could not be scrolled at all. Don't
  "simplify" it back to `SearchableInput` inside a dialog.
- **Scroll affordances** (`components/ui/scroll-fade.tsx`,
  `components/ui/scroll-to-top-button.tsx`). `ScrollFade` (top/bottom) and
  `HorizontalScrollFade` (left/right) are the house cue for a clipped
  scroll region; the horizontal one exists specifically for the
  `.hide-scrollbar` metric/card strips, which by design have no scrollbar
  to give the game away. `ScrollToTopButton` takes the *same* ref the list's
  `useVirtualizer` holds and portals a fixed button measured off that
  element's bounding rect (the lists sit inside cards with their own
  overflow/transform contexts, which would clip or re-anchor an absolute
  child). All three no-op safely where `ResizeObserver` is missing (jsdom).
  Tab rails (`components/ui/tabs.tsx` and the `TabsList`-based status
  filters) deliberately get no fade — the active-tab indicator is already
  their orientation cue.
  The always-visible scrollbar block in `app/globals.css` now colours the
  thumb with `color-mix(in srgb, var(--primary) …%, transparent)` rather
  than a neutral grey, so every theme variant and both light/dark modes
  follow from the one token; don't hardcode a per-theme hex there.
- **`FilterPill`** (`components/ui/filter-pill.tsx`): a "Label: value"
  dropdown that replaces a long row of one-per-value quick-filter chips.
  Used for Category/Inventory filters on the product catalog and the audit
  ledger's category picker. Prefer this over adding another chip row when a
  filter has more than ~4-5 possible values.
- **`ResponsiveTabLabel`** (`components/ui/responsive-tab-label.tsx`):
  `<span className="md:hidden">{short}</span>` / `<span className="hidden
  md:inline">{long}</span>`: the house pattern for abbreviating table
  headers/labels on small screens instead of letting them force horizontal
  scroll.
- **No raw `<table>` elements, ever.** Every data table in the app is
  div-based with ARIA roles standing in for real `<table>` semantics
  (`role="table"` / `"rowgroup"` / `"row"` / `"columnheader"` / `"cell"`),
  laid out with CSS Grid (a single `grid-cols-[...]` template string shared
  between the header row and every body row (never repeat per-column
  widths in each row separately, that's exactly how header/body columns
  drift out of alignment). See `components/stock-batch/supplier-table.tsx`
  for the reference implementation, or `components/activity-log/activity-log-page.tsx`
  for one with a sticky first column and row click/keyboard handling.
  `components/ui/table.tsx` (the shadcn `<table>`-based primitive) exists
  but is intentionally unused, don't reach for it.
  `components/settings/roles-permissions/permission-matrix.tsx` was migrated
  to this pattern on 2026-09-28 (it had been missed by the earlier sweep);
  because its column count is the group count and so isn't knowable at build
  time, its shared template lives in one `gridStyle` object spread onto the
  header row and every body row instead of a Tailwind `grid-cols-[...]`
  class — the rule is "one template, one place", not "must be a class".
  `components/stock-batch/stock-audits.tsx`'s off-screen printable sheet
  followed on the same day, and is the one documented **layout** exception:
  it is div-based with the same ARIA roles, but laid out with `display:
  table*` utilities (`table` / `table-header-group` / `table-row` /
  `table-cell`) instead of CSS Grid, because a browser only repeats a header
  across printed pages when that header box is a `table-header-group`, and
  that sheet routinely runs to several pages. Any other **print-only** sheet
  should copy that shape; on-screen tables stay on grid. No raw `<table>`
  elements remain in the app outside the unused `components/ui/table.tsx`.
- **Dense "ledger" tables** (receive-goods, stock audit): same div/grid/ARIA
  pattern, with a `sticky left-0` item-name column and `overflow-x-auto` on
  the wrapper: the agreed pattern for "QuickBooks/Moniebook-style" dense
  editable grids. Match header and body cell padding exactly (`px-3 py-2`
  convention); a mismatch here is an easy-to-miss bug that makes columns
  look misaligned under their headers.
- **Paginated tables** get a standard footer via `components/ui/table-pagination.tsx`:
  a rows-per-page selector, "Showing X-Y of Z", and "Page A of B" with
  prev/next. Use it for any new paginated table instead of hand-rolling
  pagination controls.
- **`hover:` variant is redefined project-wide** in `app/globals.css` to
  only apply under `(hover: hover) and (pointer: fine)`: this fixes an iOS
  Safari/WebKit double-tap-to-hover bug. Every existing `hover:` utility
  picks this up automatically; don't reintroduce a raw media query for the
  same problem.
- **`--input` CSS variable** is the *border* color for form controls
  (`border-input` on Input/Select/Textarea/Switch), not a background.
  Don't set it to something close to `--card`/`--background` or borders go
  invisible (this exact bug shipped once; see commit `54272f5`).
- **PO number / SKU-style IDs**: `PO-XXXXXXXX` (first 8 chars of the UUID,
  uppercased) is the display convention for order/audit IDs, see
  `formatPONumber` in `components/procurement/purchase-order-table.tsx` for
  the canonical helper; don't reintroduce ad-hoc `id.split("-")[0]` calls.
- **Header day format**: short weekday (`Thu, Aug 13`), not long, see
  `components/dashboard/dashboard-header.tsx`.

## Testing & verification

- `npm test`: Vitest unit tests. Cover: DB transaction semantics
  (`db-transaction.test.ts`), sync engine behavior
  (`sync-engine.test.ts`), stock audit math (`stock-audit.test.ts`), query-key
  factory shape (`query-keys.test.ts`), and various calculation/parsing
  utilities.
- `npm run test:e2e`: Playwright, full user flows (auth, sales lifecycle,
  procurement, products, dashboard, expenses, customers). Since a fresh
  browser context starts with an empty IndexedDB, don't rely on network
  interception or the "Setup New Store" flow for initial state — a
  `global.setup.ts` script pre-seeds `idb-keyval` with a dedicated test
  account (`admin@dumosrx.com`, PIN `1234`) and mock data once; test files
  import `test`/`expect` from `e2e/fixtures.ts` (not `@playwright/test`
  directly) to inject that seeded database via `window.restoreDatabase()`
  before navigating. Avoid `page.goto()` for internal navigation (forces a
  full reload, resetting SPA state); click through sidebar links instead.
  New pages should get E2E coverage alongside the existing core set
  (Dashboard, POS, Inventory, Customers, Procurement, Expenses, Reports) so
  the whole app stays covered, not just the area you're adding.
- `npm run test:schema`: diffs local SQLite schema against the Laravel
  backend's live MySQL schema. Requires the sibling `../laravel-server` repo
  and a working `php artisan tinker` in it.
- **There is no substitute for exercising a change in the actual app** for
  anything touching a live screen. This session's convention has been:
  start the dev server (`npm run dev`, already runs on `:3000` in most
  sessions, check before starting a second one), drive it via the
  claude-in-chrome browser tools, and actually click through the flow
  rather than trusting `tsc`/tests alone for UI-shaped changes. If you edit
  files while the dev server is mid-session and hit a `Rendered more hooks
  than during the previous render` error that traces into Next's *router*
  internals (not your component), that's stale Fast Refresh state after
  adding/removing files. Ask for (or do, if permitted) a dev-server
  restart rather than debugging it as a real bug.
- `npm run lint` (ESLint) and `tsc --noEmit` (no dedicated script currently,
  run `npx tsc --noEmit -p .`) before considering non-trivial changes done.
- These are no longer advisory. `.github/workflows/checks.yml` runs
  `npm ci --legacy-peer-deps`, `npx tsc --noEmit` and `npx vitest run` for
  `client/` and `php artisan test` for `laravel-server/`, and every deploy
  and release workflow calls it as a `needs:` gate — a red check stops the
  deploy, it does not just annotate it. `next.config.mjs` no longer sets
  `typescript.ignoreBuildErrors`, so `next build` type-checks too. Running
  both locally first is still the fast path; CI is the backstop.

## Running things

```
npm run dev              # Next dev server, 0.0.0.0:3000
npm run tauri dev        # (if configured) desktop app against the dev server
npm run build             # production Next build
npm run release           # scripts/release.ts: version bump + release flow
```

## Online storefront orders (`components/pos/online-orders-modal.tsx`)

Orders placed on the public storefront (`web/app/store/[store_slug]/`) are
fetched from the API, never synced into local SQLite — there is no
`online_orders` table in `lib/db/schema.ts`. Fulfilling one is what turns it
into local data.

**`useFulfillOnlineOrderMutation` writes locally FIRST, in one
`transaction()`, and only then calls the server. Don't re-invert that.** The
original order (server first, local writes after) meant any failure in the
local leg — a SQLite write error, the writer-tab lock, the app being killed
mid-loop, one item of several throwing — left the order server-side
`fulfilled` and therefore hidden from this modal's `pending`-only actionable
list, with no sale recorded and stock never deducted: revenue missing from
every report, inventory permanently overstated, silent and unrecoverable
through the UI. Now a server failure is a retryable error with correct local
books already queued in `_sync_queue`, and a local failure rolls back whole.
The retry is only safe because the server rejects a non-`pending` transition
with a 409. Full writeup: `docs/FIXED_BUGS.md` (SF-P2-5/SF-P3-6).

`apiClient.fulfillOnlineOrder()` sends `payment_confirmed: true` explicitly —
the server no longer infers payment from fulfilment, and "Fulfill & Deduct
Stock" is pressed at the counter as the goods are handed over and the money
is taken. `GET /app/online-orders` is now bounded to 50 newest-first with a
`has_more` flag; the modal renders whatever it's given, so a deeper history
needs a real paginated view.

## Publishing products to the online storefront

`products.show_online` defaults off. Three ways to change it, in increasing
bulk:

1. The per-product switch in `add-product-dialog.tsx`.
2. The **CSV/XLSX importer** (`lib/utils/product-import-export.ts`), which
   handles a `show_online` column with the header spellings owners actually
   type and `parseBooleanValue()`'s accepted values. An unrecognised or blank
   cell returns `undefined` and the product keeps whatever it has — never
   guess, or an ambiguous spreadsheet silently publishes a catalog to a public
   page. The exporter emits `Yes`/`No` under "Show in Online Store", the same
   spelling the importer reads, so export → edit → re-import is itself a bulk
   path.
3. The **"Online" dropdown** on the catalog toolbar
   (`components/products/bulk-show-online-action.tsx`), which follows that
   toolbar's existing convention of acting on the **currently-filtered set**
   ("what's on screen", same as Export) and falls back to the whole store when
   no filter is active. Hidden unless `storeProfile.online_store_enabled`.
   `setProductsShowOnline()` skips rows already in the target state so it
   doesn't queue a no-op sync push per product.

There is no row-checkbox bulk-selection pattern in the products table and
none was invented for this; the filtered-set convention already existed. The
spreadsheet reader/writer plumbing lives in `lib/utils/spreadsheet-io.ts` and
is re-exported from `product-import-export.ts` (that file was over the
350-line limit); import either path, they're the same symbols.

Changing `show_online`, `selling_price`, `name` or `is_active` server-side
dirties the owning store's storefront and schedules a full static rebuild
(~15 minutes at best) — see `laravel-server/AGENTS.md`. The UI copy says as
much, so don't promise instant updates anywhere.

## Online Payments settings panel (`components/settings/store/online-payments-section.tsx`)

Lets a store owner connect a Paystack subaccount so the storefront's `paystack`
checkout option (`web/`) becomes available — country select, bank select
(populated from `GET /store/payment-banks`), account number, an inline
"resolve" confirmation step, then `POST /store/payment-account`. Wired into
the Payment Methods settings panel alongside the existing
`PaymentAccountsCard`.

Two states, one component: a store whose pulled `storeProfile` already has a
`paystack_subaccount_code` gets the read-only **connected** view (bank code +
`****last4`, "contact support to change your bank details"), never the
onboarding form again — changing banks is deliberately a support path, and the
server 409s a second `POST /store/payment-account` anyway. The last-4 and bank
code are synced down for exactly this display.

**"We can't verify this" is not the same as "this account number is wrong."**
`POST /store/payment-account/resolve` returns `verifiable` alongside
`account_name`: `false` means Paystack has no resolver for that country at all
(Kenya/South Africa/Rwanda/Côte d'Ivoire) and is the **only** case where the
"I have double-checked these details" override may be offered — the server
refuses `confirmed_unverifiable` for a verifiable country (Nigeria/Ghana),
where a null `account_name` means the details are simply wrong. Never infer
either from a hardcoded country list in this app; the server reports it per
request.

**Never write `paystack_subaccount_code`/`paystack_subaccount_country`/
`paystack_bank_code`/`paystack_account_number_last4`/`paystack_fee_dirty_at`
locally as if this client owns them.** These five `stores` columns exist in
the local schema only so pull sync's dynamic column list doesn't break on an
unknown column (the same reason `storefront_dirty_at`/`store_slug_changed_at`
are mirrored — see `laravel-server/AGENTS.md`'s model `boot()` hooks
section). The subaccount is created **server-side** by
`PaystackSubaccountService::createSubaccount()`, which is the only source of
truth for whether a store has one; this panel's job is to call the
`/store/payment-*` endpoints and then rely on the next pull sync to bring the
real values down, not to write a locally-guessed subaccount code/masked
number into local SQLite and hope it matches. Treat this exactly like the
"server-only bookkeeping column" convention documented in
`laravel-server/AGENTS.md` — writing one of these fields via `insert()`/
`update()` from this client is a bug, not a shortcut.

## Current focus / recent work (update this section as work continues)

Most recent work (2026-09-29, latest) **re-investigated all twelve
catalog-only keys** left by the 2026-09-28 category-by-category pass, on the
premise that some had been dismissed too quickly. Two had: `run_daily_close`
is now wired to the Daily Close banner's backup/sync buttons (which were a
real data-export leak open to cashiers), and `print_product_labels` to a new
"Print Labels" item in the catalog detail panel's overflow menu, which
finally makes the long-finished barcode dialog reachable. The other nine were
confirmed dead and **removed from the catalog** outright.

Two of those nine came straight back the same day, by a different route:
`delete_products` and `delete_suppliers`. The removal finding was correct —
there really was no delete anywhere — but the owner's call was that this is
a **product gap, not a catalog-cleanup item**, so the features were built
(`deleteProduct()` / `deleteSupplier()`, a confirmation dialog each, gated
menu/action-row triggers) and both keys returned with their enforcement in
the same commit. Read their entries in the Inventory & Stock block for the
**deactivate-vs-delete** design: products get a hard guard (stock on hand,
open purchase order) because they have no deactivate state worth the blast
radius of adding one; suppliers get a debt guard plus a signpost to the
Inactive toggle they already have. The same day's other fix retired the dead
`/inventory/batches` route, which now redirects to the Catalog tab.

46 of the catalog's 47 keys now have a real call site; only `view_dashboard`
is catalog-only, and deliberately so. Read the Enforced permissions section —
especially "The category-by-category pass is complete", "Removed from the
catalog (2026-09-29)" and "The dead `/inventory/batches` route" — before
touching a permission key or re-adding a removed one.

Most recent work (2026-09-28, later) worked through a live client's
("Cynthia", construction-materials store) feedback list — see the
Category-picker, Receiving-cost-scale, Enforced-permissions and
Reports-on-screen-view sections above for the durable rules each item
produced. Deliberately skipped, with reasons: the `TabsList` status-filter
rails got no horizontal fade (their active-tab indicator is the cue, same
call as `components/ui/tabs.tsx`); three virtualized lists
(`pos-virtualized-product-grid.tsx`, `transaction-list.tsx`,
`audit-ledger-step.tsx`) got no scroll-to-top button because their scroll
element is owned by a parent/prop rather than the list itself; POS
Transaction History got no cashier filter (scope creep, Report Center now
covers the need); and `purchase_order_items.unit_cost` is still not
rewritten on receipt (see the receiving section for why).


Most recent work (later on 2026-09-23, ~20:35-23:07 — see `git log` for
full detail) was a second, evening bug-fix/small-feature batch working
directly through a store owner's live testing notes, then a full
`/code-review high` pass against the whole batch's diff:

- **Cashier dashboard metrics fixed properly**: the "Today's Sales" card
  was showing store-wide revenue to cashiers even though a separate "My
  Sales Today" card already existed right next to it — replaced with "My
  Transactions Today" (a count, scoped to the cashier). Both cashier-
  scoped cards were then found (by the same review pass) to be built on
  `getRecentSales(user?.id)` called **undated** — `LIMIT 100`, filtered
  for "today" client-side afterward — so a cashier ringing more than 100
  sales in one day had the earliest same-day ones silently dropped by the
  `LIMIT` before the "is today" filter ever ran. Fixed by using
  `getRecentSales`'s existing (previously unused by this hook)
  `dateRange` param, which filters in SQL and raises the cap to 500 — see
  `lib/hooks/use-my-today-sales.ts`.
- **Reseller vs. store-markup sales split**: the "Reseller sale" POS cart
  toggle was being used for two different business things — an actual
  reseller/agent sale (commission owed) and a store staff member simply
  pricing above normal for their own reasons (no commission, the code's
  own long-standing comment called this "the reseller toggle used purely
  as a price-override mechanism"). These now branch at the point of sale:
  new `sales.markup_type` (`'reseller' | 'store'`, default `'reseller'`
  so nothing about existing rows changes), a required choice before
  checkout when the reseller toggle is on
  (`validatePaymentReadiness` in `lib/hooks/use-pos-payment-helpers.ts`
  blocks otherwise), and a store-markup sale is **pre-settled at
  checkout** (no commission computed, `reseller_commission_redeemed`/
  `claim_type`/`redeemed_at`/`by` all set immediately) instead of sitting
  pending until someone remembers to click "Store Claims Markup" later.
  Distinct badges everywhere a reseller badge already showed (violet
  Handshake "Reseller" vs. blue Tag "Store Markup" — POS transaction
  list, dashboard Recent Activity), plus its own Transaction History
  filter, so an owner can audit every staff-applied markup separately
  from genuine reseller business. Gated behind the new `canUseMarkupSales`
  tier-AND-toggle combined gate — see the Licensing/tiers bullet above.
- **Cross-store transfer requests, now admin-controllable**: a new
  `stores.staff_can_request_transfers` toggle (default off, Settings →
  Multiple Stores) decides whether non-admin staff (specialist,
  `sales_staff`) can use the POS header's "Request stock from another
  store" button added in the earlier same-day batch — admin-tier roles
  (`checkIsAdmin`) can always request one regardless. The combined
  role+setting check is `checkCanRequestStockTransfer()`
  (`lib/context/auth-context.tsx`), extracted as a pure function so it's
  unit-testable independent of the plan-tier/store-count checks
  `pos-layout-header.tsx` also applies.
- **Cancellable stock-audit PDF export**: the PDF render already runs off
  the main thread in a Web Worker, so the app wasn't actually frozen at
  "Rendering PDF... (60%)" — but the full-viewport `LoadingOverlay` gave
  no way out, so a large audit read as an unrecoverable hang. Added an
  opt-in `onCancel` to `LoadingOverlay` and threaded an `AbortSignal`
  through `generateReportPdfBlob` (`lib/utils/report-pdf.tsx`) so
  cancelling actually terminates the worker.
- **Stale-chunk auto-recovery** and the **RSC-payload-served-as-a-page
  PWA bug**: see their own sections above.
- **Review-driven fixes worth internalizing as patterns**, beyond what's
  already covered above: (1) a `useEffect` resetting `isResellerSale`/
  `markupType` when `canUseMarkupSales` flips false mid-session — without
  it, a cart that already had the flag persisted true would lose the
  entire row (including its own reset control) while checkout stayed
  blocked, no way out short of discarding the cart; (2) the "Enable
  Markup Sales" settings switch had no plan-tier gate despite a comment
  elsewhere claiming it did — always grep for the actual usage a comment
  describes, don't trust it; (3) **the exact same "new client-synced
  column, no Laravel migration" failure class from the earlier same-day
  batch (see below) recurred immediately** for `sales.markup_type` and
  the two new `stores.*` toggles — see `laravel-server/AGENTS.md`, this
  is now a proven-recurring gotcha, not a one-off.
- **Verification**: full client (`vitest`, 778 tests) and server
  (`php artisan test`, 278 tests) suites green throughout; the server-side
  migration fix was verified by actually running the full migration chain
  against a throwaway sqlite db and checking the resulting columns/defaults,
  not just reviewing the migration file.

Before that, earlier the same day (2026-09-23, see `git log` for full
detail) was a large,
mostly-independent bug-fix/small-feature batch, largely driven by "what's
still annoying a cashier or a store owner" feedback. Notable pieces beyond
what's already covered above:

- **Cashier UX/permission sweep**: last-bought-price column on the
  Catalog (sourced from the most recently received, non-`ADJ-%` stock
  batch — see `getProductsWithDetails()`), customer deletion (soft
  delete, blocked while the customer has an outstanding balance),
  "remove from this device" on login-picker tiles (local-only, doesn't
  touch the account), Expenses surfaced to cashiers, and the profit-hiding
  sweep described in the Cashier visibility section above.
- **Reseller sales merged into Recent Transactions**: the old standalone
  admin-only "Reseller Commission" tab/panel (`FEATURE_ROADMAP_SPEC.md`'s
  2026-09-16/17 entry) is **gone** — reseller sales now show inline in
  `pos-transaction-history.tsx` with a badge + a "Sale Type" filter, and
  the redeem/store-claim actions live directly in
  `TransactionDetailsDialog` (admin-gated). If you find a stale reference
  to `reseller-commission-panel.tsx`, it's dead documentation.
- **Cross-store stock transfer**: a cashier can now request stock from
  another store directly from POS (`pos-layout-header.tsx`, gated on
  `checkCanProcessSales` + multi-store access) — it takes effect
  immediately (pull-only: the destination is locked to their own active
  store, they can't push stock out to an arbitrary one), flagged
  `stock_movements.status = "needs_review"` for the owner to check
  afterward (see the "Needs Review" badge in `stock-movement-*-row.tsx`).
- **Stock audit export**: split the single ambiguous "Print" action
  (PDF-then-`window.open`, which neither printed nor downloaded cleanly)
  into real Print (native dialog via `printNode()` against a hidden
  printable table), Download PDF, and new Export CSV/Excel.
- **Receipt logo position**: per-store "above"/"beside" toggle
  (`stores.receipt_logo_position`), Settings → Receipt.
- **PO fixes**: "Amount Paid" hidden entirely (not just disabled) when
  "Fully Paid" is selected, its submitted value taken directly from the
  order total rather than a possibly-stale field on both create and edit;
  the edit page's `totalAmount` now derives from `getLineTotal()`
  (`item.subtotal` only updates on cost edits, not quantity ones — a
  "Fully Paid" order with an edited quantity was persisting a mismatched
  `amount_paid`).
- **PWA offline precaching** and **audit-log correlation grouping**: see
  their own sections above.
- **Cross-repo lesson, hit live in production**: added a client column
  without its matching Laravel migration + `$fillable` entry breaks sync
  for every device touching that column, permanently, until fixed —
  happened twice in this session alone (`activity_logs.correlation_id`,
  and a years-old pre-existing case, `stock_movements.movement_type`
  being a MySQL `ENUM` that never actually matched the client's values).
  See `laravel-server/AGENTS.md`'s sync-engine section for the fuller
  writeup — read it before adding any new synced column.

Before that, the **Procurement revamp**: replacing one-at-a-time PO item
entry with the Moniebook-inspired bulk ledger table, and splitting
Standard vs. Immediate PO types. Design doc at
`docs/superpowers/specs/2026-08-29-procurement-revamp-design.md`,
implementation plan at
`docs/superpowers/plans/2026-08-29-procurement-revamp.md` (both worth
reading before touching this area again — they carry the "why" behind the
decisions summarized in Domain model essentials above). Key pieces, beyond
what's already covered above:

- `getActiveProductsForPO()` (`lib/db/queries/procurement.ts`) now returns a
  real `AVG(cost_price)` across active batches plus `stock_quantity`,
  fixing a prior bug where "cost" meant "most recently created batch's
  cost" and stock wasn't selected at all.
- `components/procurement/po-review-price-popover.tsx`: per-row sell-price
  + live margin % popover on Immediate Purchase rows, so cost and sell
  price can be set in one pass instead of a separate Product Catalog trip.
- Retired/deleted: `po-add-item-form.tsx`, `po-line-items-list.tsx`,
  `po-order-form-fields.tsx`, `po-summary-pane.tsx` — all superseded by the
  components named in the Domain model bullet above. If you find a stale
  reference to any of these, it's dead documentation, not a hint they still
  exist.

Before that, work focused on the **Inventory** area:

- Purchase order / receiving tables: refactored for readability, fixed
  input-border visibility, made the receive-goods ledger responsive
  (shortened headers on mobile, aligned padding, full-width inputs).
- **Stock audits reworked into a single "Ledger" flow**: removed the old
  Setup step and Standard (one-item-at-a-time) mode entirely. Now opens
  straight into a dense, QuickBooks-style table covering the whole catalog
  at once, with a category filter (top-left, defaults to All) and search as
  pure view filters, not scope gates, so switching categories mid-count
  never loses progress. Added live Diff Qty/Cost/Selling columns and widened
  the layout to 1280px to fit them comfortably.
- Product catalog filters consolidated from a long horizontal chip row into
  `FilterPill` dropdowns (Category, Inventory, including a new "Expiring
  Soon" state distinct from "Expired").
- Category management lives inline in Settings → Store Profile
  (`CategoriesCard`) as a grid of tiles (icon, editable name, live product
  count) instead of a separate "Manage Categories" modal — the modal
  (`manage-categories-dialog.tsx`) is gone. The Catalog page's "Manage
  categories" action now just navigates to Settings → Categories instead
  of opening it.
- Added `last_audited_at` tracking end-to-end (query → type → UI), with a
  staleness banner on the product detail panel.
- Renamed the "Ledger" inventory tab to "Movements" (it shows stock
  movement history, a different concept from the new audit "Ledger" mode,
  and the rename removes the resulting ambiguity).
- Activity Log rebuilt to match the Catalog page's look: search + `FilterPill`
  filters live inside the table's card, search is fuzzy (against action/table/staff),
  and raw rows (`INSERT`/`purchase_orders`) are humanized into sentences
  ("Created a purchase order") via `components/activity-log/describe-activity.ts`.
  Rows are clickable, opening a slide-in detail panel with the parsed audit payload.
- Migrated every remaining raw `<table>` in the app to the div/grid/ARIA
  pattern (`receive-ledger-table.tsx`, `audit-ledger-step.tsx`,
  `activity-log-page.tsx`, `online-orders-modal.tsx`, `customer-behavior-tab.tsx`)
  and added the shared `TablePagination` footer, see the UI conventions
  section above, which used to (incorrectly) describe `<table>` as fine to use.

**Known open threads / natural next steps** (not started, just discussed):
- Settings and Reports areas were flagged for the same
  Moniebook-reference-driven review the Procurement revamp got, but that
  review was deferred ("Procurement first, then settings, then reports" —
  only Procurement has actually happened so far).
- Invoice/attachment upload and a "vendor bill" toggle on Immediate
  Purchases (both present in Moniebook's flow) were explicitly scoped out
  of the Procurement revamp, not forgotten — see the design doc's
  Non-Goals section.
- QuickBooks/Moniebook CSV/XLS catalog import (real reference file:
  `QB POS Inventory Items Export.xls` under `refs/`) is still an open,
  unscoped feature idea from the same requirements-gathering session.

**Also still open, from the 2026-09-23 batch:**
- PO draft persistence resurfaced a UI gap rather than a data one: values
  now round-trip correctly, but nothing surfaces them anywhere except the
  edit screen's ledger table — no read-only summary view shows a resumed
  draft's saved overrides before you open it for editing.
- Audit Log's pagination count is still computed over ungrouped rows, so
  "25 of N" can show noticeably fewer than 25 visible entries on a page
  with a large sale in it (grouping is presentational-only by design, see
  the correlationId section above — the SQL/pagination layer was
  deliberately left untouched, this is the known cost of that choice).
- The PWA precache manifest includes every file in the static export
  (every route's HTML/JS chunks, both sql.js wasm binaries) with no
  curation — fine at current app size, but worth revisiting (a smaller
  "app shell only" manifest, lazy-caching the rest) if the export grows
  enough to make first-install download size a real complaint.

**Also still open, from the later 2026-09-23 evening batch:**
- **Rollout consideration, not a bug**: `markup_sales_enabled` defaults
  to 0, so every existing Pro/Enterprise store that was already actively
  using reseller-commission sales loses the POS "Reseller sale" row the
  moment this ships, until the owner finds and flips the new toggle in
  Settings → Register Configs. Deliberately not "fixed" by defaulting
  existing rows to on — that was an explicit requirement, not an
  oversight — but worth a release note / in-app notice if this actually
  ships, since it's a silent regression from that store's point of view.
- `getRecentSales`'s undated form is still capped at `LIMIT 100` for
  every other caller (`use-pos-data.ts`'s "recent activity" list, the
  base `pos-transaction-history.tsx` view before a date range is picked)
  — only the cashier-scoped "my sales today" path was moved to a dated
  query this batch. Same theoretical undercount risk exists anywhere
  else that reads it undated and a single user/store can exceed 100 rows
  in the relevant window; not fixed elsewhere because no other caller was
  reported as actually hitting it.
- `sw.js`'s catch-all stale-while-revalidate branch was fixed on
  2026-09-26 — see the PWA section above. `sw.js` still has **no test
  coverage** of any kind, which remains the real open item here.
