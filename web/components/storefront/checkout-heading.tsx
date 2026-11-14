"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";

export function CheckoutHeading() {
  const { t } = useStorefrontI18n();

  return (
    <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground mb-8">{t("checkout.title")}</h1>
  );
}
