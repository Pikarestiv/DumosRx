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
          className="h-auto whitespace-normal text-left text-xs"
          onClick={() => onPick(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
