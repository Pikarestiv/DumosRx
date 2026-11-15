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
