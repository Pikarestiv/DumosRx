# Derived stock quantity: making drift structurally impossible — design

**Date:** 2026-10-10
**Status:** design only. Nothing implemented. Supersedes the incremental-delta
model described in `client/AGENTS.md` ("Deferred movement deltas", "Pull
details") and in `SyncController::applyStockBatchDeltas()`'s own comments.
**Scope:** `client/` and `laravel-server/`. No `web/` change; the admin panel's
`device_stock_reports` comparison keeps reading the same two integers.
**Related:** `docs/KNOWN_BUGS.md` A-197, A-203, A-205, A-176 · `docs/FIXED_BUGS.md`
A-148, A-173, A-176a, A-191 ·
`docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md` (the repair
this design is meant to make redundant) · unmerged branch
`feat/stock-drift-autoheal`

---

## Why

A customer's till showed 80 units of an item the server correctly recorded as
52. On `DRX-ZKI5K81UG`, 255 of 1,952 batches disagreed with their own movement
log, 841 units overstated. Before that, 958 of 2,495 products on another device
read at exactly twice their opening stock. Each incident has cost a night of
remote debugging, and marketing is being held back because of them.

The founder's diagnosis was handed to this design as something to test rather
than accept. **It survives testing, with one correction that changes the fix.**

### The diagnosis, confirmed

`stock_movements` is append-only and never pruned (`retention.ts` prunes only
`audit_logs`). `stock_batches.quantity` is only ever meant to be its sum —
`pull.ts:278` strips `quantity` from every pulled snapshot, and
`SyncController.php:423` forces `quantity = 0` on every batch the server
accepts, on INSERT and UPDATE alike. Neither side trusts the number; both
rebuild it. Nobody rebuilds it *from the log*: both maintain it by applying
deltas incrementally, per movement, independently, on every replica.

That is the whole defect. Four separately-diagnosed bugs are one cause:

| Bug | How the incremental patch loses the delta |
| --- | --- |
| A-197 | deltas drained per round, not per page → applied out of order → the floor clamps them away. 34 of 300 randomised histories in the first fuzz, 31 of 60 in the branch's own; confirmed live, +823 units on one device |
| A-176 | a batch older than the pull cursor never arrives → its delta stays pending forever |
| A-203 | a queue backlog makes `pull.ts:313` skip those rows → updates never land |
| A-205 | a conflicted queue row is dropped and never re-offered → the device keeps the losing value |

**The strongest data point is the server.** It has never drifted, in any
incident. Same movements, same deltas, same `MAX(0, …)` floor — but one writer,
applying in order, with no pull cursor to strand anything. The design works with
a single writer and fails on replicas. That is the signature of an
order-dependent, non-idempotent reducer, not of four unrelated bugs.

### The correction: the floor is the whole of the order dependence

Addition is commutative and associative. `MAX(0, x + δ)` is neither. Strip the
per-movement floor and the incremental path becomes mathematically sound — A-197
cannot happen at all, whatever order the deltas arrive in. So the floor is not
"part of the question": it is the first half of the answer.

The second half is that commutativity is not enough. A-176, A-203 and A-205 lose
or duplicate deltas rather than reorder them, and no commutative reducer survives
a lost input. Only recomputing from the log does.

### A third finding, not in the diagnosis: the two replicas compute different functions

The client floors **per movement** (`pull.ts:393`,
`deferred-stock-deltas.ts:98`, `inventory.ts:538`, `:800-856`). The server
accumulates every delta in a push into `$stockBatchDeltas[$batchId]` and applies
**one** floored `UPDATE` over the sum (`SyncController.php:1341-1347`). For a
batch that is ever oversold, these are not the same function of the same log —
so even a perfectly-ordered, perfectly-delivered delta stream can leave the two
sides disagreeing. Any fix has to name one canonical function and make both
sides compute it. Today neither side's behaviour is written down as a definition
anywhere; it is an emergent property of two different loops.

---

## Goals

1. One written definition of on-hand quantity, computed identically by every
   replica from data every replica already holds.
2. Drift becomes self-correcting rather than repairable: a missed, deferred,
   duplicated or reordered delta changes nothing, because nothing is ever
   patched.
3. No connectivity required to compute a correct local figure, ever.
4. No flag day, no payload change, no migration a device has to survive.
5. Every existing stock read keeps working untouched — 52 SQL references to
   `stock_batches` across `client/`, plus the server's storefront availability,
   dashboards and `StockDivergenceService`.

## Non-goals

- Changing what syncs. The pull's `quantity` strip and the server's
  `quantity = 0` on accept are both correct and both stay.
- Repairing the physical world. A shelf miscount is not a software problem.
- Fixing A-203 or A-205 for other columns. This removes `quantity` from their
  blast radius; `category_id` and `price` stay exposed.
- Replacing `verifyStockIntegrity()` / `foldStockQuantities()`. They become a
  monitor rather than a repair (§"The auto-heal").

---

## The definition

> **`onHand(batch) = MAX(0, Σ quantity of that batch's non-deleted
> `stock_movements`)`**, for any batch with at least one inbound (positive)
> movement. A batch with no inbound movement is outside the invariant and is
> never recomputed.

Three properties earn their keep:

- **Order-independent.** The sum is taken once; the floor is applied once over
  it. No ordering of arrivals can change the result.
- **Idempotent.** Applying it twice is applying it once. A duplicated delta, a
  replayed page, a re-pulled movement: all no-ops.
- **Loss-tolerant.** A movement that arrives late contributes the moment it is
  recomputed. Nothing has to be remembered in the meantime, so nothing can be
  forgotten.

The carve-out is not a wart; it is the A-148 class, already classified and
already refused by `foldStockQuantities()`. Batches created by a pre-`a36b00e7`
import hold a quantity with no movement behind it. Recomputing one yields 0 and
destroys the only record of that stock. `stock-integrity.ts`'s
`unreconstructable` verdict (`batchQuantity > 0 && inboundCount === 0`) is the
existing, field-tested test for it and is reused verbatim. Imports have written
a matching movement for every batch since `a36b00e7`
(`product-import.ts:269`), so the class is closed and shrinking.

### Does the floor still destroy information?

The founder's objection is right about today's code and stops applying under
this definition. Today the clamp is applied **to the only mutable copy of the
number**: a delta clamped away at `pull.ts:393` is gone, because nothing
recomputes. Under the definition the clamp is a pure projection of an intact,
append-only log — a batch whose log sums to −3 still says so, and
`getOversoldAlerts()` already derives oversells straight from
`stock_movements`, never from `quantity`. The unclamped sum costs 0.1 ms for one
batch (measured below) for anyone who wants it. **Nothing is lost, so the clamp
can stay where the 52 readers expect it.**

Storing the negative instead and clamping at display/sell time was considered
and rejected on cost, not principle. What breaks: `SUM(quantity * cost_price)`
stock value goes down as stock goes "more negative"; FEFO deduction in
`deductFromBatch` picks negative batches as candidates; every
`AND quantity > 0` filter in `getProductsWithDetails` silently drops an
oversold batch out of the cost-price and expiry subqueries; low-stock alerts
fire on phantom negatives; `buildStockFingerprint()`'s `SUM(quantity)` stops
being comparable with the server's; and the server's storefront availability
(`StorefrontController.php:152`) would offer negative stock. That is 52 client
sites plus five server ones to audit for a fact that is already recoverable
from the log in 0.1 ms.

### One behaviour change, stated plainly

Per-movement flooring **forgives** an oversell; a single floor over the sum
**carries the deficit forward**. Log `+80, −100, +20`: today's client replay
gives 20, the definition gives 0. Today's *server* gives 0 if all three
movements arrive in one push and 20 if they arrive in three. So the two
replicas already disagree here and the definition at least picks a side.

Which side is right is a business question, not a technical one: an oversell
means the shelf held fewer units than the system thought, so arguably the
deficit is a counting error that the next delivery should not inherit. If the
founder wants forgiveness, the right way to get it is an explicit compensating
`shrinkage` movement written at oversell time instead of a silent clamp — the
log then sums to ≥ 0 on its own, no floor is needed anywhere, and the oversell
becomes a visible, syncing, auditable fact. That is strictly better and strictly
more work; it is listed as stage 4 rather than required.

---

## Options evaluated

### Option 1 — compute from the log on read, drop the column

Rejected on measurement. The catalogue read is the hard case: it is
whole-store, it runs on every Products/POS open, and on web/sql.js it resolves
synchronously on the main thread.

`getProductsWithDetails()` today is **flat at 20.8 ms regardless of log size**,
because it sums 1,952 cached integers. Replacing that with a derivation over the
log costs 35 ms at 40k movements, 68 ms at 120k and **187 ms at 400k**, growing
linearly and forever — the log is never pruned. A single grouped CTE over the
whole log is marginally *worse* than correlated subqueries (204 ms at 400k),
because the group-by has to touch every row either way.

That is on an M-series Mac in node. A store till is a cheap Windows box or an
Android tablet; `product-import.ts` already yields to the event loop every 25
rows precisely because sql.js freezes the tab. A 3–5× hardware factor puts the
catalogue at 0.6–1 s of hard main-thread block per open at 400k movements, with
no ceiling.

Dropping the column is also the one option §11 cannot absorb: it is in the pull
payload today, 52 client reads and 5 server reads consume it, and a device
running last month's bundle would read `NULL` as 0 and show an empty shop.

**Point reads are a different story and worth recording:** a single product's
stock derived from the log is 0.0–0.1 ms at every log size. If a future surface
needs a guaranteed-fresh figure for one product, it can derive it directly and
skip the cache entirely.

### Option 2 — keep `quantity` strictly as a cache, recomputed from that batch's log whenever the log changes (**recommended**)

Per-batch recompute is **0.0–0.1 ms** at every log size tested, because
`idx_stock_movements_stock_batch_id` already exists in
`schema-migrations.ts`'s `READ_PATH_INDEXES`. A sale touching two batches costs
0.0–0.2 ms. A pull page of 500 movements spread over 300 batches costs 2.3 ms at
40k and 24.6 ms at 400k, against 0.6 ms for today's per-movement increments —
an absolute cost of ~0.08 ms per batch, inside the noise of the page's own
inserts.

Every read path is untouched. The payload is untouched. Old clients are
untouched.

### Option 3 — materialised projection / event-sourced read model / periodic checkpoint

A checkpoint row plus "recent movements since the checkpoint" is what option 2
already is, with the checkpoint *per batch* and the window *empty*. Adding a
separate projection table buys nothing the existing column does not, and costs a
new table in the local schema, the MySQL migration and the sync engine's push
and pull coverage (root `AGENTS.md` §5). A periodic checkpoint with a live tail
reintroduces exactly the thing being removed: a stored partial sum that can
drift from its tail.

### Option 4 — remove only the floor, keep incremental deltas

Worth stating because it is the cheapest thing that fixes A-197 completely, and
because it is the fallback if option 2 hits trouble in the field. It fixes
nothing else: A-176, A-203 and A-205 lose deltas rather than reorder them, and
no commutative reducer survives a lost input. It also leaves the two replicas
computing different functions. Not recommended alone; its one-line change is
subsumed by option 2.

---

## Design

### `stock_batches.quantity` as a column: kept, redefined as a strict cache

No schema change. No payload change. No migration. The column's *definition*
changes from "a running total maintained by deltas" to "a cache of
`onHand(batch)`, rebuildable at any time from data this device already holds".

### Client: one helper, five call sites

```
recomputeBatchQuantity(batchId): quantity = MAX(0, COALESCE(SUM(sm.quantity), 0))
  over stock_movements WHERE stock_batch_id = ? AND _deleted = 0,
  skipped when the batch has no inbound movement (A-148 carve-out)
```

It replaces, rather than joins, the incremental writes:

| Site | Today | After |
| --- | --- | --- |
| `inventory.ts:538` (`updateStockBatchQuantity`) | read, add delta, floor, `update()` | `recomputeBatchQuantity()` |
| `inventory.ts:278` (`deductFromBatch`) | `MAX(0, batch.quantity − deduction)` | `recomputeBatchQuantity()` after the movement insert |
| `inventory.ts:800-856` (audit shortfall/overage) | same | same |
| `pull.ts:393` | `MAX(0, quantity + ?)` per pulled movement | collect `stock_batch_id`s, recompute the distinct set once per page |
| `deferred-stock-deltas.ts:98` | `MAX(0, quantity + ?)` | file deleted (§Retirement) |

**All ten client sites that insert a `stock_movements` row go through
`base-helpers.ts`'s shared `insert()`** (`procurement-receiving.ts:147,300`,
`product-import.ts:269`, `local-database.ts:168`, `inventory.ts:323,525,784,808,845`,
`returns.ts:71`). That is the chokepoint: `insert()` and `softDelete()` call
`recomputeBatchQuantity()` when `table === "stock_movements"`, and the pull's
raw-`execute()` path calls it per page. Two hooks cover every writer in the app,
now and later — a future caller cannot forget, which is the property today's
design lacks.

