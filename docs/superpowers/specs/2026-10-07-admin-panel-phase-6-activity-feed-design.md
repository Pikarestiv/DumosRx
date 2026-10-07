# Admin Panel Phase 6 — Consolidated Activity Feed

**Date:** 2026-10-07
**Status:** approved in-session (unified feed with per-type quick filters)
**Predecessors:** Phases 1–5.

---

## Part 0. The problem

"What is happening on the platform" currently requires four pages: admin actions
on `/admin/activity`, sync refusals on `/admin/operations`, subscription
movement on `/admin/subscriptions`, payments under Marketing. Nobody correlates
them, so the sequence that explains an incident — *a plan lapsed, then pushes
started failing, then an admin granted a trial* — is invisible unless someone
already suspects it.

This phase merges them into one reverse-chronological stream with **quick
filters** to narrow to a single type.

## Part 1. Sources, and what each event really is

| Type | Source | Honesty note |
|---|---|---|
| `admin_action` | `activity_logs` | Real rows. The existing `/admin/activity` view keeps its own richer filters as a separate tab. |
| `sync_failure` | `sync_failures` (Phase 2) | Real rows, canonical reasons. |
| `payment` | `payment_transactions` | Real rows, carries an amount — **money, see Part 3**. |
| `subscription` | **derived** from `subscriptions` | Not an event table. A row yields *started* at `start_date`, and *ended* at `end_date` only when that date has passed. Future `end_date`s are not events that happened. |

The subscription type is **labelled as derived** in the API and the UI. There is
no subscription event log in this schema, and pretending otherwise would be the
Phase 1 error in a new costume. Building one is a separate project.

## Part 2. Pagination that actually works across sources

The naive merge — fetch N from each source, sort, return — cannot paginate.
Page 2 is undefined, because "skip 20" means something different in each source.

**Cursor on timestamp, descending.** Each source is asked for up to `limit`
events strictly older than the cursor; the results are merged, sorted, and the
first `limit` returned. The next cursor is the last returned event's timestamp.
This is correct per page and never loads an unbounded set — the property Phase 3
had to retrofit.

`limit` is capped at **50** (§8). A tie on identical timestamps is broken by
`(timestamp, type, id)` so the order is total and a page boundary cannot drop or
repeat an event.

When a **type filter** is active, only that source is queried. The filter is
therefore both a UX feature and the cheapest path.

## Part 3. Money is gated, and the gate is server-side

`payment` events carry amounts. Phases 3 and 4 both restricted revenue to
super_admin, and `RegisteredStoreSummary` already withholds money from
`platform_admin`/`agent`. The feed must not become the hole in that.

- **The server decides which sources a caller may read**, from the caller's
  role — not the request. A `platform_admin` asking for `type=payment` gets a
  422 for an unavailable type, not an empty list that implies "no payments
  happened".
- The response advertises `available_types` for the caller, so the UI renders
  only the filters that exist for them rather than hiding refusals behind
  buttons that return nothing.
- The page itself stays at `permission:view_platform_data`, because the
  non-money sources are legitimately visible at that level. This does **not**
  contradict `web/AGENTS.md`'s nav rule: the page's narrowest *endpoint* gate is
  `view_platform_data`; the money *source* is gated inside it.

## Part 4. UI

`/admin/activity` gains a tab layout:

- **Feed** (new, default) — the merged stream with quick filters: All, Admin
  actions, Sync failures, Subscriptions, Payments. Only types in
  `available_types` render.
- **Admin actions** — the existing table, untouched, with its search/action/
  store/user/date/role filters. It is more capable for its one source and is not
  replaced by the feed.

Each row: an icon and type badge, a title, a one-line detail, the relative time,
and the absolute timestamp in **DD/MM/YYYY** (§6). "Load more" advances the
cursor; there is no page-number control, because the feed has no stable page
numbers by construction.

## Part 5. Testing

- merges sources into one stream, newest first
- a type filter returns only that type, and queries only that source
- the cursor paginates with **no duplicates and no gaps** across a boundary,
  including when two events share a timestamp
- **a `platform_admin` never receives a `payment` event**, and asking for that
  type is refused rather than silently empty
- `available_types` differs by role
- `limit` is capped at 50
- derived subscription events exclude a future `end_date`
- DD/MM/YYYY rendering; relative time does not shift under `TZ=America/New_York`

Plus the §9 browser smoke test as super_admin and as `platform_admin` — Phases 4
and 5 each shipped a defect that a green suite did not catch.

## Part 6. Out of scope

- A real subscription event table (derived events are explicitly labelled).
- Live/streaming updates.
- Cross-source correlation or incident grouping — this phase puts the events in
  one place; reading them is still the operator's job.
