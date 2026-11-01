"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface POSwitchToStandardDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function POSwitchToStandardDialog({ open, onConfirm, onCancel }: POSwitchToStandardDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch to a Standard order?</AlertDialogTitle>
          <AlertDialogDescription>
            A Standard order doesn&apos;t take a price, cost, lot and expiry up front: those are entered when you receive
            it. What you typed for them on these items will be cleared, and switching back won&apos;t restore it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Immediate</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="!bg-destructive !text-destructive-foreground !hover:bg-destructive/90"
          >
            Switch &amp; Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
