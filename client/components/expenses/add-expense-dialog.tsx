"use client";

import { useState, useEffect } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { insert, update } from "@/lib/db/local-database";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";
import { Info } from "lucide-react";
import { DatePickerInput } from "@/components/ui/date-picker-input";

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseToEdit?: any;
  onSaved?: () => void;
}

const CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Marketing",
  "Other",
];

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card"];

export function AddExpenseDialog({ open, onOpenChange, expenseToEdit, onSaved }: AddExpenseDialogProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: "Rent",
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    payment_method: "Cash",
    notes: "",
  });

  useEffect(() => {
    if (expenseToEdit && open) {
      setFormData({
        category: expenseToEdit.category || "Rent",
        amount: expenseToEdit.amount?.toString() || "",
        description: expenseToEdit.description || "",
        date: expenseToEdit.date ? new Date(expenseToEdit.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        payment_method: expenseToEdit.payment_method || "Cash",
        notes: expenseToEdit.notes || "",
      });
    } else if (!open) {
      // Reset form when closed
      setFormData({
        category: "Rent",
        amount: "",
        description: "",
        date: new Date().toISOString().split("T")[0],
        payment_method: "Cash",
        notes: "",
      });
    }
  }, [expenseToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category || !formData.amount || !formData.date) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        user_id: user?.id,
      };

      if (expenseToEdit) {
        await update("expenses", expenseToEdit.id, data);
        toast.success("Expense updated successfully");
      } else {
        await insert("expenses", data);
        toast.success("Expense added successfully");
      }
      
      onSaved?.();
      onOpenChange(false);
      
      // Form reset is handled by useEffect when modal closes
    } catch (error) {
      console.error("Failed to save expense:", error);
      toast.error("Failed to save expense");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ResponsiveModal 
      open={open} 
      onOpenChange={onOpenChange} 
      title={<span className="text-[17px] font-serif font-bold">{expenseToEdit ? "Edit Expense" : "Add Expense"}</span>}
      className="p-0 sm:max-w-[520px] bg-card rounded-2xl overflow-hidden gap-0 border-border"
      headerClassName="px-6 py-5 border-b border-border m-0"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[85vh]">
        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[12.5px] font-semibold mb-1.5 block text-foreground">Date</label>
              <DatePickerInput
                value={formData.date}
                onChange={(value: string) => setFormData(prev => ({ ...prev, date: value }))}
                className="w-full bg-background [&_input]:border-border [&_input]:rounded-[10px] [&_input]:px-3.5 [&_input]:py-2.5 [&_input]:text-[13px] [&_input]:h-auto focus-within:border-primary"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold mb-1.5 block text-foreground">Category</label>
              <select 
                className="w-full border border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary bg-background text-foreground"
                value={formData.category}
                onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <label className="text-[12.5px] font-semibold mb-1.5 block text-foreground">Description</label>
            <input 
              type="text" 
              required
              placeholder="e.g. July shop rent" 
              className="w-full border border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary bg-background text-foreground placeholder:text-muted-foreground"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[12.5px] font-semibold mb-1.5 block text-foreground">Amount</label>
              <input 
                type="number" 
                step="0.01"
                required
                placeholder="0.00" 
                className="w-full border border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary bg-background text-foreground placeholder:text-muted-foreground"
                value={formData.amount}
                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold mb-1.5 block text-foreground">Method</label>
              <select 
                className="w-full border border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary bg-background text-foreground"
                value={formData.payment_method}
                onChange={e => setFormData(prev => ({ ...prev, payment_method: e.target.value }))}
              >
                {PAYMENT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <label className="text-[12.5px] font-semibold mb-1.5 block text-foreground">Notes (optional)</label>
            <input 
              type="text" 
              placeholder="Any extra detail" 
              className="w-full border border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary bg-background text-foreground placeholder:text-muted-foreground"
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          
          <div className="text-[11.5px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-[10px] px-3.5 py-3 flex gap-2 items-start mt-2">
            <Info className="w-[15px] h-[15px] text-primary shrink-0 mt-0.5" />
            Attach a receipt later from the expense detail view — file upload coming soon.
          </div>
        </div>
        
        <div className="px-6 py-5 border-t border-border mt-auto bg-card">
          <Button 
            type="submit" 
            className="w-full py-6 rounded-xl text-[14px] font-bold"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : expenseToEdit ? "Update Expense" : "Save Expense"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
