"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { query, update, transaction } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import type { Sale } from "@/lib/types/sale";

interface RedeemParams {
  saleId: string;
  userId?: string;
}

/**
 * Marks a reseller sale's commission as redeemed. Not a payout/ledger
 * mutation - there is no till/cash-drawer model in this app - just a status
 * flag + timestamp + who processed it, guarded so the same commission can't
 * be redeemed twice.
 */
export async function redeemResellerCommission({ saleId, userId }: RedeemParams) {
  await transaction(async () => {
    const rows = await query<Sale>(`SELECT * FROM sales WHERE id = ? AND _deleted = 0`, [saleId]);
    const sale = rows[0];
    if (!sale) throw new Error("Sale not found");
    if (!sale.is_reseller_sale) throw new Error("This sale has no reseller commission to redeem");
    if (sale.reseller_commission_redeemed) throw new Error("This commission has already been redeemed");

    await update(
      "sales",
      saleId,
      {
        reseller_commission_redeemed: 1,
        reseller_commission_redeemed_at: new Date().toISOString(),
        reseller_commission_redeemed_by: userId || null,
      },
      { action: AUDIT_ACTIONS.RESELLER_COMMISSION_REDEEMED },
    );
  });
}

export function useRedeemResellerCommissionMutation() {
  return useMutation({
    mutationFn: redeemResellerCommission,
    onSuccess: () => {
      toast.success("Commission marked as redeemed");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to redeem commission");
    },
  });
}
