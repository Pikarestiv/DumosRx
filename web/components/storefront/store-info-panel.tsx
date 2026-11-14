"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { storeAddressLine } from "@/lib/storefront-display";
import { summarizeHours } from "@/lib/storefront-hours";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";

interface StoreInfoPanelProps {
  store: StorefrontStore;
  storefront?: StorefrontProfile | null;
}

export function StoreInfoPanel({ store, storefront }: StoreInfoPanelProps) {
  const { t, locale } = useStorefrontI18n();
  const pickup = storefront?.pickup_minutes;
  const rows = [
    { label: t("info.address"), value: storeAddressLine(store) },
    { label: t("info.hours"), value: summarizeHours(storefront?.opening_hours, locale) },
    { label: t("info.phone"), value: store.phone?.trim() || null },
    { label: t("info.payment"), value: store.online_payment_available ? t("info.payment.online") : t("info.payment.pickup") },
    { label: t("info.pickup"), value: pickup ? t("info.pickup.value", { minutes: pickup }) : null },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  if (rows.length === 0) return null;

  return (
    <aside
      aria-label={t("info.aria")}
      className="self-start rounded-[var(--sf-card-radius)] border border-current/15 bg-white/5 p-6"
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[color:var(--primary)]">{t("info.heading")}</h2>
      <dl className="mt-4">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-6 border-t border-current/15 py-3 text-sm">
            <dt className="opacity-70">{row.label}</dt>
            <dd className="text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
