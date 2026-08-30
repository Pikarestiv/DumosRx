import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { isFullyReturned } from "@/lib/utils/returns-calculations";
import { insert, update, transaction } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import { restoreReturnedStock } from "@/lib/db/queries/returns";
import { getCustomerBalance } from "@/lib/db/queries/customers";
import { updatePrescriptionStatus } from "@/lib/db/queries/prescriptions";
import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";

type ReturnableItem = SaleItemDetail & {
  returnQuantity: number;
  stock_batch_id?: string;
};

interface ProcessReturnParams {
  sale: SaleWithDetails;
  userId?: string;
  reason: string;
  totalRefund: number;
  itemsToReturn: ReturnableItem[];
  saleItems: SaleItemDetail[];
  currencyCode?: string;
}

export function useProcessReturnMutation() {
  return useMutation({
    mutationFn: async ({
      sale,
      userId,
      reason,
      totalRefund,
      itemsToReturn,
      saleItems,
    }: ProcessReturnParams) => {
      await transaction(async () => {
        // 1. Create return record
        const returnId = await insert(
          "returns",
          {
            sale_id: sale.id,
            user_id: userId || "system",
            reason: reason,
            total_refunded: totalRefund,
            created_at: new Date().toISOString(),
          },
          { action: AUDIT_ACTIONS.SALE_RETURN },
        );

        // 2. Create return items and restore stock
        const dumosUser = JSON.parse(localStorage.getItem("dumos_user") || "{}");
        for (const item of itemsToReturn) {
          await insert("return_items", {
            return_id: returnId,
            product_id: item.product_id,
            quantity: item.returnQuantity,
            unit_price: item.unit_price,
            subtotal: item.unit_price * item.returnQuantity,
          });

          await restoreReturnedStock({
            saleItemId: item.id,
            productId: item.product_id,
            costPrice: item.cost_price || 0,
            legacyStockBatchId: item.stock_batch_id,
            returnQuantity: item.returnQuantity,
            returnId,
            performedBy: dumosUser?.id,
          });
        }

        // 3. Mark sale as returned once every line item's full remaining
        // balance has been returned (across this and any prior returns),
        // not just when every original line item is touched in this one.
        const allItemsReturned = isFullyReturned(
          saleItems,
          itemsToReturn.map((i) => ({ id: i.id, returnQuantity: i.returnQuantity })),
        );
        await update("sales", sale.id, {
          payment_status: allItemsReturned ? "refunded" : "partially_refunded",
        });

        // A full return of a prescription-linked sale undoes the dispense.
        // Send it back to "ready" so it re-enters the dispense queue instead
        // of staying "completed" with no sale to show for it. Partial returns
        // (e.g. one med out of several) leave the prescription's status alone.
        if (sale.prescription_id && allItemsReturned) {
          await updatePrescriptionStatus(sale.prescription_id, "ready");
        }

        // If any part of this sale was paid on credit, returning goods must also
        // reduce what the customer owes, otherwise they're still on the hook
        // for items they gave back. Prorate by the credit share of the original
        // sale for mixed-payment sales; a plain "credit" sale is 100% credit.
        if (sale.customer_id) {
          let creditFraction = 0;
          if (sale.payment_method === "credit") {
            creditFraction = 1;
          } else if (sale.payment_method === "mixed" && sale.payment_details) {
            try {
              const details =
                typeof sale.payment_details === "string"
                  ? JSON.parse(sale.payment_details)
                  : sale.payment_details;
              const splits = Array.isArray(details) ? details : details?.splits;
              const creditAmount =
                splits?.find((s: { method: string; amount: number }) => s.method === "credit")
                  ?.amount || 0;
              creditFraction =
                sale.total_amount > 0 ? creditAmount / sale.total_amount : 0;
            } catch {
              // payment_details wasn't valid JSON, no credit portion to reduce
            }
          }

          if (creditFraction > 0) {
            const creditPortionOfRefund = totalRefund * creditFraction;
            const balanceRows = await getCustomerBalance(sale.customer_id);
            const currentBalance = balanceRows[0]?.balance || 0;
            await update("customers", sale.customer_id, {
              outstanding_balance: Math.max(
                0,
                currentBalance - creditPortionOfRefund,
              ),
            });
          }
        }
      });
    },
    onSuccess: (_data, { totalRefund, currencyCode }) => {
      toast.success(
        `Return processed. Refund amount: ${formatCurrency(totalRefund, currencyCode)}`,
      );
    },
    onError: (error) => {
      console.error("Return failed", error);
      toast.error("Failed to process return");
    },
  });
}
