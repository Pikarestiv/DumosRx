# Oversell compensation: making the log never sum below zero — design

**Date:** 2026-10-14
**Status:** Stage 1 shipped 2026-10-14; Stages 2 and 3 shipped 2026-10-25 (`docs/FIXED_BUGS.md`, A-265) after the owner's go-ahead, with the defaults below: the compensation counts as value added, a mis-keyed oversell is corrected by the next count, and the backfill command exists but is run by hand. Deviations: `--revert` writes counter-rows (`StockMovement` cannot be soft-deleted on the server), and the row stays in `groupAdjustmentMovements()` as an "Oversell" ledger entry rather than being skipped, since that grouping *is* the ledger.
**Scope:** `client/` write path and readers; one read-only server command. No
schema change on either side, no new `movement_type`.
**Related:** `docs/KNOWN_BUGS.md` A-265 (the defect), A-212 (the alert that
cannot see it), A-211 (the count-freshness guard), A-217 (client/server
disagreement until Stage 2), A-264 (the carve-out's blind spot), A-213/A-214
(what a repair that asserts a number did) ·
`docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md`
("One behaviour change, stated plainly"; "What ships, in what order", Stage 4
first bullet).

---

## Why

Batch `868a8d17` (`gluformin`, "Opening Stock", store `571582a9`) received 4
units and sold 6. Its log sums to −2 and its stored quantity is 0, which is
what the derived definition says it should be. A staff member who finds two
units on the shelf and counts them writes `+2`; the log reaches 0; the stored
figure stays 0. The count reads as having done nothing. A second count writes
another `+2` and the figure finally shows 2, with +4 of "found stock" in the
ledger for two real units.

This is the derived-quantity spec's one deliberate behaviour change seen from
the counting screen: a single floor over the sum carries an oversell's
deficit forward, so the next inbound pays it off before it adds anything. The
spec named the deficit as a product question and offered a Stage 4 answer. The
counting screen has now asked the question for us.

### What A-265 says that needs correcting

Three things in the entry as written:

1. **The sign.** "Write an explicit `shrinkage` movement for the phantom
   units" reads as an outbound row. To make the log sum to zero it must be
   **inbound**: `+N`. An oversell means the customer left with units the
   system did not know it had, so the ledger was short by `N` *inbound*, not
   long by `N` outbound. Shrinkage is the opposite event. Calling the row
   shrinkage would put it in `getStockLosses()` (`finance.ts:85-105` matches
   loss reasons) and present an unlogged receipt as a loss.
2. **The scale is narrower than "a count does nothing", and wider than one
   batch.** `applyStockAdjustmentDelta()` lands found stock on
   `getOrCreateTargetBatchForProduct()`'s first result, ordered by expiry then
   `created_at` (`inventory.ts:129-130`), with no regard to which batch holds
   the deficit. The count only vanishes when that target *is* the deficit
   batch — `gluformin` has one batch, so it is. For a product with two
   batches the count lands on the other one, the product total is right first
   time, and the deficit batch keeps its −2 silently: the next return or
   restock against *it* is absorbed instead. So the symptom is intermittent
   and the deficit is permanent either way.
3. **"The pre-Stage-1 floor forgave the deficit and that count stuck"** is
   true of the client. It is also still true of the **server**, which is on
   Stage 0 arithmetic. Today, after the first `+2`, the server already holds 2
   and the client 0; after the second it holds 4 and the client 2. The
   disagreement A-217 describes is not hypothetical for this batch; it is
   there now, and every count on it widens it by the deficit.

---

## Goals

1. A count sticks first time, on every batch, and the ledger records what the
   counter saw and nothing more.
2. The two replicas agree on a batch that has been oversold, before Stage 2
   ships and after it.
3. The deficit becomes a typed, queryable ledger fact instead of a negative
   number that only the recompute ever sees.
4. No schema change, no new `movement_type`, nothing an old bundle cannot
   read.

## Non-goals

- Changing how a sale decides it is overselling. `deductFromBatch()`'s rule
  (clamp the deduction to what is available, attribute the remainder to a
  fallback batch, tag the row) stays.
- Fixing A-148/A-264. A deficit (log below zero) and a residue (stock above
  the log) are different shapes; §"Effect on the carve-out" says what this
  does to the second.
- Stage 2. Its order and content are unchanged; §"Against the server" says
  why it neither blocks nor is blocked by this.

---

## Options evaluated

Ranked by real units protected per line of code, cheapest first.

### Option 1 — tell the counting screen the truth, change nothing else

A warning on the cycle-count review step (the A-211 pattern,
`components/stock-batch/count-freshness-warning.tsx`) that a product's
batches carry a deficit of N, so a count of C will record as `+(C − system)`
and leave N uncorrected. ~40 lines once the deficit query (§Option 1a) exists.

Rejected as the answer, kept as a component of the recommended one. It
protects nothing on its own: staff would have to count the deficit through by
hand, which the A-265 entry rightly says nobody should have to know, and the
server would still part from the client by N on every count.

### Option 1a — the deficit query (A-212's fix)

Per product (or batch), `Σ quantity` over non-deleted movements where the sum
is below zero, with the size. The grouped sum the recompute already runs,
without the clamp, under the same freshness condition as a count. ~30 lines,
replaces `getOversoldAlerts()`'s `reason LIKE '%oversold%'` and its 30-day
window (`inventory.ts:426-460`).

Not a fix either, but required by every other option: it is the only way to
measure how many deficits exist, to warn, and to know afterwards that they are
gone. It is the field signal for everything below and is listed as the first
stage for that reason.

### Option 2 — post the figure needed to reach the count, not `counted − system`

In `applyStockAdjustmentDelta()`'s `delta > 0` branch, add the target batch's
deficit (`MAX(0, −Σlog_target)`) to the adjustment. `gluformin`: the count
posts `+4`, the log reaches 2, the stored figure reads 2 first time. ~10
lines.

Rejected. It is honest on the client and wrong on the server: Stage 0 already
forgave the −2 at the sale, so `+4` lands as 4 against the client's 2. It
trades A-265 for a guaranteed A-217 on every count until Stage 2, and the
ledger then shows a `+4` that the counter did not see. It also only reaches
the deficit batch when the count happens to target it (§Why, item 2).

### Option 3 — store the negative, clamp at display

Re-measured: the 2026-10-10 spec counted 52 `stock_batches` reads; today there
are 147 references across `client/lib`, `app`, `components` and `hooks`, and
12 files in `client/lib` alone filter on `quantity > 0`. The server's
storefront availability, `SUM(quantity * cost_price)` value, FEFO candidate
selection and low-stock alerts are all still the readers the earlier spec
listed. Rejected again, more firmly: the surface grew.

### Option 4 — compensating inbound movement at oversell time (**recommended**)

When `deductFromBatch()` takes more from a batch than it has, write a second
movement in the same transaction: `+N` against the same batch, where N is the
oversold remainder, typed `adjustment`, with `reference_type = "oversell"` and
`reference_id = saleId`, valued at the batch's cost. The sale's `−Q` and the
compensation's `+N` sum to the batch's actual prior quantity, so the log never
goes below zero, the floor never carries anything, and a later count is an
ordinary `counted − system`.

Costs ~25 lines in `writeSaleItemStock()`, one constant, one label, two reader
decisions, and the tests in §Testing. Protects every unit of every future
deficit on every replica. Does nothing for deficits already in the log, which
is §Option 5.

### Option 5 — backfill the deficits already there

A server artisan command, dry-run by default, that finds every batch whose
non-deleted log sums below zero and writes one `+N` compensation row per
batch, dated now, `reference_type = "oversell"`, `reference_id = NULL`, reason
naming the backfill. Today that is one batch and two units.

Kept, as the last stage, with the A-213/A-214 test applied to it in
§"Why this backfill is not Health Sync".

### Option 6 — do nothing until Stage 2

Rejected. Stage 2 makes the server compute `MAX(0, Σlog)`, which makes it
*share* A-265 rather than resolve it: after Stage 2 a count on `gluformin`
does nothing on both replicas. Stage 2 fixes the disagreement, not the
absorption.

---

## Design

### The write

In `client/lib/db/queries/inventory.ts`, `writeSaleItemStock()` already
tracks `oversoldBatchIds` and, per batch, the deduction applied. It needs one
more figure per batch: the oversold remainder, `deduction − available` where
`available` is the batch's quantity before the deduction (the `liveQuantity`
map already holds it). After the sale movement for that batch is inserted,
insert the compensation:

