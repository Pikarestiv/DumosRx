# Reseller Commission Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a cashier mark a sale as a reseller sale, override each cart line's price upward, have the system compute and store a commission (store-wide % of the markup) on that sale at checkout, and let staff later look up that sale by receipt number and redeem the commission.

**Architecture:** A store-wide `reseller_commission_percentage` setting (same shape as the existing `vat_percentage`). The POS cart gains an `isResellerSale` toggle and a per-item price override, both living in the existing cart zustand store alongside `discount`/`discountType`. At checkout, `usePOSPayment` computes the markup and commission once and writes them onto the `sales` row as a snapshot — nothing is ever recalculated later. A new tab on the existing Reports page lets staff look up a sale by transaction number and mark its commission redeemed.

**Tech Stack:** Next.js (App Router), React, TypeScript, Zustand (cart store), TanStack Query, SQLite via `sql.js` (browser) / Tauri SQL plugin (native), Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-09-16-reseller-commission-design.md`

## Global Constraints

- Commission is a single store-wide percentage of the markup, not per-reseller and not a flat rate on the whole sale.
- No reseller identity/CRM — sales are flagged, not attributed to a named reseller.
- The customer-facing receipt must not change at all.
- A reseller-sale price can only be edited **upward** from the item's normal selling price — never below it. Enforced both in the input (`min`) and in the state update itself (clamped), not just one or the other.
- Commission is computed once at checkout and stored as a snapshot on the `sales` row — never recalculated from current product prices or the current store setting.
- Redemption is bookkeeping only (a flag + timestamp + who redeemed it) — there is no till/cash-drawer simulation anywhere in this app, and this feature does not add one.
- New DB columns follow the existing idempotent `ALTER TABLE ... ADD COLUMN` migration pattern in `client/lib/db/core.ts`, plus matching `CREATE TABLE IF NOT EXISTS` DDL in `client/lib/db/schema.ts` for fresh installs.

---

## Task 1: Schema — new columns on `stores` and `sales`

**Files:**
- Modify: `client/lib/db/schema.ts` (stores `CREATE TABLE`, sales `CREATE TABLE`)
- Modify: `client/lib/db/core.ts` (add two `ALTER TABLE` migrations, alongside the existing `tax_number`/`loyalty_program_enabled` ones)
- Modify: `client/lib/context/store-context.tsx` (`StoreProfile` interface)
- Modify: `client/lib/types/sale.ts` (`Sale` interface)
- Test: `client/__tests__/reseller-commission-schema.test.ts`

**Interfaces:**
- Produces: `stores.reseller_commission_percentage` (REAL, default 0), `sales.is_reseller_sale` (INTEGER, default 0), `sales.reseller_commission_percentage` (REAL, default 0), `sales.reseller_commission_amount` (REAL, default 0), `sales.reseller_commission_redeemed` (INTEGER, default 0), `sales.reseller_commission_redeemed_at` (TEXT), `sales.reseller_commission_redeemed_by` (TEXT). `StoreProfile.reseller_commission_percentage?: number`. `Sale.is_reseller_sale?: number`, `Sale.reseller_commission_percentage?: number`, `Sale.reseller_commission_amount?: number`, `Sale.reseller_commission_redeemed?: number`, `Sale.reseller_commission_redeemed_at?: string`, `Sale.reseller_commission_redeemed_by?: string`.

- [ ] **Step 1: Write the failing test**

Create `client/__tests__/reseller-commission-schema.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("reseller commission schema", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM stores;`);
  });

  it("stores a reseller_commission_percentage on stores", () => {
    db.run(
      `INSERT INTO stores (id, name, reseller_commission_percentage) VALUES ('s1', 'Store', 25)`,
    );
    const rows = db.exec(
      `SELECT reseller_commission_percentage FROM stores WHERE id = 's1'`,
    );
    expect(rows[0].values[0][0]).toBe(25);
  });

  it("stores reseller commission fields on a sale, defaulting to unset", () => {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount) VALUES ('sale1', 'TXN1', 100, 100)`,
    );
    const defaults = db.exec(
      `SELECT is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed FROM sales WHERE id = 'sale1'`,
    );
    expect(defaults[0].values[0]).toEqual([0, 0, 0]);

    db.run(
      `UPDATE sales SET is_reseller_sale = 1, reseller_commission_percentage = 20, reseller_commission_amount = 500 WHERE id = 'sale1'`,
    );
    const updated = db.exec(
      `SELECT is_reseller_sale, reseller_commission_percentage, reseller_commission_amount FROM sales WHERE id = 'sale1'`,
    );
    expect(updated[0].values[0]).toEqual([1, 20, 500]);

    db.run(
      `UPDATE sales SET reseller_commission_redeemed = 1, reseller_commission_redeemed_at = '2026-09-16T00:00:00Z', reseller_commission_redeemed_by = 'user-1' WHERE id = 'sale1'`,
    );
    const redeemed = db.exec(
      `SELECT reseller_commission_redeemed, reseller_commission_redeemed_at, reseller_commission_redeemed_by FROM sales WHERE id = 'sale1'`,
    );
    expect(redeemed[0].values[0]).toEqual([1, "2026-09-16T00:00:00Z", "user-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/reseller-commission-schema.test.ts`
Expected: FAIL — `SQLITE_ERROR: table stores has no column named reseller_commission_percentage` (or similar for `sales`).

- [ ] **Step 3: Add the columns to `schema.ts`**

In `client/lib/db/schema.ts`, find the `stores` table's `CREATE TABLE IF NOT EXISTS stores (...)` block. Locate this existing line (added for the Tax Invoice feature):

```sql
  tax_number TEXT,
```

Add immediately after it:

```sql
  tax_number TEXT,
  reseller_commission_percentage REAL DEFAULT 0,
```

Then find the `sales` table's `CREATE TABLE IF NOT EXISTS sales (...)` block. Locate:

```sql
  receipt_printed INTEGER DEFAULT 0,
```

Add immediately after it:

```sql
  receipt_printed INTEGER DEFAULT 0,
  is_reseller_sale INTEGER DEFAULT 0,
  reseller_commission_percentage REAL DEFAULT 0,
  reseller_commission_amount REAL DEFAULT 0,
  reseller_commission_redeemed INTEGER DEFAULT 0,
  reseller_commission_redeemed_at TEXT,
  reseller_commission_redeemed_by TEXT,
```

- [ ] **Step 4: Add the migrations to `core.ts`**

In `client/lib/db/core.ts`, find this existing block (the Tax Invoice feature's migration):

```ts
    try {
      // For the Tax Invoice receipt print variant's header (see ReceiptView) -
      // a store's formal tax/VAT registration ID, distinct from
      // pcn_license/registration_number.
      db.run('ALTER TABLE stores ADD COLUMN tax_number TEXT;');
    } catch (_e) {
      // Ignore if column already exists
    }
```

Add immediately after it:

```ts
    try {
      // Store-wide % of a reseller sale's markup remitted back to the
      // reseller. See ReselleCommissionPanel / use-pos-payment.ts.
      db.run('ALTER TABLE stores ADD COLUMN reseller_commission_percentage REAL DEFAULT 0;');
    } catch (_e) {
      // Ignore if column already exists
    }

    try {
      db.run('ALTER TABLE sales ADD COLUMN is_reseller_sale INTEGER DEFAULT 0;');
    } catch (_e) {
      // Ignore if column already exists
    }

    try {
      db.run('ALTER TABLE sales ADD COLUMN reseller_commission_percentage REAL DEFAULT 0;');
    } catch (_e) {
      // Ignore if column already exists
    }

    try {
      db.run('ALTER TABLE sales ADD COLUMN reseller_commission_amount REAL DEFAULT 0;');
    } catch (_e) {
      // Ignore if column already exists
    }

    try {
      db.run('ALTER TABLE sales ADD COLUMN reseller_commission_redeemed INTEGER DEFAULT 0;');
    } catch (_e) {
      // Ignore if column already exists
    }

    try {
      db.run('ALTER TABLE sales ADD COLUMN reseller_commission_redeemed_at TEXT;');
    } catch (_e) {
      // Ignore if column already exists
    }

    try {
      db.run('ALTER TABLE sales ADD COLUMN reseller_commission_redeemed_by TEXT;');
    } catch (_e) {
      // Ignore if column already exists
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/reseller-commission-schema.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Update `StoreProfile` and `Sale` TypeScript types**

In `client/lib/context/store-context.tsx`, find:

```ts
  tax_number?: string;
```

Add immediately after it:

```ts
  tax_number?: string;
  reseller_commission_percentage?: number;
```

In `client/lib/types/sale.ts`, find the `Sale` interface's:

```ts
  points_earned?: number;
  points_redeemed?: number;
}
```

Change to:

```ts
  points_earned?: number;
  points_redeemed?: number;
  is_reseller_sale?: number;
  reseller_commission_percentage?: number;
  reseller_commission_amount?: number;
  reseller_commission_redeemed?: number;
  reseller_commission_redeemed_at?: string;
  reseller_commission_redeemed_by?: string;
}
```

- [ ] **Step 7: Type-check**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add client/lib/db/schema.ts client/lib/db/core.ts client/lib/context/store-context.tsx client/lib/types/sale.ts client/__tests__/reseller-commission-schema.test.ts
git commit -m "feat: add reseller commission columns to stores and sales"
```

---

## Task 2: Store setting — "Reseller Commission %"

**Files:**
- Modify: `client/hooks/use-settings-form.ts`
- Modify: `client/hooks/use-settings.ts`
- Modify: `client/components/settings/regional-settings-card.tsx`
- Modify: `client/components/settings/appearance-settings.tsx`
- Modify: `client/app/(dashboard)/settings/[tab]/panels/appearance-panel.tsx`

**Interfaces:**
- Consumes: `StoreProfile.reseller_commission_percentage` (Task 1).
- Produces: `SettingsState.localResellerCommission: string`, `SettingsState.setLocalResellerCommission: (val: string) => void` (flows through `...formState` spread in `use-settings.ts`, same as every other `local*` field). `handleSaveRegional()` now also persists `reseller_commission_percentage`.

- [ ] **Step 1: Add local state to `use-settings-form.ts`**

Find:

```ts
  const [localVat, setLocalVat] = useState(storeProfile?.vat_percentage?.toString() || "7.5");
```

Add immediately after it:

```ts
  const [localResellerCommission, setLocalResellerCommission] = useState(
    storeProfile?.reseller_commission_percentage?.toString() || "0",
  );
```

Find, in the `useEffect` that syncs state from `storeProfile`:

```ts
      setLocalVat(storeProfile.vat_percentage?.toString() || "7.5");
```

Add immediately after it:

```ts
      setLocalResellerCommission(
        storeProfile.reseller_commission_percentage?.toString() || "0",
      );
```

Find the hook's `return { ... }` block, locate:

```ts
    localVat, setLocalVat,
```

Add immediately after it:

```ts
    localResellerCommission, setLocalResellerCommission,
```

- [ ] **Step 2: Wire it into `use-settings.ts`**

Find, in the destructure of `formState`-derived fields near the top of `useSettings`:

```ts
    localVat,
```

Add immediately after it:

```ts
    localResellerCommission,
```

Find `handleSaveRegional`:

```ts
  const handleSaveRegional = () => {
    updateStoreProfile({
      currency: localCurrency,
      vat_percentage: parseFloat(localVat) || 0,
    });
    toast.success("Regional settings updated");
  };
```

Change to:

```ts
  const handleSaveRegional = () => {
    updateStoreProfile({
      currency: localCurrency,
      vat_percentage: parseFloat(localVat) || 0,
      reseller_commission_percentage: parseFloat(localResellerCommission) || 0,
    });
    toast.success("Regional settings updated");
  };
```

- [ ] **Step 3: Add the field to `regional-settings-card.tsx`**

Add to `RegionalSettingsCardProps`, immediately after `setLocalVat: (val: string) => void;`:

```ts
  localResellerCommission: string;
  setLocalResellerCommission: (val: string) => void;
```

Add to the destructured props, immediately after `setLocalVat,`:

```ts
  localResellerCommission,
  setLocalResellerCommission,
```

In the read-only summary grid (`!isEditingRegional` block), the grid is currently `grid-cols-1 sm:grid-cols-2`. Change it to `sm:grid-cols-3` and add a third card immediately after the VAT card's closing `</div>` (the one showing `{localVat ? ... : "0%"}`):

```tsx
          <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20">
            <div className="p-2 rounded-full bg-primary/10 shrink-0">
              <Percent className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reseller Commission</p>
              <p className="text-sm font-semibold">
                {localResellerCommission ? `${localResellerCommission}%` : "0%"}
              </p>
            </div>
          </div>
```

In the editing form (`isEditingRegional` block), add a new field immediately after the VAT `<div className="grid gap-2">...</div>` block (after its closing `</div>`):

```tsx
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="reseller-commission">Reseller Commission (%)</Label>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      When a cashier marks a sale as a reseller sale and marks
                      up an item&apos;s price, this percentage of that markup
                      is owed to the reseller as commission.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="reseller-commission"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={localResellerCommission}
              onChange={(e) => setLocalResellerCommission(e.target.value)}
              placeholder="e.g. 20"
            />
            <p className="text-xs text-muted-foreground">
              Leave at 0 if you don&apos;t run reseller sales.
            </p>
          </div>
```

- [ ] **Step 4: Thread the prop through `appearance-settings.tsx`**

Add to `AppearanceSettingsProps`, immediately after `setLocalVat: (val: string) => void;`:

```ts
  localResellerCommission: string;
  setLocalResellerCommission: (val: string) => void;
```

Find the `<RegionalSettingsCard ... />` call and add, immediately after `setLocalVat={setLocalVat}`:

```tsx
          localResellerCommission={localResellerCommission}
          setLocalResellerCommission={setLocalResellerCommission}
```

Also add `localResellerCommission` and `setLocalResellerCommission` to this component's own destructured function parameters (mirrors how `localVat`/`setLocalVat` are already destructured there).

- [ ] **Step 5: Thread the prop through `appearance-panel.tsx`**

Find:

```tsx
      localVat={s.localVat}
      setLocalVat={s.setLocalVat}
```

Add immediately after it:

```tsx
      localResellerCommission={s.localResellerCommission}
      setLocalResellerCommission={s.setLocalResellerCommission}
```

- [ ] **Step 6: Type-check**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run: `cd client && npm run dev`, open `/settings` → Appearance tab (or wherever Regional Settings renders), click the pencil icon on the "Regional Settings" card. Confirm:
1. A new "Reseller Commission (%)" field appears below VAT, defaulting to "0".
2. Type "20", click "Save Regional Settings".
3. Reload the page. The read-only summary now shows a third card "Reseller Commission: 20%".

- [ ] **Step 8: Commit**

```bash
git add client/hooks/use-settings-form.ts client/hooks/use-settings.ts client/components/settings/regional-settings-card.tsx client/components/settings/appearance-settings.tsx "client/app/(dashboard)/settings/[tab]/panels/appearance-panel.tsx"
git commit -m "feat: add Reseller Commission % store setting"
```

---

## Task 3: Cart state — reseller toggle and price-floor-clamped price override

**Files:**
- Modify: `client/lib/hooks/use-pos-cart.ts`
- Test: `client/__tests__/use-pos-cart-reseller.test.ts`

**Interfaces:**
- Consumes: `CartItem` (existing, extends `POSProduct`), `POSCartState` (existing zustand store shape).
- Produces: `CartItem.original_unit_price: number` (new required field, set once when added to cart). `usePOSCart(products).isResellerSale: boolean`, `.setIsResellerSale: (val: boolean) => void`, `.updateUnitPrice: (id: string, newPrice: number) => void`. `clearCart()` now also resets `isResellerSale` to `false`. Turning `isResellerSale` off reverts every cart item's `unit_price`/`subtotal` back to its `original_unit_price`.

- [ ] **Step 1: Write the failing test**

Create `client/__tests__/use-pos-cart-reseller.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePOSCart reseller mode", () => {
  let usePOSCart: typeof import("@/lib/hooks/use-pos-cart").usePOSCart;
  let container: HTMLDivElement;
  let root: Root;

  const product = {
    id: "p1",
    name: "Cement Bag",
    generic_name: "",
    strength: "",
    unit_price: 100,
    stock: 50,
  } as any;

  beforeEach(async () => {
    usePOSCart = (await import("@/lib/hooks/use-pos-cart")).usePOSCart;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function renderCart() {
    let hookResult!: ReturnType<typeof usePOSCart>;
    function TestHost() {
      hookResult = usePOSCart([product]);
      return null;
    }
    act(() => {
      root.render(React.createElement(TestHost));
    });
    return { get: () => hookResult };
  }

  it("clamps updateUnitPrice to never go below the item's original price", async () => {
    const handle = renderCart();
    act(() => handle.get().clearCart());
    act(() => handle.get().addToCart(product));

    act(() => handle.get().updateUnitPrice("p1", 150));
    expect(handle.get().cart[0].unit_price).toBe(150);
    expect(handle.get().cart[0].subtotal).toBe(150);

    act(() => handle.get().updateUnitPrice("p1", 50));
    expect(handle.get().cart[0].unit_price).toBe(100);
    expect(handle.get().cart[0].subtotal).toBe(100);
  });

  it("reverts all item prices to original when isResellerSale is turned off", async () => {
    const handle = renderCart();
    act(() => handle.get().clearCart());
    act(() => handle.get().addToCart(product));
    act(() => handle.get().setIsResellerSale(true));
    act(() => handle.get().updateUnitPrice("p1", 200));
    expect(handle.get().cart[0].unit_price).toBe(200);

    act(() => handle.get().setIsResellerSale(false));
    expect(handle.get().cart[0].unit_price).toBe(100);
    expect(handle.get().cart[0].subtotal).toBe(100);
    expect(handle.get().isResellerSale).toBe(false);
  });

  it("resets isResellerSale on clearCart", async () => {
    const handle = renderCart();
    act(() => handle.get().setIsResellerSale(true));
    act(() => handle.get().clearCart());
    expect(handle.get().isResellerSale).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/use-pos-cart-reseller.test.ts`
Expected: FAIL — `updateUnitPrice`/`setIsResellerSale`/`isResellerSale` are not functions/undefined.

- [ ] **Step 3: Implement in `use-pos-cart.ts`**

Add `original_unit_price` to `CartItem`:

```ts
export interface CartItem extends Product {
  quantity: number;
  subtotal: number;
  original_unit_price: number;
}
```

Add `isResellerSale`/`setIsResellerSale` to `POSCartState` and the store:

```ts
interface POSCartState {
  cart: CartItem[];
  discount: number;
  discountType: "fixed" | "percentage";
  redeemedOption: RedeemedOption | null;
  isResellerSale: boolean;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setDiscount: (discount: number) => void;
  setDiscountType: (type: "fixed" | "percentage") => void;
  setRedeemedOption: (option: RedeemedOption | null) => void;
  setIsResellerSale: (value: boolean) => void;
}
```

In the store's initializer object, add `isResellerSale: false,` alongside `redeemedOption: null,`, and `setIsResellerSale: (isResellerSale) => set({ isResellerSale }),` alongside `setRedeemedOption`.

In `usePOSCart`, read the new store slice:

```ts
  const isResellerSale = usePOSCartStore((state) => state.isResellerSale);
  const setStoreIsResellerSale = usePOSCartStore((state) => state.setIsResellerSale);
```

Set `original_unit_price` in `addToCart`, in the `cartItem` literal:

```ts
        const cartItem: CartItem = {
          ...product,
          quantity: 1,
          subtotal: product.unit_price,
          original_unit_price: product.unit_price,
        };
```

Add `updateUnitPrice`, right after `updateQuantity`:

```ts
  const updateUnitPrice = (id: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        // A reseller sale can only mark price up, never down - clamped here
        // too, not just in the input's `min`, so a pasted/typed value below
        // the floor can't get through either.
        const clamped = Math.max(newPrice, item.original_unit_price);
        return { ...item, unit_price: clamped, subtotal: clamped * item.quantity };
      }),
    );
  };
```

Add `setIsResellerSale`, right after `updateUnitPrice`:

```ts
  const setIsResellerSale = (value: boolean) => {
    setStoreIsResellerSale(value);
    if (!value) {
      // Turning reseller mode off with marked-up prices still in the cart
      // would silently keep charging the marked-up amount with no
      // commission tracked for it - revert every line back to normal.
      setCart((prev) =>
        prev.map((item) => ({
          ...item,
          unit_price: item.original_unit_price,
          subtotal: item.original_unit_price * item.quantity,
        })),
      );
    }
  };
```

In `clearCart`, add the reset:

```ts
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setStoreIsResellerSale(false);
  };
```

In the hook's `return { ... }` block, add:

```ts
    updateUnitPrice,
    isResellerSale: isHydrated ? isResellerSale : false,
    setIsResellerSale,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/use-pos-cart-reseller.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors. `addToCart` (Step 3) is the only place in the codebase that constructs a `CartItem` object literal (confirmed via `grep -rn "CartItem = {" client`), so no other call site needs a matching fix. `use-pos-held-transactions.ts`'s recall path parses a previously-held cart via `JSON.parse(held.items_json) as CartItem[]` — a type assertion, not a literal construction — so it type-checks regardless; a transaction held before this feature shipped simply won't have `original_unit_price` in its stored JSON at runtime, which only matters if reseller mode is turned on after recalling it. That's an acceptable, narrow gap for v1 and is called out here rather than silently ignored.

- [ ] **Step 6: Commit**

```bash
git add client/lib/hooks/use-pos-cart.ts client/__tests__/use-pos-cart-reseller.test.ts
git commit -m "feat: add reseller-mode price override to POS cart state"
```

---

## Task 4: Cart UI — Reseller Sale toggle and editable prices

**Files:**
- Modify: `client/components/pos/pos-cart-item.tsx`
- Modify: `client/components/pos/pos-cart.tsx`
- Modify: `client/components/pos/pos-cart-panels.tsx`
- Modify: `client/components/pos/pos-mobile-cart-wrapper.tsx`
- Modify: `client/components/pos/pos-mobile-cart-drawer.tsx`
- Modify: `client/lib/hooks/use-pos-system.ts`
- Modify: `client/components/pos/pos-system.tsx`

**Interfaces:**
- Consumes: `usePOSCart`'s `isResellerSale`, `setIsResellerSale`, `updateUnitPrice` (Task 3).
- Produces: nothing new consumed by later tasks except that `usePOSSystem()`'s return object now includes `isResellerSale`, `setIsResellerSale`, `updateUnitPrice`, which Task 5 wires into `usePOSPayment`.

- [ ] **Step 1: `pos-cart-item.tsx`  — editable price**

Add to `Props`:

```ts
  isResellerSale?: boolean;
  updateUnitPrice?: (id: string, price: number) => void;
```

Add to the destructured function parameters: `isResellerSale = false, updateUnitPrice,`.

Replace the price display block:

```tsx
          <div className="text-[11.5px] text-muted-foreground leading-tight">
            {formatCurrency(item.unit_price, currencyCode)} each
          </div>
```

with:

```tsx
          {isResellerSale ? (
            <div className="flex items-center gap-1 text-[11.5px]">
              <input
                type="number"
                min={item.original_unit_price}
                step="1"
                value={item.unit_price}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!Number.isNaN(val)) updateUnitPrice?.(item.id, val);
                }}
                className="w-20 h-6 px-1.5 rounded border border-border bg-background text-[11.5px]"
              />
              <span className="text-muted-foreground">each (min {formatCurrency(item.original_unit_price, currencyCode)})</span>
            </div>
          ) : (
            <div className="text-[11.5px] text-muted-foreground leading-tight">
              {formatCurrency(item.unit_price, currencyCode)} each
            </div>
          )}
