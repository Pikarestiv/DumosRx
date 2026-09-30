"use client";

import { useCallback } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { useAssistant } from "@/lib/hooks/use-assistant";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { AssistantMessageList } from "./assistant-message-list";
import { AssistantComposer } from "./assistant-composer";
import { AssistantSuggestionChips } from "./assistant-suggestion-chips";

export function AssistantPanel() {
  const isOpen = useAssistantPanel((state) => state.isOpen);
  const close = useAssistantPanel((state) => state.close);
  const { messages, isThinking, suggestions, send } = useAssistant();

  const handleSend = useCallback(
    (text: string) => {
      void Promise.resolve()
        .then(() => send(text))
        .catch(() => undefined);
    },
    [send],
  );

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Assistant"
      description="Ask how to do something, or ask for a quick number."
      className="sm:max-w-lg"
      footer={<AssistantComposer isThinking={isThinking} onSend={handleSend} />}
    >
      <div className="flex h-[60vh] flex-col">
        {messages.length === 0 && (
          <AssistantSuggestionChips suggestions={suggestions} onPick={handleSend} />
        )}
        <AssistantMessageList messages={messages} isThinking={isThinking} onActionClick={close} />
      </div>
    </ResponsiveModal>
  );
}
