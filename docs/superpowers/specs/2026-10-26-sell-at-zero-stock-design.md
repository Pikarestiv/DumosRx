# Sell at zero stock, settle on receipt — design

**Date:** 2026-10-26
**Status:** Built on `feat/sell-at-zero-stock` (2026-10-26). See §"Build notes" at the end for where the build departs from the text above.
**Requested by:** Favour Mbonu, Divamax Quincallerie (Cameroon, construction materials; referred by Cynthia/Ada of Nest Pharmacies) — sell a product that shows 0, or less than asked for, and have the system square it up when the purchase order arrives.
**Scope:** `client/` (cart, sale write, receiving, readers), `laravel-server/` (one `stores` column). No `web/` change required.
**Related:** `docs/KNOWN_BUGS.md` A-265, A-217 · `docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md` · `docs/superpowers/specs/2026-10-14-oversell-compensating-movement-design.md`

---

## Summary

A store setting, off by default, lets the till sell past what is on hand. At checkout the units that were not on the books are written to the ledger as **owed** (a backorder). When stock comes in through a purchase order or an Immediate Purchase, the receipt pays the owed units off first and only the rest goes on the shelf. The receive screen says "5 units of this were already sold. 15 go on the shelf."

There is no new table and no new `movement_type`. The design reuses the A-265 compensating-row pattern under a different `reference_type`, so both replicas agree on the numbers while the server is still on Stage 0 arithmetic.

## Verified findings that shape the design

1. **The block exists only in the cart.** `client/lib/hooks/use-pos-cart.ts`:
   `addToCart()` refuses when `product.stock <= 0` (`toast.error("This item is out of stock")`) and when
   `existingItem.quantity >= product.stock`; `updateQuantity()` refuses `newQuantity > product.stock`.
   Both messages come from `formatInsufficientStock()` in `client/lib/utils/stock-status.ts`, which hides
   the number when `canSeeQuantities` is false. Nothing downstream re-checks stock: `writeSaleTransaction()`
   (`client/lib/hooks/pos-sale-writer.ts`) calls `recordSaleItemStock()` per line, and
   `writeSaleItemStock()` (`client/lib/db/queries/inventory-sale-stock.ts` — the oversell spec still calls
   this `inventory.ts`; it has since moved) already sells through to zero and past it:
   - FEFO over `getBatchesForProduct()`, falling back to `getAnyActiveBatchForProduct()` (then with
     `includeExpired`), and finally `getOrCreateTargetBatchForProduct(productId, { unitCost, batchNumberPrefix: "SALE" })`
     when the product has no batch at all;
   - `deductFromBatch()` puts the shortfall on a fallback batch, adds that batch to `oversoldBatchIds`
     and gives its `sale` movement the reason "Customer sale (oversold — insufficient batch stock)".
   So the write path needs no unblocking. It needs the deficit **recorded as owed** and nothing more.
   `pos-product-card.tsx` greys the tile out (`aria-disabled`, `opacity-60`) but still calls `addToCart()`.
   The scanner (`use-pos-scan.ts`) and held transactions (`use-pos-held-transactions.ts`) do not check stock themselves.
2. **A purchase-order receipt never pays off an existing deficit today.** `receivePurchaseOrder()`
   and `createAndReceivePurchaseOrder()` (`client/lib/db/procurement-receiving.ts`) always
   `insert("stock_batches", { quantity: 0, ... })` a **new** batch (`receiptBatchId(item.id, alreadyReceived)`)
   and put the `+R` `purchase` movement on it. Each batch's on-hand is `MAX(0, Σ its own log)` (`onHandFromLog()` /
   `resolveBatchQuantity()`, `client/lib/db/batch-quantity.ts`), so if the sale left −5 on batch A, receiving 20 into new
   batch B reads A=0, B=20, product=20. **The "next inbound pays it off" property holds only for inbound onto the same batch.**
   That means counts landing via `getOrCreateTargetBatchForProduct()` and returns. It does not hold for purchases. This is
   A-265 point (a) seen from the receiving side. The deficit stays on A for good, and on hand is overstated by 5.
