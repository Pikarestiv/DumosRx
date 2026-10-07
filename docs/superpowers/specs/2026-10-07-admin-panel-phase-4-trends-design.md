# Admin Panel Phase 4 — Trends

**Date:** 2026-10-07
**Status:** approved (design settled in-session; charting = recharts, MRR = cash collected)
**Predecessors:** Phase 1 (honest metrics + IA), Phase 2 (sync health), Phase 3 (subscription lifecycle), Phase 5 (maintenance — jumped the queue to close an active incident).

---

## Part 0. What this is, and the number it refuses to invent

Phases 1–3 answer "what is true right now". This phase answers "which way is it
moving" — the question an owner actually asks before deciding anything.

### MRR is not derivable, and will not be faked

`subscriptions` has `plan_name`, `start_date`, `end_date`, `status`, `is_trial`
and nothing else. **No amount. No billing cycle.** Billing cycle exists only
inside `payment_transactions.metadata` for manually activated plans, and nothing
anywhere records whether a subscription auto-renews. A figure labelled "MRR"
would be a guess wearing an accountant's hat — precisely the class of number
Phase 1 existed to delete.

So this phase reports **cash collected**: successful `payment_transactions`,
bucketed by month, **per currency, never summed across currencies**. It is
labelled as what it is. The missing columns are logged as the reason MRR is
absent, so the next person doesn't re-derive the discovery.

### The rule, carried forward

Phase 1's rule governs: **a metric that cannot be measured renders as
unavailable, never as a plausible-looking number.** Phase 5 added a corollary
worth repeating here — zero and unknown must never render alike.

---

## Part 1. Six series, and exactly where each comes from

| Series | Source | The trap it avoids |
|---|---|---|
| Cash collected | `payment_transactions` where `status='success'`, by month **and currency** | Summing NGN and CFA into one meaningless line |
| New paid subscriptions | `subscriptions.start_date`, `is_trial = false` | Counting rows; an owner with three renewals is not three customers |
| Trial starts | `subscriptions.start_date`, `is_trial = true` | — |
| Trial conversions | Phase 3's definition (`SubscriptionService`) | A win-back trial scored as an instant conversion |
| Churn | owners reaching `lapsed` in the bucket, via `subscriptionState()` | Re-deriving grace; a second definition of "lapsed" |
| Store signups | `stores.created_at` | See **Part 2** — this one is subtler than it looks |

Sync success rate already exists as a real daily series from Phase 2
(`sync_health_daily`) and stays on Operations. It is not duplicated here.

### Windows

`30d` (daily buckets), `6m` and `12m` (monthly buckets). One request returns
every series for the chosen window — six round trips to draw one screen is how
a dashboard becomes the slowest page in the panel.

---

## Part 2. A trend must not rewrite its own past

**Store signups counts the event, not the current population.** A store that
signed up in March and was deleted in August still signed up in March.

This cuts against Phase 1, deliberately. Phase 1's "active stores" excludes
soft-deleted stores, because it answers *how many exist now*. If this series
inherited that filter, every deletion would retroactively shrink a past month,
and March's bar would be a different height each time anyone loaded the page.
A chart whose history changes is worse than no chart: it destroys trust in the
numbers beside it, which are correct.

So: **signups includes soft-deleted stores; `withTrashed()` is the correct
query here and `withoutTrashed()` is the bug.** The same reasoning applies to
subscriptions and payments — a historical bucket is immutable.

**Demo stores are excluded**, because a demo store is not a signup. `is_demo`
is currently surfaced in the admin store lists but filtered nowhere; this is the
first place it changes a number, which is noted in `laravel-server/AGENTS.md`
so the inconsistency is deliberate rather than discovered later.

---

## Part 3. Empty buckets are zero; absent data is not

A `GROUP BY` returns no row for a month with no activity. Rendering that series
as-is makes the line jump straight from May to July as though June did not
exist — the chart lies about its own shape while every value in it is correct.

