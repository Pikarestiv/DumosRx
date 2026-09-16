import type { CartItem } from "@/lib/hooks/use-pos-cart";
import type { Customer } from "@/lib/types/customer";
import type { ReceiptTransaction } from "./receipt-view";

/**
 * Builds a ReceiptTransaction straight from live cart state, for the
 * proforma quote preview/print - no sale exists yet (no DB row, no stock
 * deduction), so id/paymentMethod/amountPaid/change are placeholders;
 * ReceiptView's "quote" documentType hides the fields that don't apply.
 * Mirrors the shape usePOSPayment.handlePayment builds at real checkout
 * (lib/hooks/use-pos-payment.ts) and sale-to-receipt-transaction.ts builds
 * from a completed sale.
 */
export function cartToReceiptTransaction(
  cart: CartItem[],
  subtotal: number,
  tax: number,
  discount: number,
  total: number,
  selectedCustomer: Customer | null,
  cashier: string,
): ReceiptTransaction {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    cashier,
    items: cart.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    })),
    customer: selectedCustomer
      ? {
          name: `${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`.trim(),
          phone: selectedCustomer.phone,
        }
      : null,
    subtotal,
    tax,
    discount,
    total,
    paymentMethod: "",
    amountPaid: 0,
    change: 0,
  };
}
