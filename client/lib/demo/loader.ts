/**
 * Demo data loader — replays lib/demo/template.ts through the app's real
 * local-database create functions (the same ones the UI calls), so seeded
 * data gets the same batches/movements/sync-queue side effects as data a
 * real user would enter by hand. Only ever run against a store flagged
 * `is_demo` (enforced by the caller / UI gate, not re-checked here).
 */

import {
  createProduct,
  createSale,
  createUser,
  createPurchaseOrder,
  receivePurchaseOrder,
  createSupplier,
  updatePurchaseOrderStatus,
  getPurchaseOrderById,
  insert,
  update,
  query,
  generateId,
  getActiveStoreId,
} from "@/lib/db/local-database";
import { restoreReturnedStock } from "@/lib/db/queries/returns";
import {
  DEMO_SUPPLIER,
  DEMO_PRODUCTS,
  DEMO_RECEIVING_PLAN,
  DEMO_INFLIGHT_POS,
  DEMO_CUSTOMERS,
  DEMO_SALES,
  DEMO_EXPENSES,
  DEMO_STAFF,
} from "@/lib/demo/template";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysAgoDateOnly(days: number): string {
  return daysAgoIso(days).slice(0, 10);
}

export interface DemoSeedResult {
  ok: boolean;
  reason?: "not_empty" | "no_active_store" | "error";
  error?: string;
}

/** Cheap guard against accidentally double-seeding a store that already has
 * real/seeded data — the caller should surface this as a confirm dialog and
 * retry with `force: true` if the operator really wants to layer on more. */
export async function isStoreSeedable(): Promise<boolean> {
  const rows = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM products WHERE _deleted = 0",
  );
  return (rows[0]?.count || 0) === 0;
}

