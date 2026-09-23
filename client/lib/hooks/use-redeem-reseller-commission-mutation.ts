"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { query, update, transaction } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import type { Sale } from "@/lib/types/sale";

type ClaimType = "commission" | "store_claim";

interface RedeemParams {
  saleId: string;
  userId?: string;
  /** "commission" (default) pays the reseller their usual percentage cut of
   * the markup. "store_claim" pays the reseller nothing - the store keeps
   * the entire markup as its own profit instead. This covers a store
   * sometimes pricing a sale above normal for a particular customer (the
   * reseller toggle used purely as a price-override mechanism) without
   * intending to pay anyone a commission on it. */
  claimType?: ClaimType;
}

/**
 * Settles a reseller sale's commission - either paid out to the reseller, or
 * kept by the store. Not a payout/ledger mutation - there is no till/cash-
 * drawer model in this app - just a status flag + timestamp + who processed
 * it, guarded so the same commission can't be settled twice. Snapshots the
 * amount that actually left the store (0 when the store claims the markup
 * for itself) so profit reporting can subtract exactly that.
 */
export async function redeemResellerCommission({
  saleId,
  userId,
  claimType = "commission",
}: RedeemParams) {
  return await transaction(async () => {
    const rows = await query<Sale>(`SELECT * FROM sales WHERE id = ? AND _deleted = 0`, [saleId]);
    const sale = rows[0];
    if (!sale) throw new Error("Sale not found");
    if (!sale.is_reseller_sale) throw new Error("This sale has no reseller commission to redeem");
    if (sale.reseller_commission_redeemed) throw new Error("This commission has already been redeemed");

    const redeemedAmount =
      claimType === "store_claim" ? 0 : sale.reseller_commission_amount || 0;

    const patch = {
      reseller_commission_redeemed: 1,
      reseller_commission_redeemed_amount: redeemedAmount,
      reseller_commission_claim_type: claimType,
      reseller_commission_redeemed_at: new Date().toISOString(),
      reseller_commission_redeemed_by: userId || null,
    };

    await update("sales", saleId, patch, {
      action: AUDIT_ACTIONS.RESELLER_COMMISSION_REDEEMED,
    });

    return patch;
  });
}

export function useRedeemResellerCommissionMutation() {
  return useMutation({
    mutationFn: redeemResellerCommission,
    onSuccess: (_, variables) => {
      toast.success(
        variables.claimType === "store_claim"
          ? "Markup kept as store profit"
          : "Commission redeemed",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to redeem commission");
    },
  });
}
