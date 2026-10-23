"use client";

import { useState, useMemo, useRef } from "react";
import { AuditLedgerStep } from "./audit-ledger-step";
import { AuditReviewStep } from "./audit-review-step";
import { AuditExportMenu } from "./audit-export-menu";
import { AuditPrintableSheet } from "./audit-printable-sheet";
import { ChevronLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useSubmitStockAuditMutation } from "@/lib/hooks/use-stock-audit-mutation";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { toast } from "sonner";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  hasUnsavedAuditEdits,
  selectAdjustedAuditItems,
  selectCountedAuditItems,
  toStockAuditSubmissions,
} from "./audit-derivations";
import { useStockAuditDraftStore } from "@/lib/hooks/use-stock-audit-draft";
import { useCountFreshness } from "@/lib/hooks/use-count-freshness";
import { useAuditLedgerLens } from "@/lib/hooks/use-audit-ledger-lens";
import { useAuditSheetExport } from "@/lib/hooks/use-audit-sheet-export";
import { useAuditSheetSource } from "@/lib/hooks/use-audit-sheet-source";
import { useAuditCounting } from "@/lib/hooks/use-audit-counting";

type AuditStep = "ledger" | "review" | "done";

export interface AuditItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  systemQty: number;
  countedQty?: number;
  costPrice?: number;
  countedCostPrice?: number;
  sellingPrice?: number;
  countedSellingPrice?: number;
  // Set once someone has actually been to the shelf for this row - by any edit, or by ticking the row by hand when the count…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-stock-audits-tsx-L69
  counted?: boolean;
  // Live stock as re-read at the moment this row's count was entered, and the only figure the submit may measure the count a…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-stock-audits-tsx-L73
  baselineQty?: number;
  // When this product was last reconciled by a submitted count (products.last_audited_at), so a counter can see what has gon…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-stock-audits-tsx-L78
  lastAuditedAt?: string | null;
  reason?: string;
}

const STEP_WIDTH = (step: AuditStep) =>
  step === "ledger" ? "w-full max-w-[1280px]" : "w-full max-w-[560px]";
const PRIMARY_BUTTON =
  "w-full bg-primary text-white border-0 py-3.5 rounded-xl text-[14px] font-bold cursor-pointer hover:bg-primary/90 transition-colors";

