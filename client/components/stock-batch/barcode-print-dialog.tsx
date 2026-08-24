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
import { Label } from "@/components/ui/label";
import { Barcode as BarcodeIcon, Printer, Minus, Plus } from "lucide-react";
import ReactBarcode from "react-barcode";
import { printNode } from "@/lib/utils/print-node";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import type { POSProduct } from "@/lib/types/product";

const LABEL_PAGE_STYLE = `
  @page { size: 50mm 25mm; margin: 0; }
  body { margin: 0; padding: 0; }
  .label {
    width: 50mm;
    height: 25mm;
    box-sizing: border-box;
    padding: 2mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    font-family: sans-serif;
  }
  .label .name {
    font-size: 8pt;
    font-weight: bold;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }
  .label .price {
    font-size: 9pt;
    font-weight: bold;
    margin-top: 1mm;
  }
`;

interface BarcodePrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  product: POSProduct | null;
}

export function BarcodePrintDialog({
  isOpen,
  onClose,
  product,
}: BarcodePrintDialogProps) {
  const { storeProfile } = useStore();
  const [quantity, setQuantity] = useState(1);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!product) return;

    try {
      requestAnimationFrame(() => {
        if (printRef.current) printNode(printRef.current, LABEL_PAGE_STYLE);
      });

      toast.success(`Printing ${quantity} labels for ${product.name}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to initiate printing");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-accent/10">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <BarcodeIcon className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-serif">
                Print Barcode Labels
              </DialogTitle>
              <DialogDescription>
                Print individual product labels for your inventory.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {product && (
          <div className="py-6 space-y-6">
            <div className="p-4 rounded-2xl bg-muted/30 border border-accent/5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Product
              </p>
              <p className="font-bold text-lg">{product.name}</p>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground block text-center">
                Number of Labels
              </Label>
              <div className="flex items-center justify-center gap-6">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl"
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                >
                  <Minus className="w-5 h-5" />
                </Button>
                <div className="w-20 text-center">
                  <span className="text-3xl font-bold">{quantity}</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl"
                  onClick={() => setQuantity((prev) => prev + 1)}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-xl border-2 border-dashed border-accent/10 flex flex-col items-center justify-center gap-3 bg-accent/5">
              <div className="bg-white rounded p-2">
                <ReactBarcode
                  value={product.barcode || product.id}
                  width={1.4}
                  height={40}
                  fontSize={11}
                  margin={0}
                />
              </div>
              <p className="text-[10px] text-muted-foreground font-mono italic">
                Label Preview (50mm x 25mm)
              </p>
            </div>
          </div>
        )}

        {/* Off-screen, printed via printNode, not display:none (that would
            carry over into the printed clone and hide it there too). */}
        {product && (
          <div
            aria-hidden="true"
            style={{ position: "fixed", left: -9999, top: -9999 }}
          >
            <div ref={printRef}>
              {Array.from({ length: quantity }).map((_, i) => (
                <div className="label" key={i}>
                  <div className="name">{product.name}</div>
                  <ReactBarcode
                    value={product.barcode || product.id}
                    width={1}
                    height={26}
                    fontSize={8}
                    margin={0}
                  />
                  <div className="price">
                    {storeProfile?.currency || "NGN"}{" "}
                    {product.unit_price.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-accent/10 pt-6">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
