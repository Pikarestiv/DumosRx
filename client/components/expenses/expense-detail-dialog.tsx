"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2, FileText, Calendar, CreditCard, Tag } from "lucide-react";
import { softDelete } from "@/lib/db/local-database";
import { toast } from "sonner";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStore } from "@/lib/context/store-context";

interface ExpenseDetailDialogProps {
  expense: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function ExpenseDetailDialog({ expense, open, onOpenChange, onDeleted }: ExpenseDetailDialogProps) {
  const { storeProfile } = useStore();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  if (!expense) return null;

  const handleDelete = async () => {
    try {
      await softDelete("expenses", expense.id);
      toast.success("Expense deleted");
      setShowConfirmDelete(false);
      onDeleted();
    } catch (error) {
      console.error("Failed to delete expense:", error);
      toast.error("Failed to delete expense");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden bg-card rounded-2xl gap-0 border-border shadow-lg">
          <DialogHeader className="px-6 py-5 border-b border-border m-0">
            <DialogTitle className="text-[15px] font-semibold">Expense detail</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-5 flex flex-col gap-5">
            <div className="text-center">
              <div className="text-[28px] font-bold font-serif mb-1">
                {formatCurrency(expense.amount, storeProfile?.currency || "NGN")}
              </div>
              <div className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                {expense.category}
              </div>
            </div>

            <div className="grid gap-4 mt-2">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-[11.5px] text-muted-foreground font-semibold mb-0.5">Description</div>
                  <div className="text-[14px] font-medium text-foreground">{expense.description || "No description"}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-[11.5px] text-muted-foreground font-semibold mb-0.5">Date</div>
                  <div className="text-[14px] font-medium text-foreground">{format(new Date(expense.date), "MMMM dd, yyyy")}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-[11.5px] text-muted-foreground font-semibold mb-0.5">Payment Method</div>
                  <div className="text-[14px] font-medium text-foreground">{expense.payment_method}</div>
                </div>
              </div>
            </div>

            {expense.notes && (
              <div className="mt-2 bg-muted/50 rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">Notes</span>
                </div>
                <p className="text-[13px] text-foreground leading-relaxed">{expense.notes}</p>
              </div>
            )}
          </div>

          <div className="px-6 pb-6 flex gap-2.5 mt-auto">
            <Button 
              variant="outline" 
              className="flex-1 rounded-xl h-11 text-[13px] font-semibold border-border text-foreground hover:bg-muted"
            >
              <Edit2 className="w-4 h-4 mr-2" /> Edit
            </Button>
            <Button 
              variant="outline" 
              className="flex-1 rounded-xl h-11 text-[13px] font-semibold border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowConfirmDelete(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showConfirmDelete}
        onOpenChange={setShowConfirmDelete}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
