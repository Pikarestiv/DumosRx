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
  Plus
} from "lucide-react";
import { query } from "@/lib/db/core";
import { insert, update } from "@/lib/db/local-database";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";
import { Badge } from "@/components/ui/badge";

interface Medicine {
  id: string;
  name: string;
  stock_quantity: number;
  base_unit: string;
}

interface StockAuditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function StockAuditDialog({ isOpen, onClose, onSuccess }: StockAuditDialogProps) {
  const { user } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [actualQuantity, setActualQuantity] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMedicines();
    }
  }, [isOpen]);

  const loadMedicines = async () => {
    try {
      const res = await query<Medicine>("SELECT id, name, stock_quantity, base_unit FROM medicines WHERE is_active = 1");
      setMedicines(res);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMedicines = medicines.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!selectedMedicine || actualQuantity === "") {
      toast.error("Please select a medicine and enter the actual quantity");
      return;
    }

    try {
      setSubmitting(true);
      const auditId = `audit_${Date.now()}`;
      const diff = Number(actualQuantity) - selectedMedicine.stock_quantity;

      // 1. Record the audit
      await insert("stock_audits", {
        id: auditId,
        medicine_id: selectedMedicine.id,
        expected_quantity: selectedMedicine.stock_quantity,
        actual_quantity: Number(actualQuantity),
        difference: diff,
        notes,
        user_id: user?.id || "unknown",
        status: "completed",
        created_at: new Date().toISOString(),
        reconciled_at: new Date().toISOString(),
      });

      // 2. Update the actual stock quantity in medicines table
      await update("medicines", selectedMedicine.id, {
        stock_quantity: Number(actualQuantity),
        updated_at: new Date().toISOString(),
      });

      toast.success(`Inventory reconciled for ${selectedMedicine.name}`);
      onSuccess?.();
      onClose();
      
      // Reset
      setSelectedMedicine(null);
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
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border-accent/10">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-serif">Inventory Audit Mode</DialogTitle>
              <DialogDescription>
                Perform physical stock-taking and reconcile with system records.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search product..."
                className="pl-9 bg-card border-accent/10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="border border-accent/10 rounded-xl h-[300px] overflow-y-auto bg-card/50">
              {filteredMedicines.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMedicine(m)}
                  className={`w-full text-left p-3 border-b border-accent/5 hover:bg-accent/5 transition-colors flex items-center justify-between ${selectedMedicine?.id === m.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                >
                  <div className="space-y-1">
                    <p className="font-bold text-sm">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      Current: {m.stock_quantity} {m.base_unit}
                    </p>
                  </div>
                  {selectedMedicine?.id === m.id && (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {!selectedMedicine ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-accent/10 rounded-2xl bg-accent/5">
                <Package className="w-12 h-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground italic">
                  Select a product from the list to start reconciliation
                </p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                  <h4 className="font-bold text-lg">{selectedMedicine.name}</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">System Record:</span>
                    <Badge variant="outline" className="font-mono text-primary border-primary/20 bg-primary/5">
                      {selectedMedicine.stock_quantity} {selectedMedicine.base_unit}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Physical Count ({selectedMedicine.base_unit})
                  </Label>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setActualQuantity(prev => Math.max(0, (Number(prev) || 0) - 1))}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Input
                      type="number"
                      placeholder="Enter actual count"
                      className="text-center text-lg font-bold bg-card border-accent/10"
                      value={actualQuantity}
                      onChange={(e) => setActualQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setActualQuantity(prev => (Number(prev) || 0) + 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {actualQuantity !== "" && (
                  <div className={`p-4 rounded-2xl border flex items-center gap-3 transition-all ${
                    Number(actualQuantity) === selectedMedicine.stock_quantity
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                  }`}>
                    {Number(actualQuantity) === selectedMedicine.stock_quantity ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <p className="text-sm font-bold">Perfect Match! No discrepancy found.</p>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold">Discrepancy Found</p>
                          <p className="text-[10px] uppercase tracking-wider">
                            Difference: {Number(actualQuantity) - selectedMedicine.stock_quantity > 0 ? '+' : ''}
                            {Number(actualQuantity) - selectedMedicine.stock_quantity} units
                          </p>
                        </div>
                        {Number(actualQuantity) < selectedMedicine.stock_quantity ? (
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

        <DialogFooter className="border-t border-accent/10 pt-6">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={submitting || !selectedMedicine || actualQuantity === ""}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
          >
            {submitting ? "Processing..." : "Reconcile Inventory"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
