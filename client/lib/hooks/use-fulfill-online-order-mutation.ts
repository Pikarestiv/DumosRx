import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { generateId, query, transaction } from "@/lib/db/core";
import { insert } from "@/lib/db/base-helpers";
import { getBatchesForProduct, recordSaleItemStock } from "@/lib/db/queries/inventory";
import type { OnlineOrder } from "@/lib/types/online-order";

interface FulfillOnlineOrderParams {
  order: OnlineOrder;
  storeId?: string;
  cashierId?: string;
}

// Deterministic from order.id (not generateShortId()'s randomness) so a retry after the server leg below fails can recognize its own prior loc…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-fulfill-online-order-mutation-ts-L14
function transactionNumberFor(order: OnlineOrder): string {
  return `ONL-${order.id}`;
}

export interface OnlineOrderStockGap {
  productId: string;
  productName: string;
  requested: number;
  available: number;
}

export function describeStockGap(gap: OnlineOrderStockGap, canSeeQuantities: boolean): string {
  const shortfall = canSeeQuantities ? `sellable ${gap.available}` : "not enough in stock";
  return `${gap.productName} — ordered ${gap.requested}, ${shortfall}`;
}

// Lines the store cannot actually dispense:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-fulfill-online-order-mutation-ts-L29
export async function findOnlineOrderStockGaps(order: OnlineOrder): Promise<OnlineOrderStockGap[]> {
  const gaps: OnlineOrderStockGap[] = [];
  for (const item of order.items) {
    const batches = await getBatchesForProduct(item.product_id);
    const available = batches.reduce((sum, b) => sum + Math.max(0, b.quantity), 0);
    if (available < item.quantity) {
      gaps.push({
        productId: item.product_id,
        productName: item.product?.name || "Unknown product",
        requested: item.quantity,
        available,
      });
    }
  }
  return gaps;
}

// Local-leg-first, and the local leg is one transaction.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-fulfill-online-order-mutation-L53
export function useFulfillOnlineOrderMutation() {
  return useMutation({
    mutationFn: async ({ order, storeId, cashierId }: FulfillOnlineOrderParams) => {
      const existing = await query<{ id: string }>(
        "SELECT id FROM sales WHERE transaction_number = ?",
        [transactionNumberFor(order)],
      );

      if (existing.length === 0) {
        const saleId = generateId();
        await transaction(() =>
          recordLocalOnlineSale({ order, storeId, cashierId, saleId }),
        );
      }

      await apiClient.fulfillOnlineOrder(order.id);
    },
  });
}

async function recordLocalOnlineSale({
  order,
  storeId,
  cashierId,
  saleId,
}: FulfillOnlineOrderParams & { saleId: string }): Promise<void> {
  // Written via the standard insert()/update() helpers, not raw execute(), so this gets audit logging and cache invalidation like every other mu…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-fulfill-online-order-mutation-ts-L76
  await insert("sales", {
    id: saleId,
    store_id: storeId,
    transaction_number: transactionNumberFor(order),
    // NOT NULL with no schema default (unlike tax_amount/discount_total, which default to 0) - online orders carry no separate tax/discount breakd…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-fulfill-online-order-mutation-ts-L93
    subtotal: order.total_amount,
    total_amount: order.total_amount,
    amount_paid: order.total_amount,
    change_given: 0,
    payment_method: order.payment_method,
    payment_status: "completed",
    user_id: cashierId,
    notes: order.customer_name ? `Online order - ${order.customer_name}` : "Online order",
  });

  // Insert each sale_items row and deduct/log the stock it consumed via the same recordSaleItemStock() used by POS checkout (see lib/db/queries/…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-fulfill-online-order-mutation-ts-L107
  for (const item of order.items) {
    // Online orders don't carry a per-item cost_price (unlike POS cart items, which resolve it from batches when added to cart), so approximate it…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-fulfill-online-order-mutation-ts-L118
    const batches = await getBatchesForProduct(item.product_id);
    const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0);
    const costPrice =
      totalQty > 0
        ? batches.reduce((sum, b) => sum + (b.cost_price || 0) * b.quantity, 0) / totalQty
        : batches[0]?.cost_price ?? 0;

    await recordSaleItemStock({
      saleId,
      productId: item.product_id,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      costPrice,
      subtotal: item.subtotal,
      cashierId: cashierId ?? null,
    });
  }
}
