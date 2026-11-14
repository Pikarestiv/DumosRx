"use client";

import { useSyncExternalStore } from "react";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { describeOpenStatus, openStatus, type OpeningHours } from "@/lib/storefront-hours";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

const subscribe = (notify: () => void) => {
  const timer = setInterval(notify, REFRESH_MS);
  return () => clearInterval(timer);
};

interface StoreOpenStatusProps {
  hours?: OpeningHours | null;
  timeZone?: string | null;
  className?: string;
  openClassName?: string;
}

export function StoreOpenStatus({ hours, timeZone, className, openClassName }: StoreOpenStatusProps) {
  const { locale } = useStorefrontI18n();
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const status = openStatus(hours, new Date(), timeZone);
      return status ? JSON.stringify({ text: describeOpenStatus(status, locale), open: status.state === "open" }) : null;
    },
    () => null,
  );

  if (!snapshot) return null;
  const { text, open: isOpen } = JSON.parse(snapshot) as { text: string; open: boolean };

  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className, isOpen && openClassName)}>
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", isOpen ? "bg-emerald-500" : "bg-slate-400")} />
      {text}
    </span>
  );
}
