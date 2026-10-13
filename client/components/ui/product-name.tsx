"use client";

import { useCallback, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { cn } from "@/lib/utils";

/**
 * One product name, rendered the way the store asked for it and readable
 * even when its column cannot hold it. Reveals the full name on hover, or
 * on tap on a touch device, and only when it is actually clamped.
 *
 * Names are stored lowercase (withNormalizedName in base-helpers.ts), so any
 * render without the store's casing class shows raw storage casing. In a
 * dense ledger the name is also the only thing identifying the row. See
 * client/AGENTS.md.
 */
export function ProductName({
  name,
  className,
  tooltipSuffix,
}: {
  name: string;
  className?: string;
  /** Extra line inside the reveal, e.g. the SKU, so one hover identifies
   * the row completely. */
  tooltipSuffix?: string;
}) {
  const capsClass = useUppercaseDisplayClass();
  const ref = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Measured into a ref at the moment the tooltip is asked to open, not
  // into state: whether the name is clamped depends on the rendered column
  // width, which no prop knows, and a state round-trip would decide one
  // render too late - i.e. never on the first hover.
  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) return setIsOpen(false);
    const el = ref.current;
    setIsOpen(!!el && el.scrollWidth > el.clientWidth + 1);
  }, []);

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip open={isOpen} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <span ref={ref} className={cn("block truncate", capsClass, className)}>
            {name}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[320px]">
          <span className={cn("block font-medium", capsClass)}>{name}</span>
          {tooltipSuffix && (
            <span className="block text-muted-foreground">{tooltipSuffix}</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
