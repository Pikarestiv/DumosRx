"use client";

import { useSyncExternalStore } from "react";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { describeOpenStatus, openStatus, type OpeningHours } from "@/lib/storefront-hours";

const REFRESH_MS = 60_000;

const subscribe = (notify: () => void) => {
  const timer = setInterval(notify, REFRESH_MS);
  return () => clearInterval(timer);
};

export function StoreClosedNotice({ hours }: { hours?: OpeningHours | null }) {
  const { locale, t } = useStorefrontI18n();
  const message = useSyncExternalStore(
    subscribe,
    () => {
      const status = openStatus(hours, new Date());
      return status?.state === "closed" ? describeOpenStatus(status, locale) : null;
    },
    () => null,
  );

  if (!message) return null;

  return (
    <div role="status" className="border-b border-black/10 bg-amber-50 text-amber-950">
      <p className="mx-auto max-w-7xl px-4 py-2 text-sm sm:px-6 lg:px-8">
        {message}. {t("closednotice.suffix")}
      </p>
    </div>
  );
}
