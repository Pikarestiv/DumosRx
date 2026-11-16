"use client";

import { Input } from "@/components/ui/input";

interface StorefrontCheckoutFieldsProps {
  paymentInstructions: string;
  deliveryAvailable: boolean;
  deliveryNote: string;
  payOnDelivery: boolean;
  disabled: boolean;
  onPaymentInstructions: (value: string) => void;
  onDeliveryAvailable: (value: boolean) => void;
  onDeliveryNote: (value: string) => void;
  onPayOnDelivery: (value: boolean) => void;
}

export function StorefrontCheckoutFields({
  paymentInstructions,
  deliveryAvailable,
  deliveryNote,
  payOnDelivery,
  disabled,
  onPaymentInstructions,
  onDeliveryAvailable,
  onDeliveryNote,
  onPayOnDelivery,
}: StorefrontCheckoutFieldsProps) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-medium">Checkout</legend>

      <div className="space-y-2">
        <label htmlFor="storefront-payment-instructions" className="text-sm">
          How to pay by transfer or mobile money
        </label>
        <textarea
          id="storefront-payment-instructions"
          value={paymentInstructions}
          maxLength={1000}
          rows={4}
          disabled={disabled}
          placeholder={"MTN MoMo 677 000 000 (Divamax)\nOrange Money 699 000 000"}
          onChange={(event) => onPaymentInstructions(event.target.value)}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Shown at checkout and on the confirmation. Leave blank to hide the transfer option: with no details, customers could not pay.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={deliveryAvailable} disabled={disabled} onChange={(event) => onDeliveryAvailable(event.target.checked)} />
        This store delivers
      </label>
      {deliveryAvailable ? (
        <div className="space-y-2">
          <label htmlFor="storefront-delivery-note" className="text-sm">
            Delivery note
          </label>
          <Input
            id="storefront-delivery-note"
            value={deliveryNote}
            maxLength={255}
            disabled={disabled}
            placeholder="Delivery within Douala, 1,000 FCFA"
            onChange={(event) => onDeliveryNote(event.target.value)}
          />
        </div>
      ) : null}
      {deliveryAvailable ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={payOnDelivery} disabled={disabled} onChange={(event) => onPayOnDelivery(event.target.checked)} />
          <span>
            Customers can pay when the order is delivered
            <span className="block text-xs text-muted-foreground">
              If off, delivery customers must pay by transfer, mobile money or online, so make sure at least one is set up.
            </span>
          </span>
        </label>
      ) : null}
    </fieldset>
  );
}