3. **The server forgives deficits per push.** `StockBatchDeltaApplier::applyStockBatchDeltas()` still runs
   `quantity = CASE WHEN quantity + ? < 0 THEN 0 ELSE quantity + ? END`. That is Stage 0 of the derived-quantity
   spec; Stage 2 has not shipped, and A-217 is still half open. Any design that leaves a batch's log below zero
   and later lifts it with `+N` makes the server read N where the client reads 0. **So the batch log must never
   go negative.** Only a compensating `+N` at sale time does that, and it is the same reason the A-265 spec picked it.
4. **The cost of a zero-stock line is 0 today.** `getProductsWithStock()` (`client/lib/db/queries/products.ts`)
   derives `cost_price` from `SUM(cost_price*quantity)/NULLIF(SUM(quantity),0)`. When every batch is 0 that is NULL, which
   becomes `|| 0`. `writeSaleTransaction()` then writes `costPrice: item.cost_price || 0` into `sale_items.cost_price`,
   and COGS (`reports.ts`, `SUM(si.cost_price * si.quantity)`) books the whole price as profit. This already happens on every
   online-order oversell. **It is a live bug and should go into `docs/KNOWN_BUGS.md` when this work starts.** `products` has
   no cost column; the nearest estimate is the `last_bought_price` subquery already in `getProductsWithDetails()`.
5. **Store toggles have a precedent.** `markup_sales_enabled` touches `client/lib/db/schema.ts` (the `stores` table),
   `schema-migrations.ts`, `client/lib/context/store-types.ts`, `use-feature-gate.ts`, `register-config-card.tsx`,
   `App\Models\Store` (`$fillable` + boolean cast) and the migration `2026_09_23_000007_...`. It is written with
   `updateStoreProfile()`, which calls `update("stores", ...)` and so syncs through the normal queue.

## Setting

- **Column:** `stores.allow_sale_without_stock`. INTEGER DEFAULT 0 on the client, `boolean()->default(false)` on the server.
  The scope is **per store**: it describes how a store runs its yard, and a cashier is not the one to decide that.
- **UI:** a fourth switch in `client/components/settings/store/register-config-card.tsx`. Label "Allow sales beyond
  recorded stock". Description: "Staff can sell more than the system shows. The extra units are recorded as owed and
  are taken off the next delivery you receive." The card is owner/admin-only already.
- **Gate:** `isSaleWithoutStockEnabled` in `use-feature-gate.ts`, built the way `isMarkupSalesEnabled` is.
  **No plan gating is recommended.** This is a stock-integrity behaviour, not a premium feature, and putting it behind
  a plan means a downgrade switches it off while backorders are still outstanding, with nothing settling them. If the
  owner wants it on a plan anyway, the gate must apply only to the *sale*. Settlement at receipt always runs (see §Receiving).
- **Per-role restriction:** not in v1. If wanted, add a permission `sell_without_stock` to
  `client/lib/constants/permissions.ts` and `PermissionGroupSeeder.php`, with a catalog-version bump and a
  legacy-grant shim like `LegacyStockQuantitiesGrant`. That costs about a day, so it waits for an owner decision.

## Code paths after the change

### Cart (`use-pos-cart.ts`)
When `isSaleWithoutStockEnabled` is on, `addToCart()` and `updateQuantity()` still let the line through, with a
`toast.warning`. They stop refusing. The wording goes in a new `formatBackorderWarning(onHand, requested, canSeeQuantities)`
beside `formatInsufficientStock()`:
- quantities visible: "Only 3 in stock. 2 will be recorded as owed until stock is received."
- quantities hidden: "More than the recorded stock. The extra will be recorded as owed."
  This leaks nothing: "Out of stock" is already shown to these staff, and "more than recorded" is the same fact.