```
product_id, stock_batch_id       same as the sale row
movement_type                    "adjustment"
quantity                         +N  (the oversold remainder)
unit_cost / total_cost           the batch's cost, N × cost
reference_id                     saleId
reference_type                   OVERSELL_REFERENCE_TYPE ("oversell")
reason                           OVERSELL_COMPENSATION_REASON
performed_by                     cashierId
movement_date                    the sale's
```

Order within the transaction: sale row, then compensation. Both go through
`insert()`, so each rebuilds the batch; the second rebuild lands on the right
number and the first is overwritten inside the same transaction.

The sale row keeps its current `reason` tag so old bundles' `getOversoldAlerts()`
keep working until the deficit query replaces it.

### The identity: reuse `adjustment`, do not add a type

A new `movement_type` touches: `client/lib/db/movement-types.ts`; the labels
in `components/stock-batch/stock-movement-utils.tsx:51`; the audit-action map
`STOCK_MOVEMENT_AUDIT_ACTIONS` (`local-database.ts:32-36`, an unknown type logs
as a bare INSERT); the three `movement_type IN (…)` lists in
`inventory.ts:1019,1026,1033`; `getStockAdjustments()`'s `= 'adjustment'`
(`local-database.ts:354`); `finance.ts:95`; `adjustment-derivations.ts:109`;
server `StockMovementController::adjustments()`'s `whereIn`
(`:114`) and `index()`'s `type` derivation (`:71`); and every bundle in the
field, which would render it with the fallback label. The column itself is
free-form on both sides (`2026_09_23_000005_widen_stock_movements_movement_type`
made MySQL a VARCHAR; `2026_10_02_000001_relax_sqlite_stock_movement_type_check`
removed the test database's CHECK; the client schema has no CHECK at all,
`schema.ts:626-646`), so nothing would *reject* a new value — it would just be
invisible or mislabelled in a dozen places.

