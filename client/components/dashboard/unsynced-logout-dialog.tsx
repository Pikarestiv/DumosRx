"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface UnsyncedLogoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingCount: number;
  onConfirm: () => void;
}

// Paired with useAccountActions. Shown when a full logout is attempted
// while offline changes are still queued for sync.
export function UnsyncedLogoutDialog({
  open,
  onOpenChange,
  pendingCount,
  onConfirm,
}: UnsyncedLogoutDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Unsynced Changes Detected"
      description={`You have ${pendingCount} offline transaction${pendingCount > 1 ? "s" : ""} pending sync. If you log out now, another user logging into this device will sync them on their account. Are you sure you want to sign out?`}
      confirmLabel="Sign Out Anyway"
      variant="destructive"
      onConfirm={onConfirm}
    />
  );
}
