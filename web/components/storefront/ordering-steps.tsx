"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { DISPLAY_FONT } from "@/lib/storefront-styles";

export function OrderingSteps({ isPharmacy }: { isPharmacy: boolean }) {
  const { t } = useStorefrontI18n();
  const kind = isPharmacy ? "pharmacy" : "retail";
  const steps = [
    { title: t("steps.choose.title"), body: t(`steps.choose.body.${kind}`) },
    { title: t("steps.pay.title"), body: t("steps.pay.body") },
    { title: t("steps.collect.title"), body: t(`steps.collect.body.${kind}`) },
  ];

  return (
    <section aria-label={t("steps.heading")} className="space-y-6">
      <h2 className={`${DISPLAY_FONT} text-2xl sm:text-3xl`}>{t("steps.heading")}</h2>
      <ol className="grid gap-8 border-t-2 border-[color:var(--sf-ink)] pt-6 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="space-y-2">
            <p className="text-sm opacity-70 [font-family:var(--sf-font-price)]">{String(index + 1).padStart(2, "0")}</p>
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="text-sm leading-relaxed opacity-80">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
