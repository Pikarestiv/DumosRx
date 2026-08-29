# Procurement Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-at-a-time Purchase Order item entry with a single editable ledger table, and introduce a new "Immediate Purchase" PO type that creates and receives stock in one atomic step, alongside the existing "Purchase Order" (Standard) type.

**Architecture:** Add a `type` column to `purchase_orders` (`'standard' | 'immediate'`, set once at creation). Build a new set of item-entry components (search → ledger table on tablet-up, stacked cards on phone) shared by both PO types, differing only in which columns they show. Standard POs keep using `createPurchaseOrder` + the existing receive flow unchanged; Immediate Purchases use a new `createAndReceivePurchaseOrder` that does order + receipt in one transaction, reusing the exact batch/cost/expiry logic already in `receivePurchaseOrder`.

**Tech Stack:** Next.js (App Router), TypeScript, React, sql.js (WASM SQLite, local-first), Tailwind, Vitest (DB-layer tests), Radix-based UI primitives.

**Spec:** `docs/superpowers/specs/2026-08-29-procurement-revamp-design.md`

## Global Constraints

- Expiry date stays optional with a blocking confirm-warning if left blank (never a Moniebook-style opt-in checkbox) — this applies to Immediate Purchase's confirm step too.
- Lot/Batch number stays optional with no warning.
- Cost price is per-batch only. Nothing may ever write to `products.cost_price` (it is dead/legacy). "Current Cost" in any new UI is always the computed average from `stock_batches`, matching `getProductsWithDetails`'s `AVG(cost_price) ... AND quantity > 0` pattern.
- All new/changed writes go through `insert`/`update`/`transaction`/`softDelete` from `lib/db/base-helpers.ts` / `lib/db/core.ts` — never raw SQL outside those helpers — to preserve `_version`/`_synced`/soft-delete sync semantics.
- `type` is set once at PO creation and never changes afterward.
- No branch/store-scoped PO concept is introduced (out of scope per spec §3).
- No invoice/attachment upload, no vendor-bill toggle (out of scope per spec §3).
- Test command: `npm run test` (`vitest run`). DB-layer changes must have Vitest coverage following the exact pattern in `__tests__/procurement.test.ts` (real in-memory `sql.js` DB via `core.__setDatabaseForTesting(db)`, asserting on real returned values, not on whether `query()` was called). There is no existing component-level test convention in this repo (no RTL/component tests found) — new UI components are verified manually as described in each task's Testing step, not with new component-test infrastructure.

---

## File Structure

**New files:**
- `components/procurement/po-review-price-popover.tsx` — per-row sell-price + margin popover, used by both the ledger table and the card list.
- `components/procurement/po-item-ledger-table.tsx` — desktop/tablet dense table, columns depend on PO type.
- `components/procurement/po-item-card-list.tsx` — phone-width stacked-card equivalent of the ledger table.
- `components/procurement/po-item-builder.tsx` — the search box + responsive table/card switch + "create new product" wiring. Replaces `po-add-item-form.tsx` as the thing rendered inside `POOrderFormFields`.
- `__tests__/procurement-immediate.test.ts` — Vitest coverage for `createAndReceivePurchaseOrder`.

**Modified files:**
- `lib/db/schema.ts` — add `type` column to the `purchase_orders` `CREATE TABLE` string.
- `lib/db/core.ts` — add `type` to the `purchase_orders` entry in `syncColumns`.
- `lib/db/procurement.ts` — extend `PurchaseOrder`/add `ImmediateLineItemDraft`, add `createAndReceivePurchaseOrder`, set `type: "standard"` in `createPurchaseOrder`.
- `lib/db/queries/procurement.ts` — extend `getActiveProductsForPO`/`POProduct` with `stock_quantity` and a real averaged `cost_price`.
- `components/ui/product-combobox.tsx` — add `showGlobalSuggestions` prop (default `true`, preserves current behavior everywhere except the new PO item search).
- `components/procurement/po-order-form-fields.tsx` — add the type toggle, swap `POAddItemForm` for `POItemBuilder`.
- `components/procurement/po-summary-pane.tsx`, `po-mobile-summary-drawer.tsx` — drop the now-redundant `POLineItemsList` body (items are edited inline in `POItemBuilder`), keep the total/Save footer.
- `app/(dashboard)/procurement/new/page.tsx` — add `poType` state, route submit to the correct DB function, pass `poType` down.
- `app/(dashboard)/procurement/edit/page.tsx` — no type toggle (editing only ever applies to Standard POs, since Immediate POs never sit in an editable pending state), but must keep working against the now poType-aware shared components in `"standard"` mode.

**Removed files:**
- `components/procurement/po-add-item-form.tsx` (Task 9, after nothing references it).

---

### Task 1: `type` column on `purchase_orders` + type-aware `PurchaseOrder`/`createPurchaseOrder`

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/core.ts` (`syncColumns` array, inside `initDatabase()`)
- Modify: `lib/db/procurement.ts:231-249` (`PurchaseOrder` interface), `lib/db/procurement.ts:382-426` (`createPurchaseOrder`)
- Test: `__tests__/procurement.test.ts`

**Interfaces:**
- Produces: `PurchaseOrder.type: string` (values used elsewhere in this plan: `"standard" | "immediate"`); `createPurchaseOrder(...)` unchanged signature, now always persists `type: "standard"`.

- [ ] **Step 1: Add the column to the schema string**

In `lib/db/schema.ts`, find the `purchase_orders` `CREATE TABLE IF NOT EXISTS` block and add `type` right after `status`:

```sql
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  supplier_id TEXT NOT NULL,
  ordered_by TEXT,
  order_date TEXT,
  status TEXT DEFAULT 'pending',
  type TEXT DEFAULT 'standard',
  payment_status TEXT DEFAULT 'unpaid',
  amount_paid REAL DEFAULT 0,
  due_date TEXT,
  total_amount REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT,
  received_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