```

- [ ] **Step 2: `pos-cart.tsx` — toggle switch**

Add import: `import { Switch } from "@/components/ui/switch";`

Add to `POSCartProps`:

```ts
  isResellerSale?: boolean;
  setIsResellerSale?: (value: boolean) => void;
  updateUnitPrice?: (id: string, price: number) => void;
```

Add to the destructured function parameters: `isResellerSale = false, setIsResellerSale, updateUnitPrice,`.

Add a toggle row immediately above the cart item list (right after the `isPrescriptionLocked` banner block, before `<div className="flex-1 overflow-y-auto ...">`):

```tsx
      {cart.length > 0 && (
        <div className="mx-5 mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-muted/20 shrink-0">
          <span className="text-[11.5px] font-semibold text-foreground">
            Reseller sale
          </span>
          <Switch
            checked={isResellerSale}
            onCheckedChange={(v) => setIsResellerSale?.(v)}
          />
        </div>
      )}
```

Pass the new props into the `<POSCartItem>` call inside the `.map`:

```tsx
            <POSCartItem
              key={item.id}
              item={item}
              currencyCode={currencyCode}
              isLast={idx === cart.length - 1}
              updateQuantity={updateQuantity}
              removeFromCart={removeFromCart}
              isLocked={isPrescriptionLocked}
              isResellerSale={isResellerSale}
              updateUnitPrice={updateUnitPrice}
            />
