import { computeResellerCommission } from "@/lib/hooks/use-pos-payment-helpers";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { getMaxReturnable } from "@/lib/utils/returns-calculations";
import type { Sale, SaleItemDetail } from "@/lib/types/sale";

type ResellerSale = Pick<
  Sale,
  | "is_reseller_sale"
  | "markup_type"
  | "reseller_commission_percentage"
  | "reseller_commission_redeemed"
  | "reseller_commission_claim_type"
  | "reseller_commission_redeemed_amount"
>;

interface ResellerReturnPatch {
  reseller_markup_amount: number;
  reseller_commission_amount?: number;
  reseller_commission_owed_back?: number;
}

/** The sale's reseller figures re-derived from the lines that survive a return, as a sales patch; null when nothing should change.
 * Commission already paid out is kept as history and the refundable part is recorded as owed back; a sale with any line lacking a list_price is left as stored. */
export function resellerPatchAfterReturn(
  sale: ResellerSale,
  saleItems: SaleItemDetail[],
  returned: { id: string; returnQuantity: number }[],
): ResellerReturnPatch | null {
  if (!sale.is_reseller_sale) return null;
  const paidOut = !!sale.reseller_commission_redeemed && sale.reseller_commission_claim_type !== "store_claim";
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

  if (paidOut) {
    const owedBack = roundMoney(Math.max(0, (sale.reseller_commission_redeemed_amount ?? 0) - resellerCommissionAmount));
    return { reseller_markup_amount: resellerMarkup, reseller_commission_owed_back: owedBack };
  }
  return sale.reseller_commission_redeemed
    ? { reseller_markup_amount: resellerMarkup }
    : { reseller_markup_amount: resellerMarkup, reseller_commission_amount: resellerCommissionAmount };
}
