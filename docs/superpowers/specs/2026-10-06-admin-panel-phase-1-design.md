# Admin Panel Phase 1 — Honest Metrics & Information Architecture

**Date:** 2026-10-06
**Status:** Design approved, pending spec review
**Packages touched:** `web/`, `laravel-server/`

## Intent

The platform admin panel is to become something the operator can both trust
and work from. Two complaints drive this phase:

1. Several headline figures are wrong, mislabelled, or fabricated. The
   operator cannot tell which numbers mean anything, so none of them can be
   acted on.
2. Telemetry is split across two surfaces, one of which is unreachable, so
   work already built (the Sentry error feed) is invisible.

Phase 1 fixes only those two things. It deliberately adds no new
observability capability — that is Phases 2-6 — but it establishes the
service boundaries those phases build on.

**Guiding rule, applied throughout:** a metric that cannot be measured
renders as unavailable. It never renders as a plausible-looking number.

## Scope boundary

In scope: metric correctness, fabrication removal, the Operations/Settings/
Communications reshuffle, and the `AdminPlatformService` split.

Out of scope, with a phase named: per-store sync health (Phase 2),
subscription lifecycle and failed payments (Phase 3), time-series charts
(Phase 4), the maintenance/migration runner (Phase 5), the consolidated
activity feed (Phase 6).

## Decisions taken during design

- **Multi-currency money is broken down per currency, never converted.**
  Stores span NGN plus CFA/GHS/KES. A single rolled-up total across them is
  not an honest number, and an FX table would mean owning stale-rate risk
  and a new config surface. Each money metric lists one line per currency
  present, formatted through `web/lib/utils/currency.ts`'s `formatMoney`.
- **Aggregation is split by domain with live queries** (Option A), not one
  observability god-service (B) and not a materialized
  `platform_metrics_daily` snapshot table (C). C is held in reserve for
  Phase 4 and only if measurement shows live trend queries are too slow —
  adding a scheduled-job dependency to the Namecheap shared host before
  proving it is necessary is speculative, and `.agents/AGENTS.md` §7
  documents why that box's cron/clock behaviour is not something to depend
  on casually.
- **`/admin/system` is redirected, not deleted,** so existing bookmarks
  survive the move.

## Part 1 — Metric semantics

### 1.1 Overview `stats`

| Current | Defect | Becomes |
|---|---|---|
| Total Stores | None | Unchanged count; trend rendered as `+N this week` absolute |
| Active Users | Baseline is `is_active = true AND created_at < 7d`, which omits anyone active 7 days ago but deactivated since, overstating growth | Same count; trend becomes `+N joined this week` |
| Platform Revenue — `₦{Sale::sum('total_amount')/1e6}M` | Measures **tenant GMV**, not platform revenue. Hardcoded `₦`. Always divided by 1e6, so it reads `₦0.0M` below a million. | **Subscription Revenue** — per currency, from `AdminRevenueService` |
| Global Inventory — `{Product::count()/1000}k` | A catalog row count labelled as inventory (the source comment concedes "Simplified to product count for now"); `/1000` fudge | **Catalog Products** — raw count, no division |

`calculateChange()` is retained for cumulative counts, where comparing the
count as of 7 days ago against now is a legitimate growth rate. It is
**not** applied to revenue: against a lifetime cumulative sum the ratio
decays toward 0% as the platform ages regardless of actual performance.
The Subscription Revenue card therefore ships with **no trend indicator in
Phase 1**; a correct equal-window revenue comparison arrives with Phase 4's
time-bucketed aggregation rather than being approximated here.

Two additions, both reading columns that already exist:

- **Active Subscriptions / Trials**
- **Stores Synced (24h)**, from `stores.last_sync_at`

### 1.2 "Live Operations" panel

| Current | Reality | Becomes |
|---|---|---|
| Total API Requests | `ActivityLog::count()` | **Audit Log Entries** |
| Sync Success Rate | All-time `SYNC_%` tally, never windowed; the UI falls back to the optimistic literal `'100%'` when absent | **Sync Success Rate (24h)**, windowed, no fallback |
| Active WebSocket Connections | `User::where('is_active')->count()`. **The project has no WebSockets.** | **Deleted** |

### 1.3 Stores page addition

**Total Stock Value**, per currency — a platform roll-up of the existing
per-store `AdminStoreOperationalMetricsService::stockValueRaw()`
(`SUM(quantity * cost_price)` over `stock_batches`). This is the figure
previously mislabelled as "Platform Revenue" on Overview; it belongs with
the fleet, not with platform earnings.

### 1.4 System health fabrication removal

| Current | Becomes |
|---|---|
| `"42ms"` literal fallback for latency | Deleted; renders `—` |
| "API Latency (P99)" | **Database Connect Time** — a single PDO connect is what is measured |
| Hardcoded `Stable` / `High Performance` badges | **Removed.** A threshold-derived badge would need latency baselines this phase does not establish; an always-green badge is the fabrication being removed |
| CPU as `sys_getloadavg()[0] * 10` labelled "Utilization %" | **Load Average (1/5/15m)**, its real unit — the `* 10` is only correct on a 10-core host |
| Memory via `shell_exec('free -m')` | When unavailable (expected on shared hosting): **"Unavailable on this host"**, not a 0% progress bar |
| "Infrastructure Nodes" — two hardcoded rows incl. a literal `'1ms'` | Replaced by real probes: DB connect, cache, queue, storage writable |
| "Platform Uptime" — age of the oldest activity log | Relabelled **Platform Age**, which is what the value measures. Real uptime is not built in this phase (it needs a probe history this phase does not add) |
| "System Status" button → `toast.info("Status Page Pending")` | Button removed |