```

- [ ] **Step 3: Thread through `pos-cart-panels.tsx`**

Add to `POSCartPanelsProps`:

```ts
  isResellerSale?: boolean;
  setIsResellerSale?: (value: boolean) => void;
  updateUnitPrice?: (id: string, price: number) => void;
```

Add to the destructure: `isResellerSale, setIsResellerSale, updateUnitPrice,`.

Add the same three keys into the `sharedCartProps` object literal.

- [ ] **Step 4: Thread through `pos-mobile-cart-wrapper.tsx`**

Add the same three props to `POSMobileCartWrapperProps`, the destructured function parameters, and the `<POSMobileCartDrawer ... />` call.

- [ ] **Step 5: Thread through `pos-mobile-cart-drawer.tsx`**

Add the same three props to `POSMobileCartDrawerProps`, the destructured function parameters, and the `<POSCart ... />` call.

- [ ] **Step 6: Thread through `use-pos-system.ts`**

Find, in the `usePOSCart` destructure:

```ts
    redeemedOption,
    redeemReward,
    clearRedemption,
  } = usePOSCart(products);
```

Change to:

```ts
    redeemedOption,
    redeemReward,
    clearRedemption,
    isResellerSale,
    setIsResellerSale,
    updateUnitPrice,
  } = usePOSCart(products);