```

- [ ] **Step 2: Add the runtime migration**

In `lib/db/core.ts`, find the `syncColumns` array inside `initDatabase()` and add `"type TEXT DEFAULT 'standard'"` to the `purchase_orders` entry's `columns` list:

```ts
{
  table: "purchase_orders",
  columns: [
    "_version INTEGER DEFAULT 1",
    "_synced INTEGER DEFAULT 0",
    "_synced_at TEXT",
    "_deleted INTEGER DEFAULT 0",
    "ordered_by TEXT",
    "order_date TEXT",
    "order_number TEXT",
    "supplier_id TEXT",
    "payment_status TEXT DEFAULT 'unpaid'",
    "amount_paid REAL DEFAULT 0",
    "due_date TEXT",
    "store_id TEXT",
    "type TEXT DEFAULT 'standard'",
  ],
},
```

This one array entry covers both the Tauri and Web migration loops, since they both iterate `syncColumns`.

- [ ] **Step 3: Run the schema-sync check**

Run: `npm run test:schema`

If it fails, follow its own output — it checks `schema.ts` stays consistent with the runtime migrations; fix whichever side it flags as out of sync (it should already be in sync after Steps 1-2).

- [ ] **Step 4: Update `PurchaseOrder` and `createPurchaseOrder`**

In `lib/db/procurement.ts`, add `type` to the `PurchaseOrder` interface:

```ts
export interface PurchaseOrder {
  id: string;
  order_number?: string;
  order_date?: string;
  supplier_id: string;
  status: string;
  type: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  received_at?: string;
  vendor_name: string;
  payment_status: string;
  amount_paid: number;
  due_date?: string;
  has_missing_expiry?: boolean;
  items?: PurchaseOrderItem[];
  ordered_by?: string;
  ordered_by_name?: string;
}
```

`getPurchaseOrders`/`getPurchaseOrderById` both `SELECT po.*`, so the new column is already included in every row they return — no SQL change needed there.

In `createPurchaseOrder`, add `type: "standard"` to the inserted row:

```ts
await insert("purchase_orders", {
  id: poId,
  supplier_id: supplierId,
  status: "pending",
  type: "standard",
  payment_status: paymentStatus,
  amount_paid: amountPaid,
  due_date: dueDate,
  total_amount: totalAmount,
  notes,
  created_at: now
});
```

- [ ] **Step 5: Write the failing test first**

In `__tests__/procurement.test.ts`, update the in-memory schema's `purchase_orders` `CREATE TABLE` (inside `beforeAll`) to include the new column, matching Step 1:

```ts
CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY, order_number TEXT, supplier_id TEXT, ordered_by TEXT,
  order_date TEXT, status TEXT DEFAULT 'pending', type TEXT DEFAULT 'standard',
  payment_status TEXT DEFAULT 'unpaid',
  amount_paid REAL DEFAULT 0, due_date TEXT, total_amount REAL DEFAULT 0, notes TEXT,
  created_at TEXT, received_at TEXT, _deleted INTEGER DEFAULT 0
);
```

Then add this test inside a new `describe("createPurchaseOrder", ...)` block (import `createPurchaseOrder` the same way the file already imports `getSuppliers`/`getPurchaseOrders`/`getPurchaseOrderItemsForDetail` in the `beforeAll`):

```ts
describe("createPurchaseOrder", () => {
  it("always persists type as 'standard'", async () => {
    db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

    const poId = await createPurchaseOrder(
      "sup1",
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
    );

    const rows = db.exec(`SELECT type FROM purchase_orders WHERE id = '${poId}'`);
    expect(rows[0].values[0][0]).toBe("standard");
  });
});
```

Also add `createPurchaseOrder` to the `beforeAll` import block alongside the other imported functions:

```ts
let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
// ...inside beforeAll:
createPurchaseOrder = procurement.createPurchaseOrder;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- procurement.test.ts`
Expected: PASS (this is a plain add-a-column change so the test should pass on first run once Steps 1-4 are done; if it fails, the failure means Step 4's `insert(...)` call is missing `type` or the test schema in Step 5 is missing the column).

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/core.ts lib/db/procurement.ts __tests__/procurement.test.ts
git commit -m "feat: add type column to purchase_orders for standard/immediate POs"
```

---

### Task 2: `createAndReceivePurchaseOrder` — atomic order + receive for Immediate Purchases

**Files:**
- Modify: `lib/db/procurement.ts`
- Test: `__tests__/procurement-immediate.test.ts` (new)

**Interfaces:**
- Consumes: `PurchaseOrder.type` (Task 1), the exact batch/cost/expiry math currently in `receivePurchaseOrder` (`lib/db/procurement.ts:492-564`).
- Produces:
  ```ts
  export interface ImmediateLineItemDraft extends DraftPOLineItem {
    /** Overrides unit_cost for the batch actually created, if the invoiced
     * cost differs from what was typed while building the order. */
    cost_price_override?: number | string;
    lot_number?: string;
    expiry_date?: string;
    /** When set, updates the product's global selling price (same effect
     * as ReceivedItem.selling_price in receivePurchaseOrder). */
    selling_price?: number | string;
  }

  export async function createAndReceivePurchaseOrder(
    supplierId: string,
    notes: string,
    items: ImmediateLineItemDraft[],
    paymentStatus?: string,
    amountPaid?: number,
    dueDate?: string | null
  ): Promise<string> // returns the new PO id
  ```
  Later tasks (the UI) import `ImmediateLineItemDraft` and call `createAndReceivePurchaseOrder` directly.

- [ ] **Step 1: Write the failing test**

Create `__tests__/procurement-immediate.test.ts`. This follows the exact same pattern as `__tests__/procurement.test.ts` (in-memory sql.js, `idb-keyval` mocked, `core.__setDatabaseForTesting`), but needs a fuller schema since `createAndReceivePurchaseOrder` also writes to `stock_batches` and `stock_movements` with more columns than the existing test file's minimal schema uses, and calls `logAction`. First, find `logAction`'s exact insert shape:

Run: `grep -n "export async function logAction" -A 20 lib/db/core.ts`

Read the output and note the exact table name and column names `logAction` inserts into (it will be `audit_logs` or similar — use whatever the grep shows). Add a `CREATE TABLE` for that table to this new test file's schema with columns matching exactly what `logAction` inserts, so the insert doesn't fail on a missing table/column.

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises createAndReceivePurchaseOrder() against a genuine in-memory
 * SQLite engine, proving the Immediate Purchase path actually creates a
 * received PO plus real stock_batches/stock_movements rows in one
 * transaction, matching the batch/cost/expiry semantics receivePurchaseOrder
 * already uses for Standard POs.
 */
