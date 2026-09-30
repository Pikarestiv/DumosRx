"use client";

import { useState, type FormEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AssistantComposerProps {
  isThinking: boolean;
  onSend: (text: string) => void | Promise<void>;
}

export function AssistantComposer({ isThinking, onSend }: AssistantComposerProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;
    void Promise.resolve()
      .then(() => onSend(trimmed))
      .catch(() => undefined);
    setValue("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border bg-background/95 p-3 backdrop-blur-sm"
    >
      <Input
        aria-label="Ask the assistant"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question…"
        disabled={isThinking}
        className="rounded-full"
      />
      <Button
        type="submit"
        size="icon"
        aria-label="Send"
        className="rounded-full"
        disabled={isThinking || value.trim().length === 0}
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </form>
  );
}
