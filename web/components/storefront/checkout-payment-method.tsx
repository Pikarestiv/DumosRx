"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { Label } from "@/components/ui/label";
import type { FulfilmentMethod } from "@/components/storefront/checkout-contact-fields";
import type { PaymentMethodId } from "@/lib/storefront-checkout";

interface CheckoutPaymentMethodProps {
  paymentMethod: string;
  fulfilment: FulfilmentMethod;
  paymentInstructions?: string | null;
  methods: PaymentMethodId[];
  onMethodChange: (value: string) => void;
}

export function CheckoutPaymentMethod({
  paymentMethod,
  fulfilment,
  paymentInstructions,
  methods,
  onMethodChange,
}: CheckoutPaymentMethodProps) {
  const { t } = useStorefrontI18n();
  const hasInstructions = Boolean(paymentInstructions?.trim());

  const option = (value: string, label: string) => (
    <Label
      htmlFor={value}
      className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${paymentMethod === value ? "border-primary" : "border-muted bg-popover"}`}
    >
      <input
        type="radio"
        id={value}
        name="payment_method"
        value={value}
        className="sr-only"
        checked={paymentMethod === value}
        onChange={() => onMethodChange(value)}
      />
      {label}
    </Label>
  );

  return (
    <div className="space-y-4 pt-4 border-t">
      <h3 className="font-semibold text-lg">{t("checkout.method")}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {methods.includes("in_store") && option("in_store", t(fulfilment === "delivery" ? "checkout.method.inStore.delivery" : "checkout.method.inStore.pickup"))}
        {methods.includes("transfer") && option("transfer", t("checkout.method.transfer.any"))}
        {methods.includes("paystack") && option("paystack", t("checkout.method.online"))}
      </div>
      {methods.length === 0 && <p role="alert" className="text-sm text-destructive">{t("checkout.noPaymentOption")}</p>}
      {paymentMethod === "transfer" && hasInstructions && (
        <div className="rounded-md border bg-muted/40 p-4 space-y-2">
          <p className="font-semibold">{t("checkout.instructions.heading")}</p>
          <p className="whitespace-pre-line text-sm">{paymentInstructions}</p>
          <p className="text-xs text-muted-foreground">{t("checkout.instructions.after")}</p>
        </div>
      )}
    </div>
  );
}
