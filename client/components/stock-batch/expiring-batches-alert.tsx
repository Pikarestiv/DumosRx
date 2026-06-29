"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Pill, X } from "lucide-react";
import { query } from "@/lib/db/core";
import { getDaysToExpiry } from "@/lib/utils/date-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";

interface ExpiringItem {
  id: string;
  name: string;
  batch_number: string;
  expiry_date: string;
  stock_quantity: number;
}

export function ExpiringBatchesAlert() {
  const router = useRouter();
  const { expiryDays } = useSettings();
  const [items, setItems] = useState<ExpiringItem[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadExpiringItems();
  }, [expiryDays]);

  const loadExpiringItems = async () => {
    try {
      const days = Number(expiryDays) || 90;
      // Find items expiring in the next X days
      const res = await query<ExpiringItem>(`
        SELECT sb.id, p.name, sb.batch_number, sb.expiry_date, sb.quantity as stock_quantity 
        FROM stock_batches sb
        JOIN products p ON sb.product_id = p.id
        WHERE sb.expiry_date IS NOT NULL 
        AND sb.quantity > 0
        AND sb._deleted = 0
        AND p._deleted = 0
        AND date(sb.expiry_date) <= date('now', '+${days} days')
        ORDER BY sb.expiry_date ASC
      `);
      setItems(res);
    } catch (err) {
      console.error(err);
    }
  };

  if (dismissed || items.length === 0) return null;

  return (
    <div className="relative group overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 transition-all hover:bg-amber-500/10 mb-6">
      <div className="flex items-start gap-4">
        <div className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600">
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
        onClick={() => router.push("/inventory/batches")}
        className="mt-2 p-0 h-auto text-xs text-amber-600 font-bold group-hover:translate-x-1 transition-transform"
      >
        Manage Expiring Batches <ChevronRight className="w-3 h-3 ml-1" />
      </Button>
    </div>
  );
}
