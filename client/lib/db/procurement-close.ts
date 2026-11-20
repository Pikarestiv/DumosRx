import { query, transaction, logAction } from "./core";
import { update } from "./base-helpers";
import { AUDIT_ACTIONS } from "./audit-actions";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { immediateLineAmount } from "@/components/procurement/po-line-item-math";
import { derivePaymentStatus, effectiveAmountPaid } from "@/components/procurement/po-payment";

export type CloseShortOutcome = "closed" | "not_found" | "not_partially_received";

interface CloseLine {
  quantity_received: number | null;
  units_per_bulk: number;
  unit_cost: number;
  cost_price_override: number | null;
}

export interface CloseShortPreview {
  receivedTotal: number;
  amountPaid: number;
  overpaidBy: number;
}

async function receivedTotalOf(orderId: string): Promise<number> {
  const lines = await query<CloseLine>(
    "SELECT quantity_received, units_per_bulk, unit_cost, cost_price_override FROM purchase_order_items WHERE po_id = ? AND _deleted = 0",
    [orderId],
  );
  return roundMoney(
    lines.reduce(
      (sum, line) => sum + roundMoney(immediateLineAmount({ ...line, bulk_quantity: Number(line.quantity_received) || 0 })),
      0,
    ),
  );
}

export async function getCloseShortPreview(orderId: string): Promise<CloseShortPreview | null> {
  const [order] = await query<{ payment_status: string | null; amount_paid: number | null; total_amount: number | null }>(
    "SELECT payment_status, amount_paid, total_amount FROM purchase_orders WHERE id = ? AND _deleted = 0",
    [orderId],
  );
  if (!order) return null;
  const receivedTotal = await receivedTotalOf(orderId);
  const amountPaid = effectiveAmountPaid(order);
  return { receivedTotal, amountPaid, overpaidBy: Math.max(0, roundMoney(amountPaid - receivedTotal)) };
}

export async function closePurchaseOrderShort(orderId: string): Promise<CloseShortOutcome> {
  return transaction(async () => {
    const [order] = await query<{ status: string; payment_status: string | null; amount_paid: number | null; total_amount: number | null }>(
      "SELECT status, payment_status, amount_paid, total_amount FROM purchase_orders WHERE id = ? AND _deleted = 0",
      [orderId],
    );
    if (!order) return "not_found";
    if (order.status !== "partially_received") return "not_partially_received";

    const receivedTotal = await receivedTotalOf(orderId);
    const amountPaid = effectiveAmountPaid(order);
    await update(
      "purchase_orders",
      orderId,
      {
        status: "closed",
        total_amount: receivedTotal,
        amount_paid: amountPaid,
        payment_status: derivePaymentStatus(amountPaid, receivedTotal),
      },
      { skipAudit: true },
    );
    await logAction(AUDIT_ACTIONS.PO_CLOSED_SHORT, "purchase_orders", orderId, {
      previous_total: order.total_amount,
      received_total: receivedTotal,
    });
    return "closed";
  });
}