export async function runDemoSeed(
  currentUserId: string,
  options: { force?: boolean } = {},
): Promise<DemoSeedResult> {
  const storeId = getActiveStoreId();
  if (!storeId) {
    return { ok: false, reason: "no_active_store" };
  }

  if (!options.force && !(await isStoreSeedable())) {
    return { ok: false, reason: "not_empty" };
  }

  try {
    // 1. Supplier
    const supplierId = await createSupplier(DEMO_SUPPLIER);

    // 2. Products (category resolution/creation happens inside createProduct)
    const productIdByRef = new Map<string, string>();
    const productByRef = new Map<string, (typeof DEMO_PRODUCTS)[number]>();
    for (const product of DEMO_PRODUCTS) {
      const { ref, cost_price: _costPrice, category, ...payload } = product;
      const id = await createProduct({ ...payload, category_id: category });
      productIdByRef.set(ref, id);
      productByRef.set(ref, product);
    }

    // 3. Optional demo cashier (skip quietly if a store already has one from a prior seed run)
    let cashierId: string | null = null;
    const existingCashier = await query<{ id: string }>(
      "SELECT id FROM users WHERE username = ? AND store_id = ? AND _deleted = 0",
      [DEMO_STAFF.username, storeId],
    );
    if (existingCashier.length > 0) {
      cashierId = existingCashier[0].id;
    } else {
      cashierId = await createUser({ ...DEMO_STAFF, store_id: storeId });
    }

    // 4. Main purchase order: one per product, fully received with the
    // expiry/batch spread from DEMO_RECEIVING_PLAN.
    const mainPoItems = DEMO_PRODUCTS.map((product) => {
      const plan = DEMO_RECEIVING_PLAN[product.ref];
      const bulkCost = product.cost_price * product.units_per_bulk;
      return {
        product_id: productIdByRef.get(product.ref)!,
        product_name: product.name,
        bulk_unit: product.bulk_unit,
        bulk_quantity: plan.bulkQuantity,
        units_per_bulk: product.units_per_bulk,
        unit_cost: bulkCost,
        subtotal: bulkCost * plan.bulkQuantity,
      };
    });
    const mainPoTotal = mainPoItems.reduce((sum, i) => sum + i.subtotal, 0);
    const mainPoId = await createPurchaseOrder(
      supplierId,
      "Initial stock — full catalog restock",
      mainPoItems,
      "partial",
      Math.round(mainPoTotal * 0.35),
      daysAgoDateOnly(-16), // due 16 days from now (order was placed 14 days ago, 30-day terms)
    );

    const mainPo = await getPurchaseOrderById(mainPoId);
    const receivedItems = (mainPo?.items || []).map((item) => {
      const product = DEMO_PRODUCTS.find((p) => productIdByRef.get(p.ref) === item.product_id)!;
      const plan = DEMO_RECEIVING_PLAN[product.ref];
      return {
        po_item_id: item.id,
        lot_number: `${plan.batchSuffix}-${new Date().getFullYear()}`,
        expiry_date: daysAgoDateOnly(-plan.expiryOffsetDays),
        cost_price: product.cost_price,
      };
    });
    await receivePurchaseOrder(mainPoId, receivedItems);

    // Batch id per product, for linking sale items below (one batch per
    // product since this is the only PO received against them).
    const batchIdByProductRef = new Map<string, string>();
    for (const product of DEMO_PRODUCTS) {
      const productId = productIdByRef.get(product.ref)!;
      const rows = await query<{ id: string }>(
        "SELECT id FROM stock_batches WHERE product_id = ? ORDER BY created_at DESC LIMIT 1",
        [productId],
      );
      if (rows[0]) batchIdByProductRef.set(product.ref, rows[0].id);
    }

    // 5. In-flight POs (unreceived), showing procurement mid-pipeline
    for (const po of DEMO_INFLIGHT_POS) {
      const product = productByRef.get(po.productRef)!;
      const bulkCost = product.cost_price * product.units_per_bulk;
      const poId = await createPurchaseOrder(
        supplierId,
        `Restock — ${product.name}`,
        [
          {
            product_id: productIdByRef.get(po.productRef)!,
            product_name: product.name,
            bulk_unit: product.bulk_unit,
            bulk_quantity: po.bulkQuantity,
            units_per_bulk: product.units_per_bulk,
            unit_cost: bulkCost,
            subtotal: bulkCost * po.bulkQuantity,
          },
        ],
        "unpaid",
        0,
        daysAgoDateOnly(-30),
      );
      if (po.status === "sent") {
        await updatePurchaseOrderStatus(poId, "sent");
      }
    }

    // 6. Customers
    const customerIdByRef = new Map<string, string>();
    for (const customer of DEMO_CUSTOMERS) {
      const { ref, ...payload } = customer;
      const id = await insert("customers", payload);
      customerIdByRef.set(ref, id);
    }

    // 7. Sales
    let txnCounter = 1;
    for (const sale of DEMO_SALES) {
      const items = sale.items.map((line) => {
        const product = productByRef.get(line.productRef)!;
        const totalPrice = product.selling_price * line.quantity;
        return {
          product_id: productIdByRef.get(line.productRef)!,
          stock_batch_id: batchIdByProductRef.get(line.productRef) || undefined,
          quantity: line.quantity,
          unit_price: product.selling_price,
          cost_price: product.cost_price,
          discount_amount: 0,
          total_price: totalPrice,
        };
      });
      const subtotal = items.reduce((sum, i) => sum + i.total_price, 0);
      const taxAmount = Math.round((subtotal * sale.taxPercentage) / 100);
      const totalAmount = subtotal + taxAmount;
      const isPending = sale.paymentStatus === "pending";
      const customerId = sale.customerRef ? customerIdByRef.get(sale.customerRef) : null;
      const points = !isPending && customerId ? Math.floor(totalAmount / 100) : 0;

      const saleId = await createSale(
        {
          transaction_number: `DEMO-${Date.now()}-${txnCounter++}`,
          customer_id: customerId,
          user_id: cashierId || currentUserId,
          subtotal,
          tax_amount: taxAmount,
          discount_total: 0,
          total_amount: totalAmount,
          amount_paid: isPending ? 0 : totalAmount,
          change_given: 0,
          payment_method: sale.paymentMethod,
          payment_status: isPending ? "pending" : "completed",
          transaction_date: daysAgoIso(sale.dayOffset),
          created_at: daysAgoIso(sale.dayOffset),
          tax_percentage: sale.taxPercentage,
          discount_percentage: 0,
          discount_amount: 0,
          discount_type: "fixed",
          points_earned: points,
          points_redeemed: 0,
          receipt_printed: 1,
        },
        items,
      );

      if (points > 0 && customerId) {
        await update("customers", customerId, {
          loyalty_points:
            (DEMO_CUSTOMERS.find((c) => c.ref === sale.customerRef)?.loyalty_points || 0) + points,
        });
      }

      // createSale() doesn't record which batch(es) funded each sale_item —
      // the POS UI does that separately. Fill it in here so returns (below)
      // can restore stock to the right batch via restoreReturnedStock().
      const insertedItems = await query<{ id: string; product_id: string; quantity: number }>(
        "SELECT id, product_id, quantity FROM sale_items WHERE sale_id = ?",
        [saleId],
      );
      for (const item of insertedItems) {
        const batchId = [...batchIdByProductRef.entries()].find(
          ([ref]) => productIdByRef.get(ref) === item.product_id,
        )?.[1];
        if (batchId) {
          await insert("sale_item_batches", {
            sale_item_id: item.id,
            stock_batch_id: batchId,
            quantity: item.quantity,
          });
        }
      }

      if (sale.refund) {
        const returnId = generateId();
        const refundTotal = items.reduce((sum, i) => sum + i.total_price, 0);
        await insert("returns", {
          id: returnId,
          sale_id: saleId,
          user_id: cashierId || currentUserId,
          reason: "Customer changed mind",
          total_refunded: refundTotal,
        });
        for (const item of insertedItems) {
          const line = items.find((i) => i.product_id === item.product_id)!;
          await insert("return_items", {
            id: generateId(),
            return_id: returnId,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: line.unit_price,
            subtotal: line.total_price,
          });
          await restoreReturnedStock({
            saleItemId: item.id,
            productId: item.product_id,
            costPrice: line.cost_price,
            returnQuantity: item.quantity,
            returnId,
            performedBy: cashierId || currentUserId,
          });
        }
        await update("sales", saleId, { payment_status: "refunded" });
      }
    }

    // 8. Expenses (recurring costs use covers_months so a lump-sum payment
    // like annual rent is smoothed across the months it actually covers,
    // instead of reading as a single month's loss).
    for (const expense of DEMO_EXPENSES) {
      await insert("expenses", {
        user_id: currentUserId,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        date: daysAgoDateOnly(expense.dayOffset),
        payment_method: expense.paymentMethod,
        covers_months: expense.coversMonths || null,
      });
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
