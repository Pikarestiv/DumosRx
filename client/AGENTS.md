# AGENTS.md: DumosRx Client

This file exists so that any AI (or human) picking up this repo cold can get
oriented quickly and work consistently with existing conventions. Keep it
updated when architecture, conventions, or the current focus of work change:
it decays fast otherwise, and a stale doc is worse than no doc.

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
  procurement/            Purchase orders, receiving (ledger-style dense table)
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

## UI conventions worth knowing before changing shared components

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
  procurement, products, dashboard, expenses, customers).
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

Most recent work (see `git log` for full detail) has been on the
**Inventory** area:

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
- "Last Received" per product (from `stock_movements` where
  `movement_type = 'purchase'`) was discussed as a good follow-up to Last
  Audited but deliberately deferred as a separate piece of work.