Reusing `adjustment` with a distinguishing `reference_type` is the pattern
the codebase already uses for exactly this problem: `PRODUCT_IMPORT_REFERENCE_TYPE`
in `client/lib/constants/stock-adjustments.ts`, with
`2026_09_29_000003_retag_bulk_import_stock_movements` as the precedent for
keeping it a display distinction. Every reader that groups, labels or sums
adjustments keeps working; the two that must *not* count it are listed next.
`npm run test:schema` has nothing to check because no column changes.

### Readers, one by one

| Reader | Today | With the row | Decision |
| --- | --- | --- | --- |
| `getOversoldAlerts()` (`inventory.ts:426`) | free-text `reason`, 30 days, `MAX(ABS)` | unchanged until replaced | replaced by the deficit query (Stage 1) |
| `getStockMoM()` positive adjustments (`inventory.ts:1033`) | `adjustment AND quantity > 0` → "value added" | counts N × cost as added | **count it.** The stock existed and the ledger under-recorded it; the value really was there. Say so in the card's tooltip. |
| `getStockMoM()` removed (`:1026`) | sale `quantity < 0` | the sale row unchanged | no change |
| `getStockLosses()` (`finance.ts:85-105`) | `adjustment` + loss reason labels | matches only if the reason matches a loss label | `OVERSELL_COMPENSATION_REASON` must not equal or prefix any `STOCK_LOSS_REASON_LABELS` entry; a test pins that |
| `getStockAdjustments()` ledger (`local-database.ts:340`) | all `adjustment` rows | shows "+N increase", reason, batch, linked sale | **show it.** This is the visibility the deficit never had. `stock-movement-utils.tsx:54` gets an `"oversell"` source label beside `"import"` |
| `groupAdjustmentMovements()` (`adjustment-derivations.ts:100-150`) | groups audit sessions by reference | one-row group, `source: "oversell"` | skip it the way `:110` skips imports, so a cycle-count derivation never reads a compensation as a count |
| COGS (`reports.ts:722,748`) | `sale_items.cost_price × quantity` | untouched: reads sale items, not movements | no change |
| Product history (`product-history.tsx:43-55`) | lists every movement | shows the row with the adjustment label | no change |
| Activity log (`STOCK_MOVEMENT_AUDIT_ACTIONS`) | `adjustment` → `STOCK_ADJUSTMENT` | one `STOCK_ADJUSTMENT` entry per compensated batch, sharing the sale's `correlationId` | pass the sale's `correlationId` so it groups with the sale |
| Server `/stock-movements`, `/stock-adjustments` | type by sign | "increase" | no change |
| Server `DashboardService` / `AdminStoreOperationalMetricsService` | counts rows | one more row | no change |
| `verifyStockIntegrity()` / `foldStockQuantities()` | `MAX(0, Σ)` vs stored | log ≥ 0, so `replayed = Σ` | no change; its `unreconstructable` test is unaffected (§Effect on the carve-out) |

