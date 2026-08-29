# Procurement Revamp — Immediate vs. Standard Purchase Orders

**Status:** Approved for planning
**Author:** Claude (with pikarestiv), from a requirements session referencing Cynthia's Moniebook instance
**References:** `refs/client-requirement-meeting-with-ada-27082026/converted-pngs/procurement/` (8 Moniebook screenshots)

## 1. Problem

The current Procurement flow (`/procurement/new`) makes the user add items one at a time: search/pick a product in `ProductCombobox`, fill quantity + cost in `POAddItemForm`, click Add, repeat. Items collect into a separate cart (`po-summary-pane.tsx`). Cynthia (client) reports this repetition is stressful, specifically the per-product step.

A second, distinct problem: `ProductCombobox` merges three different kinds of suggestions into one sorted dropdown — real catalog products (`source: "local"`), a static reference list of common pharmacy/retail names that are **not** in the catalog (`source: "global"`, from `FORM_SUGGESTIONS`), and a "create new" fallback. They're differentiated only by a small badge. The client wants these structurally separated: a catalog search must never show non-catalog name suggestions in the same list.

## 2. Goals

1. Replace one-at-a-time item entry with a single editable table (ledger), matching the density and directness of Moniebook's approach, for building up a PO's line items.
2. Introduce two purchase-order types:
   - **Standard** (existing behavior): create a PO against a vendor now, receive its stock later via the existing receive panel.
   - **Immediate**: build the item table and submit once — order and receipt happen atomically, stock batches are created immediately, no intermediate pending state.
3. Fix the search dropdown so catalog matches and "not yet in catalog" name suggestions never appear in the same list.
4. Preserve architecture and UX that already works well (see §6 — Explicitly Kept).
5. Keep the mobile experience a first-class, separate-subtree layout, not a squeezed table.

## 3. Non-Goals (this pass)

- No invoice/receipt-attachment upload.
- No "vendor bill" recording toggle.
- No branch-scoped purchase orders — DumosRx has no multi-branch-per-store model; each store is its own local-first database. This is not being added here.
- No change to how COGS/reporting reads batch cost.

## 4. Schema Changes

`purchase_orders` gains one column:

```sql
ALTER TABLE purchase_orders ADD COLUMN type TEXT DEFAULT 'standard';
-- allowed values: 'standard' | 'immediate'
```

- `type` is set once at creation and never changes afterward.
- `status` continues to mean lifecycle position (`pending` | `received`) and is orthogonal to `type`. A Standard PO's status transitions over its life; an Immediate PO is created with `status: 'received'` directly, in the same transaction that creates its `stock_batches` rows — it never has a visible `pending` moment.
- Why a separate column instead of inferring type from status/timing: once received, a Standard PO and an Immediate PO both have `status = 'received'` and are otherwise indistinguishable. The procurement list, PO detail view (which layout/actions to show), and future reporting ("immediate vs. planned purchases this month") all need to tell them apart after the fact.
- No `store_id`/branch column is added — confirmed out of scope per §3.

## 5. New/Changed Functions (`lib/db/procurement.ts`)

