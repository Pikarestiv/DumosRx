import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";
import { translate, type StorefrontLocale } from "@/lib/storefront-i18n";

export interface PaymentWays {
  delivery: boolean;
  transfer: boolean;
  online: boolean;
}

type ProfileWays = Pick<StorefrontProfile, "payment_instructions" | "delivery_available" | "pay_on_delivery">;

export function paymentWaysOf(storefront: Partial<ProfileWays> | null | undefined, store: Pick<StorefrontStore, "online_payment_available">): PaymentWays {
  return {
    delivery: Boolean(storefront?.delivery_available && storefront.pay_on_delivery),
    transfer: Boolean(storefront?.payment_instructions?.trim()),
    online: Boolean(store.online_payment_available),
  };
}

function waysList(locale: StorefrontLocale, ways: PaymentWays, variant: "goods" | "services" = "goods"): string {
  const parts = [
    translate(locale, variant === "services" ? "steps.pay.way.collect.services" : "steps.pay.way.collect"),
    ways.delivery ? translate(locale, "steps.pay.way.delivery") : null,
    ways.transfer ? translate(locale, "steps.pay.way.transfer") : null,
    ways.online ? translate(locale, "steps.pay.way.online") : null,
  ].filter((part): part is string => part !== null);
  const last = parts.pop() as string;
  return parts.length ? `${parts.join(", ")} ${translate(locale, "steps.pay.or")} ${last}` : last;
}

export function paymentStepBody(locale: StorefrontLocale, ways: PaymentWays, variant: "goods" | "services" = "goods"): string {
  return translate(locale, "steps.pay.body.ways", { ways: waysList(locale, ways, variant) });
}

export function paymentFaqAnswer(locale: StorefrontLocale, ways: PaymentWays): string {
  return translate(locale, "faq.payments.answer", { ways: waysList(locale, ways) });
}

export function paymentMetaSentence(locale: StorefrontLocale, ways: PaymentWays): string {
  const parts = [
    ways.online ? translate(locale, "meta.pay.online") : null,
    ways.transfer ? translate(locale, "meta.pay.transfer") : null,
    translate(locale, "meta.pay.store"),
  ].filter((part): part is string => part !== null);
  return translate(locale, "meta.pay", { ways: new Intl.ListFormat(locale, { type: "disjunction" }).format(parts) });
}
