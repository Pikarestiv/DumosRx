import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import { getLocalTodayDate } from "@/lib/utils";
import { getPayableDueState, outstandingAmount } from "@/lib/utils/payables";

export interface PayablesDueSummary {
  overdueCount: number;
  overdueTotal: number;
  dueSoonCount: number;
  dueSoonTotal: number;
}

interface PayableRow {
  status: string;
  total_amount: number;
  amount_paid: number | null;
  payment_status: string | null;
  due_date: string;
}

export async function getPayablesDueSummary(): Promise<PayablesDueSummary> {
  const storeId = getActiveStoreId();
  const rows = await query<PayableRow>(
    `SELECT status, total_amount, amount_paid, payment_status, due_date
     FROM purchase_orders
     WHERE _deleted = 0 AND due_date IS NOT NULL AND due_date != ''
       AND COALESCE(payment_status, 'unpaid') != 'paid'${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  const today = getLocalTodayDate();
  const summary: PayablesDueSummary = { overdueCount: 0, overdueTotal: 0, dueSoonCount: 0, dueSoonTotal: 0 };
  for (const row of rows) {
    const state = getPayableDueState(row, today);
    if (state === "overdue") {
      summary.overdueCount += 1;
      summary.overdueTotal += outstandingAmount(row);
    } else if (state === "due_soon") {
      summary.dueSoonCount += 1;
      summary.dueSoonTotal += outstandingAmount(row);
    }
  }
  return summary;
}
