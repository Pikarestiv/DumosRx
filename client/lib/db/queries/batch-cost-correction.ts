import { query, update } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import { roundMoney } from "@/lib/utils/pos-calculations";

export const MAX_BATCH_COST_PRICE = 1_000_000_000;

export function isValidBatchCostPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_BATCH_COST_PRICE;
}

export async function correctBatchCostPrice(batchId: string, newCost: number): Promise<void> {
  if (!isValidBatchCostPrice(newCost)) {
    throw new Error("Enter a cost price of 0 or more.");
  }

  const [batch] = await query<{ product_id: string; batch_number: string | null; cost_price: number | null }>(
    "SELECT product_id, batch_number, cost_price FROM stock_batches WHERE id = ? AND _deleted = 0",
    [batchId],
  );
  if (!batch) throw new Error("This batch no longer exists.");

  const costPrice = roundMoney(newCost);
  if (batch.cost_price === costPrice) return;

  await update(
    "stock_batches",
    batchId,
    { cost_price: costPrice },
    {
      action: AUDIT_ACTIONS.BATCH_COST_CORRECTED,
      auditDetails: {
        product_id: batch.product_id,
        batch_number: batch.batch_number,
        previous_cost_price: batch.cost_price,
      },
    },
  );
}
