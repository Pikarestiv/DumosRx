"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Barcode as BarcodeIcon, 
  Printer,
  Minus,
  Plus
} from "lucide-react";
import { printBarcodeLabels } from "@/lib/utils/barcode-generator";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";

interface Medicine {
  id: string;
  name: string;
  unit_price: number;
}

interface BarcodePrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: Medicine | null;
}

export function BarcodePrintDialog({ isOpen, onClose, medicine }: BarcodePrintDialogProps) {
  const { profile } = useStore();
  const [quantity, setQuantity] = useState(1);

  const handlePrint = () => {
    if (!medicine) return;

    try {
      printBarcodeLabels([{
        name: medicine.name,
        price: medicine.unit_price,
        barcode: medicine.id, // Using ID as barcode for now
        currency: profile?.currency || "NGN"
      }], quantity);
      
      toast.success(`Printing ${quantity} labels for ${medicine.name}`);
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
              <DialogTitle className="text-xl font-serif">Print Barcode Labels</DialogTitle>
              <DialogDescription>
                Print individual product labels for your inventory.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {medicine && (
          <div className="py-6 space-y-6">
            <div className="p-4 rounded-2xl bg-muted/30 border border-accent/5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Product</p>
              <p className="font-bold text-lg">{medicine.name}</p>
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
                  onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
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
                  onClick={() => setQuantity(prev => prev + 1)}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-xl border-2 border-dashed border-accent/10 flex flex-col items-center justify-center gap-3 bg-accent/5">
                <div className="w-full h-8 bg-black/80 rounded flex items-center justify-center">
                    <div className="w-full h-full flex items-center justify-around px-2">
                        {[...Array(15)].map((_, i) => (
                            <div key={i} className={`h-full bg-white/20 w-${Math.floor(Math.random() * 2) + 1}`} />
                        ))}
                    </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono italic">Label Preview (50mm x 25mm)</p>
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
