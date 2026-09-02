import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { generateId } from "@/lib/db/core";
import { insert } from "@/lib/db/base-helpers";
import { getBatchesForProduct, recordSaleItemStock } from "@/lib/db/queries/inventory";
import type { OnlineOrder } from "@/lib/types/online-order";

interface FulfillOnlineOrderParams {
  order: OnlineOrder;
  storeId?: string;
  cashierId?: string;
}

export function useFulfillOnlineOrderMutation() {
  return useMutation({
    mutationFn: async ({ order, storeId, cashierId }: FulfillOnlineOrderParams) => {
      // 1. Mark as fulfilled on server
      await apiClient.fulfillOnlineOrder(order.id);

      // 2. Record locally in SQLite (as an online sale), via the standard
      // insert()/update() helpers, not raw execute(), so this gets audit
      // logging and cache invalidation like every other mutation.
      const saleId = generateId();

      await insert("sales", {
        id: saleId,
        store_id: storeId,
        total_amount: order.total_amount,
        amount_paid: order.total_amount,
        change_given: 0,
        payment_method: order.payment_method,
        payment_status: "paid",
        receipt_number: `ONL-${order.id.split("-")[0]}`,
        cashier_id: cashierId,
        customer_name: order.customer_name,
        status: "completed",
      });

      // Insert each sale_items row and deduct/log the stock it consumed via
      // the same recordSaleItemStock() used by POS checkout (see
      // lib/db/queries/inventory.ts), instead of this hook's own
      // getStockBatchesForProduct/remainingToDeduct loop. That duplicated
      // loop had the identical FEFO-fallback bug fixed there (a batch that
      // only partially covers the order line silently left the rest
      // undeducted) and, worse, never wrote stock_movements or
      // sale_item_batches rows at all — a fulfilled online order left zero
      // trace in the stock ledger regardless of depletion level. Routing
      // through the shared helper closes both gaps in one place.
      for (const item of order.items) {
        // Online orders don't carry a per-item cost_price (unlike POS cart
        // items, which resolve it from batches when added to cart), so
        // approximate it here as the quantity-weighted average cost across
        // the product's active batches — the same average recordSaleItemStock's
        // caller convention (see use-pos-payment.ts) expects.
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
    },
  });
}
