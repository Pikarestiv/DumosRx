import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { isFullyReturned } from "@/lib/utils/returns-calculations";
import { insert, update, query, transaction } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import { restoreReturnedStock } from "@/lib/db/queries/returns";
import { getCustomerBalance, getCustomerLoyaltyPoints } from "@/lib/db/queries/customers";
import { updatePrescriptionStatus } from "@/lib/db/queries/prescriptions";
import { calculateLoyaltyPointsAfterSale, calculateReturnPointsAdjustment } from "@/lib/utils/loyalty-calculator";
import type { Sale, SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";
import { getStoredUser } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { resellerPatchAfterReturn } from "@/lib/utils/reseller-return-adjustment";

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
      // returns.user_id is a constrained foreign key server-side, so a sentinel written here only fails much later and somewhere else:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-process-return-mutation-ts-L40
      if (!userId) {
        throw new Error("Cannot process a return without a signed-in user");
      }

      await transaction(async () => {
        // 1. Create return record
        const returnId = await insert(
          "returns",
          {
            sale_id: sale.id,
            user_id: userId,
            reason: reason,
            total_refunded: totalRefund,
            created_at: new Date().toISOString(),
          },
          { action: AUDIT_ACTIONS.SALE_RETURN },
        );

        // 2. Create return items and restore stock
        const dumosUser = getStoredUser() ?? {};
        for (const item of itemsToReturn) {
          await insert("return_items", {
            return_id: returnId,
            product_id: item.product_id,
            quantity: item.returnQuantity,
            unit_price: item.unit_price,
            subtotal: roundMoney(item.unit_price * item.returnQuantity),
          });

          await restoreReturnedStock({
            saleItemId: item.id,
            productId: item.product_id,
            costPrice: item.cost_price || 0,
            legacyStockBatchId: item.stock_batch_id,
            returnQuantity: item.returnQuantity,
            returnId,
            saleId: sale.id,
            performedBy: dumosUser?.id,
          });
        }

        // 3. Mark sale as returned once every line item's full remaining balance has been returned (across this and any prior returns), not just when…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-process-return-mutation-ts-L87
        const allItemsReturned = isFullyReturned(
          saleItems,
          itemsToReturn.map((i) => ({ id: i.id, returnQuantity: i.returnQuantity })),
        );
        const [storedSale] = await query<Sale>(`SELECT * FROM sales WHERE id = ?`, [sale.id]);
        const resellerPatch = resellerPatchAfterReturn(
          storedSale ?? sale,
          saleItems,
          itemsToReturn.map((i) => ({ id: i.id, returnQuantity: i.returnQuantity })),
        );
        await update("sales", sale.id, {
          payment_status: allItemsReturned ? "refunded" : "partially_refunded",
          ...resellerPatch,
        });

        // A full return of a prescription-linked sale undoes the dispense.
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-process-return-mutation-ts-L98
        if (sale.prescription_id && allItemsReturned) {
          await updatePrescriptionStatus(sale.prescription_id, "ready");
        }

        // If any part of this sale was paid on credit, returning goods must also reduce what the customer owes, otherwise they're still on the hook fo…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-process-return-mutation-ts-L106
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

            // The credit portion of a return is debt forgiveness, not a collection event, but applyCreditPaymentFIFO() computes what a sale still owes as…
            // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-process-return-mutation-ts-L134
            const owed = Math.max(
              0,
              (sale.total_amount || 0) - (sale.amount_paid || 0),
            );
            // Cap the debt forgiveness at what this sale actually still owes - crediting the customer's outstanding_balance by the full creditPortionOfRef…
            // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-process-return-mutation-ts-L147
            const forgiven = Math.min(owed, creditPortionOfRefund);

            const balanceRows = await getCustomerBalance(sale.customer_id);
            const currentBalance = balanceRows[0]?.balance || 0;
            await update("customers", sale.customer_id, {
              outstanding_balance: roundMoney(Math.max(0, currentBalance - forgiven)),
            });

            if (forgiven > 0) {
              await update("sales", sale.id, {
                amount_paid: roundMoney((sale.amount_paid || 0) + forgiven),
              });
            }
          }

          // A return must also undo its proportional share of whatever this sale did to the customer's points balance — otherwise a customer keeps point…
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-process-return-mutation-ts-L167
          const itemsSubtotal = itemsToReturn.reduce(
            (sum, i) => sum + (i.unit_price || 0) * i.returnQuantity,
            0,
          );
          const returnShare = sale.subtotal > 0 ? itemsSubtotal / sale.subtotal : 0;
          const { clawback: pointsEarnedClawback, refund: pointsRedeemedRefund } =
            calculateReturnPointsAdjustment(
              sale.points_earned || 0,
              sale.points_redeemed || 0,
              returnShare,
            );

          if (pointsEarnedClawback > 0 || pointsRedeemedRefund > 0) {
            const pointsRows = await getCustomerLoyaltyPoints(sale.customer_id);
            const currentPoints = pointsRows[0]?.loyalty_points || 0;
            await update("customers", sale.customer_id, {
              loyalty_points: calculateLoyaltyPointsAfterSale(
                currentPoints,
                pointsRedeemedRefund,
                pointsEarnedClawback,
              ),
            });

            if (pointsEarnedClawback > 0) {
              await insert("loyalty_transactions", {
                customer_id: sale.customer_id,
                points: -pointsEarnedClawback,
                type: "earned",
                transaction_id: returnId,
                created_at: new Date().toISOString(),
              });
            }
            if (pointsRedeemedRefund > 0) {
              await insert("loyalty_transactions", {
                customer_id: sale.customer_id,
                points: pointsRedeemedRefund,
                type: "redeemed",
                transaction_id: returnId,
                created_at: new Date().toISOString(),
              });
            }
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
