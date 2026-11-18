"use client";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { storeAddressLine } from "@/lib/storefront-display";
import { summarizeHoursLines } from "@/lib/storefront-hours";
import type { StorefrontProfile, StorefrontStore } from "@/lib/api/storefront-data";

interface StoreInfoPanelProps {
  store: StorefrontStore;
  storefront?: StorefrontProfile | null;
}

export function StoreInfoPanel({ store, storefront }: StoreInfoPanelProps) {
  const { t, locale } = useStorefrontI18n();
  const pickup = storefront?.pickup_minutes;
  const rows = [
    { label: t("info.address"), lines: [storeAddressLine(store)] },
    { label: t("info.hours"), lines: summarizeHoursLines(storefront?.opening_hours, locale) },
    { label: t("info.phone"), lines: [store.phone?.trim()] },
    { label: t("info.payment"), lines: [store.online_payment_available ? t("info.payment.online") : t("info.payment.pickup")] },
    { label: t("info.pickup"), lines: [pickup ? t("info.pickup.value", { minutes: pickup }) : null] },
  ]
    .map((row) => ({ label: row.label, lines: row.lines.filter((line): line is string => Boolean(line)) }))
    .filter((row) => row.lines.length > 0);

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
            <dd className="text-right">
              {row.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