- `createPurchaseOrder(...)` — unchanged, used for Standard POs. Now explicitly sets `type: 'standard'` (matching the column default; passed explicitly for clarity, not relying on the default).
- **New:** `createAndReceivePurchaseOrder(supplierId, notes, items, paymentStatus, amountPaid, dueDate)` — used for Immediate Purchases. Runs in one `transaction()`:
  1. Insert the `purchase_orders` row with `type: 'immediate'`, `status: 'received'`, `received_at: now`.
  2. Insert `purchase_order_items` rows (same shape as today).
  3. For each item, insert the `stock_batches` row and `stock_movements` row — reusing the exact logic currently in `receivePurchaseOrder` (batch number from lot input or PO id prefix, expiry from input or null, `cost_price` from the row's cost override or falling back to unit cost — same as today, see §6).
  4. If a row's selling price was edited, `update("products", ..., { selling_price })` — same as today.
  5. `logAction("RECEIVE_PO", ...)`.
- `receivePurchaseOrder(...)` — unchanged, still used only for receiving a Standard PO that's currently `pending`.
- `getPurchaseOrders`/`getPurchaseOrderById` — add `type` to the selected/returned columns; no behavior change otherwise.

## 6. Explicitly Kept (do not change)

These were verified against the current codebase during design and confirmed correct; the revamp must not regress them:

- **Expiry date: optional, with a blocking confirm-warning if left blank.** Existing logic in `receive-po-panel.tsx`'s `handleConfirmClick`/`AlertDialog` ("Missing Expiry Date... Proceed Anyway"). This applies to Immediate Purchase's own confirm step too — it is **not** replaced with Moniebook's opt-in "Add Batch No & Expiry Date" checkbox. Batch/expiry columns are always visible in the table; the warning is what makes them effectively-required-but-not-blocking.
- **Lot/Batch number: optional, no warning.** Unchanged.
- **Cost price is per-batch, not a master field.** `products.cost_price` is dead (no code writes it); "Avg Cost" in the catalog is `AVG(stock_batches.cost_price)` computed at query time over active, in-stock batches. The new table's "New Cost Price" input, for both PO types, seeds only the new `stock_batches` row it creates — it must never write to `products`. This is already the correct architecture (FEFO/batch costing) and is more correct than Moniebook's single mutable product-level cost field; do not "improve" it toward Moniebook's model.
- **Inline "create vendor" convenience** (the `+` next to the vendor select opening `AddSupplierDialog`) — unchanged.
- **Sync/versioning discipline** — all new writes go through `insert`/`update`/`transaction` from `lib/db/base-helpers.ts` / `local-database.ts`, never raw SQL, to preserve `_version`/`_synced`/soft-delete semantics.

## 7. New Shared Component: the Item Ledger Table

Replaces `po-add-item-form.tsx` + `po-summary-pane.tsx`'s cart list as the primary way to build a PO's line items, for **both** PO types. Built extending the existing table conventions in `receive-ledger-table.tsx` (div/ARIA-table, inline-editable cells, `EditableNumberCell`).

Rows are added via a search box at the top of the table (see §8), not a separate add-item form. Each row is inline-editable; no per-row "Add" click needed to commit it to the list — it's already in the list.

**Columns for Standard PO** (ordering, not receiving — mirrors today's data, just tabular):

| Item | Qty Ordered | Unit Cost | Subtotal | remove |

**Columns for Immediate Purchase** (order + receive combined):

| Item | Stock (read-only, current) | Qty Received | Current Cost (read-only, computed avg) | New Cost (editable, optional — seeds new batch) | Lot/Batch (optional) | Expiry (optional, warns if blank on confirm) | Total | Review price (row action) | remove |

The "Review price" action opens a small popover/modal per row: shows cost, a sell-price input, and a live-computed margin %, matching Moniebook's pattern — approved for inclusion since it lets cost and sell price be set in the same pass instead of a separate trip to the Product Catalog. It writes to `products.selling_price` only (existing, already-supported write path), never to cost.

## 8. Search / Create-Product Separation

`ProductCombobox`'s live dropdown, used to add a row to the ledger table, is changed to show **only real catalog matches** (`source: "local"` today) plus, only when there is no good match, a single pinned "+ Create new product" row rendered distinctly (solid background, top of list — matching Moniebook's treatment), which opens `AddProductDialog` pre-filled with the typed text.

The static `FORM_SUGGESTIONS` reference list (today's `source: "global"`) is removed from this dropdown entirely. It moves into `AddProductDialog`'s name field as an autocomplete/"did you mean" aid for naming a *new* product — the context where a non-catalog name suggestion actually belongs. This is a relocation, not a deletion of the feature.

Once a product is created via the modal, it's auto-inserted as a new row in the ledger table (replacing today's "auto-select in the add-item form" behavior) with qty defaulted to what was typed/implied, cost/price left for the user to fill in the row.

## 9. Mobile Layout

Reuses the exact pattern already proven in `receive-po-panel.tsx`: a JS media-query hook selects between two full, separately-mounted subtrees — not CSS-only hiding, and not a squeezed/scrolling table.

```tsx
const isTabletUp = useMediaQuery("(min-width: 640px)");
const mode = isTabletUp ? "ledger" : "standard";
```

- `ledger` (≥640px): the table from §7.
- `standard` (<640px): a stacked, one-card-per-row layout carrying the same fields as the corresponding table's columns, vertically arranged — structurally equivalent to today's `ReceiveItemCard`.

The search box that adds rows stays pinned above the list/table in both modes; only the added-row rendering differs. This deliberately does **not** follow the CSS `lg:hidden`-dual-mount pattern used in `po-mobile-create-view.tsx`/`po-mobile-summary-drawer.tsx`, to avoid keeping two live copies of the same editable row state in sync.

## 10. Flows, End to End

**Standard PO (existing, largely unchanged):**
1. `/procurement/new` → pick vendor, notes, payment terms.
2. Build line items in the ledger table (Standard columns), rows added via search/create.
3. Save → `createPurchaseOrder(..., type: 'standard')` → status `pending`.
4. Later, from the PO detail/list, "Receive" opens the existing `ReceivePOPanel` (unchanged) to record batches/expiry/actual cost and mark `received`.

**Immediate Purchase (new):**
1. `/procurement/new` (or a mode toggle/separate entry point — see Open Question below) → pick vendor.
2. Build line items directly in the ledger table (Immediate columns) — qty received, cost, batch/expiry, sell-price review all happen here, in one pass.
3. Confirm → the existing missing-expiry warning dialog fires if applicable → `createAndReceivePurchaseOrder(..., type: 'immediate')` → PO is created already `received`, stock batches exist immediately.
4. No separate "receive" step ever happens for this PO.

## 11. Type Selection UI

A segmented toggle ("Immediate Purchase" / "Purchase Order") at the top of `/procurement/new`, above the vendor select. One route, one page — the toggle only changes which ledger-table column set and submit function get used downstream; it does not duplicate the page.

Once the ledger table has at least one row, the toggle is **disabled** (not hidden — visibly disabled with a tooltip like "Start a new PO to change type"). The two types have different column shapes and different submit semantics (`createPurchaseOrder` vs. `createAndReceivePurchaseOrder`), so switching mid-entry risks silent data loss; disabling is simpler and safer than a warn-and-clear confirm dialog for what should be a rare case.

## 12. File Impact Summary

- `lib/db/schema.ts` — add `type` column + migration.
- `lib/db/procurement.ts` — add `createAndReceivePurchaseOrder`, extend `getPurchaseOrders`/`getPurchaseOrderById` to select `type`.
- `components/procurement/po-add-item-form.tsx`, `po-summary-pane.tsx`, `po-mobile-summary-drawer.tsx` — retired, replaced by the new Item Ledger Table component (desktop + mobile card variants).
- `components/ui/product-combobox.tsx` — drop `global`-source suggestions from results.
- `components/products/add-product-dialog.tsx` — gain the name-suggestion autocomplete (relocated `FORM_SUGGESTIONS` usage).
- `app/(dashboard)/procurement/new/page.tsx`, `edit/page.tsx` — wire up type selection and the new table component.
- `components/procurement/receive-po-panel.tsx`, `receive-ledger-table.tsx` — unchanged, still used for Standard PO receiving only.