Ordering: the movement row must be inserted **before** the recompute, inside the
same `transaction()`. Today the quantity is written first and the movement
second in several places; that inversion has to be corrected, and is the main
reason this is not a search-and-replace.

**The recompute keeps using `update()`, not raw `execute()`, in stage 1.** It is
tempting to drop to `execute()` since the server throws the pushed `quantity`
away anyway — it would strip a `_sync_queue` row per batch per sale, which is
real relief for A-203. It is deferred deliberately: a batch's `updated_at`
bumping on every sale is currently the *only* thing that makes a
cursor-stranded batch get re-sent (A-176), and removing it quietly widens that
bug. One change at a time.

### Server: one statement

`applyStockBatchDeltas()` keeps its per-batch savepoint, its `$failed`
accounting and its unknown-batch warning. Only the statement changes, from
accumulate-and-increment to recompute:

```sql
UPDATE stock_batches sb
   SET quantity = GREATEST(0, COALESCE(
         (SELECT SUM(sm.quantity) FROM stock_movements sm
           WHERE sm.stock_batch_id = sb.id AND sm.deleted_at IS NULL), 0))
 WHERE sb.id = ?
```

`CASE WHEN … THEN 0 ELSE … END` instead of `GREATEST()` for the same reason the
current code gives: production is MySQL, tests run on SQLite. `$stockBatchDeltas`
degenerates from a map of sums to a set of touched batch ids, which is simpler
than what it replaces.

