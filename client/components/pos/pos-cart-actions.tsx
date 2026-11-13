"use client";

import type { ComponentType, ReactNode } from "react";
import { ClipboardList, FileText, PauseCircle, Trash2 } from "lucide-react";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { cn } from "@/lib/utils";

const BASE =
  "flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";

function CartAction({
  label,
  fullLabel,
  icon: Icon,
  onClick,
  className,
}: {
  label: ReactNode;
  fullLabel: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  className: string;
}) {
  return (
    <HintTooltip text={fullLabel}>
      <button type="button" aria-label={fullLabel} onClick={onClick} className={cn(BASE, className)}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {label}
      </button>
    </HintTooltip>
  );
}

interface Props {
  onRequestItem: () => void;
  onHoldSale?: () => void;
  onClearCart?: () => void;
  onPreviewQuote?: () => void;
}

/** The cart's secondary actions on one row; absent handlers hide their button. */
export function POSCartActions({ onRequestItem, onHoldSale, onClearCart, onPreviewQuote }: Props) {
  return (
    <div className="flex gap-1.5 mb-2.5">
      <CartAction
        label="Request"
        fullLabel="Request Item"
        icon={ClipboardList}
        onClick={onRequestItem}
        className="border-border bg-card text-foreground hover:bg-muted/50"
      />
      {onHoldSale && (
        <CartAction
          label="Hold"
          fullLabel="Hold Sale"
          icon={PauseCircle}
          onClick={onHoldSale}
          className="border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-400 hover:bg-amber-500/10"
        />
      )}
      {onClearCart && (
        <CartAction
          label="Clear"
          fullLabel="Clear cart"
          icon={Trash2}
          onClick={onClearCart}
          className="border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400 hover:bg-red-500/10"
        />
      )}
      {onPreviewQuote && (
        <CartAction
          label="Preview"
          fullLabel="Preview Quote"
          icon={FileText}
          onClick={onPreviewQuote}
          className="border-border bg-card text-foreground hover:bg-muted/50"
        />
      )}
    </div>
  );
}
