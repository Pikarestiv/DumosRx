"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { prefersReducedMotion } from "@/lib/prefers-reduced-motion";
import type { AssistantMessage } from "@/lib/assistant/types";

const WORD_INTERVAL_MS = 45;
const MAX_REVEAL_MS = 1500;

interface AssistantMessageBubbleProps {
  message: AssistantMessage;
  animate: boolean;
  userInitials: string;
  onActionClick: () => void;
}

interface TextSegment {
  text: string;
  wordIndex: number | null;
}

function splitIntoSegments(text: string): TextSegment[] {
  let wordIndex = 0;
  return text
    .split(/(\s+)/)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^\s+$/.test(part)) return { text: part, wordIndex: null };
      const segment = { text: part, wordIndex };
      wordIndex += 1;
      return segment;
    });
}

function useWordReveal(total: number, animate: boolean): { revealed: number; layered: boolean } {
  const [layered] = useState(() => animate && total > 0 && !prefersReducedMotion());
  const [revealed, setRevealed] = useState(() => (layered ? 0 : total));

  useEffect(() => {
    if (!layered) return;
    const maxTicks = Math.max(1, Math.floor(MAX_REVEAL_MS / WORD_INTERVAL_MS));
    const perTick = Math.max(1, Math.ceil(total / maxTicks));
    let shown = 0;
    const timer = setInterval(() => {
      shown += perTick;
      if (shown >= total) {
        clearInterval(timer);
        setRevealed(total);
        return;
      }
      setRevealed(shown);
    }, WORD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [layered, total]);

  return { revealed, layered };
}

export function AssistantMessageBubble({
  message,
  animate,
  userInitials,
  onActionClick,
}: AssistantMessageBubbleProps) {
  const isUser = message.role === "user";
  const segments = useMemo(() => splitIntoSegments(message.text), [message.text]);
  const wordCount = useMemo(
    () => segments.filter((segment) => segment.wordIndex !== null).length,
    [segments],
  );
  const { revealed, layered } = useWordReveal(wordCount, animate && !isUser);
  const fullyRevealed = revealed >= wordCount;

  const revealingWords = segments.map((segment, index) => {
    if (segment.wordIndex === null) return segment.text;
    const visible = segment.wordIndex < revealed;
    return (
      <span
        key={index}
        data-revealed={visible ? "true" : "false"}
        className={`transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        {segment.text}
      </span>
    );
  });

  return (
    <div className={`flex items-start gap-2 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
      )}
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground shadow-sm"
            : "max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-muted px-3 py-2 text-sm text-foreground shadow-sm"
        }
      >
        {layered && !fullyRevealed ? (
          <p className="whitespace-pre-wrap">{revealingWords}</p>
        ) : (
          <p className="whitespace-pre-wrap">{message.text}</p>
        )}
        {fullyRevealed && message.actions && message.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.actions.map((action) => (
              <Button
                key={`${action.href}:${action.label}`}
                asChild
                variant="outline"
                size="sm"
                className="rounded-full border-primary/40 text-primary"
                onClick={onActionClick}
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
      {isUser && (
        <Avatar className="mt-0.5 h-7 w-7 border border-border">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {userInitials}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