### Against the server (Stage 0 arithmetic)

`applyStockBatchDeltas()` sums every movement in a push per batch and applies
one floored `UPDATE` (`SyncController.php:736, 1342-1348`). The sale and its
compensation are written in one transaction, queued adjacently, and pushed in
`created_at` order in chunks of 50 (`push.ts:62, 312-318`). In the same push
the server sees `−Q + N = −available`, exactly what the batch held, and lands
on 0 — the same figure the client holds. **So the compensating movement is the
one option under which a Stage-0 server and a Stage-1 client agree on an
oversold batch, today, without Stage 2.** Stage 2 then changes nothing for
these batches: `MAX(0, Σlog)` of a log that never goes negative is `Σlog`.

Two caveats, both bounded by N and both visible in `device_stock_reports`:

- A chunk boundary can split the sale from its compensation (roughly a 6-in-50
  chance per sale sitting in a backlog). The server then floors `−Q` to 0 and
  adds `+N` in the next request, reading N where the client reads 0, until
  Stage 2 recomputes it. That is the A-217 shape with the sign the entry
  already describes; it does not grow.
- The server never *needs* this to ship first. Stage 2 can go before, after or
  between; the only ordering that matters is §"What ships".

### Why this backfill is not Health Sync

A-213/A-214 happened because a device asserted its own stored number as
truth and the server wrote the difference into the log. The backfill asserts
**no stored number from anywhere**. It reads one thing, the server's own
movement log, and says: *for this batch, more units left than the log says
arrived; the customer had them, so they were here.* The row it writes is
derived from the same log every replica rebuilds from, so every replica
reaches the same figure (0 → 0 today; a later count then adds). It cannot zero
anything: it only ever raises a sum from below zero to zero. It runs on the
server, where the log is complete (A-211's half-synced-till problem does not
apply), and it must go through Eloquent, never `applyStockBatchDeltas()`, so
the server's stored quantity is untouched and stays equal to `MAX(0, Σlog)`.
Dry-run by default, prints every batch and its N, and refuses to run while
the `health_sync_enabled` switch is anything but off, so the two repairs can
never both be live.

What it is still wrong about, honestly: if the oversell was a mis-keyed sale
(6 rung up for 4 handed over), the deficit was never real stock and the
compensation puts two units on the books that are not on the shelf. The next
count removes them, with a `−2` that says so. The alternative — leaving the
deficit in the log — puts the same two phantom units nowhere visible and makes
the count absorb instead. Either way the count is the arbiter; the backfill
just makes it legible.

---

## Backward compatibility

Root `AGENTS.md` §11: every bundle ever shipped is still in the field.

- **Wire format:** unchanged. One more `stock_movements` row with an existing
  `movement_type`, a new `reference_type` string in a column that already
  holds free text, and no new column. Old bundles insert it through the same
  pull path they use for every adjustment.
