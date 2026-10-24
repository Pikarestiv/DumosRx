"use client";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { SaleWithDetails } from "@/lib/types/sale";

interface ResellerMarkupPanelProps {
  sale: SaleWithDetails;
  currencyCode?: string;
  isRedeeming: boolean;
  onRedeem: (claimType: "commission" | "store_claim") => void;
}

export function ResellerMarkupPanel({
  sale,
  currencyCode,
  isRedeeming,
  onRedeem,
}: ResellerMarkupPanelProps) {
  return (
    <div
      className={
        sale.markup_type === "store"
          ? "mt-3 p-3 sm:p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 rounded-lg space-y-2"
          : "mt-3 p-3 sm:p-4 border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900 rounded-lg space-y-2"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={
            sale.markup_type === "store"
              ? "text-sm font-medium text-blue-700 dark:text-blue-300"
              : "text-sm font-medium text-violet-700 dark:text-violet-300"
          }
        >
          {sale.markup_type === "store" ? "Store markup" : "Reseller markup"}:{" "}
          {formatCurrency(sale.reseller_markup_amount || 0, currencyCode)}
        </p>
        {sale.reseller_commission_redeemed ? (
          <span className="text-xs font-medium text-emerald-600">
            {sale.reseller_commission_claim_type === "store_claim"
              ? "Store kept markup"
              : "Commission redeemed"}
            {sale.reseller_commission_redeemed_at &&
              ` on ${formatDateToDDMMYYYY(sale.reseller_commission_redeemed_at)}`}
            {(sale.reseller_commission_owed_back ?? 0) > 0 &&
              ` · ${formatCurrency(sale.reseller_commission_owed_back ?? 0, currencyCode)} owed back by the reseller`}
          </span>
        ) : (
          <span className="text-xs font-medium text-amber-600">
            Not yet redeemed
          </span>
        )}
      </div>
      {!sale.reseller_commission_redeemed && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRedeem("commission")}
            disabled={isRedeeming}
          >
            Redeem Commission
          </Button>
          {(sale.reseller_markup_amount || 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRedeem("store_claim")}
              disabled={isRedeeming}
            >
              Store Claims Markup
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
