"use client";

import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { ASSISTANT_FEATURE_KEY, ASSISTANT_NAME, AssistantBetaTag } from "./assistant-brand";

const LAUNCHER_CLASS =
  "rounded-full animate-assistant-sheen bg-gradient-to-br from-primary via-primary/60 to-primary text-primary-foreground shadow-sm hover:from-primary hover:via-primary/70 hover:to-primary";
const LOCKED_CLASS = "rounded-full bg-muted text-muted-foreground shadow-sm hover:bg-muted";

export function AssistantLauncher() {
  const open = useAssistantPanel((state) => state.open);
  const { canUseAiAssistant, withRestriction, getUpgradeMessage } = useFeatureGate();

  const handleClick = withRestriction(open, {
    enforceMobileAccess: false,
    featureAllowed: canUseAiAssistant,
    featureKey: ASSISTANT_FEATURE_KEY,
  });

  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          aria-label={canUseAiAssistant ? "Open assistant" : "Assistant locked"}
          onClick={handleClick}
          className={canUseAiAssistant ? LAUNCHER_CLASS : LOCKED_CLASS}
        >
          {canUseAiAssistant ? <Sparkles className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {canUseAiAssistant ? (
          <>
            Ask {ASSISTANT_NAME}
            <AssistantBetaTag />
          </>
        ) : (
          getUpgradeMessage(ASSISTANT_FEATURE_KEY, `${ASSISTANT_NAME} requires a plan upgrade.`)
        )}
      </TooltipContent>
    </Tooltip>
  );
}
