"use client";

import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Search,
  Package,
  TrendingDown,
  TrendingUp,
  Minus,
  Plus,
} from "lucide-react";
import { getBatchesForProduct } from "@/lib/db/queries/inventory";
import { insert, update } from "@/lib/db/local-database";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";
import { Badge } from "@/components/ui/badge";
import { useStockAudit } from "@/lib/hooks/use-inventory-data";

import type { AuditProduct as Product } from "@/lib/db/queries/inventory";

interface StockAuditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function StockAuditDialog({
  isOpen,
  onClose,
  onSuccess,
}: StockAuditDialogProps) {
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [actualQuantity, setActualQuantity] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { products, isLoading, refetch: loadProducts } = useStockAudit();

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const filteredProducts = products.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSubmit = async () => {
    if (!selectedProduct || actualQuantity === "") {
      toast.error("Please select a product and enter the actual quantity");
      return;
    }

    try {
      setSubmitting(true);
      const auditId = `audit_${Date.now()}`;
      const diff = Number(actualQuantity) - selectedProduct.stock_quantity;

      // 1. Record the audit
      await insert("stock_audits", {
        id: auditId,
        product_id: selectedProduct.id,
        expected_quantity: selectedProduct.stock_quantity,
        actual_quantity: Number(actualQuantity),
        difference: diff,
        notes,
        user_id: user?.id || "unknown",
        status: "completed",
        created_at: new Date().toISOString(),
        reconciled_at: new Date().toISOString(),
      });

      // 2. Reconcile stock batches
      if (diff > 0) {
        // Positive discrepancy: add an audit batch
        await insert("stock_batches", {
          product_id: selectedProduct.id,
          batch_number: "AUDIT_" + Date.now().toString().slice(-6),
          quantity: diff,
          cost_price: selectedProduct.cost_price || 0,
          selling_price: selectedProduct.selling_price || 0,
          expiry_date: new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          is_active: 1,
        });
      } else if (diff < 0) {
        // Negative discrepancy: deduct using FIFO
        const batches = await getBatchesForProduct(selectedProduct.id);
        let remainingToDeduct = Math.abs(diff);
        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;
          const deduction = Math.min(batch.quantity, remainingToDeduct);
          await update("stock_batches", batch.id, {
            quantity: batch.quantity - deduction,
            updated_at: new Date().toISOString(),
          });
          remainingToDeduct -= deduction;
        }
      }

      toast.success(`Stock reconciled for ${selectedProduct.name}`);
      onSuccess?.();
      onClose();

      // Reset
      setSelectedProduct(null);
      setActualQuantity("");
      setNotes("");
      setSearch("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save reconciliation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-background/95 backdrop-blur-xl border-accent/10">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <ClipboardCheck className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div className="text-left">
              <DialogTitle className="text-lg sm:text-xl font-serif">
                Stock Audit
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Perform physical stock-taking and reconcile with system records.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search product..."
                className="pl-9 bg-card border-accent/10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="border border-accent/10 rounded-xl h-[300px] overflow-y-auto bg-card/50">
              {filteredProducts.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedProduct(m)}
                  className={`w-full text-left p-3 border-b border-accent/5 hover:bg-accent/5 transition-colors flex items-center justify-between ${selectedProduct?.id === m.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                >
                  <div className="space-y-1">
                    <p className="font-bold text-sm">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      Current: {m.stock_quantity} {m.base_unit}
                    </p>
                  </div>
                  {selectedProduct?.id === m.id && (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {!selectedProduct ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-accent/10 rounded-2xl bg-accent/5">
                <Package className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground italic">
                  Select a product from the list to start reconciliation
                </p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                  <h4 className="font-bold text-lg">{selectedProduct.name}</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      System Record:
                    </span>
                    <Badge
                      variant="outline"
                      className="font-mono text-primary border-primary/20 bg-primary/5"
                    >
                      {selectedProduct.stock_quantity}{" "}
                      {selectedProduct.base_unit}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Physical Count ({selectedProduct.base_unit})
                  </Label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setActualQuantity((prev) =>
                          Math.max(0, (Number(prev) || 0) - 1),
                        )
                      }
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Input
                      type="number"
                      placeholder="Enter actual count"
                      className="text-center text-lg font-bold bg-card border-accent/10"
                      value={actualQuantity}
                      onChange={(e) =>
                        setActualQuantity(
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setActualQuantity((prev) => (Number(prev) || 0) + 1)
                      }
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {actualQuantity !== "" && (
                  <div
                    className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${
                      Number(actualQuantity) === selectedProduct.stock_quantity
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                        : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                    }`}
                  >
                    {Number(actualQuantity) ===
                    selectedProduct.stock_quantity ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <p className="text-sm font-bold">
                          Perfect Match! No discrepancy found.
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold">Discrepancy Found</p>
                          <p className="text-[10px] uppercase tracking-wider">
                            Difference:{" "}
                            {Number(actualQuantity) -
                              selectedProduct.stock_quantity >
                            0
                              ? "+"
                              : ""}
                            {Number(actualQuantity) -
                              selectedProduct.stock_quantity}{" "}
                            units
                          </p>
                        </div>
                        {Number(actualQuantity) <
                        selectedProduct.stock_quantity ? (
                          <TrendingDown className="w-5 h-5 ml-auto opacity-50" />
                        ) : (
                          <TrendingUp className="w-5 h-5 ml-auto opacity-50" />
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Reconciliation Notes
                  </Label>
                  <Textarea
                    placeholder="Reason for discrepancy (e.g. damage, expiry, theft...)"
                    className="bg-card border-accent/10 resize-none h-20"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-accent/10 pt-4 sm:pt-6 flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 mt-4 sm:mt-0">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedProduct || actualQuantity === ""}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer w-full sm:w-auto"
          >
            {submitting ? "Processing..." : "Reconcile Stock Batch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
