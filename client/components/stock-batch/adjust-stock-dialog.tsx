"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/context/auth-context";
import { useStockAdjustmentDraftStore } from "@/lib/hooks/use-stock-adjustment-draft";
import { useSubmitStockAdjustmentMutation } from "@/lib/hooks/use-stock-adjustment-mutation";
import { AdjustmentPreferencesStep } from "./adjustment-preferences-step";
import { AdjustmentItemsStep, toAdjustmentDraftItem } from "./adjustment-items-step";
import { ADJUSTMENT_REASONS } from "./adjustment-derivations";

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  onSubmitted,
}: AdjustStockDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<"preferences" | "items">("preferences");

  const reason = useStockAdjustmentDraftStore((state) => state.reason);
  const note = useStockAdjustmentDraftStore((state) => state.note);
  const items = useStockAdjustmentDraftStore((state) => state.items);
  const setReason = useStockAdjustmentDraftStore((state) => state.setReason);
  const setNote = useStockAdjustmentDraftStore((state) => state.setNote);
  const addItem = useStockAdjustmentDraftStore((state) => state.addItem);
  const setQuantity = useStockAdjustmentDraftStore((state) => state.setQuantity);
  const removeItem = useStockAdjustmentDraftStore((state) => state.removeItem);
  const clearDraft = useStockAdjustmentDraftStore((state) => state.clearDraft);

  const { data: products } = useQuery({
    ...queryKeys.products.withDetails(),
    queryFn: () => getProductsWithDetails(),
    enabled: open,
  });

  const submitMutation = useSubmitStockAdjustmentMutation();

  const reasonLabel = useMemo(
    () => ADJUSTMENT_REASONS.find((option) => option.value === reason)?.label ?? "",
    [reason],
  );

  const adjustableItems = items.filter((item) => item.quantity !== 0);

  const close = () => {
    setStep("preferences");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync({
        items: adjustableItems,
        reason,
        note,
        performedBy: user?.id ?? null,
      });
      toast.success(
        `Stock adjusted for ${adjustableItems.length} ${
          adjustableItems.length === 1 ? "item" : "items"
        }.`,
      );
      clearDraft();
      onSubmitted?.();
      close();
    } catch (error) {
      console.error("Stock adjustment failed:", error);
      toast.error("Couldn't record this adjustment. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {step === "preferences"
              ? "Step 1 of 2 — pick a reason for this adjustment."
              : `Step 2 of 2 — ${reasonLabel.toLowerCase()}`}
          </DialogDescription>
        </DialogHeader>

        {step === "preferences" ? (
          <AdjustmentPreferencesStep
            reason={reason}
            note={note}
            onReasonChange={setReason}
            onNoteChange={setNote}
          />
        ) : (
          <AdjustmentItemsStep
            reason={reason}
            items={items}
            products={products ?? []}
            onAdd={(product) => addItem(toAdjustmentDraftItem(product))}
            onChangeQuantity={setQuantity}
            onRemove={removeItem}
          />
        )}

        <DialogFooter className="gap-2">
          {step === "items" && (
            <Button variant="outline" onClick={() => setStep("preferences")}>
              Back
            </Button>
          )}
          {step === "preferences" ? (
            <Button onClick={() => setStep("items")}>Continue</Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={adjustableItems.length === 0 || submitMutation.isPending}
            >
              {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit adjustment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
