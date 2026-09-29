"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/context/auth-context";
import { useStockAdjustmentDraftStore } from "@/lib/hooks/use-stock-adjustment-draft";
import { useSubmitStockAdjustmentMutation } from "@/lib/hooks/use-stock-adjustment-mutation";
import { AdjustmentPreferencesStep } from "./adjustment-preferences-step";
import { AdjustmentItemsStep, toAdjustmentDraftItem } from "./adjustment-items-step";
import { ADJUSTMENT_REASONS } from "./adjustment-derivations";

interface AdjustStockFlowProps {
  onClose: () => void;
  onSubmitted?: () => void;
}

/** Full-page creation flow, the same shell the cycle count uses
 * (`stock-audits.tsx`): a fixed header with a back button, a centered
 * scrolling body and a pinned footer action. It replaces the tab's content
 * outright rather than overlaying it, so the two-step entry has the whole
 * viewport on a phone instead of a dialog's scroll box. */
export function AdjustStockFlow({ onClose, onSubmitted }: AdjustStockFlowProps) {
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
  });

  const submitMutation = useSubmitStockAdjustmentMutation();

  const reasonLabel = useMemo(
    () => ADJUSTMENT_REASONS.find((option) => option.value === reason)?.label ?? "",
    [reason],
  );

  const adjustableItems = items.filter((item) => item.quantity !== 0);

  const handleBack = () => {
    if (step === "items") {
      setStep("preferences");
      return;
    }
    onClose();
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
      onClose();
    } catch (error) {
      console.error("Stock adjustment failed:", error);
      toast.error("Couldn't record this adjustment. Please try again.");
    }
  };

  return (
    <div
      data-testid="adjust-stock-flow"
      className="fixed inset-0 z-50 flex flex-col bg-background w-full h-full"
    >
      <div
        className="flex items-center gap-3 px-4 md:px-6 pb-4 md:pb-5 border-b border-border bg-card"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1rem)" }}
      >
        <button
          type="button"
          aria-label="Back"
          className="w-8 h-8 md:w-[38px] md:h-[38px] rounded-[10px] bg-muted/30 flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted hover:border hover:border-border transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          onClick={handleBack}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="text-[14px] md:text-[15px] font-semibold">Adjust Stock</div>
          <div className="text-[11px] md:text-[11.5px] text-muted-foreground">
            {step === "preferences"
              ? "Step 1 of 2 - Pick a reason"
              : `Step 2 of 2 - ${reasonLabel}`}
          </div>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 md:p-8 md:pt-4 flex justify-center"
        style={{
          paddingBottom:
            "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)",
        }}
      >
        <div className={`w-full ${step === "preferences" ? "max-w-2xl" : "max-w-[1280px]"}`}>
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
        </div>
      </div>

      <div className="border-t border-border bg-background p-4 md:px-8 md:py-5 flex justify-center shrink-0">
        <div className={`w-full ${step === "preferences" ? "max-w-[560px]" : "max-w-[1280px]"}`}>
          {step === "preferences" ? (
            <button
              type="button"
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-primary/90 transition-colors"
              onClick={() => setStep("items")}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              disabled={adjustableItems.length === 0 || submitMutation.isPending}
              onClick={() => void handleSubmit()}
            >
              {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitMutation.isPending ? "Submitting..." : "Submit adjustment"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
