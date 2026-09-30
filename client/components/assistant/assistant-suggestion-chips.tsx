"use client";

import { Button } from "@/components/ui/button";

interface AssistantSuggestionChipsProps {
  suggestions: string[];
  onPick: (text: string) => void;
}

export function AssistantSuggestionChips({ suggestions, onPick }: AssistantSuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-3">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto whitespace-normal rounded-full border-primary/40 px-3 py-1.5 text-left text-xs text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => onPick(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
