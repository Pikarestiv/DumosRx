# Stock integrity: divergence detection and fold-from-scratch — design

**Date:** 2026-10-08
**Status:** phase 1 shipped — **detection only, no writes and no interlock**. The Health Sync interlock was built and then withdrawn before merge (see §4). Phase 2 (`foldStockQuantities()`) not started.
**Scope:** `client/` only. No server change, no admin surface.
**Related:** `docs/KNOWN_BUGS.md` A-176 · `docs/FIXED_BUGS.md` A-148, A-173, A-191

## Why

On 2026-10-08 a store reported "double counting". Investigation found 958 of
2,495 products on one device carrying exactly twice their opening stock —
83,990 units against a true 47,072. The server was correct throughout: every
batch's `quantity` equalled the sum of its `stock_movements`, verified across
all 2,495 products.

The damage was confined to one device's local SQLite, and **nothing in the
product could repair it**:

| Path | Why it fails |
| --- | --- |
| Sync | `pull.ts:278` strips `quantity` from every pulled `stock_batches` row, by design — a pulled snapshot is only as current as the movements the server had processed, so writing it clobbers real local state |
| Movements re-pull | an existing movement hits the UPDATE branch, which replays no delta |
| `forceFullResync()` | resets the cursor, not the data — both of the above still apply |
| Health Sync | points the wrong way: it asserts *this device's* quantities as authoritative and would have pushed 83,990 up as truth |

The only repair available was a factory reset and a full re-download of the
catalogue, which works only because a fresh local database reconstructs
quantity correctly: batches arrive at 0 and every movement delta applies
exactly once.

**That reconstruction is the missing function.** The log is complete and
authoritative — `stock_movements` is append-only and never pruned
(`retention.ts` prunes only `audit_logs`). The system has the log and the
incremental apply, but no way to recompute the derived value from the log.
Hence a day of investigation for what should have been one click.

A second device (`DRX-Y8UK10GC3`) is still drifted: 46,310 local units against
the server's 46,097, including `PENTAZOCINE INJ` reading 53 where its own
movement log sums to 52. It is deliberately being left drifted as the
real-world fixture to verify this work against.

## Goals

1. Detect per-batch divergence between `stock_batches.quantity` and the sum of
   that batch's movements, cheaply enough to run routinely.
2. Repair what is provably reconstructable.
3. Refuse, loudly, what is not — never destroy the only copy of a fact.
4. Stop Health Sync being usable as a foot-gun on a diverged device.

## Non-goals

- Changing how quantity syncs. The strip at `pull.ts:278` stays; it is correct.
- Any server change. The server is already self-consistent by construction.
- Remote triggering. That is the remote-maintenance-commands spec.
- Fixing A-176 (stranded deltas). Separate cause, separate fix. Fold repairs the
  *symptom* a stranded delta leaves behind, but the delta still strands.

## Design

Two functions, deliberately separable: one reads, one writes. Keeping them apart
is what makes a detect-first rollout possible.

### 1. `verifyStockIntegrity()` — pure read

For each active, non-deleted batch of the active store, compare
`stock_batches.quantity` against `SUM(stock_movements.quantity)` for that
`stock_batch_id`, and classify:

| Verdict | Condition |
| --- | --- |
| `consistent` | quantity equals the movement sum |
| `diverged` | quantity differs, and the batch has at least one movement |
| `unreconstructable` | quantity is non-zero and the batch has **no** movements |

The third class is the dangerous one and the reason fold cannot be naive. Those
batches demonstrably exist: a bulk import predating `a36b00e7` created batches
with a quantity and no movement row, which is why `A-148` and Health Sync exist
at all. Folding one computes 0 and destroys the only record of that stock.

Returns counts per class plus the diverged/unreconstructable batch ids and their
deltas. Writes nothing.

### 2. `foldStockQuantities()` — repair

Takes the verify result and, for `diverged` batches only, sets
`quantity = SUM(movements)` — applying the same `MAX(0, …)` floor the pull's
delta path uses, so an oversell floored on the originating device does not
diverge again here.

