"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type AccountExitAction = "logout" | "switch";

interface AccountExitDialogProps {
  action: AccountExitAction | null;
  pendingCount: number;
  countInProgress: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const COUNT_KEPT =
  "A cycle count is in progress. It is saved on this device and opens where you left off when you, or a colleague, sign back in here. If this till was online while counting, the counted rows are also held in the store's cloud count session, so another till can take the count over from Cycle Count. Rows counted offline only reach that session once this till is back online with Cycle Count open. Nothing changes stock until the count is submitted.";

function pendingSyncText(pendingCount: number): string {
  return `You have ${pendingCount} offline transaction${pendingCount > 1 ? "s" : ""} pending sync. If you log out now, another user logging into this device will sync them on their account.`;
}

// Paired with useAccountActions: shown before logout or Switch Account when
// something on this device is still unsynced or a cycle count is in progress.
export function AccountExitDialog({
  action,
  pendingCount,
  countInProgress,
  onOpenChange,
  onConfirm,
}: AccountExitDialogProps) {
  const isSwitch = action === "switch";
  const hasUnsynced = !isSwitch && pendingCount > 0;
  const parts = [
    countInProgress ? COUNT_KEPT : null,
    hasUnsynced ? pendingSyncText(pendingCount) : null,
  ].filter(Boolean);

  return (
    <ConfirmDialog
      open={action !== null}
      onOpenChange={onOpenChange}
      title={hasUnsynced ? "Unsynced Changes Detected" : "Cycle count in progress"}
      description={
        <span className="flex flex-col gap-2">
          {parts.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </span>
      }
      confirmLabel={isSwitch ? "Switch account" : hasUnsynced ? "Sign Out Anyway" : "Sign out"}
      cancelLabel="Stay signed in"
      variant={hasUnsynced ? "destructive" : "default"}
      onConfirm={onConfirm}
    />
  );
}
