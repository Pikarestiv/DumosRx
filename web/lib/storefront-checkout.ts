import type { checkoutLine } from "@/lib/storefront-cart-lines";
import type { FulfilmentMethod } from "@/components/storefront/checkout-contact-fields";

export type PaymentMethodId = "in_store" | "transfer" | "paystack";

interface PaymentAvailability {
  delivery: boolean;
  payOnDelivery: boolean;
  hasInstructions: boolean;
  onlinePaymentAvailable: boolean;
}

export function availablePaymentMethods({ delivery, payOnDelivery, hasInstructions, onlinePaymentAvailable }: PaymentAvailability): PaymentMethodId[] {
  const methods: PaymentMethodId[] = [];
  if (!delivery || payOnDelivery) methods.push("in_store");
  if (hasInstructions) methods.push("transfer");
  if (onlinePaymentAvailable) methods.push("paystack");
  return methods;
}

export interface PendingCheckout {
  formData: {
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    customer_email: string;
    fulfilment_method: FulfilmentMethod;
    payment_method: string;
  };
  items: ReturnType<typeof checkoutLine>[];
}

export const orderFields = (form: PendingCheckout["formData"]) => ({
  customer_name: form.customer_name,
  customer_phone: form.customer_phone,
  payment_method: form.payment_method,
  fulfilment_method: form.fulfilment_method,
  ...(form.customer_email.trim() ? { customer_email: form.customer_email.trim() } : {}),
  ...(form.fulfilment_method === "delivery" && form.customer_address.trim() ? { customer_address: form.customer_address.trim() } : {}),
});

export const wasRefunded = (error: unknown): boolean => {
  const response = (error as { response?: { status?: number; data?: { refunded?: boolean } } } | null)?.response;
  return response?.status === 422 && response?.data?.refunded === true;
};
