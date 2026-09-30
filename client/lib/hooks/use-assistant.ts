import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { answer } from "@/lib/assistant/router";
import { TOOL_REGISTRY } from "@/lib/assistant/tools";
import { authorizeToolCall } from "@/lib/assistant/permission-gate";
import { suggestionExampleFor } from "@/lib/assistant/suggestion-examples";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import type { ToolContext } from "@/lib/assistant/types";

const MAX_SUGGESTIONS = 5;
const DEFAULT_EXPIRY_WARNING_DAYS = 90;

function buildToolContext(
  user: { id: string; role: string; store_id?: string | null } | null,
  permissionGroup: { permissions: string[] } | null,
  storeProfile: { currency?: string; expiry_warning_days?: number } | null,
  storeType: string,
  t: (key: string) => string,
): ToolContext {
  return {
    user,
    permissionGroup,
    currencyCode: storeProfile?.currency,
    expiryWarningDays: storeProfile?.expiry_warning_days ?? DEFAULT_EXPIRY_WARNING_DAYS,
    storeType,
    t,
    now: new Date(),
  };
}

function generateId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useAssistant() {
  const { user, permissionGroup } = useAuth();
  const { storeProfile, storeType, t, activeStoreId } = useStore();
  const { messages, append, clear } = useAssistantPanel();
  const [isThinking, setIsThinking] = useState(false);
  const identityRef = useRef<string | null>(null);

  useEffect(() => {
    const identity = `${user?.id ?? ""}:${activeStoreId ?? ""}`;
    if (identityRef.current !== null && identityRef.current !== identity) {
      clear();
    }
    identityRef.current = identity;
  }, [user?.id, activeStoreId, clear]);

  const send = useCallback(
    async (text: string) => {
      const ctx = buildToolContext(user, permissionGroup, storeProfile, storeType, t);
      append({ id: generateId(), role: "user", text, at: new Date().toISOString() });
      setIsThinking(true);
      try {
        const reply = await answer(text, ctx);
        append({
          id: generateId(),
          role: "assistant",
          text: reply.text,
          actions: reply.actions,
          at: new Date().toISOString(),
        });
      } finally {
        setIsThinking(false);
      }
    },
    [user, permissionGroup, storeProfile, storeType, t, append],
  );

  const suggestions = useMemo(() => {
    const ctx = buildToolContext(user, permissionGroup, storeProfile, storeType, t);
    return Array.from(TOOL_REGISTRY.values())
      .filter((tool) => authorizeToolCall(tool, ctx).ok)
      .map((tool) => suggestionExampleFor(tool, ctx))
      .filter((example): example is string => Boolean(example))
      .slice(0, MAX_SUGGESTIONS);
  }, [user, permissionGroup, storeProfile, storeType, t]);

  return { messages, isThinking, suggestions, send };
}
