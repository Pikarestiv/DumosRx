"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Pill, X } from "lucide-react";
import { getDaysToExpiry } from "@/lib/utils/date-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";

import { useExpiringBatches } from "@/lib/hooks/use-inventory-data";

export function ExpiringBatchesAlert() {
  const { expiryDays } = useSettings();
  const [dismissed, setDismissed] = useState(false);
  const { items, isLoading } = useExpiringBatches(Number(expiryDays) || 90);

  if (dismissed || items.length === 0) return null;

  return (
    <div className="relative group overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 transition-all hover:bg-amber-500/10 mb-6">
      <div className="flex items-start gap-4">
        <div className="h-7 w-7 sm:h-10 sm:w-10 shrink-0 rounded-lg sm:rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600">
          <AlertTriangle className="w-3 h-3 sm:w-5 sm:h-5" />
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-amber-900 dark:text-amber-100">
              Expiring Stock Alert
            </h4>
            <button
              onClick={() => setDismissed(true)}
              className="text-amber-500 hover:text-amber-700 transition-colors p-1"
            >
              <X className="w-4 h-4 cursor-pointer" />
            </button>
          </div>
          <p className="text-xs text-amber-800/70 dark:text-amber-200/70 leading-relaxed">
            You have <span className="font-bold">{items.length} products</span>{" "}
            reaching their expiry date within the next {expiryDays || 90} days.
            Please prioritize these batches for sale or return to supplier.
          </p>

          <div className="pt-3 flex flex-wrap gap-2">
            {items.slice(0, 3).map((item) => {
              const days = getDaysToExpiry(item.expiry_date);
              return (
                <Badge
                  key={item.id}
                  variant="outline"
                  className="bg-background/50 border-amber-500/20 text-[10px] font-bold py-1 px-2 flex items-center gap-2"
                >
                  <Pill className="w-3 h-3 text-amber-500" />
                  {item.name} ({days}d)
                </Badge>
              );
            })}
            {items.length > 3 && (
              <Badge
                variant="outline"
                className="bg-background/50 border-amber-500/20 text-[10px] font-bold py-1 px-2"
              >
                +{items.length - 3} more
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Button
        variant="link"
        asChild
        className="mt-2 p-0 h-auto text-xs text-amber-600 font-bold group-hover:translate-x-1 transition-transform"
      >
        <Link href="/inventory/batches">
          Manage Expiring Batches <ChevronRight className="w-3 h-3 ml-1" />
        </Link>
      </Button>
    </div>
  );
}