describe("createAndReceivePurchaseOrder", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let createAndReceivePurchaseOrder: typeof import("@/lib/db/procurement").createAndReceivePurchaseOrder;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const procurement = await import("@/lib/db/procurement");
    createAndReceivePurchaseOrder = procurement.createAndReceivePurchaseOrder;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE suppliers (
        id TEXT PRIMARY KEY, name TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY, order_number TEXT, supplier_id TEXT, ordered_by TEXT,
        order_date TEXT, status TEXT DEFAULT 'pending', type TEXT DEFAULT 'standard',
        payment_status TEXT DEFAULT 'unpaid', amount_paid REAL DEFAULT 0, due_date TEXT,
        total_amount REAL DEFAULT 0, notes TEXT, created_at TEXT, received_at TEXT,
        updated_at TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE purchase_order_items (
        id TEXT PRIMARY KEY, po_id TEXT, product_id TEXT, bulk_quantity INTEGER,
        units_per_bulk INTEGER, unit_cost REAL, subtotal REAL, created_at TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT, base_unit TEXT, bulk_unit TEXT, units_per_bulk INTEGER,
        selling_price REAL
      );
      CREATE TABLE stock_batches (
        id TEXT PRIMARY KEY, product_id TEXT, quantity INTEGER, cost_price REAL,
        batch_number TEXT, expiry_date TEXT, created_at TEXT, is_active INTEGER DEFAULT 1,
        _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY, product_id TEXT, stock_batch_id TEXT, movement_type TEXT,
        quantity INTEGER, unit_cost REAL, total_cost REAL, reference_id TEXT,
        reference_type TEXT, reason TEXT, performed_by TEXT, movement_date TEXT,
        created_at TEXT, _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
    `);
    // Add the audit-log table here using the exact columns found via the
    // grep above, e.g.:
    // CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT, table_name TEXT, record_id TEXT, details TEXT, user_id TEXT, created_at TEXT);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM suppliers; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
      DELETE FROM products; DELETE FROM stock_batches; DELETE FROM stock_movements;
    `);
    db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100, 50)`);
  });

  it("creates the PO already marked received, with type 'immediate'", async () => {
    const poId = await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
    );

    const rows = db.exec(`SELECT status, type FROM purchase_orders WHERE id = '${poId}'`);
    expect(rows[0].values[0]).toEqual(["received", "immediate"]);
  });

  it("creates one stock_batches row per line item, using cost_price_override when given", async () => {
    await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{
        product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton",
        bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000,
        cost_price_override: 6, lot_number: "BATCH-1", expiry_date: "2027-01-01",
      }],
    );

    const rows = db.exec(`SELECT product_id, quantity, cost_price, batch_number, expiry_date FROM stock_batches`);
    expect(rows[0].values[0]).toEqual(["prod1", 200, 6, "BATCH-1", "2027-01-01"]);
  });

  it("falls back to unit_cost / units_per_bulk when no cost override is given", async () => {
    await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
    );

    const rows = db.exec(`SELECT cost_price FROM stock_batches`);
    expect(rows[0].values[0][0]).toBe(5);
  });

  it("updates the product's selling_price when provided", async () => {
    await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 100, unit_cost: 500, subtotal: 500, selling_price: 75 }],
    );

    const rows = db.exec(`SELECT selling_price FROM products WHERE id = 'prod1'`);
    expect(rows[0].values[0][0]).toBe(75);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- procurement-immediate.test.ts`
Expected: FAIL with `createAndReceivePurchaseOrder is not a function` (it doesn't exist yet).

- [ ] **Step 3: Implement `createAndReceivePurchaseOrder`**

In `lib/db/procurement.ts`, add the `ImmediateLineItemDraft` interface (near `DraftPOLineItem`) and the new function (near `receivePurchaseOrder`), reusing the exact batch/cost/expiry logic from `receivePurchaseOrder`:

```ts
export interface ImmediateLineItemDraft extends DraftPOLineItem {
  cost_price_override?: number | string;
  lot_number?: string;
  expiry_date?: string;
  selling_price?: number | string;
}

/** Immediate Purchase: order and receipt happen in one transaction. Unlike
 * createPurchaseOrder() + receivePurchaseOrder(), this never leaves the PO
 * sitting in "pending" — it's created already "received", with its stock
 * batches, in a single atomic step. Reuses the exact per-item batch/cost/
 * expiry math receivePurchaseOrder() uses for Standard POs. */
export async function createAndReceivePurchaseOrder(
  supplierId: string,
  notes: string,
  items: ImmediateLineItemDraft[],
  paymentStatus: string = 'unpaid',
  amountPaid: number = 0,
  dueDate: string | null = null
) {
  const poId = generateId();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let totalAmount = 0;
  for (const item of items) {
    totalAmount += item.subtotal;
  }

  return transaction(async () => {
    await insert("purchase_orders", {
      id: poId,
      supplier_id: supplierId,
      status: "received",
      type: "immediate",
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      due_date: dueDate,
      total_amount: totalAmount,
      notes,
      created_at: now,
      received_at: now,
    });

    const dumosUser = JSON.parse(localStorage.getItem("dumos_user") || "{}");

    for (const item of items) {
      const poItemId = generateId();
      await insert("purchase_order_items", {
        id: poItemId,
        po_id: poId,
        product_id: item.product_id,
        bulk_quantity: item.bulk_quantity,
        units_per_bulk: item.units_per_bulk,
        unit_cost: item.unit_cost,
        subtotal: item.subtotal,
        created_at: now,
      });

      const totalBaseUnits = item.bulk_quantity * item.units_per_bulk;
      const batchNumber = item.lot_number?.trim() || poId.split('-')[0].toUpperCase();
      const expiryDate = item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : null;

      const safeUnitsPerBulk = item.units_per_bulk || 1;
      const baseUnitCost =
        item.cost_price_override !== undefined && item.cost_price_override !== ""
          ? Number(item.cost_price_override)
          : Number(item.unit_cost) / safeUnitsPerBulk;

      const invId = await insert("stock_batches", {
        product_id: item.product_id,
        quantity: totalBaseUnits,
        cost_price: baseUnitCost,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        created_at: now,
        is_active: 1,
        _version: 1,
        _synced: 0,
        _deleted: 0
      });

      await insert("stock_movements", {
        id: crypto.randomUUID(),
        product_id: item.product_id,
        stock_batch_id: invId,
        movement_type: "purchase",
        quantity: totalBaseUnits,
        unit_cost: baseUnitCost,
        total_cost: baseUnitCost * totalBaseUnits,
        reference_id: poId,
        reference_type: "purchase_order",
        reason: "Immediate purchase received",
        performed_by: dumosUser?.id || null,
        movement_date: now,
        created_at: now,
        _version: 1,
        _synced: 0,
        _deleted: 0
      });

      if (item.selling_price !== undefined && item.selling_price !== "") {
        await update("products", item.product_id, {
          selling_price: Number(item.selling_price),
        });
      }
    }

    await logAction("RECEIVE_PO", "purchase_orders", poId, { total_items: items.length });

    return poId;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- procurement-immediate.test.ts`
Expected: PASS. If the `audit_logs`-equivalent insert fails, revisit Step 1's grep output and fix the test schema's table/column names to match exactly.

- [ ] **Step 5: Commit**

```bash
git add lib/db/procurement.ts __tests__/procurement-immediate.test.ts
git commit -m "feat: add createAndReceivePurchaseOrder for atomic Immediate Purchases"
```

---

### Task 3: `ProductCombobox` — `showGlobalSuggestions` prop

**Files:**
- Modify: `components/ui/product-combobox.tsx`

**Interfaces:**
- Produces: `ProductComboboxProps.showGlobalSuggestions?: boolean` (default `true`). When `false`, the dropdown only ever shows real catalog matches (`source: "local"`) plus the existing "Add as new product" fallback — never `source: "global"` reference-list suggestions.
- Consumes (Task 8): `po-item-builder.tsx` will pass `showGlobalSuggestions={false}`.

- [ ] **Step 1: Add the prop and gate `globalSuggestions`**

In `components/ui/product-combobox.tsx`, add the prop to `ProductComboboxProps`:

```ts
interface ProductComboboxProps {
  value: string;
  onChange: (product: SelectedProduct) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When false, the dropdown only shows real catalog matches and the
   * "create new" fallback — never the static reference-list ("Suggested")
   * names. Used by PO item search, where catalog results and non-catalog
   * name suggestions must never appear in the same list. Defaults to true
   * to preserve existing behavior (e.g. the new-product name field, where
   * suggesting non-catalog names is exactly the point). */
  showGlobalSuggestions?: boolean;
}
```

Destructure it in `ProductCombobox` with the default, and gate the `globalSuggestions` memo:

```ts
export function ProductCombobox({
  value,
  onChange,
  onClear,
  placeholder = "Search products...",
  disabled = false,
  className,
  showGlobalSuggestions = true,
}: ProductComboboxProps) {
  // ...unchanged state...

  const globalSuggestions = React.useMemo(() => {
    if (!showGlobalSuggestions) return [];
    const list: SelectedProduct[] = [];
    const source = isPharmacy
      ? FORM_SUGGESTIONS.store
      : FORM_SUGGESTIONS.retail;
    // ...rest unchanged...
    return list;
  }, [isPharmacy, showGlobalSuggestions]);
```

Nothing else in the file changes — `allSuggestions`, `filteredOptions`, and the "Add as new product" fallback logic already work correctly once `globalSuggestions` is empty.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, open the existing "Add New Product" dialog (e.g. from `/products`) and confirm the name field still shows "Suggested" (blue) entries alongside "In Catalog" (green) ones exactly as before — this call site doesn't pass the new prop, so it keeps the default `true`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/product-combobox.tsx
git commit -m "feat: add showGlobalSuggestions opt-out to ProductCombobox"
```

---

### Task 4: `getActiveProductsForPO` — add stock quantity, fix cost to a real average

**Files:**
- Modify: `lib/db/queries/procurement.ts`
- Test: `__tests__/procurement.test.ts` (or a new `__tests__/procurement-products.test.ts` if `getActiveProductsForPO` isn't already covered — check first)

**Interfaces:**
- Produces: `POProduct.stock_quantity: number` (new field), `POProduct.cost_price` now means the same thing `getProductsWithDetails`'s `cost_price` means (`AVG(stock_batches.cost_price)` over active, in-stock batches), not "most recent batch's cost".
- Consumes (Tasks 6-7): the ledger table/card list read `product.stock_quantity` for the "Stock" column and `product.cost_price` for "Current Cost".

- [ ] **Step 1: Check for existing test coverage**

Run: `grep -rn "getActiveProductsForPO" __tests__/`

If a test already exists, read it and extend it in Step 4 below instead of creating a new file. If none exists, create `__tests__/procurement-products.test.ts` in Step 4 following the same sql.js pattern as `__tests__/procurement.test.ts`.

- [ ] **Step 2: Update the query**

In `lib/db/queries/procurement.ts`, change `getActiveProductsForPO`'s SQL and the `POProduct` interface:

```ts
export interface POProduct {
  id: string;
  name: string;
  bulk_unit: string;
  base_unit: string;
  units_per_bulk: number;
  cost_price: number;
  stock_quantity: number;
}
```

```sql
SELECT p.id, p.name, p.bulk_unit, p.base_unit, p.units_per_bulk,
  (SELECT AVG(cost_price) FROM stock_batches WHERE product_id = p.id AND _deleted = 0 AND is_active = 1 AND quantity > 0) as cost_price,
  (SELECT SUM(quantity) FROM stock_batches WHERE product_id = p.id AND _deleted = 0 AND is_active = 1) as stock_quantity
FROM products p WHERE p._deleted = 0
```

(Keep whatever store-scoping/`WHERE` clause the function already has beyond this — only change the selected columns and the `cost_price` subquery.)

- [ ] **Step 3: Handle NULL stock_quantity**

Since `SUM()` over zero rows returns `NULL` in SQLite, add a fallback where the row is mapped/returned (or in the SQL itself via `COALESCE`) so `stock_quantity` is always a number, matching the pattern `getSuppliers()` uses for its own `COALESCE(...)` aggregates:

```sql
COALESCE((SELECT SUM(quantity) FROM stock_batches WHERE product_id = p.id AND _deleted = 0 AND is_active = 1), 0) as stock_quantity
```

- [ ] **Step 4: Write/extend the test**

Add (or extend) a test asserting real numbers, e.g.:

```ts
it("returns the averaged cost across active batches and total stock quantity", async () => {
  db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);
  db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES
    ('b1', 'prod1', 100, 4, 1, 0),
    ('b2', 'prod1', 50, 6, 1, 0)`);

  const products = await getActiveProductsForPO();
  const panadol = products.find((p) => p.id === "prod1")!;

  expect(panadol.cost_price).toBe(5); // (4+6)/2
  expect(panadol.stock_quantity).toBe(150); // 100+50
});

it("returns 0 stock_quantity for a product with no batches", async () => {
  db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod2', 'New Item', 'Unit', 'Box', 1)`);

  const products = await getActiveProductsForPO();
  const item = products.find((p) => p.id === "prod2")!;

  expect(item.stock_quantity).toBe(0);
});
```

Add a `stock_batches` table to whichever test file this lands in if one doesn't already exist there, with columns `id, product_id, quantity, cost_price, is_active, _deleted`.

- [ ] **Step 5: Run the tests**

Run: `npm run test`
Expected: PASS, and no other test that depends on `getActiveProductsForPO`'s old "most recent batch cost" behavior regresses (grep `getActiveProductsForPO` across `__tests__/` and fix any test asserting the old semantics).

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/procurement.ts __tests__/
git commit -m "fix: getActiveProductsForPO returns averaged cost and total stock quantity"
```

