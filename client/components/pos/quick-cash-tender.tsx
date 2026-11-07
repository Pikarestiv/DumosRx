"use client";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { getQuickCashOptions } from "@/lib/utils/pos-calculations";

interface QuickCashTenderProps {
  total: number;
  amountPaid: string;
  onSelectAmount: (amount: string) => void;
  currencyCode?: string;
}

export function QuickCashTender({
  total,
  amountPaid,
  onSelectAmount,
  currencyCode,
}: QuickCashTenderProps) {
  if (total <= 0) return null;
  const options = getQuickCashOptions(total);

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
      <span className="text-[11px] text-muted-foreground font-medium mr-0.5">Quick:</span>
      {options.map((opt) => {
        const isExact = opt === total;
        const isSelected = amountPaid === opt.toString();
        return (
          <Button
            key={opt}
            type="button"
            variant={isSelected ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2 text-xs font-medium rounded-md ${
              isSelected
                ? ""
                : isExact
                  ? "font-semibold text-primary border-primary/40 hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onSelectAmount(opt.toString())}
          >
            {isExact
              ? `Exact (${formatCurrency(opt, currencyCode)})`
              : formatCurrency(opt, currencyCode)}
          </Button>
        );
      })}
    </div>
  );
}
