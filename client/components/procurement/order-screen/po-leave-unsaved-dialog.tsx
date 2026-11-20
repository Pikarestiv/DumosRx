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

interface PoLeaveUnsavedDialogProps {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export function PoLeaveUnsavedDialog({ open, onStay, onLeave }: PoLeaveUnsavedDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Your last changes aren&apos;t saved</AlertDialogTitle>
          <AlertDialogDescription>
            This device couldn&apos;t save them. If you leave now they are lost. Stay to retry, or leave
            without them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={onLeave}>Leave anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