The A-148 carve-out applies server-side too, and matters more there: the server
is the one place a batch's quantity may have come from somewhere other than the
log, and `SyncController.php`'s own comment history (`83ffb95`) is a record of
what happens when that is got wrong. Skip any batch with no inbound movement.

No clock exposure (`AGENTS.md` §7): the statement sets no timestamp and uses no
`NOW()`. `updated_at` is left to Eloquent exactly as today.

### Sync: unchanged

The pull still strips `quantity`. The server still forces `quantity = 0` on
accept and derives. The push still carries `quantity` and the server still
ignores it. **An old client is affected in no way at all** — it receives the same
payload, sends the same payload, and keeps patching its own local copy
incrementally, which is what it does today. The only thing that changes for it
is that the server's figure is now right more often, which it never reads.

That is why there is no compatibility shim to retire: there is nothing to
tolerate on the way in, because the wire format does not move. **The condition
for removing the incremental code paths entirely is a client-side one** (see
Retirement), not a fleet-wide one.

### `device_stock_reports` and Health Sync

`buildStockFingerprint()` (`SUM(quantity)`, `COUNT(*)`) and
`StockDivergenceService`'s server-side mirror both keep working verbatim, and
become meaningful for the first time: today a non-zero `quantity_delta` could be
either real divergence or the two replicas' different floors, and there was no
way to tell. Under one definition, non-zero means something is wrong.

