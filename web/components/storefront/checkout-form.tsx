"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/store/use-cart-store";
import { useCartRepricing } from "@/lib/store/use-cart-repricing";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api/base-client";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { toDisplayTitle } from "@/lib/storefront-display";
import {
  FailedConfirmationPanel,
  OrphanReferencePanel,
} from "@/components/storefront/checkout-reference-panels";
import { CheckoutContactFields, type FulfilmentMethod } from "@/components/storefront/checkout-contact-fields";
import { CheckoutPaymentMethod } from "@/components/storefront/checkout-payment-method";
import { availablePaymentMethods } from "@/lib/storefront-checkout";
import { readSavedCheckoutDetails, saveCheckoutDetails } from "@/lib/use-saved-checkout-details";

interface CheckoutFormProps {
  storeSlug: string;
  paymentInstructions?: string | null;
  deliveryAvailable?: boolean;
  deliveryNote?: string | null;
  payOnDelivery?: boolean;
}

interface PendingCheckout {
  formData: {
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    customer_email: string;
    fulfilment_method: FulfilmentMethod;
    payment_method: string;
  };
  items: { product_id: string; quantity: number }[];
}

const orderFields = (form: PendingCheckout["formData"]) => ({
  customer_name: form.customer_name,
  customer_phone: form.customer_phone,
  payment_method: form.payment_method,
  fulfilment_method: form.fulfilment_method,
  ...(form.customer_email.trim() ? { customer_email: form.customer_email.trim() } : {}),
  ...(form.fulfilment_method === "delivery" && form.customer_address.trim() ? { customer_address: form.customer_address.trim() } : {}),
});

const wasRefunded = (error: unknown): boolean => {
  const response = (error as { response?: { status?: number; data?: { refunded?: boolean } } } | null)
    ?.response;
  return response?.status === 422 && response?.data?.refunded === true;
};

