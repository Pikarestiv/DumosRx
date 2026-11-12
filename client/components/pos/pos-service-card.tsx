"use client";

import { memo } from "react";
import { Sparkles, Layers } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Service } from "@/lib/types/service";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";

export const POSServiceCard = memo(function POSServiceCard({
  service,
  currencyCode,
  addToCart,
  cartQuantity = 0,
}: {
  service: Service;
  currencyCode?: string;
  addToCart: (service: Service) => void;
  cartQuantity?: number;
}) {
  const capsClass = useUppercaseDisplayClass();

  return (
    <button
      type="button"
      className="relative w-full text-left p-2 sm:p-3 border rounded-xl sm:rounded-2xl transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:border-ring cursor-pointer border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.08]"
      onClick={() => addToCart(service)}
    >
      <div className="absolute top-2 left-2 z-10 flex items-center justify-center gap-1 text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/90 dark:bg-emerald-950/80 backdrop-blur-md border border-emerald-300/50 px-1.5 py-0.5 rounded-full shadow-sm">
        <Sparkles className="h-2.5 w-2.5" />
        <span>Service</span>
      </div>

      {cartQuantity > 0 && (
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 flex items-center justify-center min-w-[18px] h-[18px] sm:min-w-[22px] sm:h-[22px] px-1 text-[9px] sm:text-[10px] font-bold text-primary-foreground bg-primary shadow-sm rounded-full">
          {cartQuantity}
        </div>
      )}

      {/* Icon Area */}
      <div className="w-full h-10 sm:h-14 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1.5 sm:mb-2.5 mt-4">
        <Layers className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>

      <div className={`text-[11.5px] sm:text-[13px] font-semibold leading-tight mb-0.5 sm:mb-1 line-clamp-2 ${capsClass}`}>
        {service.name}
      </div>
      <div className="text-[10px] sm:text-[11px] text-muted-foreground truncate mb-1 sm:mb-2">
        {service.category || "General Service"}
        {service.code ? ` • ${service.code}` : ""}
      </div>

      <div className="flex items-center justify-between mt-auto pt-0.5 sm:pt-1">
        <div className="text-[12px] sm:text-[13.5px] font-bold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(service.price, currencyCode)}
        </div>
        <div className="text-[9px] sm:text-[10px] font-medium text-muted-foreground bg-background/80 border border-border/50 px-1.5 py-0.5 rounded-md">
          Non-stock
        </div>
      </div>
    </button>
  );
});
