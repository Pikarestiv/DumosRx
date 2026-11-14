"use client";

import { useSyncExternalStore } from "react";

import { describeOpenStatus, openStatus, type OpeningHours } from "@/lib/storefront-hours";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

const subscribe = (notify: () => void) => {
  const timer = setInterval(notify, REFRESH_MS);
  return () => clearInterval(timer);
};

interface StoreOpenStatusProps {
  hours?: OpeningHours | null;
  className?: string;
}

export function StoreOpenStatus({ hours, className }: StoreOpenStatusProps) {
  const text = useSyncExternalStore(
    subscribe,
    () => {
      const status = openStatus(hours, new Date());
      return status ? describeOpenStatus(status) : null;
    },
    () => null,
  );

  if (!text) return null;
  const isOpen = text.startsWith("Open");

  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", isOpen ? "bg-emerald-500" : "bg-slate-400")} />
      {text}
    </span>
  );
}
