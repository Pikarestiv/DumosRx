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

// One product name, rendered the way the store asked for it and readable even when its column cannot hold it.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-product-name-tsx-L13
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

  // Measured into a ref at the moment the tooltip is asked to open, not into state:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-ui-product-name-tsx-L42
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