```

Add the same three names into the hook's final `return { ... }` object (anywhere after `clearRedemption,`).

- [ ] **Step 7: Thread through `pos-system.tsx`**

Add `isResellerSale, setIsResellerSale, updateUnitPrice,` to the destructure of `usePOSSystem()`'s return value.

Add the same three props to the `<POSCartPanels ... />` call, e.g. immediately after `onEditPrescription={handleEditPrescription}`:

```tsx
        isResellerSale={isResellerSale}
        setIsResellerSale={setIsResellerSale}
        updateUnitPrice={updateUnitPrice}
```

- [ ] **Step 8: Type-check**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 9: Manual verification**

Run: `cd client && npm run dev`, open `/pos`, add an in-stock item to the cart. Confirm:
1. A "Reseller sale" toggle row appears above the cart list.
2. Turning it on makes the item's price into an editable number input showing "min ₦X" hint.
3. Typing a value below the original price snaps back to the original price on blur/change.
4. Typing a higher value updates both the line's displayed price and its subtotal.
5. Turning the toggle back off reverts the price to normal and hides the input.

- [ ] **Step 10: Commit**

```bash
git add client/components/pos/pos-cart-item.tsx client/components/pos/pos-cart.tsx client/components/pos/pos-cart-panels.tsx client/components/pos/pos-mobile-cart-wrapper.tsx client/components/pos/pos-mobile-cart-drawer.tsx client/lib/hooks/use-pos-system.ts client/components/pos/pos-system.tsx
git commit -m "feat: add Reseller Sale toggle and editable prices to POS cart UI"
```

---

## Task 5: Checkout — compute and persist commission

**Files:**
- Modify: `client/lib/hooks/use-pos-payment.ts`
- Modify: `client/components/pos/pos-system.tsx` (pass the two new props into `usePOSPayment`)
- Test: `client/__tests__/use-pos-payment-reseller-commission.test.ts`

**Interfaces:**
- Consumes: `CartItem.original_unit_price` (Task 3), `usePOSSystem`'s `isResellerSale` (Task 4), `storeProfile.reseller_commission_percentage` (Task 1).
- Produces: `sales.is_reseller_sale`, `sales.reseller_commission_percentage`, `sales.reseller_commission_amount` written at checkout.

- [ ] **Step 1: Write the failing test**

Create `client/__tests__/use-pos-payment-reseller-commission.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePOSPayment reseller commission", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let usePOSPayment: typeof import("@/lib/hooks/use-pos-payment").usePOSPayment;
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    usePOSPayment = (await import("@/lib/hooks/use-pos-payment")).usePOSPayment;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sale_items; DELETE FROM sales;`);
    core.setActiveStoreId(null);
    window.localStorage.setItem("dumos_user", JSON.stringify({ id: "user-1" }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  type PaymentProps = Parameters<typeof usePOSPayment>[0];

  function renderPayment(props: PaymentProps) {
    let hookResult!: ReturnType<typeof usePOSPayment>;
    function TestHost() {
      hookResult = usePOSPayment(props);
      return null;
    }
    act(() => {
      root.render(React.createElement(TestHost));
    });
    return { get: () => hookResult };
  }

  it("computes and stores commission as a % of the marked-up amount for a reseller sale", async () => {
    // One item marked up by 50 (100 -> 150), one left at normal price.
    const cartItem1 = {
      id: "p1", name: "Cement Bag", unit_price: 150, original_unit_price: 100,
      cost_price: 60, quantity: 1, subtotal: 150,
    } as any;
    const cartItem2 = {
      id: "p2", name: "Nails", unit_price: 20, original_unit_price: 20,
      cost_price: 10, quantity: 2, subtotal: 40,
    } as any;

    const handle = renderPayment({
      cart: [cartItem1, cartItem2],
      subtotal: 190,
      tax: 0,
      total: 190,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
      isResellerSale: true,
      resellerCommissionPercentage: 20,
    });

    act(() => handle.get().setAmountPaid("190"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    // Markup = (150-100)*1 + (20-20)*2 = 50. Commission = 50 * 20% = 10.
    const rows = db.exec(
      `SELECT is_reseller_sale, reseller_commission_percentage, reseller_commission_amount FROM sales`,
    );
    expect(rows[0].values[0]).toEqual([1, 20, 10]);
  });

  it("writes no commission fields when isResellerSale is false, even if prices differ from original", async () => {
    const cartItem = {
      id: "p1", name: "Cement Bag", unit_price: 150, original_unit_price: 100,
      cost_price: 60, quantity: 1, subtotal: 150,
    } as any;

    const handle = renderPayment({
      cart: [cartItem],
      subtotal: 150,
      tax: 0,
      total: 150,
      discount: 0,
      selectedCustomer: null,
      clearCart: () => {},
      refetchProducts: () => {},
      isResellerSale: false,
      resellerCommissionPercentage: 20,
    });

    act(() => handle.get().setAmountPaid("150"));
    await act(async () => {
      await handle.get().handlePayment();
    });

    const rows = db.exec(
      `SELECT is_reseller_sale, reseller_commission_amount FROM sales`,
    );
    expect(rows[0].values[0]).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/use-pos-payment-reseller-commission.test.ts`