- **Old bundles' arithmetic:** a pre-Stage-1 client floors per movement. It
  pulls the sale `−Q`, clamps the batch to 0, then pulls `+N` and lands on N
  where a Stage-1 client lands on 0. It *already* disagreed with the server by
  the same N in the other direction (the server forgives per push, it forgives
  per movement); this flips the sign of that disagreement, bounds it by N,
  and the next `healStockIntegrity()` fold on that device corrects it from
  the log. No old bundle writes compensation rows, so a sale from an old till
  still leaves a deficit; that deficit is what Stage 3's backfill re-run finds.
- **Old bundles' alerts:** `getOversoldAlerts()` matches `reason`, which the
  sale row keeps. They see what they saw before.
- **Server:** VARCHAR column, no validation on `movement_type` or
  `reference_type` (`StockMovement::$fillable` only), nothing to deploy for
  Stage 2a; the backfill is a new command that touches nothing else.
- **Shim to retire:** none. There is no translation on the way in or out. The
  only compatibility artefact is the sale row's `oversold` reason tag, which
  can stop being written once every live device reports a bundle that has
  the deficit query — the same "every device has run the bundle once"
  condition the 2026-10-10 spec uses for its Stage 3.

---

## Effect on the carve-out and on A-264

`resolveBatchQuantity()` judges a carve-out as `stored > inbound-before-this-change`.
A compensation row is inbound, so for an oversold batch it raises the inbound
total by N while the log sum rises from `−N` to 0 and `stored` stays 0.
`0 > anything` is never true, so the batch is never a carve-out before or
after. The classification is unaffected for ordinary batches.

For a *legacy* batch inside the carve-out (`stored` holds unlogged units) an
oversell was claimed impossible here because `deductFromBatch()` clamps to the
stored figure. **That is wrong (review, 2026-10-25):** the partial-shortfall
fallback deducts past it, and the compensation covers the part past zero. The
figure stays right; see `client/AGENTS.md`, "A legacy carve-out batch can be
oversold too". A compensation row on such a batch
lands only after its stored figure has reached zero, so it cannot change what
the carve-out test reads while the batch is still inside it.

What changes is A-264's **detection**, not its hole. A-264's exposure query
counts `quantity = 0 AND Σlog < 0` as its upper bound, and names `gluformin`
as that bound's one false positive — an ordinary oversell. Once logs never
sum below zero, that shape can *only* be a decayed legacy batch, so the query
becomes exact and the false positive disappears. The hole itself (a legacy
batch sold to zero has lost its residue) is a residue problem, not a deficit
problem, and `opening_quantity` is **unchanged in necessity**: no more needed,
no less. Today's measurement says the class is empty; this design makes that
measurement trustworthy.

---

## What ships, in what order

Each stage is one commit, individually revertable, with a signal that must
read clean before the next.

**Stage 1 — the deficit query, and the counting screen told the truth. Shipped
2026-10-14; see `docs/FIXED_BUGS.md`, "A-212 / A-265 stage 1". Two deviations
from this plan, both forced by the existing suite: the query excludes a
carve-out batch (its log also sums below zero, but nothing is owed), and it
lives beside `resolveBatchQuantity()` reporting per batch, with the per-product
aggregation done in `getOversoldAlerts()` rather than in the query.**
`getBatchDeficits()` beside `resolveBatchQuantity()` in
`client/lib/db/batch-quantity.ts` (it is the same grouped sum): per batch and
per product, `Σ quantity` where below zero, filtered to the active store and
to `is_active = 1`. `getOversoldAlerts()` becomes a call to it (same return
shape for `use-dashboard-overview.ts` and `use-stock-batch-alerts.ts`; the
30-day window goes, A-212). `use-count-freshness.ts` gains the product's
deficit, and `count-freshness-warning.tsx` says: "System shows 0 but the
ledger is 2 short; a count of 2 will record +2 and leave the shortfall." The
alert is shown only when `movementLogIsComplete()` holds, A-212's freshness
condition. Client-only, no behaviour change to any write.
*Field signal:* the dashboard's oversold count equals the number of batches
A-264's exposure query finds with `quantity = 0 AND Σlog < 0` — one today.
*Reversible:* revert one commit; nothing written.

