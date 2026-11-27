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

export function paymentStepBody(locale: StorefrontLocale, ways: PaymentWays): string {
  const parts = [
    translate(locale, "steps.pay.way.collect"),
    ways.delivery ? translate(locale, "steps.pay.way.delivery") : null,
    ways.transfer ? translate(locale, "steps.pay.way.transfer") : null,
    ways.online ? translate(locale, "steps.pay.way.online") : null,
  ].filter((part): part is string => part !== null);
  const last = parts.pop() as string;
  const joined = parts.length ? `${parts.join(", ")} ${translate(locale, "steps.pay.or")} ${last}` : last;
  return translate(locale, "steps.pay.body.ways", { ways: joined });
}
