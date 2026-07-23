"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Info } from "lucide-react";
import { logRequestedProduct } from "@/lib/db/requested-products-queries";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getAllCustomers } from "@/lib/db/queries/customers";
import { SearchableInput } from "@/components/ui/searchable-input";

export function RequestItemDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen =
    isControlled && controlledOnOpenChange
      ? controlledOnOpenChange
      : setInternalOpen;

  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: getAllCustomers,
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }

    setLoading(true);
    try {
      await logRequestedProduct(
        productName.trim(),
        customerName.trim() || undefined,
        parseInt(quantity) || 1,
        notes.trim() || undefined,
      );
      toast.success("Request logged successfully");
      setOpen(false);
      setProductName("");
      setCustomerName("");
      setQuantity("1");
      setNotes("");
    } catch (error) {
      console.error("Failed to log request:", error);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="Log Missing Product"
        className="sm:max-w-[425px]"
      >
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Panadol Extra"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity Asked For</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2 flex flex-col">
                <Label htmlFor="customer">Customer (Optional)</Label>
                <SearchableInput
                  id="customer"
                  placeholder="Select or type..."
                  value={customerName}
                  onValueChange={setCustomerName}
                  options={customers.map((c: any) => ({
                    label:
                      `${c.first_name} ${c.last_name}${c.phone ? ` (${c.phone})` : ""}`.trim(),
                    value: `${c.first_name} ${c.last_name}`.trim(),
                  }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Note (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Brand preference, urgency, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none h-16"
              />
            </div>

            <div className="text-[11.5px] text-primary/80 bg-primary/10 border border-primary/20 rounded-[10px] px-3 py-2.5 flex gap-2 items-start mt-2">
              <Info className="w-[15px] h-[15px] shrink-0 mt-0.5" />
              This gets logged for restocking and sent to your manager right
              away.
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="mt-2 sm:mt-0"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Request"}
            </Button>
          </div>
        </form>
      </ResponsiveModal>
    </>
  );
}
