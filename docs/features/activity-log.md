# Activity Log

Route: `app/(dashboard)/activity-log/page.tsx` → `<ActivityLogPage />`
(`components/activity-log/activity-log-page.tsx`). Following the recent
refactor (commit `7e28c577`), the page composes several dedicated modules
under `components/activity-log/`:

- `activity-log-filters.tsx` — search box + filter pills (Date range / Action
  / Role / Staff).
- `activity-log-rows.tsx` — `ActivityLogDesktopTable` (div-based table, ARIA
  roles) and `ActivityLogMobileList` (stacked cards).
- `activity-log-detail-panel.tsx` — slide-in panel showing the full row.
- `describe-activity.ts` / `format-action-label.ts` — turn raw
  `action`/`table_name` values into human-readable sentences.

Data layer: `lib/db/queries/activity-log.ts` (`getActivityLog`,
`getDistinctActivityActions`, `getDistinctActivityUsers`), all reading the
`audit_logs` table.

## Plan gating

**Not gated.** Unlike Prescriptions/Procurement/Expenses/Loyalty Program,
`app/(dashboard)/activity-log/page.tsx` does not wrap its content in
`<LockedModuleOverlay>`, and `locked-module-overlay.tsx`'s `featureKey` union
has no entry for it. (The union's `"audit"` key maps to
`canUseAuditMode`/`audit_mode` — a separate stock cycle-count feature, not
this page — confirmed by reading both files; don't confuse the two.) Every
plan tier sees the full, unfiltered Activity Log.

## What generates a log entry

Every row in `audit_logs` comes from one call to `logAction()`
(`lib/db/core.ts`). Two call-site shapes exist:

1. **Generic CRUD helpers** (`lib/db/base-helpers.ts`) — `insert()`,
   `update()`, `softDelete()`, and `remove()` each call `logAction()`
   automatically for **every table** they touch, so any create/update/delete
   that goes through the shared helpers is logged with zero extra code at the
   call site. Default actions: `INSERT` / `UPDATE` / `DELETE` (soft) /
   `HARD_DELETE` (only `remove()`, a real unrecoverable `DELETE FROM`, since
   this is "the one place where NOT capturing this would leave a real blind
   spot," per the code comment). The one exception: `feedback` inserts are
   deliberately **not** logged (`insert()` special-cases `table !== "feedback"`)
   because that table holds background crash/error telemetry, not a user
   action — logging it would surface every silent crash report as a "Created
   feedback" row.
2. **Named actions** (`lib/db/audit-actions.ts`'s `AUDIT_ACTIONS` constant) —
   passed as `options.action` to override the generic default when a raw
   INSERT/UPDATE doesn't say enough on its own:
   - `LOGIN` / `LOGOUT` / `LOGIN_FAILED` / `PIN_CHANGED` —
     `lib/context/auth-context.tsx`.
   - `RECEIVE_PO` — `lib/db/procurement-receiving.ts` (both the "receive on
     create" and later-partial-receive paths call it).
   - `SALE_RETURN`, `STOCK_ADJUSTMENT`, `STOCK_EXPIRED`, `STOCK_DAMAGED` —
     defined in `audit-actions.ts`; not directly grepped for call sites here,
     but follow the same `options.action` pattern.

Cross-referenced via `grep -rn "logAction(" client/lib client/components`:
every call funnels through the two shapes above — there is no third,
ad-hoc call site anywhere in the app.

### Bulk operations still log per-row

The product **import** flow inserts one product at a time through the same
`insert()` helper (not a separate bulk-insert path), so a 1,513-row import
produces 1,513 individual "Created a product" entries — confirmed live: with
the search box scoped to `products`, entries for this task's smaller Task-1
import batch appear as one row per product, all timestamped within the same
minute.

## Filters

- **Search** (`SearchInput`, "Search by action, table, or staff member") —
  client-side fuzzy search (`genericFuzzySearch`) over `action`, `table_name`,
  and `user_name` **only** — it does not search the `details` JSON payload
  (so you can't search by, e.g., an expense's description text). When active,
  the page fetches up to `SEARCH_FETCH_CAP` (2,000) rows matching the other
  filters and fuzzy-searches that batch client-side, rather than paginating
  normally.
- **Date range** (`DateRangePicker`) — presets (Today/Yesterday/Last 7 days/
  Last 30 days/This month/Last month/Year to date/Last year) or a manual
  calendar range. Maps to `from`/`to` on `getActivityLog()`, filtered
  server-side (well, client-side against the local SQLite DB) via
  `al.created_at >= ?` / `<= ?`. Verified live: "Today" correctly narrowed
  2,739 rows down to the single row from today.
- **Action** — populated from `getDistinctActivityActions()` (distinct
  `action` values actually present for this store), labeled via
  `describeActionVerb()` (e.g. raw `"RECEIVE_PO"` → "Received goods for a
  purchase order", raw `"INSERT"` → "Created"). Verified live: selecting
  "Received goods for a purchase order" correctly narrowed to exactly the 3
  PO-receive events on this store.
- **Role** — only shown when `canViewAll` is true (see below); options come
  from `STAFF_ROLES` (a fixed constant list), not from distinct roles present
  in the data.
- **Staff** — only shown when `canViewAll` is true; populated from
  `getDistinctActivityUsers()`. Verified live: selecting the single seeded
  user narrowed nothing further (single-user store), as expected.
- **Table** — there is no discrete "Table" filter pill in the UI (the
  `ActivityLogFilters` type/`getActivityLog()` query layer supports a
  `tableName` param, and
  `getDistinctActivityActions`/`getDistinctActivityUsers` both accept an
  optional `tableName` too, but nothing in `activity-log-page.tsx` wires a
  pill to it). The closest equivalent is typing the table name into Search
  (e.g. "products"), which matches on `table_name` as one of its three fuzzy
  fields.

All filters combine with AND semantics (`getActivityLog()`'s `conditions`
array), and changing any filter resets pagination back to page 1.

## Row-level visibility (`checkCanViewAllActivity`)

`lib/context/auth-context.tsx`: only `admin`/`store_owner` roles see every
user's activity, the Role/Staff filter pills, and can filter by other staff.
Every other role has `userId` silently forced to their own `user.id` in
`baseFilters` — they only ever see their own actions, and the Role/Staff
pills don't render at all for them.

## Row → detail panel

Clicking any row (desktop table row or mobile card) opens
`ActivityLogDetailPanel` (`ResponsiveDetailPanel`, slide-in on desktop /
sheet on mobile): a human sentence (`describeActivity()`) as the title,
`table_name` + formatted timestamp as the subtitle, then "Performed By",
"Record ID" (if present), and "What Changed" — every key in the row's
`details` JSON payload except internal/bookkeeping columns
(`HIDDEN_KEYS`: `id`, `created_at`, `updated_at`, `_version`, `_synced`,
`_synced_at`, `_deleted`, `store_id`, `pin`), each humanized
(`humanizeKey()`) and value-formatted (`null`/`undefined`/`""` → "N/A",
booleans → "Yes"/"No"). If `details` fails to parse as JSON, it falls back to
showing the raw string in a `<pre>` block; if there's no `details` at all, it
shows "No further details recorded." Verified live: opening a "Created a
expense" entry showed Category/Amount/Description/Date/Payment Method/
Notes/Covers Months/User Id exactly matching what was entered when that
expense was created.

## Sorting & pagination

Desktop table columns Activity/By/When are each sortable
(`SortableHeaderCell`, `ActivityLogSortKey = "created_at" | "action" |
"user_name"`), toggling asc/desc per click, defaulting to `created_at desc`
(newest first). Standard `TablePagination` (configurable page size, default
50) — `2,739` total rows on the live test store paginate to 55 pages at the
default size.

## Test coverage

Some unit coverage of the query layer existed before this task
(`__tests__/activity-log-store-scoping.test.ts`,
`__tests__/activity-log-filters.test.ts` — store scoping and the `tableName`
filter param on `getActivityLog()`), but **zero e2e/UI-level coverage**
(confirmed via `grep -rln "activity.log\|audit_logs" __tests__/ e2e/`).

**Closed (Step 4):** added `client/e2e/activity-log.spec.ts` — logs in,
elevates to paid tier (Expenses, the traceable action used, is itself
paid-tier-gated; Activity Log is not — see "Plan gating" above), adds a
uniquely-named expense, navigates to Activity Log, and asserts the newest row
is "Created a expense" / `expenses`, then opens its detail panel and confirms
the exact Description/Amount match what was just entered and "Performed By"
is a real actor (not "System").

## Bugs found

None. Step 1's live walkthrough specifically set out to confirm three
already-completed actions from earlier tasks left a trail — the product
import (Task 1), the PO create/receive cycle (Task 6), and the expense
add/edit/delete (Task 7) — and all three were found correctly logged with
accurate actor, table, action, and (via the detail panel) payload. Every
filter (Action, Role, Staff, Date range, Search) behaved as designed when
exercised live. No audit-trail gap was found.