Expected: FAIL — commission columns are `0`/absent for the reseller case (props not yet consumed).

- [ ] **Step 3: Implement in `use-pos-payment.ts`**

Add to `UsePOSPaymentProps`, immediately after `canUseLoyaltyProgram?: boolean;`:

```ts
  isResellerSale?: boolean;
  /** Store-wide % of the markup remitted to the reseller - snapshotted onto
   * the sale at checkout time, never recalculated later. */
  resellerCommissionPercentage?: number;
```

Add to the function's destructured parameters, with defaults:

```ts
  isResellerSale = false,
  resellerCommissionPercentage = 0,
```

Inside `handlePayment`, right before the `const saleId = await insert("sales", {` call, compute the markup and commission:

```ts
      // Markup is clamped to >= 0 by construction (updateUnitPrice never
      // lets unit_price go below original_unit_price), but Math.max here is
      // a second layer of defense, not the only one.
      const resellerMarkup = isResellerSale
        ? cart.reduce(
            (sum, item) =>
              sum + Math.max(0, item.unit_price - item.original_unit_price) * item.quantity,
            0,
          )
        : 0;
      const resellerCommissionAmount = isResellerSale
        ? resellerMarkup * (resellerCommissionPercentage / 100)
        : 0;
```

Inside the `insert("sales", { ... })` call, add three fields immediately after `prescription_id: dispensedRxId || null,`:

```ts
        prescription_id: dispensedRxId || null,
        is_reseller_sale: isResellerSale ? 1 : 0,
        reseller_commission_percentage: isResellerSale ? resellerCommissionPercentage : 0,
        reseller_commission_amount: resellerCommissionAmount,
```

- [ ] **Step 4: Wire the two new props from `pos-system.tsx`**

In `pos-system.tsx`, find the `usePOSPayment({ ... })` call (via the destructure at the top of the file that pulls it from `usePOSSystem()` — actually this call lives inside `use-pos-system.ts`, already edited in Task 4's Step 6/7 by destructuring `isResellerSale` from `usePOSCart`). Now pass it into `usePOSPayment` there too: in `client/lib/hooks/use-pos-system.ts`, find the `usePOSPayment({ ... })` call and add, immediately after `canUseLoyaltyProgram,`:

```ts
    isResellerSale,
    resellerCommissionPercentage: storeProfile?.reseller_commission_percentage ?? 0,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/use-pos-payment-reseller-commission.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Type-check and full test suite**

Run: `cd client && npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Manual verification**

Run: `cd client && npm run dev`. In Settings, set Reseller Commission to 20%. In POS, add an item, turn on "Reseller sale", raise its price by ₦100, complete a cash checkout. Confirm:
1. The printed/previewed receipt shows the marked-up price with no reseller labeling anywhere.
2. Open the sale from Recent Sales — nothing looks different from a normal sale.

- [ ] **Step 8: Commit**

```bash
git add client/lib/hooks/use-pos-payment.ts client/lib/hooks/use-pos-system.ts client/__tests__/use-pos-payment-reseller-commission.test.ts
git commit -m "feat: compute and persist reseller commission at checkout"
```

---

## Task 6: Redemption queries

**Files:**
- Modify: `client/lib/db/queries/sales.ts`
- Modify: `client/lib/db/audit-actions.ts`
- Test: `client/__tests__/reseller-commission-queries.test.ts`

**Interfaces:**
- Produces: `getSaleByTransactionNumber(transactionNumber: string): Promise<SaleWithDetails | null>`, `getPendingResellerCommissionTotal(): Promise<number>`. `AUDIT_ACTIONS.RESELLER_COMMISSION_REDEEMED`.

- [ ] **Step 1: Write the failing test**

Create `client/__tests__/reseller-commission-queries.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("reseller commission queries", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getSaleByTransactionNumber: typeof import("@/lib/db/queries/sales").getSaleByTransactionNumber;
  let getPendingResellerCommissionTotal: typeof import("@/lib/db/queries/sales").getPendingResellerCommissionTotal;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const sales = await import("@/lib/db/queries/sales");
    getSaleByTransactionNumber = sales.getSaleByTransactionNumber;
    getPendingResellerCommissionTotal = sales.getPendingResellerCommissionTotal;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales;`);
    core.setActiveStoreId(null);
  });

  it("finds a sale by its exact transaction number", async () => {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount) VALUES ('s1', 'TXN123', 100, 100)`,
    );
    const found = await getSaleByTransactionNumber("TXN123");
    expect(found?.id).toBe("s1");

    const notFound = await getSaleByTransactionNumber("NOPE");
    expect(notFound).toBeNull();
  });

  it("sums only unredeemed reseller commissions", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed)
      VALUES
        ('s1', 'TXN1', 100, 100, 1, 30, 0),
        ('s2', 'TXN2', 100, 100, 1, 50, 1),
        ('s3', 'TXN3', 100, 100, 0, 0, 0),
        ('s4', 'TXN4', 100, 100, 1, 70, 0)
    `);
    const total = await getPendingResellerCommissionTotal();
    expect(total).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/reseller-commission-queries.test.ts`
Expected: FAIL — `getSaleByTransactionNumber is not a function` (etc.)

- [ ] **Step 3: Implement in `sales.ts`**

Add, right after `getSaleById`:

```ts
export async function getSaleByTransactionNumber(transactionNumber: string) {
  const rows = await query<SaleWithDetails>(
    `SELECT
      s.*,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
      (SELECT SUM(quantity) FROM sale_items si WHERE si.sale_id = s.id AND (si._deleted = 0 OR si._deleted IS NULL)) as item_count
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     WHERE s.transaction_number = ? AND s._deleted = 0`,
    [transactionNumber]
  );
  return rows[0] || null;
}

