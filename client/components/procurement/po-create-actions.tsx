"use client";

import { Button } from "@/components/ui/button";

interface POCreateActionsProps {
  isWalkIn: boolean;
  canReceive: boolean;
  isSubmitting: boolean;
  hasItems: boolean;
  compact?: boolean;
  onSaveDraft: () => void;
  onReceive: () => void;
  onSend: () => void;
}

export function POCreateActions({
  isWalkIn,
  canReceive,
  isSubmitting,
  hasItems,
  compact,
  onSaveDraft,
  onReceive,
  onSend,
}: POCreateActionsProps) {
  const size = compact
    ? "h-9 px-3 rounded-[10px] text-[12.5px] font-semibold"
    : "h-10 px-5 rounded-[10px] text-[13px] font-bold";
  const disabled = isSubmitting || !hasItems;

  return (
    <>
      <Button variant="outline" className={size} onClick={onSaveDraft} disabled={disabled}>
        {compact ? "Draft" : "Save as Draft"}
      </Button>
      {canReceive && (
        <Button
          variant={isWalkIn ? "default" : "outline"}
          className={size}
          onClick={onReceive}
          disabled={disabled}
        >
          {isSubmitting && isWalkIn ? "Saving..." : compact ? "Receive" : "Receive stock"}
        </Button>
      )}
      {!isWalkIn && (
        <Button className={size} onClick={onSend} disabled={disabled}>
          {isSubmitting ? "Saving..." : compact ? "Send" : "Send to vendor"}
        </Button>
      )}
    </>
  );
}