The toast fires when the line first crosses `product.stock`, not on every later `+`.
`pos-product-card.tsx` drops `aria-disabled`/greyscale for out-of-stock tiles when the gate is on, and keeps the "Out of stock" word.
`CartItem` gets no new field. The shortfall is worked out at write time from live batch figures, which beats a cart snapshot.

### Sale write (`inventory-sale-stock.ts`)
`RecordSaleItemStockParams` gains `recordShortfallAsOwed?: boolean`, passed from `writeSaleTransaction()` as the store
setting. When it is true, then for each batch in `oversoldBatchIds` and after its `sale` movement:

```
movement_type  "adjustment"            quantity  +(deduction − max(0, available))
reference_type BACKORDER_REFERENCE_TYPE ("backorder")   reference_id saleId
unit_cost      the line's costPrice     reason   BACKORDER_REASON ("Sold before stock was received")
performed_by   cashierId                correlationId  the sale's
```

`available` is the batch's `liveQuantity` before the deduction, which the function already tracks. With the row in
place the batch log sums to ≥ 0, `insert()`'s recompute holds the batch at its true shelf figure (0), and the server's
per-push floor never triggers. The pair sits next to each other in `_sync_queue`, so finding 3 is satisfied apart from
the chunk-split caveat A-265 already bounds. With the setting off, the write is unchanged from today.

Cost: `writeSaleTransaction()` passes `item.cost_price`. Fix finding 4 at the source: `getProductsWithStock()` becomes
`COALESCE(avg_cost_price, last purchase cost of a non-ADJ batch, 0)`, which reuses the subquery from
`getProductsWithDetails()`. That changes COGS for every zero-stock line, accidental oversells included, and it is the right change.

### Outstanding backorders (new, `client/lib/db/queries/backorders.ts`)
`getOutstandingBackorders(productIds?)` returns per product
`Σ quantity WHERE reference_type='backorder' − Σ |quantity| WHERE reference_type='backorder_settlement'`.
It is scoped to the active store and `_deleted = 0`, and floored at 0. (Superseded: see §"Build notes"; the build
matches settlements to sales by id and has no over-settled report.) It is derived from the log alone, so it syncs and rebuilds with no state of its own.

### Receiving (`procurement-receiving.ts`)
In both receive functions, after the `purchase` movement for a line:
`settle = min(outstanding(product), totalBaseUnits)`. If `settle > 0`, insert on the **receipt batch**:

```
id             receiptSettlementMovementId(item.id, alreadyReceived)   (new, deterministic-id.ts)
movement_type  "adjustment"   quantity −settle   unit_cost baseUnitCost
reference_type BACKORDER_SETTLEMENT_REFERENCE_TYPE ("backorder_settlement")  reference_id PO id
reason         BACKORDER_SETTLEMENT_REASON ("Already sold before this delivery")
```

Within one transaction a PO with two lines for the same product re-reads `outstanding` between lines. The deterministic id
makes a retried receipt idempotent in the same way as `receiptMovementId`. Settlement **does not depend on the setting**,
so a store that turns the toggle off with backorders outstanding still settles them.

What the owner sees:
- `receive-po-panel.tsx` / `receive-item-card.tsx`: under the quantity input, "5 already sold before this delivery.
  15 will go on the shelf." This comes from `getOutstandingBackorders()` and shows only when outstanding > 0. The number
  is shown because receiving is a role that sees quantities under the `view_stock_quantities` rule.
- `po-immediate-confirm-dialog.tsx`: the same line per item.
- Stock Adjustments ledger (`getStockAdjustments()`): both rows appear. `stock-movement-utils.tsx` gets two source labels
  next to `"import"`: "Sold before received" and "Settled on delivery", each linked to its sale or PO.
- Inventory alerts (`inventory-alerts.ts`): a new "Owed to customers" list built on `getOutstandingBackorders()`. It is
  separate from `getOversoldAlerts()`, which with the compensation in place no longer sees these sales. That is
  correct, because they are intended rather than accidental.

