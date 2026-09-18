"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { query, update, transaction } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import type { Sale } from "@/lib/types/sale";

type ClaimType = "commission" | "full_markup";

interface RedeemParams {
  saleId: string;
  userId?: string;
  /** "commission" (default) pays out the store's percentage cut of the
   * markup; "full_markup" pays out the entire markup instead - for a
   * reseller who priced a sale above normal but the store wants to let them
   * keep all of that extra margin rather than just their usual cut. */
  claimType?: ClaimType;
}

/**
 * Marks a reseller sale's commission as redeemed. Not a payout/ledger
 * mutation - there is no till/cash-drawer model in this app - just a status
 * flag + timestamp + who processed it, guarded so the same commission can't
 * be redeemed twice. Snapshots the actual amount paid out (commission or
 * full markup) so profit reporting can subtract exactly what left the
 * store, regardless of which option was chosen.
 */
export async function redeemResellerCommission({
  saleId,
  userId,
  claimType = "commission",
}: RedeemParams) {
  await transaction(async () => {
    const rows = await query<Sale>(`SELECT * FROM sales WHERE id = ? AND _deleted = 0`, [saleId]);
    const sale = rows[0];
    if (!sale) throw new Error("Sale not found");
    if (!sale.is_reseller_sale) throw new Error("This sale has no reseller commission to redeem");
    if (sale.reseller_commission_redeemed) throw new Error("This commission has already been redeemed");

    const redeemedAmount =
      claimType === "full_markup"
        ? sale.reseller_markup_amount || 0
        : sale.reseller_commission_amount || 0;

    await update(
      "sales",
      saleId,
      {
        reseller_commission_redeemed: 1,
        reseller_commission_redeemed_amount: redeemedAmount,
        reseller_commission_claim_type: claimType,
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
    onSuccess: (_, variables) => {
      toast.success(
        variables.claimType === "full_markup"
          ? "Full markup claimed"
          : "Commission redeemed",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to redeem commission");
    },
  });
}
