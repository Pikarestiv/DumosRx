"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type FulfilmentMethod = "pickup" | "delivery";

interface CheckoutContactFieldsProps {
  values: { customer_name: string; customer_phone: string; customer_email: string; customer_address: string };
  fulfilment: FulfilmentMethod;
  deliveryAvailable: boolean;
  deliveryNote?: string | null;
  emailRequired: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFulfilmentChange: (value: FulfilmentMethod) => void;
}

export function CheckoutContactFields({
  values,
  fulfilment,
  deliveryAvailable,
  deliveryNote,
  emailRequired,
  onChange,
  onFulfilmentChange,
}: CheckoutContactFieldsProps) {
  const { t } = useStorefrontI18n();
  const option = (value: FulfilmentMethod, label: string) => (
    <Label
      htmlFor={`fulfilment_${value}`}
      className={`flex items-center justify-center rounded-md border-2 p-3 cursor-pointer ${fulfilment === value ? "border-primary" : "border-muted bg-popover"}`}
    >
      <input
        type="radio"
        id={`fulfilment_${value}`}
        name="fulfilment_method"
        value={value}
        className="sr-only"
        checked={fulfilment === value}
        onChange={() => onFulfilmentChange(value)}
      />
      {label}
    </Label>
  );

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{t("checkout.contact")}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="customer_name">{t("checkout.name")}</Label>
          <Input id="customer_name" name="customer_name" required value={values.customer_name} onChange={onChange} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer_phone">{t("checkout.phone")}</Label>
          <Input id="customer_phone" name="customer_phone" type="tel" required value={values.customer_phone} onChange={onChange} autoComplete="tel" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer_email">{emailRequired ? t("checkout.email") : t("checkout.emailOptional")}</Label>
        <Input
          id="customer_email"
          name="customer_email"
          type="email"
          required={emailRequired}
          value={values.customer_email}
          onChange={onChange}
          autoComplete="email"
        />
      </div>

      {deliveryAvailable && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("checkout.fulfilment")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {option("pickup", t("checkout.fulfilment.pickup"))}
            {option("delivery", t("checkout.fulfilment.delivery"))}
          </div>
          {fulfilment === "delivery" && deliveryNote ? <p className="text-sm text-muted-foreground">{deliveryNote}</p> : null}
        </fieldset>
      )}

      {fulfilment === "delivery" && (
        <div className="space-y-2">
          <Label htmlFor="customer_address">{t("checkout.address.required")}</Label>
          <Input id="customer_address" name="customer_address" required value={values.customer_address} onChange={onChange} autoComplete="street-address" />
        </div>
      )}
    </div>
  );
}