`unreconstructable` batches are **skipped and reported**, never folded. A fold
may only ever overwrite a value it can fully reconstruct.

Local-only, like every other quantity write on the client. It does **not** push
quantity (the server refuses it anyway) and does **not** write a
`sync_reconciliation` movement — that is Health Sync's job and points the other
way. The fold is bringing this device back in line with a log it already holds.

### 3. Wire detection into `checkSyncHealth()`

`health-check.ts` already runs once per 24h per device and reports to Sentry
under `area: sync-health-check`. Add a divergence summary to it: counts per
class, total unit delta, and a sample of the worst offenders.

**Phase 1 ships detection only — it writes nothing.** The fleet tells us how
often devices drift, by how much, and crucially how many `unreconstructable`
batches are out there. Only then do we enable auto-fold. Shipping the write
blind is how you turn a display bug into a data-loss incident.

Rationale for detect-first is unchanged from the brainstorm: the unreconstructable
case is a genuine destructive edge and we do not yet know its prevalence.

### 4. The Health Sync interlock — built, then withdrawn before merge

An interlock refusing `reconcileStockQuantities()` on any `diverged` batch was
implemented and then **removed during pre-merge review**. The reasoning that
justified it was sound in the abstract and wrong against this classifier:

- **A floored batch reads as diverged forever.** `stock_batches.quantity` is
  floored at 0 in four places (`queries/inventory.ts:538` and `:800-856`,
  `pull.ts:393`, `SyncController.php:1345`) while the movement keeps its full
  size. An oversell of 3 units leaves quantity `0` against a sum of `-3`.
- **A legacy A-148 batch reads as diverged the moment anything sells from it.**
  The `unreconstructable` carve-out originally fired only at zero movements, so
  one sale against an imported batch flipped it to `diverged`.
- Either case made Health Sync throw **for the entire store**, permanently —
  and Health Sync is the *only* repair A-148 batches have. Phase 1 ships no
  fold, so the error told the owner to "repair those first" with nothing to
  repair with.
- It also ran *before* `syncFn(true)`, so a merely stale device was refused
  before the forced sync it needed could run — the same shape of defect as the
  pending-delta guard below.

The classifier was fixed for the first two cases regardless (a floored
quantity and a batch with no inbound movement are no longer `diverged`),
because they also produced false divergence *reports*. But the interlock stays
out until phase 2 exists: a guard that blocks the only repair path is worse
than no guard.

**Also corrected during implementation: this spec originally called for
refusing while `_pending_stock_deltas` is non-empty. That is wrong and was not
built.** The same guard was written and removed in the A-173 review: a delta
stays pending only while its `stock_batches` row is *absent* locally, and an
absent batch is not in the payload, which the server only applies to batches it
receives. `client/AGENTS.md` carries a standing rule against reinstating it,
and `client/__tests__/reconcile-proceeds-with-pending-deltas.test.ts` pins the
opposite property.

### 5. Exposure

- `window.__verifyStockIntegrity()` and `window.__foldStockQuantities()`,
  alongside the existing `__forceFullResync` / `__reconcileStockQuantities`
  DevTools hooks, for a support session.
- No in-app button in phase 1. Settings → Data already offers two destructive
  actions whose names invite misuse; a third is not an improvement until
  detection data says folding is safe to offer.

## Performance

One grouped query over `stock_movements` per store, joined to active batches.
On the real dataset that is ~2,500 batches and a movement log in the low tens of
thousands — comfortably inside the once-a-day health check. If it proves slow on
sql.js, chunk by product rather than reaching for a cache.

## Testing

Data-integrity work, so per root `AGENTS.md` §9 these are mandatory, not optional:

- a diverged batch folds to its movement sum
- a batch with quantity and **no** movements is classified `unreconstructable`,
  is **not** folded, and is reported
- a fold never drives a quantity below 0
- a consistent batch is left untouched and reported `consistent`
- verify writes nothing (assert quantities unchanged after a verify-only run)
- an unpushed local sale sitting in `_sync_queue` is still counted, so folding
  cannot discard unsynced work — this is the property that makes fold safe where
  a factory reset is not