`reconcileStockQuantities()` (Health Sync) asserts the device's quantities as
truth and pushes them up. It is the A-148 batches' only repair and keeps that
job. It gets strictly safer: the device's figure is now a function of a log the
server also holds, so Health Sync stops being a way to push a floor artefact
into the server.

---

## Performance

sql.js 1.13 (WASM), node 24, M-series Mac. 2,495 products / 1,952 batches — the
real store — with the real indexes and `ANALYZE` run. Medians of 3–50 reps.
Scripts were throwaway; they are not in the tree.

| Operation | 40k log | 120k | 400k |
| --- | --- | --- | --- |
| `getProductsWithDetails()` — cached quantity (today, and after) | **20.8 ms** | **20.7 ms** | **20.8 ms** |
| same — derived on read, correlated subqueries | 35.3 ms | 67.9 ms | 187.0 ms |
| same — derived on read, one grouped CTE | 39.6 ms | 72.4 ms | 204.3 ms |
| one product's stock — cached | 0.0 ms | 0.0 ms | 0.0 ms |
| one product's stock — derived from log | 0.0 ms | 0.0 ms | 0.1 ms |
| **one batch recomputed from log (the write path)** | **0.0 ms** | **0.0 ms** | **0.1 ms** |
| pull page: 500 movements, per-movement increment (today) | 0.6 ms | — | 0.6 ms |
| pull page: 500 movements, recompute 300 touched batches | 2.3 ms | — | 24.6 ms |
| one sale: recompute 2 batches | 0.0 ms | — | 0.2 ms |
| `verifyStockIntegrity()`'s two reads (today) | 59.6 ms | 180.1 ms | 620.5 ms |
| whole-table rebuild, `UPDATE … = SUM(log)` in SQL | 15.2 ms | 45.6 ms | 165.4 ms |
| local DB size | 5.4 MB | 15.8 MB | 52.3 MB |

