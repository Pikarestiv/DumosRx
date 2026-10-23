"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SpreadMonthsHint() {
  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What does spreading an expense do?"
          className="text-muted-foreground hover:text-foreground cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] space-y-1.5 leading-relaxed">
        <p>
          For a payment that covers several months, like a year&apos;s rent
          paid up front. Profit reports and the &quot;This month&quot; figure
          count an equal share in each calendar month, starting with the month
          of the expense date, instead of the whole amount in one month.
        </p>
        <p>
          The expense list, the all-time total and Daily Close&apos;s cash
          figure still show the full amount on the day it was paid.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
