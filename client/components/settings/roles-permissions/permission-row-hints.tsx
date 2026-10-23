"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STOCK_QUANTITIES_KEY = "view_stock_quantities";
const STOCK_QUANTITY_SCREEN_KEYS = [
  "perform_stock_audit",
  "adjust_stock_counts",
  "receive_purchase_orders",
  "view_stock_adjustment_history",
  "view_reports",
];

function HintButton({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={1000}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={label} className={`ml-1.5 shrink-0 rounded-sm ${className}`}>
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PermissionDescription({ label, description }: { label: string; description?: string }) {
  if (!description) return null;
  return (
    <HintButton label={`About ${label}: ${description}`} className="text-muted-foreground hover:text-foreground">
      <Info className="h-3.5 w-3.5" />
    </HintButton>
  );
}

export function StockQuantitiesOverlapWarning({
  permissionKey,
  groupName,
  permissions,
}: {
  permissionKey: string;
  groupName: string;
  permissions: string[];
}) {
  const applies =
    permissionKey === STOCK_QUANTITIES_KEY &&
    !permissions.includes(STOCK_QUANTITIES_KEY) &&
    STOCK_QUANTITY_SCREEN_KEYS.some((key) => permissions.includes(key));
  if (!applies) return null;

  return (
    <HintButton
      label={`${groupName} still sees stock quantities on the count, adjust, receiving, stock history or report screens it can open.`}
      className="text-amber-600 dark:text-amber-400"
    >
      <AlertTriangle className="h-3.5 w-3.5" />
    </HintButton>
  );
}
