"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PendingMigration } from "@/lib/types/admin";

interface RunMigrationsDialogProps {
  open: boolean;
  pending: PendingMigration[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RunMigrationsDialog({
  open,
  pending,
  isPending,
  onOpenChange,
  onConfirm,
}: RunMigrationsDialogProps) {
  const destructive = pending.filter((migration) => migration.alters_existing_data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent role="alertdialog" className="bg-background/95 backdrop-blur-sm border shadow-sm">
        <DialogHeader>
          <DialogTitle>
            Run {pending.length} pending migration{pending.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3">
              <p>
                This applies every pending migration to the production database, in order. It does
                not seed, and it cannot be undone from here.
              </p>

              {destructive.length > 0 && (
                <p className="font-bold text-destructive">
                  {destructive.length} of these {pending.length} alter or remove existing data. This
                  host has no backup step, and a migration that fails midway cannot be rolled back —
                  take a database backup first.
                </p>
              )}

              <p className="text-xs">
                If the request times out the migration may still be applying. Re-read the pending
                list rather than assuming it failed.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Running…" : "Run migrations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