export function CheckoutForm({ storeSlug, paymentInstructions, deliveryAvailable = false, deliveryNote, payOnDelivery = false }: CheckoutFormProps) {
  const { t, money } = useStorefrontI18n();
  const cart = useCart(storeSlug);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const { pricesLoading, pricesStale, onlinePaymentAvailable, currency } = useCartRepricing(storeSlug);
  const [orphanReference, setOrphanReference] = useState<string | null>(null);
  const [failedReference, setFailedReference] = useState<string | null>(null);
  const [failedWasRefunded, setFailedWasRefunded] = useState(false);
  const autoConfirmedReference = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    customer_email: "",
    fulfilment_method: "pickup" as FulfilmentMethod,
    payment_method: "in_store",
  });

  useEffect(() => {
    const saved = readSavedCheckoutDetails();
    setFormData((prev) => ({
      ...prev,
      customer_name: prev.customer_name || saved.customer_name,
      customer_phone: prev.customer_phone || saved.customer_phone,
      customer_email: prev.customer_email || saved.customer_email,
      customer_address: prev.customer_address || saved.customer_address,
    }));
  }, []);

  const methods = availablePaymentMethods({
    delivery: formData.fulfilment_method === "delivery",
    payOnDelivery,
    hasInstructions: Boolean(paymentInstructions?.trim()),
    onlinePaymentAvailable,
  });
  const chosenMethod = methods.includes(formData.payment_method as never) ? formData.payment_method : (methods[0] ?? formData.payment_method);

  const pendingStorageKey = `dumos_pending_checkout_${storeSlug}`;

  const goToConfirmation = (orderId: string, submitted: PendingCheckout["formData"] = formData) => {
    saveCheckoutDetails(submitted);
    router.push(`/store/${storeSlug}/order/?id=${encodeURIComponent(orderId)}`);
  };

  const readPendingCheckout = (): PendingCheckout | null => {
    const raw = sessionStorage.getItem(pendingStorageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PendingCheckout;
    } catch {
      return null;
    }
  };

  const confirmPaidCheckout = async (reference: string, pending: PendingCheckout) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post<{ order: { id: string } }>(`/storefront/${storeSlug}/checkout`, {
        ...orderFields(pending.formData),
        items: pending.items,
        payment_method: 'paystack',
        paystack_reference: reference,
      });
      sessionStorage.removeItem(pendingStorageKey);
      setFailedReference(null);
      toast.success(t("checkout.placed"));
      cart.clearCart();
      goToConfirmation(data.order.id, pending.formData);
    } catch (error) {
      setFailedReference(reference);
      setFailedWasRefunded(wasRefunded(error));
      const detail = error instanceof Error ? ` (${error.message})` : "";
      toast.error(t("checkout.error.confirm", { reference, detail }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const reference = searchParams.get('reference') ?? searchParams.get('trxref');
    if (!reference) return;

    if (autoConfirmedReference.current === reference) return;
    autoConfirmedReference.current = reference;

    const pending = readPendingCheckout();
    if (!pending) {
      setOrphanReference(reference);
      return;
    }

    void confirmPaidCheckout(reference, pending);
    // Deliberately not re-run on formData/cart changes, which would resubmit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, storeSlug]);

  const retryConfirmation = () => {
    if (!failedReference) return;
    const pending = readPendingCheckout();
    if (!pending) {
      setFailedReference(null);
      setOrphanReference(failedReference);
      return;
    }
    void confirmPaidCheckout(failedReference, pending);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMethodChange = (value: string) => {
    setFormData((prev) => ({ ...prev, payment_method: value }));
  };

  const handleFulfilmentChange = (value: FulfilmentMethod) => {
    setFormData((prev) => ({ ...prev, fulfilment_method: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.items.length === 0) {
      toast.error(t("checkout.error.emptyCart"));
      return;
    }

    if (!formData.customer_name || !formData.customer_phone) {
      toast.error(t("checkout.error.required"));
      return;
    }

    if (formData.fulfilment_method === "delivery" && !formData.customer_address.trim()) {
      toast.error(t("checkout.error.required"));
      return;
    }

    const submitted = { ...formData, payment_method: chosenMethod };

    if (submitted.payment_method === 'paystack' && !submitted.customer_email) {
      toast.error(t("checkout.error.email"));
      return;
    }

    setLoading(true);
    // Assigning window.location.href starts a navigation but does not stop
    // this function, so the `finally` below must not re-enable the button.
    let redirectStarted = false;

    try {
      const items = cart.items.map(item => ({
        product_id: item.id,
        quantity: item.quantity
      }));

      if (submitted.payment_method === 'paystack') {
        sessionStorage.setItem(pendingStorageKey, JSON.stringify({ formData: submitted, items }));
        const { data } = await apiClient.post<{ payment_url: string }>(
          `/storefront/${storeSlug}/checkout/initialize`,
          { customer_email: formData.customer_email, items },
        );
        redirectStarted = true;
        setRedirecting(true);
        window.location.href = data.payment_url;
        return;
      }

      const { data } = await apiClient.post<{ order: { id: string } }>(`/storefront/${storeSlug}/checkout`, {
        ...orderFields(submitted),
        items,
      });

      toast.success(t("checkout.placed"));
      cart.clearCart();
      goToConfirmation(data.order.id, submitted);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("checkout.error.generic"));
    } finally {
      if (!redirectStarted) setLoading(false);
    }
  };

  const returnToStore = () => router.push(`/store/${storeSlug}`);

  if (failedReference) {
    return (
      <FailedConfirmationPanel
        reference={failedReference}
        refunded={failedWasRefunded}
        retrying={loading}
        onRetry={retryConfirmation}
        onReturnToStore={returnToStore}
      />
    );
  }

  if (orphanReference) {
    return <OrphanReferencePanel reference={orphanReference} onReturnToStore={returnToStore} />;
  }

  if (cart.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("checkout.empty")}
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => router.push(`/store/${storeSlug}`)}>{t("checkout.returnToStore")}</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <Card>
          <form onSubmit={(e) => void handleSubmit(e)}>
            <CardHeader>
              <CardTitle>{t("checkout.delivery")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <CheckoutContactFields
                values={formData}
                fulfilment={formData.fulfilment_method}
                deliveryAvailable={deliveryAvailable}
                deliveryNote={deliveryNote}
                emailRequired={chosenMethod === "paystack"}
                onChange={handleInputChange}
                onFulfilmentChange={handleFulfilmentChange}
              />

              <CheckoutPaymentMethod
                paymentMethod={chosenMethod}
                fulfilment={formData.fulfilment_method}
                paymentInstructions={paymentInstructions}
                methods={methods}
                onMethodChange={handleMethodChange}
              />
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-2">
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading || redirecting || pricesLoading || methods.length === 0}
              >
                {(loading || redirecting || pricesLoading) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {redirecting
                  ? t("checkout.redirecting")
                  : pricesLoading
                    ? t("checkout.confirmingPrices")
                    : t("checkout.placeOrder", { total: money(cart.getTotal(), currency) })}
              </Button>
              {pricesStale && (
                <p className="text-xs text-amber-600 text-center">
                  {t("checkout.pricesStale")}
                </p>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>

      <div>
        <Card className="sticky top-24">
          <CardHeader>
            <CardTitle>{t("checkout.summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{toDisplayTitle(item.name)} (x{item.quantity})</span>
                <span className="font-medium">{money(item.price * item.quantity, currency)}</span>
              </div>
            ))}
            <div className="border-t pt-4 flex justify-between font-bold text-lg">
              <span>{t("checkout.total")}</span>
              <span className="text-primary">{money(cart.getTotal(), currency)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
