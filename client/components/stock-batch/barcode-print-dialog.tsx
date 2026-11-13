"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Barcode as BarcodeIcon, Printer } from "lucide-react";
import ReactBarcode from "react-barcode";
import { printNode } from "@/lib/utils/print-node";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import {
  useDisplayName,
  useUppercaseDisplay,
  useUppercaseDisplayClass,
} from "@/lib/hooks/use-uppercase-display";
import { cn } from "@/lib/utils";
import {
  barcodeFit,
  buildLabelSheetHtml,
  clampLabelQuantity,
  clampStartPosition,
  getLabelPageStyle,
  LABEL_LAYOUTS,
} from "./barcode-label-sheet";
import { BarcodeLabelOptions } from "./barcode-label-options";
import { formatLabelPrice, labelBarcodeValue } from "./barcode-label-markup";
import { useLabelLayout } from "./use-label-layout";

// Only the four fields a label actually carries, so any product shape can be printed — POSProduct satisfies it structurall…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-barcode-print-dialog-tsx-L24
export interface BarcodeLabelProduct {
  id: string;
  name: string;
  barcode?: string;
  unit_price: number;
}

interface BarcodePrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: BarcodeLabelProduct | null;
}

function BarcodeWidthWarning({ product, unencodable, neededMm, availableMm }: {
  product: BarcodeLabelProduct;
  unencodable: boolean;
  neededMm: number;
  availableMm: number;
}) {
  return (
    <div role="alert" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {unencodable ? (
        <p>
          This barcode contains characters a label can&apos;t encode, so the label prints the product&apos;s internal ID
          instead, which is long and may not scan. Change the product&apos;s barcode for a scannable label.
        </p>
      ) : (
        <p>
          {!product.barcode && "This product has no barcode, so the label uses its internal ID. "}
          That code needs about {Math.round(neededMm)} mm of bars but the label has {Math.round(availableMm)} mm,
          so it will be squeezed to fit and may not scan.
          {product.barcode ? " Give the product a shorter barcode." : " Add a barcode to the product for a scannable label."}
        </p>
      )}
    </div>
  );
}

export function BarcodePrintDialog({
  isOpen,
  onClose,
  product,
}: BarcodePrintDialogProps) {
  const { storeProfile } = useStore();
  const uppercaseNames = useUppercaseDisplay();
  const capsClass = useUppercaseDisplayClass();
  const displayName = useDisplayName();
  const { layout, setLayout } = useLabelLayout();
  const [quantityText, setQuantityText] = useState("1");
  const [startText, setStartText] = useState("1");
  const printRef = useRef<HTMLDivElement>(null);

  const quantity = clampLabelQuantity(Number(quantityText));
  const startPosition = clampStartPosition(layout, Number(startText));
  const barcodeValue = product ? labelBarcodeValue(product) : "";
  const unencodable = !!product?.barcode && barcodeValue !== product.barcode;
  const fit = barcodeFit(barcodeValue, layout);
  const price = product ? formatLabelPrice(storeProfile?.currency, product.unit_price) : "";

  const handlePrint = () => {
    if (!product) return;

    try {
      const template = printRef.current;
      if (!template) return;

      const sheet = document.createElement("div");
      sheet.innerHTML = buildLabelSheetHtml(template.innerHTML, quantity, layout, startPosition);

      printNode(sheet, getLabelPageStyle(layout, uppercaseNames)).catch((err) => {
        console.error("[print] Failed to print labels:", err);
        toast.error("Couldn't open the print dialog. Please try again.");
      });

      toast.success(`Printing ${quantity} labels for ${displayName(product.name)}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to initiate printing");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-accent/10"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 p-6 pb-4 pr-12">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <BarcodeIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-xl font-serif">
                Print Barcode Labels
              </DialogTitle>
              <DialogDescription>
                Print price and barcode labels for this product.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {product && (
          <div data-label-dialog-body className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-6 space-y-5">
            <div className="p-4 rounded-2xl bg-muted/30 border border-accent/5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Product
              </p>
              <p data-testid="label-product-name" className={cn("font-bold text-lg break-words", capsClass)}>
                {product.name}
              </p>
            </div>

            <BarcodeLabelOptions
              quantityText={quantityText}
              onQuantityTextChange={setQuantityText}
              layout={layout}
              onLayoutChange={setLayout}
              startText={startText}
              onStartTextChange={setStartText}
              startPosition={startPosition}
            />

            {(unencodable || !fit.fits) && (
              <BarcodeWidthWarning product={product} unencodable={unencodable} neededMm={fit.neededMm} availableMm={fit.availableMm} />
            )}

            <div className="p-4 rounded-xl border-2 border-dashed border-accent/10 flex flex-col items-center justify-center gap-2 bg-accent/5">
              <div className="w-full max-w-[16rem] bg-white text-black rounded p-2 text-center space-y-1">
                <p className={cn("text-xs font-bold truncate", capsClass)}>{product.name}</p>
                <ReactBarcode
                  value={barcodeValue}
                  width={1}
                  height={40}
                  fontSize={11}
                  margin={0}
                  className="mx-auto block max-w-full h-auto"
                />
                <p className="text-xs font-bold">{price}</p>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono italic">
                Label preview ({LABEL_LAYOUTS[layout].widthMm} × {LABEL_LAYOUTS[layout].heightMm} mm)
              </p>
            </div>
          </div>
        )}

        {product && (
          <div
            aria-hidden="true"
            style={{ position: "fixed", left: -9999, top: -9999 }}
          >
            <div ref={printRef}>
              <div className="label">
                <div className="name">{product.name}</div>
                <ReactBarcode
                  value={barcodeValue}
                  width={1}
                  height={26}
                  fontSize={8}
                  margin={0}
                />
                <div className="price">{price}</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-accent/10 px-6 py-4">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!product}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print {quantity} label{quantity === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