export async function getPendingResellerCommissionTotal() {
  const storeId = getActiveStoreId();
  const rows = await query<{ total: number | null }>(
    `SELECT SUM(reseller_commission_amount) as total FROM sales
     WHERE is_reseller_sale = 1 AND reseller_commission_redeemed = 0 AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  return rows[0]?.total || 0;
}
```

- [ ] **Step 4: Add the audit action**

In `client/lib/db/audit-actions.ts`, add to the `AUDIT_ACTIONS` object, immediately after `RECEIVE_PO: "RECEIVE_PO",`:

```ts
  RESELLER_COMMISSION_REDEEMED: "RESELLER_COMMISSION_REDEEMED",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/reseller-commission-queries.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Type-check**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add client/lib/db/queries/sales.ts client/lib/db/audit-actions.ts client/__tests__/reseller-commission-queries.test.ts
git commit -m "feat: add reseller commission lookup and pending-total queries"
```

---

## Task 7: Redemption mutation

**Files:**
- Create: `client/lib/hooks/use-redeem-reseller-commission-mutation.ts`
- Test: `client/__tests__/redeem-reseller-commission-mutation.test.ts`

**Interfaces:**
- Consumes: `getSaleByTransactionNumber` (Task 6), `transaction`/`update` from `@/lib/db/local-database`, `AUDIT_ACTIONS.RESELLER_COMMISSION_REDEEMED` (Task 6).
- Produces: `useRedeemResellerCommissionMutation()` — a TanStack Query mutation whose `mutationFn` accepts `{ saleId: string; userId?: string }` and throws if the sale isn't a reseller sale or is already redeemed.

- [ ] **Step 1: Write the failing test**

Create `client/__tests__/redeem-reseller-commission-mutation.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("useRedeemResellerCommissionMutation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let redeemResellerCommission: typeof import("@/lib/hooks/use-redeem-reseller-commission-mutation").redeemResellerCommission;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const mod = await import("@/lib/hooks/use-redeem-reseller-commission-mutation");
    redeemResellerCommission = mod.redeemResellerCommission;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM activity_log;`);
    core.setActiveStoreId(null);
  });

  it("marks an unredeemed reseller sale's commission as redeemed", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed)
      VALUES ('s1', 'TXN1', 100, 100, 1, 30, 0)
    `);

    await redeemResellerCommission({ saleId: "s1", userId: "user-1" });

    const rows = db.exec(
      `SELECT reseller_commission_redeemed, reseller_commission_redeemed_by FROM sales WHERE id = 's1'`,
    );
    expect(rows[0].values[0][0]).toBe(1);
    expect(rows[0].values[0][1]).toBe("user-1");
  });

  it("rejects redeeming a sale that isn't a reseller sale", async () => {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount) VALUES ('s2', 'TXN2', 100, 100)`,
    );
    await expect(
      redeemResellerCommission({ saleId: "s2", userId: "user-1" }),
    ).rejects.toThrow();
  });

  it("rejects redeeming a sale that's already redeemed", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed)
      VALUES ('s3', 'TXN3', 100, 100, 1, 30, 1)
    `);
    await expect(
      redeemResellerCommission({ saleId: "s3", userId: "user-1" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/redeem-reseller-commission-mutation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `client/lib/hooks/use-redeem-reseller-commission-mutation.ts`:

```ts
"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { query, update, transaction } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import type { Sale } from "@/lib/types/sale";

interface RedeemParams {
  saleId: string;
  userId?: string;
}

/**
 * Marks a reseller sale's commission as redeemed. Not a payout/ledger
 * mutation - there is no till/cash-drawer model in this app - just a status
 * flag + timestamp + who processed it, guarded so the same commission can't
 * be redeemed twice.
 */
export async function redeemResellerCommission({ saleId, userId }: RedeemParams) {
  await transaction(async () => {
    const rows = await query<Sale>(`SELECT * FROM sales WHERE id = ? AND _deleted = 0`, [saleId]);
    const sale = rows[0];
    if (!sale) throw new Error("Sale not found");
    if (!sale.is_reseller_sale) throw new Error("This sale has no reseller commission to redeem");
    if (sale.reseller_commission_redeemed) throw new Error("This commission has already been redeemed");

    await update(
      "sales",
      saleId,
      {
        reseller_commission_redeemed: 1,
        reseller_commission_redeemed_at: new Date().toISOString(),
        reseller_commission_redeemed_by: userId || null,
      },
      { action: AUDIT_ACTIONS.RESELLER_COMMISSION_REDEEMED },
    );
  });
}

