# Stuck Data & Divergence Visibility

**Date:** 2026-10-07
**Status:** approved in-session; sequencing agreed (1 → 4 below)

---

## Part 0. The problem, and the constraint that shapes everything

Two questions currently have no answer anywhere:

1. **"Why does this store show different stock on different devices?"** — a live
   problem (A-173, A-176, A-176a), and the owner expects it to surface at the
   next physical stock audit.
2. **"What is stuck, for whom, and can we do anything about it?"** — rows that
   hit the client's 5-attempt ceiling stop retrying and are never delivered.

**The constraint: `_sync_queue` is client-only.** The server has never seen a
stuck row — that is what being stuck means. So the admin panel cannot read,
retry or discard one by querying. Anything beyond "we know something is
wrong" needs the device to participate.

That single fact sets the order of work: measure first with data the server
can already obtain, then widen what devices report, and only then build a
channel that asks a device to act.

## Part 1. Why abandonment is not the destination

The obvious endpoint for a permanently stuck row is to abandon it. For a
crash report that is fine. For a `sales` or `stock_movements` row it is not:
the device holds the **only copy**, so discarding it permanently loses
revenue data or permanently falsifies on-hand stock.

So the terminal state for business tables is **escalation to a human**, not
discard — which makes this tooling a **prerequisite** for bounded abandonment
(A-165), not a follow-up to it. There has to be somewhere to escalate *to*
before giving up can be safe.

And the priority sits upstream of both: **fix the causes**. Every stuck row
that never happens is one nobody has to adjudicate.

---

## Phase 1 — Stock divergence report

**The question it answers:** which devices disagree with the server about
stock, and by how much, *before* someone counts shelves.

The server already derives authoritative quantity by replaying
`stock_movements`; it never trusts a pushed `quantity`. The client never
accepts a pulled one. Neither side has ever compared them.

**Design: a fingerprint on the sync request.** Sending every batch quantity
on every sync is too much. Instead the client includes, for the active store:

```
stock_fingerprint: { batch_count, quantity_sum }
```

Two integers. The server computes the same two from its own rows and stores
both sides in `device_stock_reports`, keyed by `(store_id, device_id)`.

- **Both sides are snapshotted at report time**, not recomputed on read, so a
  historical row cannot change meaning later — the Phase 4 trends lesson.
- A matching fingerprint is strong evidence of agreement; a differing one is
  **proof** of disagreement. It cannot say *which* batch differs — that is
  Phase 4's job — but it turns "we have no idea" into "device X is 56 units
  light, since Tuesday", which is what the audit question needs.
- Cost is one COUNT and one SUM per sync per side.

**Where it appears:** the store detail page, beside sync health — a per-device
table of reported vs. server, with the delta and when it was last reported. A
store whose devices all agree says so plainly rather than showing an empty
table.

**Gating:** `view_platform_health` (operational, not commercial).

## Phase 2 — Close the reporting blind spots (PG-18)

A push that 500s, or that `validateSync()` refuses outright, currently records
**nothing**. So any "what is stuck" view built before this is honest only
about the failures that happened to reach the hook — and the blind spots are
exactly the interesting cases (plan-gated stores, server errors).

Fix the recorder so a refusal at those two points lands in `sync_failures`
like any other, with a canonical reason.

## Phase 3 — Devices report their queue state

The client adds to its sync request a small summary of its own `_sync_queue`:
depth, and for each stuck item the table, record id, attempt count and
canonicalised last error. No payloads — just enough to answer "what is stuck
and where" as **fact** rather than inference.

Stored per `(store_id, device_id)`, replacing the previous snapshot. The admin
view becomes: this store, this device, these 4 rows stuck, these reasons,
since this time.

**This is where the operator's question is genuinely answered**, and it still
requires no remote control.

## Phase 4 — The command channel

Only now does acting on a stuck row make sense.

A `sync_commands` table: `(store_id, device_id, action, table_name,
record_id, issued_by, status, issued_at, acted_at)`. The client fetches
pending commands during sync, applies them to **`_sync_queue` only**, and
reports back.

**Actions, deliberately few:** `retry` (reset backoff), `send_payload` (upload
the row so an operator can see it), and `abandon` — which refuses on business
tables, per Part 1.

**Constraints that are not negotiable:**

- The command vocabulary is a **closed set** that can only touch sync
  bookkeeping, never business tables. A compromised admin panel must not
  become a way to destroy store data.
- super_admin only, every command audited, and `abandon` carries a Phase
  5-style confirmation naming exactly what is being discarded.
- **Eventually consistent.** A command applies on the device's next sync, and
  a device on a plan with sync disabled may never pick one up. The UI
  distinguishes *queued* from *applied*, or operators will fire it twice.

---

## Cross-cutting rules

- **Per-device, not per-store.** Every table here is keyed by device: the
  whole point is that two devices of the same store disagree.
- **Absent is not zero.** A store that has never reported says "no reports
  yet", never "0 divergence" — Phase 1's rule, which this feature would
  otherwise break in its most consequential place.
- **Bounded payloads.** Fingerprints are two integers; queue summaries are
  capped and carry no row payloads. Nothing here may make a sync request grow
  with a store's size.
- §7: all timestamps from PHP, never MySQL's clock.

## Out of scope

- Fixing the divergences themselves (A-176's cursor half; a targeted
  by-id backfill).
- Bounded abandonment (A-165) — unblocked by Phase 4, not delivered by it.
- Any client UI. This is operator tooling; the store owner sees nothing new.