Five things these numbers decide:

1. **Read-time derivation is out.** Flat 20.8 ms against 187 ms and climbing,
   for the one query that must not block the tab. The log never shrinks, so this
   gap only widens.
2. **Write-time recompute is free.** 0.0–0.1 ms per batch. The cost is not
   "acceptable", it is unmeasurable against the movement insert next to it.
3. **A full rebuild is 4× cheaper than today's integrity check** (165 ms vs
   620 ms at 400k), because the rebuild stays in SQLite while the check ships
   every movement row into JS to replay in a `reduce`. A whole-store rebuild is
   affordable on every sync round, let alone daily — which is what makes the
   staged rollout verifiable and the auto-heal cheap.
4. **A first full sync of a 400k-movement store pays ~20 s extra** (800 pages ×
   24.6 ms) for per-page recompute. A first sync of that store already takes
   minutes and is the one moment drift is worst (A-197's live case *was* a large
   pull), so this is the right place to spend it. If it proves annoying, recompute
   once at end of round *and* per page only for batches that arrived this round.
5. **Hardware factor is unmeasured and is the main caveat.** Everything above is
   a developer Mac. Expect 3–5× on a store till. That changes nothing about the
   recommendation — 0.1 ms × 5 is still 0.5 ms — but it is why option 1's 187 ms
   is disqualifying rather than merely unattractive.

---

## What ships, in what order

Two live customers and a founder who cannot afford a bad night. Every stage is
one commit, individually revertable, and each has a field signal that must come
back clean before the next one goes out.

**Stage 0 — merge `feat/stock-drift-autoheal` as it stands.** It is the first
aid and this design does not replace it. Its per-page drain fixes A-197 today;
its queue collapsing fixes A-203; `healStockIntegrity()` repairs devices that
are already drifted, which no later stage does. Nothing in stages 1–4 conflicts
with it: stage 1 deletes code it modified, which is a clean sequence in that
direction and a merge conflict in the other. **Do not hold it for this design.**

**Stage 1 — client recompute.** `recomputeBatchQuantity()`, the two hooks in
`insert()`/`softDelete()`, the per-page recompute in `pull.ts`, the five call
sites. Client-only; the server keeps incrementing.
*Field signal:* `healStockIntegrity()`'s existing Sentry report under
`area: stock-autoheal` — `diverged` should go to 0 and stay there on a device
that has folded once, across large pulls. The store-level signal is
`device_stock_reports.quantity_delta` in the admin panel; it will **not** reach 0
yet, because the server is still on the old function, but it must stop growing.
*Reversible:* revert one commit. No data shape changed; the column holds the
same kind of number either way, and the next auto-heal round repairs whatever
the revert leaves behind.

