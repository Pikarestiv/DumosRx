"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchableInput } from "@/components/ui/searchable-input";
import { ProductCombobox } from "@/components/ui/product-combobox";
import { useRouter } from "next/navigation";

interface AddStockAdjustmentFormProps {
  newAdjustment: {
    product: string;
    batch_id: string;
    adjustmentType: "increase" | "decrease";
    quantity: number;
    reason: string;
    notes: string;
  };
  setNewAdjustment: React.Dispatch<
    React.SetStateAction<{
      product: string;
      batch_id: string;
      adjustmentType: "increase" | "decrease";
      quantity: number;
      reason: string;
      notes: string;
    }>
  >;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  reasons: string[];
  availableBatches?: any[];
}

export function AddStockAdjustmentForm({
  newAdjustment,
  setNewAdjustment,
  onSubmit,
  onCancel,
  reasons,
  availableBatches = [],
}: AddStockAdjustmentFormProps) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          New Stock Adjustment
        </CardTitle>
        <CardDescription>
          Record stock batch adjustments for audit purposes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product">Product *</Label>
              <ProductCombobox
                value={newAdjustment.product}
                onChange={(option) => {
                  setNewAdjustment((prev) => ({
                    ...prev,
                    product: option.name,
                  }));
                  if (option.source === "new" || option.source === "global") {
                    router.push(
                      `/inventory/products?add=true&name=${encodeURIComponent(option.name)}&source=${option.source}`,
                    );
                  }
                }}
                placeholder="Enter product name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjustmentType">Adjustment Type *</Label>
              <Select
                value={newAdjustment.adjustmentType}
                onValueChange={(value: "increase" | "decrease") =>
                  setNewAdjustment((prev) => ({
                    ...prev,
                    adjustmentType: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Increase Stock</SelectItem>
                  <SelectItem value="decrease">Decrease Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch_id">Batch *</Label>
              <Select
                value={newAdjustment.batch_id}
                onValueChange={(value) =>
                  setNewAdjustment((prev) => ({ ...prev, batch_id: value }))
                }
                disabled={!newAdjustment.product}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select batch..." />
                </SelectTrigger>
                <SelectContent>
                  {availableBatches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batch_number} (Qty: {batch.quantity}, Exp:{" "}
                      {batch.expiry_date
                        ? new Date(batch.expiry_date).toLocaleDateString()
                        : "N/A"}
                      )
                    </SelectItem>
                  ))}
                  {newAdjustment.adjustmentType === "increase" && (
                    <SelectItem value="new">+ Create New Batch</SelectItem>
                  )}
                  {newAdjustment.adjustmentType === "decrease" &&
                    availableBatches.length > 0 && (
                      <SelectItem value="">Auto (FIFO Deduction)</SelectItem>
                    )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                value={
                  newAdjustment.quantity === 0 ? "" : newAdjustment.quantity
                }
                onChange={(e) =>
                  setNewAdjustment((prev) => ({
                    ...prev,
                    quantity: Number.parseInt(e.target.value) || 0,
                  }))
                }
                onFocus={(e) => e.target.select()}
                placeholder="0"
                min="1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <SearchableInput
                value={newAdjustment.reason}
                onValueChange={(val) =>
                  setNewAdjustment((prev) => ({ ...prev, reason: val }))
                }
                options={reasons}
                placeholder="Select or type reason"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={newAdjustment.notes}
              onChange={(e) =>
                setNewAdjustment((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Additional notes or explanation..."
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              className="bg-accent hover:bg-accent/90 cursor-pointer"
            >
              Submit Adjustment
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
