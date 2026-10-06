# Admin Panel Phase 3 — Subscription Lifecycle

**Date:** 2026-10-07
**Status:** Design approved, pending spec review
**Packages touched:** `laravel-server/`, `web/`
**Predecessors:** Phase 1 (`2026-10-06-admin-panel-phase-1-design.md`), Phase 2 (`2026-10-06-admin-panel-phase-2-sync-health-design.md`)

## Intent

Phase 1 made the admin panel's numbers honest; Phase 2 made sync visible. Phase 3
answers a different question: **which accounts need attention this week, and what
do I do about them.**

Today the panel can tell you a store exists and whether it syncs. It cannot tell
you that the store's subscription lapses on Friday, that its trial ends tomorrow
and nobody has called, or that its last three card charges failed. The last of
those is not merely missing — it is actively filtered out:
`AdminRevenueService` restricts to `status = 'success'`, so of the four values
`payment_transactions.status` can hold (`pending`, `success`, `failed`,
`abandoned`), **three are invisible platform-wide**.

This is a worklist, not a report. Every row carries the action that resolves it.

## The correctness constraint this phase lives or dies on

**Lifecycle state is a property of an owner, not of a subscription row.** An
owner holding an expired subscription *and* a current one is not lapsed. Counting
rows instead of owners is exactly the bug that made the Overview report 7 active
subscriptions for a single account (PG-16's sibling, fixed in Phase 1).

Worse, `SubscriptionService::resolveEffectiveSubscription()` **already** decides,
grace-aware, which subscription governs an account right now — and the whole
application gates on it (`CheckSubscription`, `hasFeature()`, `checkLimit()`,
`enforceStaffLimits()`, `SyncController`). If the admin list applies its own
definition, it will list accounts the software still treats as fully subscribed,
and an operator will spend Monday morning chasing accounts that are fine.

**Therefore: one resolver, shared.** `SubscriptionService` gains
`subscriptionState(User $owner): string` returning one of `trialing`, `active`,
`in_grace`, `lapsed`, `none`, implemented **on top of**
`resolveEffectiveSubscription()` rather than beside it. The admin lists and the
app's own gating agree by construction, not by two implementations being kept in
step.

## Decisions taken during design

- **Worklist with actions, not a read-only report.** Every action a worklist
  needs already exists — `POST /admin/{users,stores}/{id}/grant-trial`,
  `/activate-plan` (`permission:grant_trials`), `/users/{id}/notify` and
  `/users/bulk-notify` (`permission:send_notifications`) — with reusable
  dialogs (`SharedGrantTrialDialog`, `SharedActivatePlanDialog`,
  `SendNotificationDialog`). Phase 3 is mostly *selecting the right accounts* and
  wiring existing actions to them.
- **A new top-level "Subscriptions" nav item.** Billing lifecycle is a distinct
  recurring job from Marketing's campaign work, and the lists are long enough to
  want a whole page.
- **super_admin only for v1**, gated at four independent layers — see Part 4a.
  The actions are permission-gated, so the lists could open to
  `platform_admin`/`agent` with buttons hidden per-permission (the established
  pattern). But these lists carry subscription money data, which
  `RegisteredStoreSummary` deliberately withholds from those roles. A
  "my registered stores expiring" view scoped via `users.registered_by_id` is a
  good follow-up; it is not v1.
- **`subscriptions.status = 'grace_period'` stays unwritten.** The enum allows
  it and nothing has ever written it; grace is derived from `end_date` in
  `resolveEffectiveSubscription()`. Introducing a second source of truth for
  grace is precisely how this subsystem already went wrong (see
  `laravel-server/AGENTS.md` on `status` not being self-maintaining).
- **PG-12 is fixed here**, because this phase touches the same query and the
  Overview now calls it on every dashboard load.

## Part 1 — The shared resolver

`SubscriptionService::subscriptionState(User $owner): string`

| State | Meaning |
|---|---|
| `trialing` | `resolveEffectiveSubscription()` returns a row with `is_trial = true` and `end_date >= now()` |
| `active` | returns a paid row with `end_date >= now()` |
| `in_grace` | returns a row whose `end_date` has passed but is inside `grace_period_days` |
| `lapsed` | returns `null`, but the owner has at least one subscription row in their history |
| `none` | returns `null` and the owner has never had a subscription |

`lapsed` and `none` are deliberately distinct: an owner who never subscribed is a
sales problem, one who lapsed is a retention problem, and a single "no
subscription" bucket would mix the two into a list nobody can act on.

The grace window comes from `SystemConfig::getVal('subscription_plans', [])['grace_period_days'] ?? 3`,
read through `resolveEffectiveSubscription()` rather than re-read here.

## Part 2 — The four worklists

All resolve to **distinct owners**, and all are paginated at 50 (§8).

1. **Expiring soon** — paid, live, `end_date` within the window. Default 7 days,
   selectable 7/14/30. Ordered soonest first. Carries: owner, store(s), plan,
   `end_date`, days remaining, last successful payment.
2. **Trials ending** — as above with `is_trial = true`. The highest-value list:
   a trial ending with no contact is a conversion lost by default.
3. **Lapsed** — `subscriptionState()` is `lapsed`, ordered by how recently they
   lapsed (most recent first, because recovery odds decay). Carries how long
   since expiry and the plan they were on.
4. **Payments needing attention** — `payment_transactions` with status `failed`
   or `abandoned` in the window, grouped by owner with an attempt count, newest
   first. These are invisible in the panel today.

**A `pending` transaction is not in scope as a worklist.** It is an in-flight
checkout, not a problem, and listing it would train the operator to ignore the
list. It is counted in Part 3's figures only.

## Part 3 — The figures

- **Trial conversion rate** over a window: trials *started* in the period versus
  those whose owner later held a paid subscription. This is the number that says
  whether the configured `trial_days` works at all, and the panel has never shown
  it.
- **Lapsed this period** and **recovered this period** (an owner who was lapsed
  and now holds a live paid subscription).
- **Payment outcome mix**: success / failed / abandoned / pending counts for the
  window, so the success-only revenue figure finally has a denominator.

Every figure follows Phase 1's rule: **a rate with a zero denominator renders as
unavailable, never as 0% or 100%.** A platform with no trials in the window shows
"No trials started", not "0% conversion".

## Part 4 — Services and API

Per the established boundary (one domain service each, never a god-service):

- **`AdminSubscriptionLifecycleService`** (`app/Services/Admin/`) — the four
  worklists and the figures. Reads `SubscriptionService::subscriptionState()`;
  never reimplements it.
- **`SubscriptionService`** gains `subscriptionState()` only. No behaviour change
  to `resolveEffectiveSubscription()` — it gates live traffic, and this phase must
  not alter who can use the software.

Endpoints, inside the existing `permission:manage_platform` admin group, each
additionally `role:super_admin`:

- `GET /admin/subscriptions/lifecycle` — the figures plus bucket counts.
- `GET /admin/subscriptions/{bucket}` — one worklist, paginated 50, where
  `bucket` is `expiring|trials|lapsed|payments`, with a `days` window parameter
  validated against an allow-list (7/14/30). **The bucket name is resolved
  through a `match` statement, never a dynamic lookup** (§8, prototype
  pollution); an unknown bucket returns 422, not a default list.

## Part 4a — Gating, in four independent layers

This surface lists who is about to stop paying and carries actions that hand out
paid time. It gets defence in depth rather than one check, and **no layer is
allowed to be the only thing standing between a role and the data.**

**1. Route middleware — the only layer that actually protects anything.**
`role:super_admin` on both endpoints, inside the existing
`permission:manage_platform` group. Everything below is user experience; this is
the control. Tested in both directions for `super_admin`, `platform_admin`,
`agent`, **and a custom platform role holding `manage_platform` +
`view_platform_data`** — the A-141 shape, which is the one a role-slug allow-list
would wrongly admit or wrongly refuse.

**2. Nav visibility.** The `subscriptions` item carries no `roles`/`permissions`
key, so it defaults to `SUPER_ADMIN_ONLY` and matches the endpoint gate exactly.
Per `web/AGENTS.md`: *a nav item's gate must match its page's narrowest endpoint
gate.* PG-14 and PG-15 are open findings against precisely this mismatch; this
phase must not add a third.

**3. A page-level guard — the layer both earlier phases were missing.**
Hiding a nav item does not stop a URL. `app/admin/layout.tsx` admits anyone
holding `manage_platform`, so a `platform_admin` who deep-links, bookmarks, or
is sent `/admin/subscriptions` loads the page shell, fires the query, and lands
on a generic "failed to load" retry screen — indistinguishable from the server
being down. That is the PG-15 defect, and shipping a third surface with it would
be careless.

The page therefore checks `checkIsSuperAdmin(user?.role)` before rendering and
shows an explicit, non-alarming "This page is only available to super admins"
state with a link back to Overview. **This is presentation, not protection** —
layer 1 is what refuses the data — but it is the difference between a colleague
understanding they lack access and a colleague filing a bug about an outage.

**4. Per-action permission checks, server and client.** Every action routes to
the existing endpoints, which keep their own middleware (`permission:grant_trials`,
`permission:send_notifications`). The worklist does not proxy, wrap, or re-expose
them, so an action's authorisation is unchanged by this phase and cannot be
widened by it. Client-side, buttons are **hidden via `checkHasPermission`, never
disabled** (`web/AGENTS.md`), and tests assert the server still refuses a caller
who lacks the permission — because a hidden button is not a security control.

**What the tests must pin, explicitly:** that a `platform_admin` deep-linking to
`/admin/subscriptions` is refused by the API *and* sees the guard rather than an
error screen; that a custom platform role is treated identically; and that
removing `grant_trials` from a role removes the button *and* still 403s the
endpoint. The browser smoke test exercises both the super_admin and the refused
path, since every prior phase's gating defect was found on screen and not in a
unit test.

## Part 5 — PG-12: the revenue query

`AdminRevenueService::getOverview()` calls `->get()` on every matching
transaction, then slices 20 rows out in PHP into a hand-built paginator. It is
logged as PG-12 and now runs on every Overview load (Phase 2 added
`AdminSummaryService` as a second caller).

The reason it was written that way: `plan_name` is read from the `metadata` JSON
column when the subscription relation is missing. But `planNameFor()` **prefers
`$txn->subscription->plan_name`** and only falls back to metadata — so the filter
and grouping can run in SQL against a joined `subscriptions.plan_name`, with the
metadata fallback applied only to the page being displayed. That makes the query
DB-paginated without a schema change and without a driver-specific JSON query.

Rows whose subscription relation is gone keep the metadata fallback for display;
they are excluded from a `plan=` filter, which is correct — an orphaned
transaction has no authoritative plan to filter on.

## Part 6 — Admin surface

A new **Subscriptions** page: the figures across the top, then the four
worklists as tabs with counts in the tab labels, because a count of zero is the
answer on a good week and should be visible without clicking.

Each row carries the actions that resolve it, following
`web/AGENTS.md`'s rule — **buttons are hidden via `checkHasPermission`, never
disabled**:

- Expiring / trials ending → Activate Plan, Grant Trial, Notify, open the store.
- Lapsed → Activate Plan, Notify.
- Payments → Notify, open the store's billing history.

Dates render `DD/MM/YYYY` through `formatDateToDDMMYYYY`, and date-only values
through `formatDateOnlyToDDMMYYYY` (Phase 2 found that bare `YYYY-MM-DD` shifts a
day backwards west of UTC, which this host's EDT clock would hit). Money renders
per currency through `formatMoney`; there is no converted total.

## Part 7 — Testing

Per §9, this is subscription and money logic and must be covered:

- **`subscriptionState()` returns each of the five states**, including the
  distinction between `lapsed` and `none`.
- **It agrees with `resolveEffectiveSubscription()`**: an owner inside the grace
  window reports `in_grace`, is **not** listed as lapsed, and the app still
  treats them as subscribed. This is the test that keeps the admin list honest.
- **Every bucket resolves to distinct owners**: an owner with five historical
  subscriptions appears once, and an owner with an expired row plus a live one
  does not appear in `lapsed` at all.
- **Trial conversion with no trials in the window returns null**, not 0%.
- **The `bucket` parameter rejects an unknown value** with 422 rather than
  resolving it dynamically or falling back to a default list.
- **Gating, all four layers** (Part 4a): both endpoints refused to
  `platform_admin`, `agent` and a custom `manage_platform` role and allowed to
  `super_admin`; the nav item absent for each refused role; the page guard
  rendering instead of an error screen on a deep link; and each action endpoint
  still refusing a caller stripped of its permission.
- **PG-12**: a `plan=` filter returns the right rows while the query is
  DB-paginated — asserted by counting queries or by asserting the paginator's
  total against a dataset larger than one page, so a regression to
  load-everything-in-PHP fails.
- **Browser smoke test** as super_admin: each tab lists real seeded accounts,
  an action dialog opens and completes, and an empty bucket reads "Nothing
  needs attention" rather than an empty table. §9 is explicit that backend
  verification is not UI verification, and both prior phases had a real defect
  caught only on screen.

`npm run test:schema` is **not** required: no new tables or columns.

## Explicitly out of scope

- **Any change to who can use the software.** `resolveEffectiveSubscription()`,
  `CheckSubscription` and the grace window are read, never modified.
- **Automated dunning or reminder emails.** Phase 3 surfaces the accounts and
  lets a human act. Automation is a later decision with its own failure modes.
- **A scoped per-agent view** (`registered_by_id`), noted above as the follow-up.
- **MRR and churn as time series** — that is Phase 4's charting work; Phase 3
  gives point-in-time figures.
- **Writing `grace_period` into `subscriptions.status`.**

## Success criteria

1. An operator can answer "who needs me this week" from one page, and act on each
   row without leaving it.
2. The lists never disagree with what the application itself believes about an
   account's subscription.
3. Failed and abandoned payments are visible platform-wide for the first time.
4. Every bucket counts owners, not subscription rows.
5. A rate with no denominator renders as unavailable, never 0% or 100%.
6. `AdminRevenueService` no longer loads every transaction to show 20.
7. No file added or modified exceeds 350 lines.
8. Gating holds at all four layers of Part 4a, and a refused role sees an
   explanation rather than an error screen — closing the PG-15 class on this
   surface rather than adding a third instance of it.
