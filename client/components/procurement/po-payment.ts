import { roundMoney } from "@/lib/utils/pos-calculations";
import { getValidatedAmountPaid } from "./po-line-item-math";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export function derivePaymentStatus(amountPaid: number, total: number): PaymentStatus {
  const paid = Number.isFinite(amountPaid) ? Math.max(0, amountPaid) : 0;
  if (paid <= 0) return "unpaid";
  return paid >= total ? "paid" : "partial";
}

// Builds before 2026-11-19 could store "paid" with amount_paid left at 0; that row still means fully paid.
export function effectiveAmountPaid(order: { payment_status?: string | null; amount_paid?: number | null; total_amount?: number | null }): number {
  const stored = Math.max(0, Number(order.amount_paid) || 0);
  if (order.payment_status === "paid") return Math.max(stored, Number(order.total_amount) || 0);
  return stored;
}

export function amountPaidForSave(draft: { paidInFull: boolean; amountPaid: string }, total: number): number {
  if (draft.paidInFull) return roundMoney(total);
  return getValidatedAmountPaid(draft.amountPaid, total);
}
