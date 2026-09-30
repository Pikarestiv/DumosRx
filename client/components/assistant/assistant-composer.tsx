"use client";

import { useState, type FormEvent } from "react";
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
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
      <Input
        aria-label="Ask the assistant"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question…"
        disabled={isThinking}
      />
      <Button type="submit" disabled={isThinking || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}
