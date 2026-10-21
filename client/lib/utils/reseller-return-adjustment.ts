import { computeResellerCommission } from "@/lib/hooks/use-pos-payment-helpers";
import { getMaxReturnable } from "@/lib/utils/returns-calculations";
import type { Sale, SaleItemDetail } from "@/lib/types/sale";

type ResellerSale = Pick<
  Sale,
  | "is_reseller_sale"
  | "markup_type"
  | "reseller_commission_percentage"
  | "reseller_commission_redeemed"
  | "reseller_commission_claim_type"
>;

/** The sale's reseller figures re-derived from the lines that survive a return, as a sales patch; null when nothing should change.
 * Commission already paid out is never touched, and a sale with any line lacking a list_price is left as stored. */
export function resellerPatchAfterReturn(
  sale: ResellerSale,
  saleItems: SaleItemDetail[],
  returned: { id: string; returnQuantity: number }[],
): { reseller_markup_amount: number; reseller_commission_amount?: number } | null {
  if (!sale.is_reseller_sale) return null;
  const paidOut = !!sale.reseller_commission_redeemed && sale.reseller_commission_claim_type !== "store_claim";
  if (paidOut) return null;
  if (saleItems.some((item) => item.list_price == null)) return null;

  const surviving = saleItems.map((item) => ({
    unit_price: item.unit_price,
    original_unit_price: item.list_price as number,
    quantity: getMaxReturnable(item) - (returned.find((r) => r.id === item.id)?.returnQuantity ?? 0),
  }));
  const { resellerMarkup, resellerCommissionAmount } = computeResellerCommission({
    cart: surviving,
    isResellerSale: true,
    markupType: sale.markup_type,
    resellerCommissionPercentage: sale.reseller_commission_percentage ?? 0,
  });

  return sale.reseller_commission_redeemed
    ? { reseller_markup_amount: resellerMarkup }
    : { reseller_markup_amount: resellerMarkup, reseller_commission_amount: resellerCommissionAmount };
}