**Stage 2 — server recompute.** The one statement in `applyStockBatchDeltas()`.
*Field signal:* `quantity_delta` → 0 for every device of both customers, and
`StockDivergenceService`'s `diverged` flag stays false through a week of
trading.
*Reversible:* revert one commit. The server's own value is rebuildable from its
own log at any time, by the same statement, so a revert cannot strand it.

**Stage 3 — retirement.** Delete `deferred-stock-deltas.ts`,
`_pending_stock_deltas`, the per-page drain and the `pending` verdict in
`stock-integrity.ts`. Demote `healStockIntegrity()` from repair to assertion.
*Condition, stated so it actually happens:* two releases after stage 1 **and**
no device reporting a non-empty `_pending_stock_deltas` or a non-zero `diverged`
in the auto-heal telemetry. This is a local-only structure, so the condition is
"every device has run a stage-1 bundle at least once", not "every version ever
shipped is gone" — a device runs exactly one bundle.

**Stage 4 — optional, only if the field data asks for it.** Two independent
items, neither required:
- *Compensating oversell movement* instead of a floor, if the founder wants
  oversells forgiven rather than carried (§"One behaviour change"). Removes the
  clamp from storage entirely.
- *`opening_quantity`*, a nullable column holding the unexplained residue of an
  A-148 batch, backfilled server-side as `MAX(0, quantity − SUM(log))` for
  batches with no inbound movement, pulled down as immutable server-authoritative
  truth, with `onHand = opening_quantity + Σ log`. This dissolves the
  `unreconstructable` class and makes the invariant total. It is a cross-repo
  schema change (root `AGENTS.md` §5: local schema, MySQL migration, push and
  pull coverage, `npm run test:schema`) and should only be paid for if the
  auto-heal telemetry says those batches are numerous enough to matter. Today's
  evidence says they are not: `DRX-ZKI5K81UG` reported `unreconstructable 0`
  across 1,952 batches.

### The other two unmerged branches

`fix/till-code-visibility-and-silent-refusal` and
`feat/store-detail-scroll-storefront-toggle` were read and touch no stock path —
admin till codes, an encrypted-code column and migration, and a storefront
toggle plus admin-panel layout. No interaction, no ordering constraint.

---

## The auto-heal: stays, demoted

`healStockIntegrity()` stops being a repair and becomes a cheap invariant
monitor, and it should stay for three reasons.

1. **It is the only way to know stage 1 worked.** Its `diverged` count is the
   field signal the rollout gates on. Removing it would leave the migration
   unverifiable.
2. **The cache can still go stale, just not catastrophically.** If a future code
   path writes a movement outside `insert()` — or a transaction half-commits, or
   a raw `execute()` is added in a hurry — the cache is wrong until something
   recomputes. The difference is that it is now *always* repairable by
   definition, and the repair is idempotent.
3. **A-148 batches keep needing it.** They are outside the invariant and Health
   Sync remains their only path.

What changes: it should stop shipping the whole movement log into JS to replay
in a `reduce`. A single SQL statement comparing `quantity` against
`SUM(log)` does the same job in 165 ms instead of 620 ms at 400k, and a
whole-store rebuild in SQL costs the same again — so the honest post-stage-3
shape is "rebuild every batch with an inbound movement, report how many values
changed", with `foldStockQuantities()`'s JS replay kept only for the
`unreconstructable` classification it is actually needed for.

It also stops needing `movementLogIsComplete()`. Mid-window the recompute is
simply *current as of what has arrived*, which is the correct answer at that
moment and converges as the window closes. The guard exists today because a
mid-window fold would mass-rewrite quantities the rest of the window was about
to correct; under recompute there is nothing to mass-rewrite.

---

## What this does **not** fix

Explicitly, because some of today's bugs survive:

