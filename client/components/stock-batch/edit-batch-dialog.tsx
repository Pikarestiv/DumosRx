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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";

interface EditBatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  batch: any;
  onSuccess: () => void;
}

export function EditBatchDialog({
  isOpen,
  onClose,
  batch,
  onSuccess,
}: EditBatchDialogProps) {
  const [loading, setLoading] = useState(false);
  const { isAdmin } = useAuth();
  const [formData, setFormData] = useState({
    batch_number: "",
    expiry_date: "",
    quantity: 0,
    cost_price: 0,
  });

  useEffect(() => {
    if (batch) {
      setFormData({
        batch_number: batch.batch_number || "",
        expiry_date: batch.expiry_date
          ? new Date(batch.expiry_date).toISOString().split("T")[0]
          : "",
        quantity: batch.quantity || 0,
        cost_price: batch.cost_price || 0,
      });
    }
  }, [batch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { update } = await import("@/lib/db/local-database");

      await update("stock_batches", batch.id, {
        batch_number: formData.batch_number,
        expiry_date: formData.expiry_date,
        quantity: formData.quantity,
        cost_price: formData.cost_price,
      });

      toast.success("Batch details updated successfully");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to update batch:", error);
      toast.error("Failed to update batch details");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[425px]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Batch Details</DialogTitle>
          <DialogDescription>
            Update batch number, expiry date, and quantity for{" "}
            {batch?.product_name}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="batch_number">Batch Number</Label>
            <Input
              id="batch_number"
              value={formData.batch_number}
              onChange={(e) =>
                setFormData({ ...formData, batch_number: e.target.value })
              }
              placeholder="Enter batch number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiry_date">Expiry Date</Label>
            <DatePickerInput
              value={formData.expiry_date}
              onChange={(val) => setFormData({ ...formData, expiry_date: val })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  quantity: parseInt(e.target.value) || 0,
                })
              }
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cost_price">Cost Price (₦)</Label>
            <Input
              id="cost_price"
              type="number"
              step="0.01"
              value={formData.cost_price}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cost_price: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
