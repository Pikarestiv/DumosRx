"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { ASSISTANT_NAME, AssistantBetaTag } from "./assistant-brand";

const LAUNCHER_CLASS =
  "animate-assistant-sheen bg-gradient-to-br from-primary via-primary/60 to-primary text-primary-foreground shadow-sm hover:from-primary hover:via-primary/70 hover:to-primary";

export function AssistantLauncher() {
  const open = useAssistantPanel((state) => state.open);

  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>
        <Button size="icon" aria-label="Open assistant" onClick={open} className={LAUNCHER_CLASS}>
          <Sparkles className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        Ask {ASSISTANT_NAME}
        <AssistantBetaTag />
      </TooltipContent>
    </Tooltip>
  );
}