### Online orders
The `pendingOversell` confirmation in `online-orders-modal.tsx` is the owner saying yes to an oversell. When the setting is
on, `use-fulfill-online-order-mutation.ts` passes `recordShortfallAsOwed: true` as well. When it is off, today's
behaviour stays (an accidental deficit, A-265 territory). The owner decides this (Q3).

## Cost, profit and COGS

- **At sale:** `sale_items.cost_price` = the batch average if any stock is left, otherwise the last purchase cost, otherwise
  0. The backorder row carries the same unit cost, so stock value stays consistent.
- **At receipt:** the settlement row carries the **actual** receipt cost. Shelf value comes out as
  `(R − settle) × actual`, which is correct. `getStockMoM()` counts the `+N` as value added and the `−N` as value
  removed. Gross added and removed figures each grow by N while the net stays correct. That is acceptable, and the card's
  tooltip should say so.
- **Correcting sale-time COGS** (estimate versus actual) is **not done in v1**. Rewriting `sale_items.cost_price`
  afterwards would change reports for periods already closed, and it would mean pushing `update()`s to historical sale
  rows, a path no code uses today. The receive panel shows the variance instead: "Sold at an estimated cost of X, received
  at Y." For construction materials the gap is usually small. If the owner wants true COGS (Q2), the backorder row's
  `reference_id = saleId` already holds the link: settle FIFO by sale, then reweight the line as
  `((Q−N)·old + N·actual)/Q`. That is about 1.5 days of work plus a server check that `sale_items` updates are accepted on push.

## Interaction with A-265 and cycle counts

- **A-265 is a sibling, not a prerequisite.** Both write a `+N` adjustment against the oversold batch at sale time. Build
  one helper, `writeShortfallCompensation(batchId, n, referenceType, ...)`, inside `inventory-sale-stock.ts`, and let
  `reference_type` say which case it is: `"oversell"` for an accident (A-265 Stage 2, still waiting on that spec's product
  decision) and `"backorder"` for an intended sale. This feature can ship before the A-265 decision. With the setting off,
  nothing changes for accidental oversells.
- Every reader that A-265's "Readers, one by one" table names needs the same treatment for both new reference types.
  Let `groupAdjustmentMovements()` (`adjustment-derivations.ts`) skip them the way it skips imports, so a count derivation
  never reads them as a count. Keep `BACKORDER_*_REASON` strings away from `STOCK_LOSS_REASON_LABELS`, so `getStockLosses()`
  never matches them, and pin that with a test. COGS reads `sale_items`, so it does not change.
- **The cycle-count trap.** Say the goods are on the yard but the PO has not been received (likely Cynthia's case: delivery
  first, paperwork later), and someone counts the item: the count posts `+5`, and the later receipt posts `+20 −5`. The
  delivered stock is then counted twice. The count screen must warn about this. Extend `use-count-freshness.ts` /
  `count-freshness-warning.tsx` with outstanding backorders: "5 units were sold before stock was received. Receive the
  purchase order before counting this item, or the delivery will be counted twice." Warn only, don't block, because some
  stores really will count first (Q4).
- Returns: `returns.ts` writes a `+Q` `return` movement. If a sale with outstanding backorder is returned before the
  delivery, the owed units were never handed over in the backorder case. The return must also write
  `−min(outstanding, Q)` as `backorder_settlement` on the same batch (`reference_id` = return id). Otherwise the next
  receipt settles units nobody is still owed. Q5 decides whether a "sold before received" customer took the goods.

## Sync and schema