- **A-176 is not fixed.** A batch whose `updated_at` predates the pull cursor
  still never arrives, and a batch that has not arrived shows no stock. What
  changes is the failure mode: the delta is no longer *destroyed*, so the batch
  self-corrects the instant it arrives, by any route — a `forceFullResync()`, an
  unrelated edit, or the targeted by-id backfill A-176 asks for. The symptom
  becomes "missing", which is visible, instead of "silently wrong forever".
  **And stage 1 carries a small risk of making it marginally worse** (see the
  `update()`-vs-`execute()` note): a sale bumping a batch's `updated_at` is
  today an accidental re-send mechanism, and anything that stops bumping it
  removes one. Keeping `update()` is the mitigation.
- **A-203 is not fixed by this design** (it is fixed on the autoheal branch).
  `pull.ts:313` still skips any row with a queued local edit, so a `products`
  backlog still hides server-side catalogue repairs. Quantity leaves the blast
  radius — it is recomputed locally from the log and never needs the pulled
  snapshot — but `category_id` and `price` do not.
- **A-205 is not fixed.** A conflicted queue row is still dropped and still
  never re-offered, for every column except `quantity`.
- **A-148 is not fixed** unless stage 4's `opening_quantity` ships. Batches with
  no inbound movement remain outside the invariant, repairable only by Health
  Sync.
- **A wrong log is still wrong.** This design makes the log the single point of
  failure for stock. If a sale completes without writing its `stock_movements`
  row, the recompute propagates the wrong answer with total confidence and the
  integrity check reports `consistent`, because quantity and log agree — they
  are just both wrong. Today's incremental path would at least leave the two
  disagreeing. **This is the one place the design trades a loud failure for a
  silent one**, and the mitigation is that the sale path writes the movement
  through the same `insert()` that triggers the recompute, inside one
  transaction, so there is no window where one exists without the other.
- **A soft-deleted movement is a live trap.** `replayMovements()`'s existing
  comment says it: the replay filters `_deleted = 0` while the delta stays in
  `quantity`, so the first code path that soft-deletes a movement — a void sale,
  most likely — would make a recompute destroy stock. Nothing does today. Under
  this design `softDelete()` recomputes, which makes it *correct* rather than
  destructive, but it also means a void-sale feature changes stock figures the
  moment it ships, which is worth knowing before it does.
- **Physical shrinkage, theft and miscounts.** Unchanged. That is what the
  stock-audit flow is for.

---

## Testing

Data-integrity work, so root `AGENTS.md` §9 makes these mandatory. The existing
`client/__tests__/` fixtures for stock integrity are the starting point.

Properties, not examples — each of these is a statement the old design could not
make:

- **Order independence.** The A-197 differential fuzz on the autoheal branch
  (`pull-deferred-delta-order-across-pages.test.ts`, 60 randomised histories)
  must pass with the batch delivered on the *last* page — the case that failed
  31 of those 60 before the drain fix. Under recompute it should pass without
  any drain at all.
- **Idempotence.** Recomputing a batch twice equals recomputing it once.
  Re-pulling a page of movements changes no quantity.
- **Loss tolerance.** Drop a movement from a pulled page entirely, then deliver
  it in a later round: the final quantity matches the complete log.
- **Replica agreement.** The existing differential fuzz, extended to assert the
  client's figure equals the server's `applyStockBatchDeltas()` figure for the
  same log, including an oversell-then-restock history — the case where today's
  two implementations provably disagree.
- **The A-148 refusal.** A batch with quantity and no inbound movement is never
  recomputed, on either side, and is reported.
- **Unsynced work survives.** A sale sitting in `_sync_queue` is still counted,
  because its movement row is local and the recompute reads local rows. This is
  the property that makes recompute safe where a factory reset is not.
- **The real case.** `PENTAZOCINE INJ` on `DRX-ZKI5K81UG`: opening 80, 28 sold
  across 8 movements, recompute must give 52 — the server's value, which the fold
  already reproduced in the field on 2026-10-10.
- **Server:** `php artisan test` only, never `tinker` (root `AGENTS.md` §12).
  If `vendor/` is copied into a worktree, **copy it, never symlink** — a symlink
  makes composer's PSR-4 paths resolve back to the main checkout and the tests
  silently run the wrong code. Two agents hit that on 2026-10-10.

---

## Docs that must change with the code

Per root `AGENTS.md` §2, in the same change, not after:

