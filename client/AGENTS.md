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
the column to the `CREATE TABLE` in `schema.ts` **and** to the migration
list in `core.ts` if existing local databases need to pick it up without a
full reinstall.

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
- Sync failures use exponential backoff per queue item
  (`recordSyncFailure` in `base-helpers.ts`), with a one-time report to
  superadmins after `SYNC_FAILURE_REPORT_THRESHOLD` (5) consecutive
  failures on the same item.
- `syncSubscriptionStatus()` is a separate, lighter-weight pull of just the
  `stores` table (tier/status/suspension), run even for free-tier stores
  that don't get full sync, so plan changes/suspensions still land.

Call `sync(true)` before any workflow where stale local data would be
actively misleading (e.g. `StockAudits` syncs on mount before showing
counts, see `components/stock-batch/stock-audits.tsx`).

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

## Cashier (`sales_staff`) visibility gating — a recurring pattern, not a one-off

A cashier account should never see store-wide profit/margin figures or
manage stock/settings beyond their own sales. The established check is a
direct `user?.role === "sales_staff"` (or `!== "sales_staff"` to show
something to everyone else), matching the pattern already used in
`daily-close-report.tsx`, `transaction-metrics.tsx`,
`product-pricing-info.tsx`, and `transaction-details-dialog.tsx` — **not**
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

## Running things

```
npm run dev              # Next dev server, 0.0.0.0:3000
npm run tauri dev        # (if configured) desktop app against the dev server
npm run build             # production Next build
npm run release           # scripts/release.ts: version bump + release flow
```

## Current focus / recent work (update this section as work continues)

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
- Category management now also accessible from Settings → Store Profile
  (`CategoriesCard`), in addition to its original entry point on the
  Catalog page: same dialog, same data, two entry points by design.
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
