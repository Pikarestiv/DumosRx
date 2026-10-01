"use client";

import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { AssistantPanel } from "./assistant-panel";

export function GatedAssistantPanel() {
  const { canUseAiAssistant } = useFeatureGate();

  if (!canUseAiAssistant) return null;

  return <AssistantPanel />;
}