## Part 2 — Information architecture

### Target navigation

- **Operations** (`/admin/operations`) — *new top-level item.* Absorbs the
  orphaned `/admin/system` page and Platform Settings' System Health tab.
  Contains: health probes, resource readings, and the Sentry error feed
  (`getRecentErrors`, previously rendered only on the unreachable page).
  Phase 5's maintenance runner becomes a tab here.
- **Communications** — gains **Templates** (moved out of Settings), beside
  the broadcast and email-campaign tabs that consume templates.
- **Platform Settings** — loses System Health and Email Templates; gains
  **Default Account Manager** (moved off the system page, because it is
  configuration rather than telemetry). Retains billing, suggestions,
  integrations, security, admin-permissions.
- `/admin/system` → redirect to `/admin/operations`.

### Why

Telemetry currently exists twice: a Settings tab and a page missing from
`sidebar-items.ts` entirely, reachable only by typing its URL. The split
meant the Sentry feed was built and then never seen. One surface, reachable
from the nav, resolves both.

Settings' health tab also renders its own `<h1>System Health</h1>` inside a
page already headed `<h1>Platform Settings</h1>` — a duplicate `<h1>` that
disappears with the move.

## Part 3 — Service architecture

### Backend

`AdminPlatformService` is 590 lines, past `.agents/AGENTS.md` §4's 350-line
limit, and holds six unrelated responsibilities. It splits along its
existing seams:

| New service | Absorbs |
|---|---|
| `AdminSummaryService` | `getGlobalSummary`, `calculateChange`, `getAlertTitle` |
| `AdminHealthService` | `getSystemHealth`, `getRecentErrors` |
| `AdminCatalogService` | `getGlobalProducts`, `getProductMetrics`, `standardizeCatalog` |
| `AdminActivityService` | `getActivityLogs`, `globalSearch` |

New alongside them:

- `AdminFleetMetricsService` — the platform-wide, per-currency stock-value
  roll-up, wrapping the existing per-store `stockValueRaw()` rather than
  reimplementing the calculation.
- A shared currency-grouping helper. Per-currency breakdown is needed by
  revenue (now), stock value (now), and lifecycle metrics (Phase 3); it is
  extracted once rather than written three times.

`AdminRevenueService` is unchanged — its `PaymentTransaction` sum is already
the correct definition of platform revenue, and its docblock already
identifies the Overview stat as the wrong one. Overview now consumes it.

`AdminPlatformController` becomes a thin delegator over the new services,
per §4's Controller/Service separation.

### Frontend

`components/admin/views/system-health-tab.tsx` (300 lines) decomposes into
the Operations page and its child components. Money rendering goes through
`formatMoney`, never a new per-file `naira()` helper —
`web/AGENTS.md` already records those as a known wart.

## Part 4 — Testing

Per `.agents/AGENTS.md` §9:

- **Per-currency grouping**, unit-tested on both revenue and stock value,
  with a multi-currency fixture (NGN + GHS + KES). This is money logic.
- **Graceful degradation**: tests asserting that an unmeasurable metric
  returns unavailable rather than `0` or a plausible string. This is the
  phase's central claim and must not regress.
- **Fabrication scanner**: a test mirroring the existing
  `web/__tests__/no-hardcoded-domains.test.ts`, failing the build on
  re-introduced literals such as `"42ms"` in admin metric components.
- **Browser smoke test** signed in as `super_admin` *and* as a custom
  platform role. §9 is explicit that backend verification is not UI
  verification, and this phase changes nav visibility — exactly the class of
  bug `tinker` cannot catch. `checkCanAccessAdmin` is permission-based
  (`manage_platform`), so a custom role must reach Operations without any
  frontend change.
- `npm run test:schema` is **not** required: no table or column changes.

## Documentation to ship in the same change

Per §2, docs ship with the code:

- `web/AGENTS.md` — the new admin IA (Operations page, where templates and
  the account-manager card moved, and why).
- `laravel-server/AGENTS.md` — the `AdminPlatformService` split and the
  per-currency money rule.
- `docs/KNOWN_BUGS.md` — two defects found while scoping and **not** fixed
  here:
  - `AdminRevenueService::getOverview()` calls `->get()` on all matching
    transactions and paginates in PHP, violating §8's pagination rule;
    it degrades as payment volume grows. (Phase 3.)
  - Oversized admin frontend files not touched by this phase:
    `activity/page.tsx` (550), `broadcasts-tab.tsx` (472),
    `users/page.tsx` (420), `subscription-config-tab.tsx` (399),
    `users/new/page.tsx` (394) — all past §4's 350-line limit.
- `docs/FIXED_BUGS.md` — the mixed-currency summation defect, fixed here by
  the per-currency breakdown.

## Success criteria

1. No figure in the admin panel is fabricated, mislabelled, or derived from
   a different quantity than its label claims.
2. Platform revenue on Overview equals Marketing → Revenue's total, because
   both read `AdminRevenueService`.
3. Total stock value appears on the Stores page, per currency.
4. Every telemetry surface is reachable from the sidebar; the Sentry error
   feed is visible without typing a URL.
5. Email templates sit beside the campaigns that use them.
6. No file added or modified by this phase exceeds 350 lines.
7. An unavailable metric is visibly unavailable to the operator.