- `reconcileStockQuantities()` refuses with diverged batches
- `reconcileStockQuantities()` still proceeds with a pending delta, and that
  delta's batch is absent from the payload
- regression against the real case: batch quantity 10, one `+5` movement →
  folds to 5

The last one is `ABIDEC MULTIVIT FOR CHILDREN` (SKU 44) exactly as observed in
production.

## Rollout

1. Phase 1 — `verifyStockIntegrity()` + health-check reporting + the Health Sync
   interlock. No writes.
2. Read the fleet data. Specifically: how many devices diverge, by how much, and
   how many `unreconstructable` batches exist.
3. Phase 2 — enable `foldStockQuantities()`, triggered automatically on detected
   divergence if the data supports it, manually via the DevTools hook if not.

Verify phase 2 against `DRX-Y8UK10GC3`, whose drift (+213 units, server known
correct at 46,097) is measured and reproducible.

## Open questions

1. Scope per store or per device? A multi-store device holds batches for several
   stores; verify is currently specified for the active store only.
2. Should `unreconstructable` batches get a one-off backfill offer — a Cycle
   Count seeded with the current quantity — or stay reported-only indefinitely?
   Reported-only for now; revisit when we know the count.
3. Does a fold need to appear anywhere in the owner's UI at all, or is a silent
   correction plus Sentry the right level? Leaning silent, consistent with how
   `sync_reconciliation` is scoped out of the owner's casual lists.

## Implementation notes

### Shipped in phase 1 (2026-10-08)

- **`client/lib/db/sync-engine/stock-integrity.ts`** — `verifyStockIntegrity()`
  (pure read, one grouped `LEFT JOIN` over `stock_movements`, scoped to the
  active store's active non-deleted batches, soft-deleted movements excluded
  from both the sum and the count) and `summarizeIntegrity()` for the Sentry
  payload. Classification is as specified above.
- **`health-check.ts`** — `reportStockIntegrity()`, called from
  `checkSyncHealth()`, reporting under `area: "stock-integrity"` with the ten
  worst-diverged batches. Returns silently when nothing diverges, and swallows
  its own failures so the check can never break the row-count deficit path
  that follows it.
- **`reconcile-quantities.ts`** — the interlock, keyed on `diverged` only
  (§4). It deliberately does **not** block on `unreconstructable`: Health Sync
  is the only repair for those batches (A-148), so blocking on them would
  disable the one thing that fixes them.
- **Exposure** — `window.__verifyStockIntegrity`, no in-app button.
- **Tests** — `client/__tests__/stock-integrity-verify.test.ts`. The
  interlock's own test file was removed with the interlock; see §4.

### Decisions settled by implementation

- **The interlock throws rather than returning a refusal result.** Both call
  sites already handle a rejection correctly: `use-settings-sync.ts` wraps the
  call in `toast.promise` whose `error` handler surfaces `e.message` verbatim
  (added precisely because this function can reject for specific, non-network
  reasons), so the refusal reaches the owner as its own sentence and never as
  an unhandled rejection; `window.__reconcileStockQuantities` is a DevTools
  hook where a rejected promise is the right result. The refusal messages are
  therefore written as user-facing prose, not error codes.
- **Open question 1 (scope) is resolved as per-store**, matching
  `reconcileStockQuantities()`'s own payload scoping; `getActiveStoreId()`
  returning nothing falls back to every batch, which is what the test harness
  exercises.

### What phase 2 still needs

1. Read the fleet data this phase emits: how many devices diverge, by how
   much, and above all **how many `unreconstructable` batches exist**. That
   count is the gate — it is the one class a fold can destroy.
2. `foldStockQuantities()` per §2: `diverged` batches only, `MAX(0, …)`
   floored, local-only, `unreconstructable` skipped and reported.
3. Decide trigger (automatic on detection versus DevTools-only) from that
   data, then verify against `DRX-Y8UK10GC3` (+213 units, server known correct
   at 46,097).
4. Open questions 2 and 3 remain open and want the same fleet data.