**Every series is zero-filled across the full window in PHP**, from boundaries
generated in PHP (§7: `now()`, never MySQL's clock). Bucketing uses
`DATE_FORMAT(created_at, '%Y-%m')`, which formats a stored column and is fine;
what is forbidden is `NOW()`/`CURDATE()` deciding the window.

The distinction that matters: **a zero-filled bucket means "we looked and there
was nothing". An unavailable series means "we could not look."** They render
differently, and a series that fails to compute never renders as a flat line at
zero.

---

## Part 4. Where it lives, and the gate

New `/admin/trends`, nav item under Operations, **super_admin only**, four
layers exactly as Phases 3 and 5 established:

1. `role:super_admin` route middleware — the control
2. nav item gated to match (`web/AGENTS.md`: a nav item's gate must match its
   page's narrowest endpoint gate)
3. page guard before any fetch, so a deep link gets an explicit refusal rather
   than a generic failed-to-load screen
4. no mutations at all — this page is read-only, so there is no fourth-layer
   action to get wrong

The reasoning is Phase 3's: these are revenue series, and
`RegisteredStoreSummary` already withholds money data from
`platform_admin`/`agent`. A scoped per-agent view remains the logged follow-up
(A-176, successor to PG-19's reasoning).

A custom platform role holding `manage_platform` + `view_platform_data` (the
A-141 shape) must be refused, and its test must prove it cleared the outer group
gate first — `AdminRoleService::createRole()` grants `manage_platform` itself.

---

## Part 5. Frontend

`recharts` added to `web/` (chosen in-session over hand-rolled SVG: axes,
tooltips and responsive resize are not worth re-implementing and getting subtly
wrong).

- `components/admin/trends/` with **one** `TrendChart` wrapper owning axes,
  tooltip, grid and responsive config, so six charts do not each re-specify it.
- `CurrencySeriesChart` renders **one line per currency**. There is no combined
  total line, because there is no exchange rate in this system and inventing one
  is the same error as MRR.
- Colours from semantic theme tokens and the Tailwind palette the admin panel
  already standardises on; **no arbitrary hex** (§6).
- Axis and tooltip dates in **DD/MM/YYYY** via the existing
  `formatDateOnlyToDDMMYYYY` (§6).
- The page owns one query and passes the payload down, the pattern Phase 3's
  review settled on for the tab counts.

---

## Part 6. Testing

Backend:

- **bucket boundaries**: a payment at the first and last instant of a month
  lands in that month and not its neighbour — run under `TZ=America/New_York`
  too, since month boundaries are exactly where a timezone bug hides
- **zero-fill**: a window containing an empty month returns that month at zero,
  not absent
- **unknown ≠ zero**: a series that cannot be computed is unavailable, and never
  a flat zero line
- **per-currency separation**: NGN and CFA never sum
- **history is immutable**: a soft-deleted store still counts in the month it
  signed up (this is the Part 2 rule, and the test that would have caught the
  `withoutTrashed()` version)
- **demo stores excluded** from signups
- **churn counts owners, not rows**, via the shared resolver
- **query budget**, in Phase 3's shape: churn runs through the PHP grace
  resolver, so it is the series that can quietly scale with the store count
- `role:super_admin` on the endpoint for `platform_admin`, `agent`, and the
  custom-role shape

Frontend:

- the page guard renders the refusal and issues **no request** for a refused role
- an unavailable series renders as unavailable, not as zero
- DD/MM/YYYY on axis and tooltip
- the currency chart renders one line per currency and no total

Plus §9's logged-in browser smoke test, as super_admin and as a lesser role, in
the same pass. Phase 5 is the precedent for why: its entire backend suite passed
while the page 500'd on first load.

---

## Part 7. Out of scope

- MRR, ARR, LTV, and any derived financial figure requiring data this schema
  does not hold. Adding `billing_cycle`/`amount` to `subscriptions` is a
  cross-repo schema change with an incomplete backfill — a deliberate project,
  not a side effect of a charts phase.
- Currency conversion, and therefore any combined revenue total.
- Forecasting or projections.
- Phase 6 (consolidated activity feed) — next, and unchanged.