---

### Task 5: `po-review-price-popover.tsx`

**Files:**
- Create: `components/procurement/po-review-price-popover.tsx`

**Interfaces:**
- Consumes: `formatCurrency` from `@/lib/utils`, `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover` (check this file exists via `ls components/ui/popover.tsx`; if it doesn't, use `@/components/ui/dialog`'s small-dialog pattern instead and note the substitution in the commit message).
- Produces:
  ```ts
  interface POReviewPricePopoverProps {
    costPrice: number;
    sellingPrice: number | string;
    onSellingPriceChange: (value: string) => void;
  }
  export function POReviewPricePopover(props: POReviewPricePopoverProps): JSX.Element
  ```
  Consumed by Task 6 (`po-item-ledger-table.tsx`) and Task 7 (`po-item-card-list.tsx`) as a per-row trigger button + popover body, Immediate-type rows only.

- [ ] **Step 1: Confirm the Popover primitive exists**

Run: `ls components/ui/popover.tsx`

If present, it wraps Radix `@radix-ui/react-popover` — use its exported `Popover`, `PopoverTrigger`, `PopoverContent`. If absent, use `components/ui/dialog.tsx`'s `Dialog`/`DialogTrigger`/`DialogContent` instead, sized small (`className="sm:max-w-sm"` on `DialogContent`) — either way the props/behavior below stay the same, only the wrapping primitive changes.

- [ ] **Step 2: Implement the component**

```tsx
"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency } from "@/lib/utils";

interface POReviewPricePopoverProps {
  costPrice: number;
  sellingPrice: number | string;
  onSellingPriceChange: (value: string) => void;
}

/** Per-row "review sell price" action for the Immediate Purchase item
 * table/card list: lets cost and sell price be set in the same pass
 * instead of a separate trip to the Product Catalog. Only ever writes to
 * the draft item's local selling_price field — the actual products.selling_price
 * write happens where createAndReceivePurchaseOrder is called, same as
 * receivePurchaseOrder's existing selling_price handling. */
export function POReviewPricePopover({
  costPrice,
  sellingPrice,
  onSellingPriceChange,
}: POReviewPricePopoverProps) {
  const margin = useMemo(() => {
    const sell = Number(sellingPrice);
    if (!sell || sell <= 0) return null;
    return ((sell - costPrice) / sell) * 100;
  }, [sellingPrice, costPrice]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-[12px]">
          <TrendingUp className="w-3.5 h-3.5 mr-1" />
          Review price
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <div className="text-[12.5px] text-muted-foreground">
          Cost: <span className="font-semibold text-foreground">{formatCurrency(costPrice)}</span>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Sell Price
          </Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={sellingPrice}
            onChange={(e) => onSellingPriceChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="0.00"
          />
        </div>
        {margin !== null && (
          <div className="text-[12px] text-muted-foreground">
            Margin: <span className="font-semibold text-foreground">{margin.toFixed(2)}%</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Manual verification**

There's no existing component-test convention in this repo (Global Constraints). Verify manually once Task 6 wires this in: typing a sell price shows a live margin %, and the field is otherwise a plain controlled input.

- [ ] **Step 4: Commit**

```bash
git add components/procurement/po-review-price-popover.tsx
git commit -m "feat: add per-row sell-price review popover for Immediate Purchases"
```

---

### Task 6: `po-item-ledger-table.tsx` — desktop/tablet ledger table

**Files:**
- Create: `components/procurement/po-item-ledger-table.tsx`

**Interfaces:**
- Consumes: `EditableNumberCell` (`components/ui/editable-number-cell.tsx`), `DatePickerInput`, `POReviewPricePopover` (Task 5), `POProduct` (Task 4, for looking up current stock/cost by `product_id`).
- Produces:
  ```ts
  export interface POLineItemDraft {
    product_id: string;
    product_name: string;
    bulk_unit: string;
    bulk_quantity: number;
    units_per_bulk: number;
    unit_cost: number;
    subtotal: number;
    // Immediate-only, ignored for Standard:
    cost_price_override?: number | string;
    lot_number?: string;
    expiry_date?: string;
    selling_price?: number | string;
  }

  interface POItemLedgerTableProps {
    poType: "standard" | "immediate";
    items: POLineItemDraft[];
    products: POProduct[]; // for Stock/Current Cost lookups by product_id
    onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
    onRemoveItem: (index: number) => void;
  }
  export function POItemLedgerTable(props: POItemLedgerTableProps): JSX.Element
  ```
  Consumed by Task 8 (`po-item-builder.tsx`) in `ledger` mode (`useMediaQuery("(min-width: 640px)")` true).

- [ ] **Step 1: Implement the table**

Follow `components/procurement/receive-ledger-table.tsx`'s exact div/ARIA-table conventions (grid columns via a `GRID_COLS` constant, `role="table"`/`role="row"`/`role="cell"`/`role="columnheader"`, sticky first column):

```tsx
"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { POReviewPricePopover } from "./po-review-price-popover";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";

