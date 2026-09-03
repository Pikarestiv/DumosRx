# Procurement

Routes (all under `app/(dashboard)/procurement/`):

- `page.tsx` → `/procurement` — Purchase Orders tab (default)
- `vendors/page.tsx` → `/procurement/vendors` — Vendors & Suppliers tab
- `requests/page.tsx` → `/procurement/requests` — Requested Products tab
- `new/page.tsx` → `/procurement/new` — Create Purchase Order (full-page form)
- `edit/page.tsx` → `/procurement/edit?id=<poId>` — Edit an existing (draft) PO

All four dashboard pages are near-identical shells: each wraps
`<ProcurementManagement initialTab="orders" | "suppliers" | "requests" />`
(`components/procurement/index.tsx`) in `<RequireRole>` and
`<LockedModuleOverlay featureKey="procurement">`. The three tabs are one
client component with tab state, not three separate pages worth of logic —
`ProcurementManagement` renders `ProcurementTabNav` plus whichever of
`PurchaseOrderTable` / vendor directory / `RequestedProductsTab` is active.

## Access control

`components/auth/require-role.tsx` gates the route: `allowed = isAdmin ||
canManageStockBatch`. `checkCanManageStockBatch` (`lib/context/auth-
context.tsx`) allow-lists roles `admin`, `manager`, `specialist`,
`store_owner` (normalized, case/punctuation-insensitive). The Store Owner PIN
account used for this walkthrough (`Pika Restiv`, role `store_owner`) is
covered by both `checkIsAdmin` (matches `"storeowner"`) and
`checkCanManageStockBatch` directly. Unlike the sidebar (which simply hides
the link), this is server-independent, client-side enforcement in a
local-first app with no backend session check — the comment on `RequireRole`
notes it's "the only enforcement point" for a typed URL, stale bookmark, or
quick-action href reaching `/procurement` directly. Confirmed live: an
authenticated-but-disallowed session would be redirected to `/dashboard` with
a toast; the Store Owner account loads the page normally.

## Vendors & Suppliers tab

`components/procurement/procurement-management.tsx` (suppliers view) backed
by `getSuppliers()` (`lib/db/procurement.ts`). Each row aggregates:

- `total_orders` / `total_value` — count and sum of **all** of that
  supplier's non-deleted purchase orders, regardless of payment status.
- `total_debt` — sum of `total_amount - amount_paid` across **unpaid**
  orders only.
- `last_order_date` — max `order_date` across all orders.

(This aggregation was previously hardcoded to 0 client-side; see the
regression tests in `__tests__/procurement.test.ts`, `describe("getSuppliers")`.)

"Add Supplier" opens a dialog (name, contact person, email, phone, address,
tax ID, payment terms, active toggle) → `createSupplier()`. The Supplier Name
field is a combobox pre-seeded with a static list of common Nigerian
pharma distributors (Emzor, GSK, Cipla, etc.) for quick-fill, but accepts any
free-text name — confirmed live by creating "Smoke Test Pharma Ltd", a name
not in that suggestion list. Selecting a supplier row opens a detail panel
(Email/Phone/Total Orders/Total Value/Last Order) with **Edit Details** →
`updateSupplier()` and **New Order** → `/procurement/new` with that supplier
pre-selected.

## Purchase Orders tab