- `client/AGENTS.md` — "Deferred movement deltas" and "Pull details" both
  document the incremental model as the design. A-197's entry already notes the
  deferral section describes the mechanism as safe when it is not. Stage 1
  rewrites both around the definition in this spec.
- `laravel-server/AGENTS.md` — the sync-engine section's account of
  `$stockBatchDeltas`.
- `SyncController.php`'s block comment on `applyStockBatchDeltas()` is ~40 lines
  of explanatory prose that root `AGENTS.md` §3 would not allow today. Stage 2
  touches that function, so the §3 retroactive-cleanup rule applies: the history
  (`83ffb95`, the savepoint rationale, the MySQL/SQLite portability note) moves
  into `laravel-server/AGENTS.md` and the code keeps at most the two-line
  portability note.
- `docs/KNOWN_BUGS.md` — A-197 closes at stage 1 and moves to `FIXED_BUGS.md`
  outright, including its executive-summary count. A-176, A-203 and A-205 stay
  open, with their consequence text corrected to say `quantity` has left the
  blast radius.
- `docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md` — its
  "Rollout" still describes a phase 3 that stage 3 of this spec demotes.

---

## Open questions

1. **Oversell semantics.** Forgive (per-movement floor, today's client) or carry
   forward (single floor, this design)? Needs the founder's answer, not an
   engineer's. It is the only user-visible behaviour change in stages 1–3, and
   it only shows up on a batch that was oversold and then restocked.
2. **Per-page or per-round recompute on a first sync?** Per page is correct at
   every instant and costs ~20 s on a 400k-movement first sync. Per round is
   cheaper and leaves the figures wrong until the round closes — which was
   tolerable before and is not obviously tolerable now that the number is
   supposed to be trustworthy.
3. **Does a multi-store device recompute every store's batches, or only the
   active one?** `foldStockQuantities()` refuses without an active store because
   the audit widens. A recompute keyed by batch id does not have that problem,
   but the per-page loop needs to decide whether it touches another store's
   batches. A-189 established that at least one owner runs two stores.

---

## What I am least sure about

Honestly, in order:

1. **The hardware factor.** Every number here is node on an M-series Mac. I did
   not measure a real till, and the ratio between this and a cheap Android
   tablet under sql.js is a guess. It does not change the recommendation — the
   recommended path's cost is 0.1 ms and the rejected path's is 187 ms, and no
   plausible factor crosses those — but any absolute number in this document
   should be treated as a lower bound. The one I would most want measured on
   real hardware is the per-page recompute during a first sync.
2. **Whether `insert()` and `softDelete()` really are the only chokepoints.** I
   traced all ten `stock_movements` insert sites through `base-helpers.ts` and
   the pull's raw `execute()`, and found no other writer; `lib/demo/loader.ts`
   and `requeue-payload.ts` write no movement, and the only other reference is
   `e2e/procurement.spec.ts`. What I cannot rule out is a future caller added
   through a raw `execute()` rather than `insert()`. If one is, that batch's
   cache goes stale silently — repairable by definition, but silent until the
   next auto-heal round.
3. **The oversell-then-restock case.** I am confident the two replicas disagree
   there today and that one definition is better than two. I am not confident
   which definition the founder wants, and I cannot tell from the code: the
   comments argue for the floor on the grounds that an oversell "is surfaced via
   `getOversoldAlerts()`, not a negative quantity", which is an argument about
   storage, not about whether the deficit should be inherited.
4. **The silent-wrong-log trade.** Making the log authoritative means a missing
   movement row becomes invisible rather than detectable. I believe the
   same-transaction coupling closes the window, and I believe the trade is worth
   it — today's "detectable" has never actually detected anything until a
   customer phoned. But it is a real loss of a real signal, and I would not want
   it discovered later rather than read here.
5. **Whether stage 1 alone is enough to stop the phone calls.** It makes the
   *client* self-correcting, and every incident so far has been a client
   divergence against a correct server. So it should be. But the server keeps
   computing a slightly different function until stage 2, so
   `device_stock_reports` will keep showing a small non-zero delta in between,
   and I cannot predict its size without a week of field data. A founder watching
   that number should be told to expect it rather than alarmed by it.
