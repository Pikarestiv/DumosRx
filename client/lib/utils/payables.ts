import { addDays, format, parseISO } from "date-fns";

export type PayableDueState = "overdue" | "due_soon";

export const PAYABLE_DUE_SOON_DAYS = 3;

const UNPAYABLE_STATUSES = new Set(["draft", "pending", "cancelled"]);

interface PayableOrder {
  status: string;
  total_amount: number;
  amount_paid?: number | null;
  payment_status?: string | null;
  due_date?: string | null;
}

export function outstandingAmount(order: Pick<PayableOrder, "total_amount" | "amount_paid">): number {
  return Math.max(0, Number(order.total_amount) - Number(order.amount_paid ?? 0));
}

/** `today` is a local YYYY-MM-DD, the same shape `due_date` is stored in. */
export function getPayableDueState(order: PayableOrder, today: string): PayableDueState | null {
  if (!order.due_date || order.payment_status === "paid" || UNPAYABLE_STATUSES.has(order.status)) return null;
  if (outstandingAmount(order) <= 0) return null;
  const dueDate = order.due_date.slice(0, 10);
  if (dueDate < today) return "overdue";
  const dueSoonLimit = format(addDays(parseISO(today), PAYABLE_DUE_SOON_DAYS), "yyyy-MM-dd");
  return dueDate <= dueSoonLimit ? "due_soon" : null;
}
