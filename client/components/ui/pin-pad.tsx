"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  className?: string;
  onSubmit?: () => void;
}

export function PinPad({
  value,
  onChange,
  maxLength = 4,
  className,
  onSubmit,
}: PinPadProps) {
  const handlePress = (digit: string) => {
    if (value.length < maxLength) {
      const newValue = value + digit;
      onChange(newValue);
      if (newValue.length === maxLength && onSubmit) {
        onSubmit();
      }
    }
  };

  const handleDelete = () => {
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [null, "0", "delete"],
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-2 sm:gap-4 max-w-[280px] mx-auto",
        className,
      )}
    >
      {digits.flat().map((btn, index) => {
        if (btn === null) {
          return <div key={`empty-${index}`} />;
        }

        if (btn === "delete") {
          return (
            <Button
              key="delete"
              variant="ghost"
              size="icon"
              className="aspect-square h-auto w-full max-w-[64px] mx-auto rounded-full text-2xl hover:bg-muted/50 active:bg-muted"
              onClick={handleDelete}
              type="button"
            >
              <Delete className="h-10 w-10 text-muted-foreground" />
              <span className="sr-only">Delete</span>
            </Button>
          );
        }

        return (
          <Button
            key={btn}
            variant="ghost"
            className="aspect-square h-auto w-full max-w-[64px] mx-auto rounded-full text-2xl font-normal hover:bg-muted/50 active:bg-muted shadow-sm border border-transparent hover:border-border/50"
            onClick={() => handlePress(btn)}
            type="button"
          >
            {btn}
          </Button>
        );
      })}
    </div>
  );
}
