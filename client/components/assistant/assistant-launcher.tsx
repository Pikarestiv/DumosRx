"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";

export function AssistantLauncher() {
  const open = useAssistantPanel((state) => state.open);

  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open assistant" onClick={open}>
          <Sparkles className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Ask the assistant</TooltipContent>
    </Tooltip>
  );
}
