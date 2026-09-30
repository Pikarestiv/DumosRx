"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ScrollFade } from "@/components/ui/scroll-fade";
import type { AssistantMessage } from "@/lib/assistant/types";
import { AssistantMessageBubble } from "./assistant-message-bubble";

interface AssistantMessageListProps {
  messages: AssistantMessage[];
  isThinking: boolean;
  onActionClick: () => void;
}

const DOT_DELAYS = ["0ms", "150ms", "300ms"];

function TypingDots() {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div
        className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-border bg-muted px-3 py-3 shadow-sm"
        aria-label="Thinking"
        role="status"
      >
        {DOT_DELAYS.map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-primary/70"
            style={{ animationDelay: delay }}
          />
        ))}
      </div>
    </div>
  );
}

export function AssistantMessageList({
  messages,
  isThinking,
  onActionClick,
}: AssistantMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [preexistingIds] = useState(() => new Set(messages.map((message) => message.id)));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isThinking]);

  return (
    <ScrollFade containerClassName="flex-1 min-h-0" className="p-3">
      <div role="log" aria-live="polite" className="flex flex-col gap-3">
        {messages.map((message) => (
          <AssistantMessageBubble
            key={message.id}
            message={message}
            animate={!preexistingIds.has(message.id)}
            onActionClick={onActionClick}
          />
        ))}
        {isThinking && <TypingDots />}
        <div ref={bottomRef} />
      </div>
    </ScrollFade>
  );
}
