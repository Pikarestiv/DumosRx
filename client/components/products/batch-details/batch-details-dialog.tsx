"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_BATCH_NUMBER_LENGTH, validateBatchDetails } from "@/lib/db/queries/batch-details-correction";
import { useCorrectBatchDetailsMutation } from "@/lib/hooks/use-correct-batch-details-mutation";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import type { StockBatch } from "@/lib/types/stock-batch";

interface BatchDetailsDialogProps {
  batch: StockBatch;
  productName: string;
  onClose: () => void;
}

const current = (batch: StockBatch) => ({
  batch_number: batch.batch_number ?? "",
  expiry_date: batch.expiry_date?.slice(0, 10) ?? "",
  manufacture_date: batch.manufacture_date?.slice(0, 10) ?? "",
});

export function BatchDetailsDialog({ batch, productName, onClose }: BatchDetailsDialogProps) {
  const [form, setForm] = useState(() => current(batch));
  const correctDetails = useCorrectBatchDetailsMutation();
  const displayName = useDisplayName();

  const original = current(batch);
  const isChanged = (Object.keys(form) as (keyof typeof form)[]).some((key) => form[key].trim() !== original[key]);
  const error = validateBatchDetails(form, original);
  const lotLabel = batch.batch_number || "Default";

  const save = async () => {
    try {
      await correctDetails.mutateAsync({ batchId: batch.id, details: form });
      toast.success(`Details updated for batch ${lotLabel}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the batch details");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight">Edit batch details</DialogTitle>
          <DialogDescription>
            {displayName(productName)} · Lot {lotLabel}. Quantity changes from Adjust stock; cost from the cost breakdown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="batch-lot">Lot number</Label>
            <Input
              id="batch-lot"
              value={form.batch_number}
              maxLength={MAX_BATCH_NUMBER_LENGTH}
              onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry date</Label>
            <DatePickerInput
              value={form.expiry_date}
              onChange={(expiry_date) => setForm({ ...form, expiry_date })}
              ariaLabel="Expiry date"
              placeholder="No expiry"
              fromYear={new Date().getFullYear() - 10}
              toYear={new Date().getFullYear() + 15}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Manufacture date</Label>
            <DatePickerInput
              value={form.manufacture_date}
              onChange={(manufacture_date) => setForm({ ...form, manufacture_date })}
              ariaLabel="Manufacture date"
              placeholder="Not set"
              fromYear={new Date().getFullYear() - 20}
              toYear={new Date().getFullYear()}
              disableFuture
            />
          </div>
          {error && isChanged && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={onClose} disabled={correctDetails.isPending}>
            Cancel
          </Button>
          <Button
            className="flex-[2] h-11 rounded-xl font-semibold"
            disabled={!isChanged || Boolean(error) || correctDetails.isPending}
            onClick={() => void save()}
          >
            {correctDetails.isPending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
