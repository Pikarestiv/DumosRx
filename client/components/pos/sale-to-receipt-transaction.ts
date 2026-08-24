import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";
import type { ReceiptTransaction } from "./receipt-view";

export function saleToReceiptTransaction(
  sale: SaleWithDetails,
  items: SaleItemDetail[],
): ReceiptTransaction {
  let paymentSplits;
  if (sale.payment_method === "mixed" && sale.payment_details) {
    try {
      const parsed =
        typeof sale.payment_details === "string"
          ? JSON.parse(sale.payment_details)
          : sale.payment_details;
      paymentSplits = Array.isArray(parsed) ? parsed : parsed?.splits;
    } catch {
      // payment_details wasn't valid JSON, fall back to the plain method line
    }
  }

  return {
    id: sale.id,
    date: sale.transaction_date || sale.created_at || "",
    cashier: sale.cashier_name || sale.user_name || sale.cashier,
    items: items.map((item) => ({
      id: item.id,
      name: item.product_name || item.name || "Unknown Item",
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.total_price ?? item.subtotal ?? item.unit_price * item.quantity,
    })),
    customer: sale.customer_name
      ? { name: sale.customer_name, phone: sale.customer_phone }
      : null,
    subtotal: sale.subtotal ?? 0,
    tax: sale.tax_amount ?? sale.tax ?? 0,
    discount: sale.discount_total ?? sale.discount_amount ?? sale.discount ?? 0,
    total: sale.total_amount ?? sale.total ?? 0,
    paymentMethod: sale.payment_method || "cash",
    amountPaid: sale.amount_paid ?? sale.total_amount ?? sale.total ?? 0,
    change: sale.change_given ?? sale.change ?? 0,
    paymentSplits,
  };
}
