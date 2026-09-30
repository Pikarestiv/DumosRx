"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollFade } from "@/components/ui/scroll-fade";
import type { AssistantMessage } from "@/lib/assistant/types";

interface AssistantMessageListProps {
  messages: AssistantMessage[];
  isThinking: boolean;
  onActionClick: () => void;
}

export function AssistantMessageList({
  messages,
  isThinking,
  onActionClick,
}: AssistantMessageListProps) {
  return (
    <ScrollFade containerClassName="flex-1 min-h-0" className="p-3">
      <div role="log" aria-live="polite" className="flex flex-col gap-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
            }
          >
            <p className="whitespace-pre-wrap">{message.text}</p>
            {message.actions && message.actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.actions.map((action) => (
                  <Button
                    key={`${action.href}:${action.label}`}
                    asChild
                    variant="outline"
                    size="sm"
                    onClick={onActionClick}
                  >
                    <Link href={action.href}>{action.label}</Link>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isThinking && (
          <div className="max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Thinking…
          </div>
        )}
      </div>
    </ScrollFade>
  );
}
