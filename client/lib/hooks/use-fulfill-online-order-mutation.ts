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

// Deterministic from order.id (not generateShortId()'s randomness) so a retry
// after the server leg below fails can recognize its own prior local write
// instead of creating a second one - see the isPending/isError note above the
// mutation. Fits transaction_number's plain string column; no schema change.
function transactionNumberFor(order: OnlineOrder): string {
  return `ONL-${order.id}`;
}

/**
 * Local-leg-first, and the local leg is one transaction. The server call used
 * to come first, so any failure writing the sale or deducting stock left the
 * order server-side `fulfilled` (and hidden from the POS's actionable list)
 * with no sale recorded and stock never deducted — silently unrecoverable
 * through the UI. This way a server failure surfaces as a retryable error with
 * the local books already correct and already queued in `_sync_queue`, and the
 * server leg is safe to retry because markFulfilled now rejects a non-`pending`
 * order.
 *
 * That inversion creates its own retry hazard the other way round: if the
 * *local* leg already succeeded and only the server call failed, the order is
 * still `pending` server-side (so the modal still offers "Fulfill" on it), and
 * a second click must not record a second sale / deduct stock twice. The
 * transactionNumberFor() lookup below is what makes a retry a no-op on the
 * local leg rather than a duplicate. See docs/FIXED_BUGS.md (SF-P2-5/SF-P3-6).
 */
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
  // Written via the standard insert()/update() helpers, not raw execute(), so
  // this gets audit logging and cache invalidation like every other mutation.
  //
  // sales has no receipt_number/status/customer_name columns (those
  // belong to other tables) - this insert previously wrote them anyway,
  // which throws a "no such column" error at the DB layer on every
  // fulfillment, and never set transaction_number (UNIQUE NOT NULL)
  // at all. transaction_number here also can't reuse order.id.split
  // ("-")[0] alone - not unique by construction, and colliding with
  // POS-issued numbers is possible since both share the same id space.
  // customer_name has nowhere to go on `sales` (only customer_id, and
  // online orders don't carry a matched customer record) - recorded in
  // notes instead so it's still visible on the transaction.
  await insert("sales", {
    id: saleId,
    store_id: storeId,
    transaction_number: transactionNumberFor(order),
    // NOT NULL with no schema default (unlike tax_amount/discount_total,
    // which default to 0) - online orders carry no separate tax/discount
    // breakdown, so this mirrors amount_paid below in treating the order
    // total as the whole of it.
    subtotal: order.total_amount,
    total_amount: order.total_amount,
    amount_paid: order.total_amount,
    change_given: 0,
    payment_method: order.payment_method,
    payment_status: "paid",
    cashier_id: cashierId,
    notes: order.customer_name ? `Online order - ${order.customer_name}` : "Online order",
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
}