`purchase-order-table.tsx`, backed by `getPurchaseOrders(viewerId)`
(`lib/db/procurement.ts`). `viewerId` is only passed when
`!checkCanViewAllActivity(user.role)` — line staff see only their own orders,
managers/owners see every order in the store. Status filter pills: **All
Orders / Drafts / Sent / Received / Missing Expiry** (client-side filter over
the same fetched list — `poTab` is deliberately excluded from the React Query
key since it doesn't change what's fetched, only what's displayed).
`has_missing_expiry` is computed in SQL as: does this PO have any linked
`stock_movements` → `stock_batches` row (via `reference_type = 'purchase_order'`)
whose `expiry_date IS NULL`.

### Creating a full order (`/procurement/new`)

Two **Order Types**, both ending in the same line-item builder UI
(`po-desktop-create-view.tsx` / `po-mobile-create-view.tsx`):

- **Purchase Order** (standard) — creates the PO in `pending`/draft status
  with no stock effect yet; stock is only added later, when it's received.
  `createPurchaseOrder()` (`lib/db/procurement.ts`).
- **Immediate Purchase** — order and receipt happen atomically in one
  transaction (self/walk-in purchases where goods arrive on the spot, no
  separate "receive" step needed). `createAndReceivePurchaseOrder()`
  (`lib/db/procurement-receiving.ts`) — see "Receiving" below; it reuses the
  exact same batch/cost/expiry math as the standard receive path, just
  without a preceding `pending` state.

Selecting a vendor accepts "Self / Walk-in Purchase" (`supplier_id: null`,
displayed downstream as `vendor_name: "Self / Walk-in Purchase"`) or any real
supplier, including one just created inline via "+ Create Supplier" in the
combobox. Line items are added by product search (existing catalog item) or
"Create '<name>' as new product", which opens the Quick Add Product dialog
pre-filled with the typed name — this is the flow the pre-existing
`e2e/procurement.spec.ts` test exercises (and stops at, without submitting).

Each line item stores `bulk_quantity` (in the product's bulk unit, e.g.
"Carton"), `units_per_bulk`, and `unit_cost` (per bulk unit); `subtotal` and
the order's `total_amount` are **always recomputed** server-side from
`bulk_quantity * unit_cost` at save time — never trusted from a stale
client-side `subtotal` field left over from an earlier quantity/cost edit in
the UI (`createPurchaseOrder()`/`updatePurchaseOrder()`, both covered by
regression tests for this exact "stale subtotal" class of bug).

Walked live end-to-end on "Pikarestiv Stores 2": created supplier "Smoke Test
Pharma Ltd" → Purchase Order → PARACETAMOL INJECTION × 3 Cartons @ ₦6,000 →
Save as Draft → `PO-83FF168D`, ₦18,000 total. **Mark as Sent** moves
`status: 'pending' → 'sent'` (`updatePurchaseOrderStatus`); no stock effect.

### Receiving (`ReceivePOPanel` / "Receive Goods")

`receivePurchaseOrder(id, receivedItems?)` (`lib/db/procurement-receiving.ts`)
is the function that turns a "Sent" PO into real stock. Per line item, inside
one `transaction()`:

1. **Received quantity** — defaults to the PO line's ordered `bulk_quantity`,
   but the "Receive Goods" form lets the user override it per line
   (`ReceivedItem.quantity`) — this is how a **partial receive** (less
   arrived than ordered) is supported. The units-per-bulk conversion always
   uses the *product's current* `product_units_per_bulk`, not the snapshot
   stored on the PO line item, in case packaging was corrected since the
   order was placed.
2. **`insert("stock_batches", ...)`** — a brand-new batch row with
   `quantity: bulk_quantity_received * units_per_bulk`, `cost_price` (either
   the ordered `unit_cost` or a per-receive override), `batch_number` (a
   typed lot number, or the PO's own ID as a fallback), and `expiry_date`.
   Because a product's total stock is always `SUM(quantity) FROM
   stock_batches WHERE ... is_active = 1` (see `lib/db/queries/products.ts`,
   `getActiveProductsForPO()`, etc.) — never a single mutable counter — this
   insert is *inherently* additive and can't double-apply or clobber
   existing stock the way an `UPDATE ... SET quantity = quantity + ?` could.
   This is the opposite failure mode from the stock-*deduction* bug found
   elsewhere in this codebase (POS checkout / online-order fulfillment): here
   there is no shared mutable running total to get out of sync.
3. **`insert("stock_movements", ...)`** — `movement_type: "purchase"`,
   `reference_type: "purchase_order"`, `reference_id: <poId>`. Its
   `total_cost` is recomputed from the *actually received* quantity, not the
   PO line's full ordered `subtotal` — those diverge on a partial receive.
4. If a `selling_price` override was entered, `update("products", ...)`
   applies it immediately (lets a discovered price change be applied without
   a separate trip to Edit Product).
5. Once every line item is processed, `updatePurchaseOrderStatus(id,
   "received")` — the whole PO moves to `received` in one step; **there is
   no partial/"received"-with-shortfall status** in this app (only
   `pending`/`sent`/`received`). A short-received line is still fully valid
   and fully reflected in `stock_batches`/`stock_movements` — the PO's own
   status just doesn't distinguish "received in full" from "received, some
   items short."

**Verified live** (partial-receive path, standard PO — the one path with
zero pre-existing automated coverage; see Coverage gap below): PARACETAMOL
INJECTION stock was 0 before. Ordered 3 Cartons on `PO-83FF168D`, marked
Sent, then received only **2** of the 3 ordered (batch `SMOKE-TEST-01`, expiry
31/12/2027). Catalog afterward showed **2 Units** in stock (not 3) and Avg
Cost ₦6,000 — confirms the partial-quantity override is honored correctly and
the stock addition is proportional to what was actually received, not what
was ordered. PO status still shows "Received" (all 3 stages checked) despite
the shortfall, per point 5 above — **investigated as a possible bug, not
one**: this matches the app's only-two-post-draft-statuses design, not a
regression.

`createAndReceivePurchaseOrder()` (Immediate Purchase) is a structurally
separate function that duplicates this same insert/insert/update sequence
rather than calling `receivePurchaseOrder()` internally — by design, per its
own doc comment, since an Immediate order has no PO row to look up yet at the
point stock needs to be created (order and receipt are the same atomic
step). Both paths share the packaging-conversion and cost-fallback *math*
(`immediateBaseUnitCost()`/`computeImmediateLineTotal()` in the Immediate
path; equivalent inline math in `receivePurchaseOrder()`), just not the
insert calls themselves.

## Requested Products tab

`requested-products-tab.tsx`, backed by `requested_products`
(`lib/db/requested-products-queries.ts`). This is the landing page for
product requests logged from **POS's "Request Item" button**
(`components/pos/request-item-dialog.tsx`, labelled "Log Missing Product" —
the dialog documented in Task 3's POS walkthrough) via
`logRequestedProduct(product_name, customer?, quantity, note?)`.

Confirmed the link live: opened POS → **Request Item** → typed "Smoke Test
Requested Product" (a name not in the catalog) → Save Request. It immediately
appeared on `/procurement/requests` as **Smoke Test Requested Product**,
Requested By: "Anonymous" (no customer selected), Qty: 1, 1 request, status
**Pending**.

`logRequestedProduct()` de-dupes by case-insensitive `product_name` +
`status = 'pending'`: a second request for the same still-pending product
name increments `request_count` and adds to `quantity` on the existing row
(appending to `requested_by_customer`/`notes`) instead of creating a
duplicate row — this is the same "quantity accumulation on repeat requests"
shape as the stock-deduction/addition bugs elsewhere in the app, but
implemented as a single-row `update()`, not a batch-loop, and out of this
task's stock_batches-specific scope.

The status filter (**All / Pending / Ordered**) reflects `status: 'pending' |
'ordered'`. **Mark as Ordered** (`markRequestedProductAsOrdered`) only flips
this status flag — it does **not** create a purchase order, add a line item
to an existing draft, or link back to any `purchase_orders`/
`purchase_order_items` row. It's a manual "I've handled this, following up
outside the app" acknowledgement, not an automated hand-off into the PO
flow. **Delete** (`deleteRequestedProduct`) soft-deletes the row.

## Test coverage

- `__tests__/procurement.test.ts` — `getSuppliers()` aggregation,
  `getPurchaseOrders()` (`has_missing_expiry`, viewer scoping, vendor-name
  fallback), `createPurchaseOrder()`/`updatePurchaseOrder()` (stale-subtotal
  regression), against a real in-memory sql.js schema.
- `__tests__/procurement-immediate.test.ts` — `createAndReceivePurchaseOrder()`
  (the Immediate Purchase path): batch/cost/selling-price behavior, cost
  override scaling.
- `__tests__/procurement-products.test.ts` — `getActiveProductsForPO()`
  cost-averaging/stock-quantity math.
- `e2e/procurement.spec.ts` — pre-existing test logs in, navigates to
  Procurement, opens Create Order, and exercises the Quick Add Product
  trigger — **stops there**, never submits/sends/receives an order.

**Gap found (Step 3):** `receivePurchaseOrder()` — the Standard PO path
actually used by "Create Order → Purchase Order → ... → Receive Goods" (as
opposed to Immediate Purchase, which is well-covered) — had **zero**
automated coverage, unit or e2e, before this task. `grep -rln
"purchase_order\|PurchaseOrder" __tests__/` never matched a file exercising
it, and `grep -n "test(" e2e/procurement.spec.ts` shows exactly one test,
which never reaches "Send" or "Receive". **PO submission and receiving had
no e2e coverage.** Closed in Step 4 — see below.

**Bug found and fixed (Step 5):** the pre-existing `e2e/procurement.spec.ts`
test was itself silently broken, independent of anything above. Commit
`113a368c` ("add POItemBuilder search-to-add-row component for PO item
entry") replaced the old one-item-at-a-time `POAddItemForm` — the section
labelled "Add Items to Order" with a separate combobox
(placeholder `"e.g. Amoxicillin 500mg"`) and explicit "Add" button — with
`components/procurement/po-item-builder.tsx`: a single search box
(placeholder `"Search item by name, SKU or barcode"`) that adds a row the
moment a product is picked, no separate "Add" click. The old test's
selectors for both of those (the "Add Items to Order" text and the
`e.g. Amoxicillin 500mg` input/"Add" button) no longer matched anything, so
`npx playwright test e2e/procurement.spec.ts` was failing outright —
confirmed by running it as-is before making any changes here (`expect...
toBeVisible failed ... locator('text="Add Items to Order"')`). Fixed by
updating the test's selectors to the current UI (see the first test in the
file); no application code changed for this fix, only the stale test.

## Test coverage — extended (Step 4)

Added a second `e2e/procurement.spec.ts` test, "should create a standard
purchase order, send it, receive it, and increase product stock", that
exercises the exact path the first test stops short of:

1. Switches Order Type to "Purchase Order" (Standard) — the default is
   Immediate, which already has unit coverage.
2. Adds a brand-new product as a line item (the fixture DB
   `e2e/.auth/test-db.bin` starts with an empty catalog, so there's no
   pre-existing product to search for — uses the same Quick Add flow as
   the first test) and sets its ordered quantity to 5.
3. Saves as Draft, clicks **Mark as Sent**, then **Receive Goods** →
   **Confirm & Receive** (confirming the "Missing Expiry Date" warning,
   since no expiry was entered).
4. Navigates to `/inventory/catalog`, searches for the product, and
   asserts its stock now reads "5 units" — i.e. `receivePurchaseOrder()`
   actually inserted a `stock_batches` row and the product's derived total
   stock reflects it.

Both tests pass: `npx playwright test --project=chromium
e2e/procurement.spec.ts --no-deps` (the brief's literal
`npx playwright test e2e/procurement.spec.ts` also invokes the known,
pre-existing, unrelated `e2e/global.setup.ts` breakage — not this task's to
fix).
