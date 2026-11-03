import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HintTooltipProps {
  text: string;
  children: ReactElement;
}

export function HintTooltip({ text, children }: HintTooltipProps) {
  return (
    <TooltipProvider delayDuration={1000}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