| Layer | Change |
| --- | --- |
| `client/lib/db/schema.ts` `stores` | `allow_sale_without_stock INTEGER DEFAULT 0` |
| `client/lib/db/schema-migrations.ts` | same, in the `stores` add-column list |
| `client/lib/context/store-types.ts` | `allow_sale_without_stock?: number` |
| `laravel-server/database/migrations/2026_10_2x_add_allow_sale_without_stock_to_stores.php` | `boolean()->default(false)`, guarded by `hasColumn` like `2026_09_23_000007` |
| `App\Models\Store` | `$fillable` + `'boolean'` cast |
| `stock_movements` | **none.** `movement_type` stays `adjustment`; `reference_type` is free text on both sides (A-265 spec §"The identity") |

Push and pull: `stores` and `stock_movements` already sync. Run `npm run test:schema` after the column is added.
Server: `StockMovementController::adjustments()`/`index()` label by sign, so the web dashboard shows the rows as
increase/decrease with no code change. Check whether the `web/` adjustments list shows `reference_type`, and give it the
two labels if it does.

## Backward compatibility (§11)

- **An old bundle on a store with the setting on** does not know the column. It keeps blocking at zero, which is safe.
- **An old bundle receiving a PO** does not settle, so the shelf there reads R instead of R − N until a newer device writes
  a settlement. Nothing does that automatically, and nothing should: two writers settling the same backorder over-settle.
  Mitigation: the settings switch shows "Make sure every till is updated before turning this on", and the server refuses
  the column flip from a bundle older than the version that adds it, using the `X-App-Version` check
  `LegacyStockQuantitiesGrant` uses (`version_compare`, `INTRODUCED_IN`). (Not checked: whether the admin panel shows
  each device's bundle version. If it does not, that is a small add.) The receive panel on a new bundle also shows any outstanding backorders it
  finds, so an unsettled receipt from an old till is visible on the next receipt, and the alert list shows it.
- **Readers in old bundles** see two extra `adjustment` rows with a fallback source label, and their sums are correct.
  `getOversoldAlerts()` in pre-2026-10-14 bundles matches on the sale row's "oversold" reason, which is kept, so those
  bundles list a backorder as oversold. Retire that once every live device runs a bundle with the deficit query, the same
  condition as the A-265 spec.
- **Shim to retire:** the server-side version gate on the column. Remove it when no device reports a bundle below
  `INTRODUCED_IN`.

## Permissions and visibility

- Stock-hidden roles (`view_stock_quantities` off) get the quantity-free toast wording. The tile shows "Out of stock" and
  stays clickable. The "Owed to customers" alert and the receive panel are on screens that already show quantities to the
  roles allowed there (`client/AGENTS.md`, "`view_stock_quantities`"), so they follow the same `useStockVisibility()` rule.
  `describeStock()` needs no change.
- The assistant's `product_stock` tool (`inventory-tools.ts`) may say "N owed" only when `canSeeQuantities` is true.
- The setting itself is changed only by owner/admin through the existing register-config card.

## Tests

All on real sql.js through `insert()`, in the style of `client/__tests__/batch-quantity-recompute.test.ts`:
1. Cart: setting off still blocks both paths (regression). Setting on lets the line through with the right toast per
   `canSeeQuantities`.
2. Sale with stock 3, qty 5, setting on: one `sale −5` and one `backorder +2` row. Batch reads 0. Outstanding = 2.
   `getBatchDeficits()` is empty.
3. Product with no batch: a `SALE-` batch is created, carries `−5/+5`, reads 0, outstanding = 5.
4. Multi-batch FEFO: the compensation lands only on the batch that went short, for the right N.
5. Receive 20 with outstanding 5: settlement −5 on the receipt batch. Product reads 15, outstanding 0. Partial receipt of 3:
   settles 3, outstanding 2. Two lines for the same product in one PO do not over-settle.
6. Idempotency: re-running `receivePurchaseOrder()` with the same `alreadyReceived` does not duplicate the settlement.
7. Immediate Purchase settles the same way.
8. Cost: zero-stock line cost = last purchase cost and not 0 (also fixes finding 4). Shelf value after receipt is `(R−N)×actual`.
9. Return before delivery reduces outstanding. Return after settlement does not.
10. `getStockLosses()` excludes both reasons. `groupAdjustmentMovements()` skips both reference types.
11. **Sync / Stage-0 parity:** push `sale −5, backorder +2` in one chunk to the server and the server batch reads 0. Laravel
    feature test against `applyStockBatchDeltas()`, with the chunk-split case asserting the bounded A-217 shape.
12. Pull: a second device pulling all three rows recomputes the same product total and the same outstanding figure.
13. Server: migration adds the column. A `Store` update from an old `X-App-Version` cannot set it.
14. `npm run test:schema` green.
Smoke test in a logged-in browser (root §9): toggle on, sell at zero as a stock-hidden role, receive a PO, check the panel text.

## Implementation order (rough effort)

1. Log finding 4 in `docs/KNOWN_BUGS.md`. Fix the cost fallback in `getProductsWithStock()` with a test. **0.5 d**, ships alone.
2. Column, both migrations, `Store` model, version gate, settings switch, feature gate, schema test. **1 d**
3. `writeShortfallCompensation()`, the `recordShortfallAsOwed` param, constants in `stock-adjustments.ts`, tests 2–4. **1 d**
4. `backorders.ts` query and settlement in both receive functions, `receiptSettlementMovementId`, tests 5–7. **1.5 d**
5. Cart unblock, toast wording, tile state, test 1. **0.5 d**
6. Readers: ledger labels, `adjustment-derivations.ts` skip, losses test, "Owed to customers" alert, receive panel and
   immediate-confirm text, count warning, assistant. **1.5 d**
7. Returns handling, test 9. **0.5 d**
8. Server parity tests (11, 13), browser smoke test, docs: `SYSTEM_FEATURES_DOCUMENTATION.md`, `client/AGENTS.md` (stock
   section and register toggles), `laravel-server/AGENTS.md` (column, version gate), and a cross-reference line in the
   A-265 spec. **1 d**

About **7.5 days** in total. Steps 1 and 2 can ship ahead of the rest. Step 3 must not ship without step 4, or backorders pile up with nothing settling them.

## Risks

- **Two tills receiving the same product offline at the same time** both settle the full outstanding amount, and the shelf
  reads low by the overlap. Each sale's balance floors at 0, so the excess pays no other sale; nothing reports it, and the
  next count corrects the shelf. Receipts normally happen on one device.
- **Chunk split** between the sale and its compensation in a backlogged push gives the bounded A-217 shape until Stage 2,
  exactly as the A-265 spec states.
- **A mis-keyed sale** (rang up 6, handed over 4) becomes 2 owed units and takes 2 off the next delivery's shelf figure.
  The next count puts them back with a visible `+2`.

## Owner decisions (2026-10-26)

1. **Scope:** per store only. No role permission in v1.
2. **COGS:** re-cost the past sale when the goods arrive (the 1.5 d option). Closed-period reports will change; say so on the receive screen.
3. **Online-order oversell:** counts as owed when the setting is on.
4. **Count before receipt:** warn, do not block.
5. **Why it is wanted:** the goods are usually physically on the yard and the purchase order has not been entered yet. The customer takes the goods on the day, so this is unrecorded stock, not a true backorder. No pick-up list is needed.
6. **Cap:** none, but the owed units keep showing as a warning (dashboard overview and the other stock alert surfaces).
7. **Plan gating:** none.

Step 1 (the zero-cost fix) shipped as A-335 in `docs/FIXED_BUGS.md`.

## Build notes (2026-10-26)

Where the code departs from the design above, and why:

- **Step 6, ledger vs. derivation.** §Receiving says both rows appear in the Stock Adjustments ledger, and §"Interaction with A-265" says `groupAdjustmentMovements()` must skip them. That function *is* the Stock Adjustments ledger (`stock-adjustments-ledger.tsx`), so both cannot hold. The build follows the import precedent: the rows are skipped from the adjustments (count) ledger and shown in the Stock Movements list with their own labels.
- **Step 6, receive notice placement.** One `OwedSettlementNotice` above the lines covers both the phone card layout and the tablet ledger table, instead of a line under each quantity input. Same wording, per product.
- **Settlement names its sale (review fix).** §Receiving writes one settlement per receipt line with `reference_id` = PO id, and outstanding as a sum. A sum lets an over-settlement absorb units owed later. The first build replaced the sum with a timestamp-ordered replay, and review showed that is clock-dependent: a till whose clock is behind settles a sale and stamps the settlement before it, the replay then pays nothing and the next delivery settles and re-costs the same units again. The build now writes one settlement row per sale paid off, `reference_id` = the sale id, PO id in `reason` behind the note separator, id `receiptSettlementMovementId(poItemId, alreadyReceived, saleId)`. Outstanding is per sale, matched by id. Order only chooses which unsettled sale is paid first. A settlement naming no local sale pays nothing; no PO-named row exists outside this branch's own earlier commits, so there is no compatibility reader. No over-settled alert.
- **Re-cost on pull (third review fix).** Re-costing only on the settling device did not converge: the server refuses a `sale_items` UPDATE at a stale `_version` and the pull reverts it, and a line not yet local was skipped. Every pull now re-costs the sales its settlement rows and sale lines name, from the local ledger; a no-op writes nothing.
- **Pull-time re-cost hardening (fourth review fix).** The hook went through `update()` inside the pull's page transaction, so an on-till inspection session (read-only `update()`), a store switch mid-pull (ownership check against the ambient store) or any error rolled the whole page back. It now skips during inspection, writes against the run's pinned store, and logs and swallows its own errors. For a re-cost queued on a stale `_version` (the till pulled the settlement before the server's re-costed line), the options were: defer until the line is current (no local way to know), skip lines with pending queue rows (does not help, the stale row is the pending one), or let the conflict happen silently. The build takes the last. The existing drop-and-rewind already re-offers the server row and the hook re-derives on it, so it converges with no new state. The only change is that a `sale_items` version conflict is not toasted, which is precise because the re-cost is the only client code that UPDATEs `sale_items`.
- **Re-cost once per round (fifth review fix).** The hook ran per page, so a sale line could be re-derived and queued from a ledger whose settlement rows were still paging, and pushed if the round was then interrupted. A Force Full Resync could also re-cost from an incomplete ledger (A-344). It now runs once after the round's last page; an interrupted round re-costs nothing.
- **Zero-cost receipt (review fix).** A receipt line costed at 0 or blank settles the units but does not re-cost the sales, otherwise it would revive A-335.
- **Owner decision 2 (re-cost) placement.** Re-costing runs inside `settleBackordersOnReceipt()`, after each settlement row, and writes an absolute cost derived from the ledger, `estimate + Σ settled_i × (actual_i − estimate) / line units` (settled units capped at what the sale owed, zero-cost receipts contributing nothing, rounded to the cent). The first build added a shift to the current cost, and review showed that compounds when a pulled re-cost arrives without its settlement and the sale is settled again.
- **Step 7, returns: no write.** §"Interaction with A-265" has a return write `−min(outstanding, Q)` as a settlement. That is right only when the owed units were never handed over. Owner decision 5 says the customer takes the goods on the day, so the owed units stand for stock that was on the yard. The yard holds 20 unrecorded, 5 are sold (owed 5, shelf 0), 2 come back (shelf 2), then the receipt of 20 settles 5 and the shelf reads 17, which is right. Cutting the owed count on the return would read 19. So `returns.ts` is unchanged, and `client/__tests__/sell-at-zero-stock-receipt.test.ts` pins the arithmetic. Test 9 above is superseded.
- **Online orders (step 3).** The online-order path costs its own lines and was not covered by A-335; it now uses `getLastPurchaseCost()`. Logged as a follow-up on A-335 in `docs/FIXED_BUGS.md`.

