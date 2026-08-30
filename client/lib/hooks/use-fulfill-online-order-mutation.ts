import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { generateId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import { getStockBatchesForProduct } from "@/lib/db/queries/sales";
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

      // Deduct stock for each item
      for (const item of order.items) {
        await insert("sale_items", {
          sale_id: saleId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        });

        // Reduce stock in stock_batches (simple FIFO logic or just deduct from first available)
        // Here we just deduct from the latest active batch to keep it simple, since online order didn't pick batch.
        const batches = await getStockBatchesForProduct(item.product_id);

        let remainingToDeduct = item.quantity;
        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(batch.quantity, remainingToDeduct);
          await update("stock_batches", batch.id, {
            quantity: batch.quantity - deduct,
          });
          remainingToDeduct -= deduct;
        }
      }
    },
  });
}
