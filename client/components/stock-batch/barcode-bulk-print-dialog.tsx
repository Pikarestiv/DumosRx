"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Barcode as BarcodeIcon, Printer } from "lucide-react";
import { toast } from "sonner";
import { printNode } from "@/lib/utils/print-node";
import { useStore } from "@/lib/context/store-context";
import { useUppercaseDisplay } from "@/lib/hooks/use-uppercase-display";
import {
  buildMultiProductSheetHtml,
  clampLabelQuantity,
  clampStartPosition,
  getLabelPageStyle,
  MAX_BULK_LABELS,
} from "./barcode-label-sheet";
import { buildLabelHtml, labelBarcodeValue, type LabelProduct } from "./barcode-label-markup";
import { BarcodeLabelOptions } from "./barcode-label-options";
import { useLabelLayout } from "./use-label-layout";

interface BarcodeBulkPrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  products: LabelProduct[];
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function BarcodeBulkPrintDialog({ isOpen, onClose, products }: BarcodeBulkPrintDialogProps) {
  const { storeProfile } = useStore();
  const uppercaseNames = useUppercaseDisplay();
  const { layout, setLayout } = useLabelLayout();
  const [copiesText, setCopiesText] = useState("1");
  const [startText, setStartText] = useState("1");

  const copies = clampLabelQuantity(Number(copiesText));
  const startPosition = clampStartPosition(layout, Number(startText));
  const totalLabels = products.length * copies;
  const tooMany = totalLabels > MAX_BULK_LABELS;
  const printsId = useMemo(() => products.filter((p) => labelBarcodeValue(p) !== p.barcode).length, [products]);

  const handlePrint = () => {
    try {
      const labelHtmls = products.map((p) => buildLabelHtml(p, storeProfile?.currency));
      const sheet = document.createElement("div");
      sheet.innerHTML = buildMultiProductSheetHtml(labelHtmls, copies, layout, startPosition);
      printNode(sheet, getLabelPageStyle(layout, uppercaseNames)).catch((err) => {
        console.error("[print] Failed to print labels:", err);
        toast.error("Couldn't open the print dialog. Please try again.");
      });
      toast.success(`Printing ${plural(totalLabels, "label")} for ${plural(products.length, "product")}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to initiate printing");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-accent/10"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 p-6 pb-4 pr-12">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <BarcodeIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-xl font-serif">Print labels for {plural(products.length, "product")}</DialogTitle>
              <DialogDescription>One label per product, packed edge to edge to save paper.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div data-label-dialog-body className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-6 space-y-5">
          <BarcodeLabelOptions
            quantityText={copiesText}
            onQuantityTextChange={setCopiesText}
            layout={layout}
            onLayoutChange={setLayout}
            startText={startText}
            onStartTextChange={setStartText}
            startPosition={startPosition}
            quantityLabel="Labels per product"
            totalLabels={totalLabels}
          />
          {printsId > 0 && (
            <p className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {plural(printsId, "product")} {printsId === 1 ? "has" : "have"} no barcode or one that cannot be printed;{" "}
              {printsId === 1 ? "its" : "their"} label prints the product id, which is long and may not scan.
            </p>
          )}
          {tooMany && (
            <p role="alert" className="text-xs font-medium text-destructive">
              That is {totalLabels} labels; the most one job can print is {MAX_BULK_LABELS}. Narrow the product list or print fewer copies.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-accent/10 px-6 py-4">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={products.length === 0 || tooMany}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print {plural(totalLabels, "label")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