export function StockAudits({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const storeName = storeProfile?.name || "";
  const [step, setStep] = useState<AuditStep>("ledger");
  const freshness = useCountFreshness();
  const [staleAcknowledged, setStaleAcknowledged] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState<{
    counted: number;
    adjusted: number;
  } | null>(null);

  const { isLoading, isSyncing } = useAuditSheetSource();
  const items = useStockAuditDraftStore((state) => state.items);
  const clearDraft = useStockAuditDraftStore((state) => state.clearDraft);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const ledger = useAuditLedgerLens(items);
  const { countRow, cancelPendingCounts, updateLedgerItem } = useAuditCounting();

  const countedItems = useMemo(() => selectCountedAuditItems(items), [items]);
  const adjustedItems = useMemo(
    () => selectAdjustedAuditItems(countedItems),
    [countedItems],
  );

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const sheetExport = useAuditSheetExport(
    { exportItems: ledger.exportItems, lens: ledger.lens, totalCount: items.length },
    storeName,
  );

  const submitAuditMutation = useSubmitStockAuditMutation();
  const isSubmitting = submitAuditMutation.isPending;

  const submitAudit = () => {
    if (isSubmitting) return;
    submitAuditMutation.mutate(
      {
        items: toStockAuditSubmissions(adjustedItems),
        performedBy: user?.id || null,
      },
      {
        onSuccess: () => {
          setSubmittedSummary({
            counted: countedItems.length,
            adjusted: adjustedItems.length,
          });
          clearDraft();
          setStep("done");
        },
        onError: (error) => {
          console.error("Failed to submit stock audit:", error);
          toast.error("Failed to save the cycle count. Please try again.");
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background w-full h-full">
      <ConfirmDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        title="Leave this cycle count?"
        description={`${adjustedItems.length} row(s) have been edited but not submitted yet. They stay saved on this device, so reopening Cycle Count picks up exactly where you left off. Nothing has been posted to stock.`}
        confirmLabel="Leave count"
        cancelLabel="Keep counting"
        variant="default"
        onConfirm={() => {
          setShowDiscardDialog(false);
          onClose();
        }}
      />

      <ConfirmDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        title="Start this count over?"
        description={`Every tick and figure entered so far is cleared and the sheet reloads at the system's current stock levels${adjustedItems.length > 0 ? ` — including ${adjustedItems.length} edited row(s)` : ""}. Nothing that has already been submitted is affected.`}
        confirmLabel="Start over"
        cancelLabel="Keep counting"
        variant="destructive"
        onConfirm={() => {
          setShowResetDialog(false);
          cancelPendingCounts();
          clearDraft();
          ledger.resetLens();
        }}
      />

      {sheetExport.printStage && (
        <LoadingOverlay
          message={sheetExport.printStage.message}
          progress={sheetExport.printStage.progress}
          onCancel={sheetExport.handleCancelPdfDownload}
        />
      )}

      <AuditPrintableSheet
        sheet={sheetExport.printSheet}
        storeName={storeName}
        sheetRef={sheetExport.printableRef}
      />

      <div
        className="flex items-center gap-3 px-4 md:px-6 pb-4 md:pb-5 border-b border-border bg-card"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1rem)" }}
      >
        <button
          type="button"
          aria-label="Back"
          className="w-8 h-8 md:w-[38px] md:h-[38px] rounded-[10px] bg-muted/30 flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted hover:border hover:border-border transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          onClick={() => {
            if (step === "review") setStep("ledger");
            else if (step === "ledger" && hasUnsavedAuditEdits(items))
              setShowDiscardDialog(true);
            else onClose();
          }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="text-[14px] md:text-[15px] font-semibold">
            Cycle Count
          </div>
          <div className="text-[11px] md:text-[11.5px] text-muted-foreground">
            {step === "ledger" && "Count items"}
            {step === "review" && "Review"}
            {step === "done" && "Finished"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {step === "ledger" && (
            <AuditExportMenu
              menuDisabled={!!sheetExport.printStage || items.length === 0}
              exportDisabled={ledger.exportItems.length === 0}
              onPrint={() => void sheetExport.handlePrint()}
              onDownloadPdf={() => void sheetExport.handleDownloadPdf()}
              onExport={(format) => void sheetExport.handleExport(format)}
              onStartOver={() => setShowResetDialog(true)}
            />
          )}
          <div className="hidden md:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-200 rounded-full px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[11.5px] font-semibold text-emerald-700">
              Saved locally · syncs when online
            </span>
          </div>
        </div>
      </div>

      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-4 md:p-8 md:pt-4 flex justify-center"
        style={{
          paddingBottom:
            "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)",
        }}
      >
        <div className={STEP_WIDTH(step)}>
          {step === "ledger" && (
            <AuditLedgerStep
              items={ledger.visibleItems}
              totalItems={items.length}
              isLoading={isLoading}
              isSyncing={isSyncing}
              onUpdateItem={updateLedgerItem}
              onCountRow={(id, qty) => void countRow(id, qty)}
              onClearCount={cancelPendingCounts}
              categories={ledger.categories}
              selectedCategory={ledger.selectedCategory}
              setSelectedCategory={ledger.setSelectedCategory}
              countStatus={ledger.countStatus}
              setCountStatus={ledger.setCountStatus}
              countedCount={countedItems.length}
              search={ledger.search}
              setSearch={ledger.setSearch}
              scrollElementRef={scrollAreaRef}
              sort={ledger.sort}
            />
          )}

          {step === "review" && (
            <AuditReviewStep
              countedItems={countedItems}
              adjustedItems={adjustedItems}
              freshness={freshness}
              staleAcknowledged={staleAcknowledged}
              onStaleAcknowledgedChange={setStaleAcknowledged}
            />
          )}

          {step === "done" && (
            <div className="text-center py-10 animate-in zoom-in-95 duration-500">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="text-[18px] font-semibold mb-1.5">
                Audit submitted
              </div>
              <div className="text-[13px] text-muted-foreground mb-6">
                {submittedSummary?.counted ?? countedItems.length} items counted
                · {submittedSummary?.adjusted ?? adjustedItems.length} adjusted
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background p-4 md:px-8 md:py-5 flex justify-center shrink-0">
        <div className={STEP_WIDTH(step)}>
          {step === "ledger" && (
            <button className={PRIMARY_BUTTON} onClick={() => setStep("review")}>
              Review &amp; submit
            </button>
          )}

          {step === "review" && (
            <button
              className={`${PRIMARY_BUTTON} disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
              disabled={
                isSubmitting ||
                countedItems.length === 0 ||
                (freshness.shouldWarn && !staleAcknowledged)
              }
              onClick={submitAudit}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "Submitting..." : "Submit audit"}
            </button>
          )}

          {step === "done" && (
            <button className={PRIMARY_BUTTON} onClick={onClose}>
              Close Audit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