**Stage 2 — the compensating write.** Gated on §"The product decision".
`writeSaleItemStock()` writes the `+N` row; `OVERSELL_REFERENCE_TYPE` and
`OVERSELL_COMPENSATION_REASON` in `client/lib/constants/stock-adjustments.ts`;
`stock-movement-utils.tsx` source label; `adjustment-derivations.ts` skip;
`getStockMoM()` tooltip text.
*Field signal:* Stage 1's deficit count stops growing; `device_stock_reports.quantity_delta`
for an oversold batch reads 0 on a Stage-1 client against the Stage-0 server
within one sync round of the sale. Any batch where it reads N is a split push
and will show the Stage-0 shape until the 2026-10-10 spec's Stage 2.
*Reversible:* revert one commit. Rows already written stay and are correct
under both the old and new arithmetic (they are plain adjustments).

**Stage 3 — the backfill.** `php artisan stock:compensate-oversells` in
`laravel-server/app/Console/Commands/`, `--dry-run` default, `--store=`
optional, prints `batch, product, store, inbound, outbound, N`; `--write`
inserts via Eloquent with `reference_type = "oversell"`, `reference_id` null,
`performed_by` null, reason naming the command and date. Refuses if
`config('dumos.health_sync_enabled')` is true. Run once after Stage 2 has been
live for a sync round on every device, so no new deficits are being created
by the sale path at the same time.
*Field signal:* Stage 1's deficit count reads 0 on every store the next day;
`gluformin`'s batch reads 0 on every device and on the server, and the next
count on it records what the counter sees.
*Reversible:* the rows carry a reason that names the run; a `--revert` that
soft-deletes them is part of the command, and `softDelete()`'s hook rebuilds
every device that pulls the reversal.

The 2026-10-10 spec's Stage 2 (server recompute) is unaffected and keeps its
own place in that spec's order. Its Stage 4 first bullet is this document.

---

## The product decision

The ledger's meaning changes, and that is the owner's call.

Today an oversell is a `sale` row tagged "oversold" and a negative number the
system silently carries until a count absorbs it. Under this design an
oversell is **two rows**: the sale as rung up, and an `adjustment` of `+N`
against the same batch, reason "Oversell on sale …: N units sold that the
ledger did not hold", in the Stock Adjustments ledger beside cycle counts, and
counted as stock value that was on the shelf.

He has to agree to two things:

1. **The stock value card counts it as value added.** N × cost appears in the
   30-day "added" figure. The alternative is a `reference_type` exclusion in
   `getStockMoM()`, which hides stock that was demonstrably there.
2. **A mis-keyed oversell is corrected by the next count, not by the system.**
   If 6 were rung up for 4 handed over, the compensation books 2 units that are
   not on the shelf, and the count removes them with a visible `−2`. The
   alternative — today — books nothing and makes the count absorb.

And one choice: whether the backfill (Stage 3) runs at all, or whether the
one live deficit is left for its next count with the Stage 1 warning on
screen. At two units on one batch, either is defensible; the backfill is what
makes "deficits are zero" a statement the field signal can verify.

---

## Testing

Root `AGENTS.md` §9: data-integrity work, mandatory coverage. All on real
sql.js through the real `insert()` hook, the way
`client/__tests__/batch-quantity-recompute.test.ts` does.

- **The live case.** Batch with `+4`, sale of 6: the log holds `−6` and `+2`,
  the batch reads 0; a count of 2 writes `+2` and the batch reads 2 first
  time. The same with the per-movement replay of an old bundle asserted as 2,
  recorded as the known, bounded disagreement.
- **Server agreement.** A pure function of the push's deltas models
  `applyStockBatchDeltas()`'s per-push floor; for 60 randomised histories of
  receipts, oversells and counts, the client's `MAX(0, Σlog)` equals the
  modelled server when sale and compensation share a push, and differs by
  exactly N when they are split. The differential fuzz in
  `pull-deferred-delta-order-across-pages.test.ts` is the template.