export function useRedeemResellerCommissionMutation() {
  return useMutation({
    mutationFn: redeemResellerCommission,
    onSuccess: () => {
      toast.success("Commission marked as redeemed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to redeem commission");
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/redeem-reseller-commission-mutation.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/lib/hooks/use-redeem-reseller-commission-mutation.ts client/__tests__/redeem-reseller-commission-mutation.test.ts
git commit -m "feat: add redeem-reseller-commission mutation"
```

---

## Task 8: Redemption screen — new Reports tab

**Files:**
- Create: `client/components/reports/reseller-commission/reseller-commission-panel.tsx`
- Modify: `client/app/(dashboard)/reports/page.tsx`
- Modify: `client/app/(dashboard)/reports/reports-tab-nav.tsx`

**Interfaces:**
- Consumes: `getSaleByTransactionNumber`, `getPendingResellerCommissionTotal` (Task 6), `useRedeemResellerCommissionMutation` (Task 7).

- [ ] **Step 1: Build the panel component**

Create `client/components/reports/reseller-commission/reseller-commission-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { getSaleByTransactionNumber, getPendingResellerCommissionTotal } from "@/lib/db/queries/sales";
import { useRedeemResellerCommissionMutation } from "@/lib/hooks/use-redeem-reseller-commission-mutation";
import type { SaleWithDetails } from "@/lib/types/sale";

export function ResellerCommissionPanel() {
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [lookedUpSale, setLookedUpSale] = useState<SaleWithDetails | null | undefined>(undefined);
  const redeemMutation = useRedeemResellerCommissionMutation();

  const { data: pendingTotal } = useQuery({
    queryKey: ["resellerCommission", "pendingTotal"],
    queryFn: () => getPendingResellerCommissionTotal(),
  });

  const handleLookup = async () => {
    if (!search.trim()) return;
    const sale = await getSaleByTransactionNumber(search.trim());
    setLookedUpSale(sale);
  };

  const handleRedeem = async () => {
    if (!lookedUpSale) return;
    await redeemMutation.mutateAsync({ saleId: lookedUpSale.id, userId: user?.id });
    const refreshed = await getSaleByTransactionNumber(lookedUpSale.transaction_number);
    setLookedUpSale(refreshed);
    queryClient.invalidateQueries({ queryKey: ["resellerCommission", "pendingTotal"] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Pending reseller commissions
            </CardTitle>
            <p className="text-xl font-bold">
              {formatCurrency(pendingTotal || 0, currencyCode)}
            </p>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redeem commission</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter receipt / transaction number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            />
            <Button onClick={handleLookup}>
              <Search className="h-4 w-4 mr-2" />
              Look up
            </Button>
          </div>

          {lookedUpSale === null && (
            <p className="text-sm text-muted-foreground">No sale found for that receipt number.</p>
          )}

          {lookedUpSale && !lookedUpSale.is_reseller_sale && (
            <p className="text-sm text-muted-foreground">
              That sale (#{lookedUpSale.transaction_number}) isn&apos;t a reseller sale.
            </p>
          )}

          {lookedUpSale && !!lookedUpSale.is_reseller_sale && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sale total</span>
                <span className="font-medium">
                  {formatCurrency(lookedUpSale.total_amount, currencyCode)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Commission</span>
                <span className="font-medium">
                  {formatCurrency(lookedUpSale.reseller_commission_amount || 0, currencyCode)}
                </span>
              </div>
              {lookedUpSale.reseller_commission_redeemed ? (
                <p className="text-sm text-emerald-600 pt-2">
                  Already redeemed
                  {lookedUpSale.reseller_commission_redeemed_at &&
                    ` on ${formatDateToDDMMYYYY(lookedUpSale.reseller_commission_redeemed_at)}`}
                  .
                </p>
              ) : (
                <Button
                  className="w-full mt-2"
                  onClick={handleRedeem}
                  disabled={redeemMutation.isPending}
                >
                  Mark as Redeemed
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add the tab trigger in `reports-tab-nav.tsx`**

Add to `ReportsTabNavProps`: no change needed (reuses the existing `isAdmin` prop). Add a new `<TabsTrigger>`, immediately after the `analytics` one's closing `</TabsTrigger>` (still inside the `{isAdmin && (...)}` block, or as its own `{isAdmin && (...)}` block right after it):

```tsx
      {isAdmin && (
        <TabsTrigger value="reseller_commission" className={tabTriggerClass}>
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12V7H5a2 2 0 010-4h14v4" />
            <path d="M3 5v14a2 2 0 002 2h16v-5" />
            <path d="M18 12a2 2 0 000 4h4v-4z" />
          </svg>
          <ResponsiveTabLabel short="Reseller" long="Reseller Commission" />
        </TabsTrigger>
      )}
```

- [ ] **Step 3: Add the tab content in `reports/page.tsx`**

Add the import: `import { ResellerCommissionPanel } from "@/components/reports/reseller-commission/reseller-commission-panel";`

In the `useState` initializer and the `tabParam` `useEffect`, add `reseller_commission` alongside the existing `reports`/`analytics` admin-only checks:

```ts
  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam === "daily_close") return "daily_close";
    if (isAdmin && tabParam === "analytics") return "analytics";
    if (isAdmin && tabParam === "reports") return "reports";
    if (isAdmin && tabParam === "reseller_commission") return "reseller_commission";
    return defaultTab;
  });
```

```ts
  useEffect(() => {
    if (tabParam) {
      if (tabParam === "daily_close") setActiveTab("daily_close");
      else if (isAdmin && tabParam === "analytics") setActiveTab("analytics");
      else if (isAdmin && tabParam === "reports") setActiveTab("reports");
      else if (isAdmin && tabParam === "reseller_commission") setActiveTab("reseller_commission");
      else setActiveTab(defaultTab);
    }
  }, [tabParam, isAdmin, defaultTab]);
```

Add the tab panel, immediately after the `analytics` `<TabsContent>`'s closing tag:

```tsx
      {isAdmin && (
        <TabsContent value="reseller_commission" className="mt-0 border-none p-0">
          <ResellerCommissionPanel />
        </TabsContent>
      )}
```

- [ ] **Step 4: Type-check**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `cd client && npm run dev`, log in as an admin/owner, open `/reports?tab=reseller_commission`. Complete a reseller sale in POS first (Task 4/5's flow), note its receipt number, then:
1. Confirm the "Pending reseller commissions" card shows a non-zero total.
2. Type the receipt number into "Redeem commission", click "Look up". Confirm the sale total and commission amount show correctly.
3. Click "Mark as Redeemed". Confirm it now shows "Already redeemed" and the pending total card decreases by that amount.
4. Look up the same receipt number again — confirm it still shows "Already redeemed" (no redeem button).
5. Look up a normal (non-reseller) sale's receipt number — confirm it shows "isn't a reseller sale".
6. Look up a nonsense string — confirm "No sale found".

- [ ] **Step 6: Full test suite**

Run: `cd client && npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add client/components/reports/reseller-commission/reseller-commission-panel.tsx "client/app/(dashboard)/reports/page.tsx" "client/app/(dashboard)/reports/reports-tab-nav.tsx"
git commit -m "feat: add reseller commission redemption screen"
```