export interface POLineItemDraft {
  product_id: string;
  product_name: string;
  bulk_unit: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  cost_price_override?: number | string;
  lot_number?: string;
  expiry_date?: string;
  selling_price?: number | string;
}

interface POItemLedgerTableProps {
  poType: "standard" | "immediate";
  items: POLineItemDraft[];
  products: POProduct[];
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
}

const STANDARD_GRID_COLS = "grid-cols-[1fr_110px_130px_130px_36px]";
const IMMEDIATE_GRID_COLS = "grid-cols-[1fr_90px_100px_110px_120px_120px_130px_120px_130px_36px]";

/** Bulk item-entry table shared by Standard and Immediate Purchase orders.
 * Column set depends on poType: Standard only needs qty/cost (nothing is
 * received yet), Immediate needs the full receiving surface (current cost,
 * new cost, batch, expiry, sell-price review) so order + receipt can happen
 * in one pass. Built on the same div/ARIA-table conventions as
 * receive-ledger-table.tsx. */
export function POItemLedgerTable({
  poType,
  items,
  products,
  onUpdateItem,
  onRemoveItem,
}: POItemLedgerTableProps) {
  const gridCols = poType === "immediate" ? IMMEDIATE_GRID_COLS : STANDARD_GRID_COLS;

  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <div role="table" aria-label="Order items" className="w-full text-[12.5px]">
        <div role="rowgroup">
          <div role="row" className={`grid ${gridCols} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}>
            <div role="columnheader" className="text-left px-3 py-2 sticky left-0 bg-muted/40">Item</div>
            {poType === "immediate" && (
              <div role="columnheader" className="text-right px-3 py-2">Stock</div>
            )}
            <div role="columnheader" className="text-right px-3 py-2">
              {poType === "immediate" ? "Received" : "Qty"}
            </div>
            {poType === "immediate" && (
              <div role="columnheader" className="text-right px-3 py-2">Current Cost</div>
            )}
            <div role="columnheader" className="text-right px-3 py-2">
              {poType === "immediate" ? "New Cost" : "Unit Cost"}
            </div>
            {poType === "immediate" && (
              <>
                <div role="columnheader" className="text-left px-3 py-2">Lot/Batch</div>
                <div role="columnheader" className="text-left px-3 py-2">Expiry</div>
              </>
            )}
            <div role="columnheader" className="text-right px-3 py-2">
              {poType === "immediate" ? "Total" : "Subtotal"}
            </div>
            {poType === "immediate" && (
              <div role="columnheader" className="text-right px-3 py-2">Sell Price</div>
            )}
            <div role="columnheader" />
          </div>
        </div>

        <div role="rowgroup" className="divide-y divide-border">
          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.product_id);
            const currentCost = product?.cost_price ?? 0;
            const stock = product?.stock_quantity ?? 0;
            const effectiveCost =
              item.cost_price_override !== undefined && item.cost_price_override !== ""
                ? Number(item.cost_price_override)
                : item.unit_cost;
            const total = item.bulk_quantity * (poType === "immediate" ? effectiveCost : item.unit_cost);

            return (
              <div key={`${item.product_id}_${index}`} role="row" className={`grid ${gridCols} items-center`}>
                <div role="cell" className="px-3 py-2 sticky left-0 bg-card">
                  <div className="font-semibold text-foreground truncate max-w-[200px]">
                    {item.product_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground/70">{item.bulk_unit}(s)</div>
                </div>

                {poType === "immediate" && (
                  <div role="cell" className="px-3 py-2 text-right text-muted-foreground">
                    {stock}
                  </div>
                )}

                <div role="cell" className="px-3 py-2 flex justify-end">
                  <EditableNumberCell
                    value={item.bulk_quantity}
                    onCommit={(val) => onUpdateItem(index, { bulk_quantity: val })}
                    parse={(raw) => parseInt(raw, 10)}
                    min={0}
                    widthClassName="w-16"
                  />
                </div>

                {poType === "immediate" && (
                  <div role="cell" className="px-3 py-2 text-right text-muted-foreground">
                    {formatCurrency(currentCost)}
                  </div>
                )}

                <div role="cell" className="px-3 py-2 flex justify-end">
                  {poType === "immediate" ? (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-24 text-right"
                      placeholder={formatCurrency(currentCost)}
                      value={item.cost_price_override ?? ""}
                      onChange={(e) => onUpdateItem(index, { cost_price_override: e.target.value })}
                    />
                  ) : (
                    <EditableNumberCell
                      value={item.unit_cost}
                      onCommit={(val) => onUpdateItem(index, { unit_cost: val, subtotal: item.bulk_quantity * val })}
                      parse={parseFloat}
                      min={0}
                      step="0.01"
                      widthClassName="w-24"
                    />
                  )}
                </div>

                {poType === "immediate" && (
                  <>
                    <div role="cell" className="px-3 py-2">
                      <Input
                        className="min-w-24"
                        placeholder="e.g. BATCH-123"
                        value={item.lot_number || ""}
                        onChange={(e) => onUpdateItem(index, { lot_number: e.target.value })}
                      />
                    </div>
                    <div role="cell" className="px-3 py-2">
                      <DatePickerInput
                        value={item.expiry_date}
                        onChange={(val) => onUpdateItem(index, { expiry_date: val })}
                        placeholder="Select"
                        disablePast
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 15}
                      />
                    </div>
                  </>
                )}

                <div role="cell" className="px-3 py-2 text-right font-semibold text-foreground">
                  {formatCurrency(poType === "immediate" ? total : item.subtotal)}
                </div>

                {poType === "immediate" && (
                  <div role="cell" className="px-3 py-2 flex justify-end">
                    <POReviewPricePopover
                      costPrice={effectiveCost}
                      sellingPrice={item.selling_price ?? ""}
                      onSellingPriceChange={(val) => onUpdateItem(index, { selling_price: val })}
                    />
                  </div>
                )}

                <div role="cell" className="px-3 py-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveItem(index)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div role="row" className={`grid ${gridCols}`}>
              <div role="cell" className="col-span-full px-3 py-8 text-center text-muted-foreground">
                Search above to add items to this order.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

Note: for Standard rows, `unit_cost` here means "cost per bulk unit" (matching `po-add-item-form.tsx`'s existing "Bulk Cost" semantics), so `EditableNumberCell`'s `onCommit` recomputes `subtotal` inline — this preserves the existing subtotal math (`qty * cost`) without needing a separate recompute step elsewhere.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. This component isn't reachable from any page yet (Task 8 wires it in) — defer full manual verification to Task 8's step, but confirm the file compiles with no type errors: `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add components/procurement/po-item-ledger-table.tsx
git commit -m "feat: add shared ledger table for Standard/Immediate PO item entry"
```

---

### Task 7: `po-item-card-list.tsx` — phone-width stacked cards

**Files:**
- Create: `components/procurement/po-item-card-list.tsx`

**Interfaces:**
- Consumes: `POLineItemDraft` (Task 6), `POReviewPricePopover` (Task 5), `POProduct` (Task 4).
- Produces:
  ```ts
  interface POItemCardListProps {
    poType: "standard" | "immediate";
    items: POLineItemDraft[];
    products: POProduct[];
    onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
    onRemoveItem: (index: number) => void;
  }
  export function POItemCardList(props: POItemCardListProps): JSX.Element
  ```
  Consumed by Task 8 in `standard` (card) mode (`useMediaQuery("(min-width: 640px)")` false) — same fields as Task 6's table, arranged vertically instead of in columns, following the existing `ReceiveItemCard` layout convention in `receive-po-panel.tsx`.

- [ ] **Step 1: Implement the card list**

```tsx
"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { POReviewPricePopover } from "./po-review-price-popover";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";

interface POItemCardListProps {
  poType: "standard" | "immediate";
  items: POLineItemDraft[];
  products: POProduct[];
  onUpdateItem: (index: number, patch: Partial<POLineItemDraft>) => void;
  onRemoveItem: (index: number) => void;
}

/** Phone-width equivalent of POItemLedgerTable: same fields, one card per
 * item instead of table columns — the ledger's columns are too cramped to
 * use even with horizontal scroll below 640px, same reasoning as
 * ReceiveItemCard in receive-po-panel.tsx. */
export function POItemCardList({
  poType,
  items,
  products,
  onUpdateItem,
  onRemoveItem,
}: POItemCardListProps) {
  if (items.length === 0) {
    return (
      <div className="border border-border rounded-xl px-4 py-8 text-center text-muted-foreground text-[13px]">
        Search above to add items to this order.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl divide-y divide-border">
      {items.map((item, index) => {
        const product = products.find((p) => p.id === item.product_id);
        const currentCost = product?.cost_price ?? 0;
        const stock = product?.stock_quantity ?? 0;
        const effectiveCost =
          item.cost_price_override !== undefined && item.cost_price_override !== ""
            ? Number(item.cost_price_override)
            : item.unit_cost;
        const total = item.bulk_quantity * (poType === "immediate" ? effectiveCost : item.unit_cost);

        return (
          <div key={`${item.product_id}_${index}`} className="p-4 space-y-3">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h4 className="font-semibold text-[14px] truncate">{item.product_name}</h4>
                {poType === "immediate" && (
                  <p className="text-[12px] text-muted-foreground">
                    Stock: {stock} · Current Cost: {formatCurrency(currentCost)}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveItem(index)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {poType === "immediate" ? "Received" : "Qty"} ({item.bulk_unit})
                </Label>
                <EditableNumberCell
                  value={item.bulk_quantity}
                  onCommit={(val) => onUpdateItem(index, { bulk_quantity: val })}
                  parse={(raw) => parseInt(raw, 10)}
                  min={0}
                  widthClassName="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {poType === "immediate" ? "New Cost" : "Unit Cost"}
                </Label>
                {poType === "immediate" ? (
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={formatCurrency(currentCost)}
                    value={item.cost_price_override ?? ""}
                    onChange={(e) => onUpdateItem(index, { cost_price_override: e.target.value })}
                  />
                ) : (
                  <EditableNumberCell
                    value={item.unit_cost}
                    onCommit={(val) => onUpdateItem(index, { unit_cost: val, subtotal: item.bulk_quantity * val })}
                    parse={parseFloat}
                    min={0}
                    step="0.01"
                    widthClassName="w-full"
                  />
                )}
              </div>
            </div>

            {poType === "immediate" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Lot/Batch (Optional)
                  </Label>
                  <Input
                    placeholder="e.g. BATCH-123"
                    value={item.lot_number || ""}
                    onChange={(e) => onUpdateItem(index, { lot_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Expiry (Optional)
                  </Label>
                  <DatePickerInput
                    value={item.expiry_date}
                    onChange={(val) => onUpdateItem(index, { expiry_date: val })}
                    placeholder="Select"
                    disablePast
                    fromYear={new Date().getFullYear()}
                    toYear={new Date().getFullYear() + 15}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
                {poType === "immediate" ? "Total" : "Subtotal"}
              </span>
              <span className="text-[14px] font-bold text-foreground">
                {formatCurrency(poType === "immediate" ? total : item.subtotal)}
              </span>
            </div>

            {poType === "immediate" && (
              <POReviewPricePopover
                costPrice={effectiveCost}
                sellingPrice={item.selling_price ?? ""}
                onSellingPriceChange={(val) => onUpdateItem(index, { selling_price: val })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add components/procurement/po-item-card-list.tsx
git commit -m "feat: add phone-width card list for Standard/Immediate PO item entry"
```

---

### Task 8: `po-item-builder.tsx` — search + responsive switch + create-product wiring

**Files:**
- Create: `components/procurement/po-item-builder.tsx`

**Interfaces:**
- Consumes: `ProductCombobox`/`SelectedProduct` (Task 3), `useMediaQuery` (`hooks/use-media-query.ts`), `POItemLedgerTable`/`POLineItemDraft` (Task 6), `POItemCardList` (Task 7), `POProduct` (Task 4). Reuses the "open create-product modal" contract already used by `po-add-item-form.tsx`: `onOpenAddProduct(productData: Partial<ProductViewModel>)`, `newlyCreatedProductId?: string | null`, `onNewlyCreatedProductConsumed?: () => void`.
- Produces:
  ```ts
  interface POItemBuilderProps {
    poType: "standard" | "immediate";
    products: POProduct[];
    items: POLineItemDraft[];
    onItemsChange: (items: POLineItemDraft[]) => void;
    onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
    newlyCreatedProductId?: string | null;
    onNewlyCreatedProductConsumed?: () => void;
  }
  export function POItemBuilder(props: POItemBuilderProps): JSX.Element
  ```
  Consumed by Task 9 inside `po-order-form-fields.tsx`, replacing the current `<POAddItemForm .../>` usage.

- [ ] **Step 1: Implement the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ProductCombobox, SelectedProduct } from "@/components/ui/product-combobox";
import { useMediaQuery } from "@/hooks/use-media-query";
import { POItemLedgerTable, type POLineItemDraft } from "./po-item-ledger-table";
import { POItemCardList } from "./po-item-card-list";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { ProductViewModel } from "@/lib/types/product";

interface POItemBuilderProps {
  poType: "standard" | "immediate";
  products: POProduct[];
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId?: string | null;
  onNewlyCreatedProductConsumed?: () => void;
}

/** Search-to-add-a-row bulk item entry, replacing the old one-at-a-time
 * POAddItemForm + separate cart summary. A row is added the moment a
 * catalog product is picked (or a newly created product comes back); no
 * separate "Add" click is needed to commit it to the list, since it's
 * already in the list. showGlobalSuggestions={false} on the combobox keeps
 * catalog matches and non-catalog name suggestions from ever appearing in
 * the same dropdown. */
export function POItemBuilder({
  poType,
  products,
  items,
  onItemsChange,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
}: POItemBuilderProps) {
  const [searchValue, setSearchValue] = useState("");
  const isTabletUp = useMediaQuery("(min-width: 640px)");

  const addRowForProduct = (product: POProduct) => {
    const newItem: POLineItemDraft = {
      product_id: product.id,
      product_name: product.name,
      bulk_unit: product.bulk_unit || "Carton",
      bulk_quantity: 1,
      units_per_bulk: product.units_per_bulk || 1,
      unit_cost: product.cost_price ? product.cost_price * (product.units_per_bulk || 1) : 0,
      subtotal: product.cost_price ? product.cost_price * (product.units_per_bulk || 1) : 0,
    };
    onItemsChange([...items, newItem]);
    setSearchValue("");
  };

  const handleProductChange = (option: SelectedProduct) => {
    if (option.source === "local" && option.localId) {
      const product = products.find((p) => p.id === option.localId);
      if (product) {
        addRowForProduct(product);
        return;
      }
    }
    if (option.source === "new" && option.name) {
      // Combobox's own text-input onChange also fires with source "new" on
      // every keystroke; only open the create-product modal on an explicit
      // "Add as new product" selection, which the combobox only offers once
      // there are no catalog matches — so this only fires for a real intent
      // to create, not while the user is still typing/searching.
      return;
    }
    setSearchValue(option.name);
  };

  // Auto-add a row for a product created via the "Add as new product" ->
  // AddProductDialog round trip, mirroring po-add-item-form.tsx's existing
  // newlyCreatedProductId handling.
  useEffect(() => {
    if (newlyCreatedProductId && products.length > 0) {
      const created = products.find((p) => p.id === newlyCreatedProductId);
      if (created) {
        addRowForProduct(created);
        onNewlyCreatedProductConsumed?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, newlyCreatedProductId, onNewlyCreatedProductConsumed]);

  const handleUpdateItem = (index: number, patch: Partial<POLineItemDraft>) => {
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    onItemsChange(next);
  };

  const handleRemoveItem = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <ProductCombobox
        value={searchValue}
        onChange={handleProductChange}
        showGlobalSuggestions={false}
        placeholder="Search item by name, SKU or barcode"
        className="bg-muted border-border h-10 px-3 text-[13px] rounded-[10px]"
        onClear={() => setSearchValue("")}
      />

      {isTabletUp ? (
        <POItemLedgerTable
          poType={poType}
          items={items}
          products={products}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
        />
      ) : (
        <POItemCardList
          poType={poType}
          items={items}
          products={products}
          onUpdateItem={handleUpdateItem}
          onRemoveItem={handleRemoveItem}
        />
      )}
    </div>
  );
}
```

This still needs the "create new product" trigger surfaced, since the current `AddNewProductOption` inside `ProductCombobox` calls `onChange({ name: value, source: "new" })` on click, which — per `handleProductChange` above — is deliberately a no-op (to avoid mis-firing on every keystroke). Add a small affordance below the search box for the explicit case: when there's a non-empty search with zero catalog matches, the combobox already renders "Add \"X\" as new product" as a dropdown row; clicking it should open the create-product dialog instead of being a no-op. Fix this by distinguishing "typed, still searching" from "explicitly clicked the create row" — thread a second callback through instead of overloading `onChange`'s `source: "new"`:

- [ ] **Step 2: Give `ProductCombobox` an explicit "create new" callback**

In `components/ui/product-combobox.tsx`, add an optional prop so callers can distinguish an explicit "Add as new" click from ordinary typing, without changing any existing caller's behavior (the prop is optional and only `po-item-builder.tsx` will pass it):

```ts
interface ProductComboboxProps {
  // ...existing props...
  /** Fired only when the user explicitly clicks "Add "X" as new product",
   * not on every keystroke. Optional — callers that don't pass it keep the
   * existing onChange({ source: "new" }) behavior for that click. */
  onCreateNew?: (name: string) => void;
}
```

In `AddNewProductOption`'s `onSelect` handler (inside the main component body where it's rendered):

```tsx
<AddNewProductOption
  value={value}
  isActive={activeIndex === filteredOptions.length}
  onSelect={() => {
    if (onCreateNew) {
      onCreateNew(value);
    } else {
      onChange({ name: value, source: "new" });
    }
    setOpen(false);
  }}
/>
```

Then in `po-item-builder.tsx`, pass it and simplify `handleProductChange` to drop the now-unnecessary `source === "new"` branch:

```tsx
<ProductCombobox
  value={searchValue}
  onChange={handleProductChange}
  onCreateNew={(name) => onOpenAddProduct({ name })}
  showGlobalSuggestions={false}
  placeholder="Search item by name, SKU or barcode"
  className="bg-muted border-border h-10 px-3 text-[13px] rounded-[10px]"
  onClear={() => setSearchValue("")}
/>
```

```tsx
const handleProductChange = (option: SelectedProduct) => {
  if (option.source === "local" && option.localId) {
    const product = products.find((p) => p.id === option.localId);
    if (product) {
      addRowForProduct(product);
      return;
    }
  }
  setSearchValue(option.name);
};
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/ui/product-combobox.tsx components/procurement/po-item-builder.tsx
git commit -m "feat: add POItemBuilder search-to-add-row component for PO item entry"
```

---

### Task 9: Wire the type toggle and new components into the create/edit pages

**Files:**
- Modify: `components/procurement/po-order-form-fields.tsx`
- Modify: `components/procurement/po-summary-pane.tsx`
- Modify: `components/procurement/po-mobile-summary-drawer.tsx`
- Modify: `components/procurement/po-mobile-create-view.tsx`
- Modify: `app/(dashboard)/procurement/new/page.tsx`
- Modify: `app/(dashboard)/procurement/edit/page.tsx`
- Delete: `components/procurement/po-add-item-form.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-8 (`type` on `PurchaseOrder`, `createAndReceivePurchaseOrder`, `ImmediateLineItemDraft`, `POItemBuilder`, `POLineItemDraft`).
- Produces: the finished, wired-up Immediate/Standard create flow.

- [ ] **Step 1: Add the type toggle to `po-order-form-fields.tsx`**

Add `poType`/`setPoType` props, and render a segmented control above the vendor select, disabled once `items.length > 0` (per spec §11):

```tsx
interface POOrderFormFieldsProps {
  poType: "standard" | "immediate";
  setPoType: (type: "standard" | "immediate") => void;
  suppliers: Supplier[];
  selectedSupplierId: string;
  setSelectedSupplierId: (id: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  paymentStatus: string;
  setPaymentStatus: (status: string) => void;
  dueDate: string;
  setDueDate: (date: string) => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  totalAmount: number;
  products: POProduct[];
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  onOpenAddSupplier: () => void;
}
```

Replace the `import { POAddItemForm } from "./po-add-item-form";` import with `import { POItemBuilder } from "./po-item-builder";`, and import `type { POLineItemDraft } from "./po-item-ledger-table";` / `type { POProduct } from "@/lib/db/queries/procurement";` instead of the old `Product`/`DraftPOLineItem` imports.

Add the toggle just above the existing "Select Vendor" block:

```tsx
<div className="space-y-1.5">
  <Label className="text-[12.5px] font-semibold text-foreground">
    Order Type
  </Label>
  <div className="inline-flex rounded-[10px] border border-border bg-muted p-1">
    {(["immediate", "standard"] as const).map((type) => (
      <button
        key={type}
        type="button"
        disabled={items.length > 0}
        title={items.length > 0 ? "Start a new PO to change type" : undefined}
        onClick={() => setPoType(type)}
        className={`px-3.5 h-8 rounded-[8px] text-[12.5px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          poType === type ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
        }`}
      >
        {type === "immediate" ? "Immediate Purchase" : "Purchase Order"}
      </button>
    ))}
  </div>
</div>
```

And replace the "Add Items to Order" card's body:

```tsx
<div className="p-4">
  <POItemBuilder
    poType={poType}
    products={products}
    items={items}
    onItemsChange={onItemsChange}
    onOpenAddProduct={onOpenAddProduct}
    newlyCreatedProductId={newlyCreatedProductId}
    onNewlyCreatedProductConsumed={onNewlyCreatedProductConsumed}
  />
</div>
```

- [ ] **Step 2: Simplify `po-summary-pane.tsx` and `po-mobile-summary-drawer.tsx`**

Items are now edited inline via `POItemBuilder` in the left pane/page body, so the right-pane/drawer's `POLineItemsList` becomes a duplicate read-only view of the same data. Remove the `<POLineItemsList .../>` render and its now-unused import/props (`items`, `onRemoveItem`, `storeType`) from both files, keeping only the header (vendor name), the total, and the Save button:

```tsx
// po-summary-pane.tsx
interface POSummaryPaneProps {
  selectedSupplierName: string;
  totalAmount: number;
  onSave: () => void;
  isSubmitting: boolean;
  itemCount: number;
}

export function POSummaryPane({
  selectedSupplierName,
  totalAmount,
  onSave,
  isSubmitting,
  itemCount,
}: POSummaryPaneProps) {
  return (
    <div className="bg-card border-l border-border flex-col min-h-0 hidden md:flex">
      <div className="p-5 border-b border-border shrink-0">
        <div className="text-[14.5px] font-semibold text-foreground">
          Order Summary
        </div>
        <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
          {selectedSupplierName}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 bg-muted/10 flex items-center justify-center text-[13px] text-muted-foreground">
        {itemCount} {itemCount === 1 ? "item" : "items"} added
      </div>
      <div className="p-5 border-t border-border shrink-0 bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Estimated total
          </div>
          <div className="text-[20px] font-bold font-serif text-primary">
            {formatCurrency(totalAmount)}
          </div>
        </div>
        <Button
          className="w-full h-12 rounded-xl text-[14px] font-bold"
          onClick={onSave}
          disabled={isSubmitting || itemCount === 0}
        >
          {isSubmitting ? "Saving..." : "Save Purchase Order"}
        </Button>
      </div>
    </div>
  );
}
```

Apply the equivalent trim to `po-mobile-summary-drawer.tsx` (drop `POLineItemsList`, keep the drawer's total/Save footer, replace `{items.length}` badge counts with a passed-in `itemCount: number` prop).

- [ ] **Step 3: Update `po-mobile-create-view.tsx`**

Thread `poType`/`setPoType` through to `POOrderFormFields`, and change the props passed to `POMobileSummaryDrawer` from `items`/`onRemoveItem` to `itemCount={items.length}` (matching Step 2's simplified props).

- [ ] **Step 4: Wire `new/page.tsx`**

```tsx
const [poType, setPoType] = useState<"standard" | "immediate">("immediate");
const [items, setItems] = useState<POLineItemDraft[]>([]);
```

(Replace the old `DraftPOLineItem` import/state with `POLineItemDraft` from `@/components/procurement/po-item-ledger-table`, and drop `handleAddLineItem`/`removeLineItem`'s old per-call-site logic in favor of the single `setItems` passed as `onItemsChange`.)

Update `handleSubmit` to branch on `poType`:

```tsx
const handleSubmit = async () => {
  if (!selectedSupplierId) {
    toast.error("Please select a vendor");
    return;
  }
  if (items.length === 0) {
    toast.error("Add at least one item to the order");
    return;
  }

  setIsSubmitting(true);
  try {
    if (poType === "immediate") {
      const poId = await createAndReceivePurchaseOrder(
        selectedSupplierId,
        notes,
        items,
        paymentStatus,
        paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
        dueDate || null,
      );
      toast.success("Purchase received", {
        description: "Stock has been added to inventory.",
      });
      router.push(`/procurement?selected=${poId}`);
    } else {
      const poId = await createPurchaseOrder(
        selectedSupplierId,
        notes,
        items,
        paymentStatus,
        paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
        dueDate || null,
      );
      toast.success("Purchase order saved as draft", {
        description: "Remember to mark it as sent once it's on its way to the vendor.",
      });
      router.push(`/procurement?selected=${poId}`);
    }
  } catch (error) {
    console.error("Failed to create PO:", error);
    toast.error("Error creating purchase order");
  } finally {
    setIsSubmitting(false);
  }
};
```

Import `createAndReceivePurchaseOrder` from `@/lib/db/procurement` alongside the existing `createPurchaseOrder`/`createProduct` import from `@/lib/db/local-database`. Update `formFieldsProps` to include `poType`, `setPoType`, `items`, `onItemsChange: setItems` (dropping the old `onAddLineItem`), and change `products` to come from whatever `useProcurementData()` now returns (already `POProduct[]` from Task 4 — no hook change needed here). Update `<POSummaryPane .../>`'s props to match Step 2's new shape (`itemCount={items.length}` instead of `items`/`onRemoveItem`).

- [ ] **Step 5: Update `edit/page.tsx`**

Editing only ever applies to Standard POs (Immediate ones are created already `received` and never enter an editable state), so no toggle is needed here — hardcode `poType="standard"` wherever `POOrderFormFields` is rendered, and keep using `updatePurchaseOrder`/`createPurchaseOrder`'s existing Standard-only code path unchanged, just updating the item state type from `DraftPOLineItem` to `POLineItemDraft` and the summary-pane props per Step 2.

- [ ] **Step 6: Delete the retired component**

```bash
git rm components/procurement/po-add-item-form.tsx
```

Confirm nothing else imports it:

Run: `grep -rn "po-add-item-form" --include="*.tsx" --include="*.ts" .`
Expected: no output.

- [ ] **Step 7: Full verification pass**

Run: `npm run test`
Expected: all tests pass (Tasks 1, 2, 4's new/updated tests plus the full existing suite).

Run: `npx tsc --noEmit`
Expected: no type errors.

Run: `npm run dev`, then manually walk both flows:
- **Immediate Purchase**: `/procurement/new` → toggle defaults to "Immediate Purchase" → pick a vendor → search and add 2+ products (including one via "Add as new product") → set quantities, a new cost on one row, batch/expiry on one row and leave another blank → click Save → confirm the "Missing Expiry Date" warning fires for the row left blank → "Proceed Anyway" → confirm redirect to `/procurement?selected=...` shows the PO already as "Received" with correct stock/cost reflected in the Product Catalog.
- **Standard PO**: toggle to "Purchase Order" before adding any items (confirm the toggle is disabled once an item exists on either type) → add items → Save → confirm it lands as "Pending"/draft, then use the existing "Receive Goods" flow from the PO detail view to receive it, confirming that path is completely unchanged.
- **Mobile**: resize below 640px and repeat the Immediate flow, confirming the stacked-card layout renders instead of the table and the bottom summary drawer still shows the running total/Save button.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: wire Immediate/Standard PO type toggle into the create/edit flow"
```

---

## Self-Review Notes

- **Spec coverage**: §4 (schema) → Task 1; §5 (`createAndReceivePurchaseOrder`) → Task 2; §6 (kept behaviors: expiry warning untouched in `receive-po-panel.tsx`, batch optional untouched, per-batch cost preserved via Task 4's average-not-master-write fix) → verified, no task regresses these since `receivePurchaseOrder`/`receive-po-panel.tsx` are never modified; §7 (ledger table, both column sets, Review price) → Tasks 5-6; §8 (search separation) → Task 3 + Task 8's `onCreateNew` split; §9 (mobile subtree swap) → Task 7 + Task 8's `useMediaQuery` switch; §10 (end-to-end flows) → Task 9; §11 (toggle, disabled once items exist) → Task 9 Step 1.
- **Placeholder scan**: no TBD/TODO markers; every step has literal code or an exact grep/run command whose output determines the next literal edit (e.g. Task 2 Step 1's `logAction` lookup, Task 5 Step 1's Popover-primitive check) rather than vague instructions.
- **Type consistency**: `POLineItemDraft` (defined in Task 6, `po-item-ledger-table.tsx`) is imported and reused identically by Tasks 7, 8, and 9 — never redefined with different fields. `ImmediateLineItemDraft` (Task 2, DB layer) and `POLineItemDraft` (Task 6, UI layer) are intentionally separate types with overlapping optional fields: Task 9 passes `items` (type `POLineItemDraft[]`) directly where `createAndReceivePurchaseOrder` expects `ImmediateLineItemDraft[]` — these are structurally compatible (`POLineItemDraft` is a superset of `ImmediateLineItemDraft`'s fields), so no mapping step is needed, but this structural-compatibility assumption should be spot-checked with `npx tsc --noEmit` in Task 9 Step 7 if TypeScript flags an excess-property or structural mismatch.