- **Multi-batch deduction.** A sale split across two batches where only the
  second oversells writes exactly one compensation, against the second, for
  the remainder only.
- **Fallback batch.** A product with no positive batch sells 3 from a 0-batch:
  compensation `+3`, batch reads 0, count of 1 reads 1.
- **No compensation on an ordinary sale.** A sale within stock writes one
  movement, not two, and queues one `stock_batches` push row.
- **Readers.** `getStockLosses()` ignores the row; `getStockAdjustments()`
  lists it with source `"oversell"`; `groupAdjustmentMovements()` does not
  group it as a count; `getStockMoM()` counts it as added; `getBatchDeficits()`
  reports the batch before the compensation and not after.
- **Reason label collision.** `OVERSELL_COMPENSATION_REASON` neither equals
  nor is prefixed by any `STOCK_LOSS_REASON_LABELS` entry.
- **Carve-out untouched.** A legacy batch (`stored 100`, no log) sold 5 writes
  no compensation and reads 95.
- **Backfill (server, `php artisan test`, never `tinker`).** Dry-run writes
  nothing and lists the batch; `--write` inserts one row per negative batch
  with the right N and leaves `stock_batches.quantity` untouched; a second
  run finds nothing; `--revert` soft-deletes exactly the rows the named run
  wrote; refuses when `health_sync_enabled` is true.
- **A-264 query becomes exact.** After the backfill, `quantity = 0 AND Σlog < 0`
  returns no rows for a store with no legacy batches.

---

## Docs that must change with the code

Per root `AGENTS.md` §2, in the same change:

- `docs/KNOWN_BUGS.md` — A-265: the three corrections in §Why, then moved to
  `FIXED_BUGS.md` at Stage 2 with its count. A-212 moves at Stage 1. A-217's
  "client is now the lower" paragraph gains the oversold-batch exception
  (equal in the same push, N apart in a split one). A-264's exposure
  paragraph notes the query is exact once Stage 3 has run.
- `docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md` —
  "One behaviour change, stated plainly" and Stage 4's first bullet point
  here; the word `shrinkage` corrected to an inbound compensation.
- `client/AGENTS.md` — the stock-movements section: an oversell writes two
  rows; `reference_type = "oversell"` is the marker; what the deficit query
  is and when it may be shown; the readers that deliberately include and
  exclude the row.
- `laravel-server/AGENTS.md` — the new command beside the A-214 repair
  command, and the rule that it writes through Eloquent and never
  `applyStockBatchDeltas()`.
- `SYSTEM_FEATURES_DOCUMENTATION.md` — the Stock Adjustments ledger's new
  source and the dashboard's oversold alert now meaning a current deficit.

---

## What I am least sure about

In order:

1. **Whether the owner wants an oversell to read as found stock.** The row is
   true — the units were there — but a pharmacist may read "+2 adjustment on a
   sale" as the system covering for a cashier. The reason text matters more
   than the arithmetic here, and I have not shown it to him.
2. **The split-push case.** I estimated it from `SYNC_BATCH_SIZE = 50` and a
   sale's six-odd rows; I did not measure how often a till pushes with a
   backlog in the field. If it is common, Stage 2 of the 2026-10-10 spec
   should go before this one's Stage 2, because the server's per-push floor
   is the only thing that makes the split visible.
3. **Old bundles overstating by N.** The fold corrects it, but only on a
   device whose `movementLogIsComplete()` holds and only once a day. A till
   on an old bundle with a chronic backlog could show N phantom units for
   longer than that. The mitigation is updating the till, which is also the
   only mitigation for everything else it is wrong about.
4. **The backfill's one assumption.** It treats every deficit as unlogged
   stock rather than a mis-keyed sale. For two units on one batch that is
   the right bet; for a store that turns out to have dozens, each is a
   question for a count, and the command's dry-run listing is where that
   decision gets made, not in code.
5. **`getStockMoM()` counting it as added value.** I chose to count it
   because excluding it hides real stock. If the owner uses that card to judge
   purchasing rather than position, the exclusion is one `reference_type`
   clause and a test.
