"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { POAddItemForm } from "./po-add-item-form";
import { POLineItemsList } from "./po-line-items-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPurchaseOrder } from "@/lib/db/local-database";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

import { useStore } from "@/lib/context/store-context";
import { useProcurementData } from "@/lib/hooks/use-procurement-data";

interface CreatePODialogProps {
  onPOCreated: () => void;
}

export function CreatePODialog({ onPOCreated }: CreatePODialogProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { storeType } = useStore();
  const [open, setOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setOpen(true);
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const newUrl =
        pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newUrl);
    }
  }, [searchParams, router, pathname]);

  // New item state managed by POAddItemForm now

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const { suppliers, products, refetch: fetchData } = useProcurementData();

  const handleAddLineItem = (newItem: any) => {
    setItems([...items, newItem]);
  };

  const removeLineItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = async () => {
    if (!selectedSupplierId) {
      toast.error("Please select a vendor");
      return;
    }

    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }

    setIsSubmitting(true);
    try {
      await createPurchaseOrder(
        selectedSupplierId,
        notes,
        items,
        paymentStatus,
        paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
        dueDate || null,
      );
      toast.success("Purchase Order created successfully");
      setOpen(false);
      onPOCreated();
      // Reset form
      setItems([]);
      setSelectedSupplierId("");
      setNotes("");
      setPaymentStatus("unpaid");
      setAmountPaid("");
      setDueDate("");
    } catch (error) {
      console.error("Failed to create PO:", error);
      toast.error("Error creating purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={<>Create Purchase Order</>}
        description={<>Draft a formal request for stock batch replenishment</>}
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-accent/20 bg-card/95 backdrop-blur-xl"
        headerClassName="p-6 border-b border-accent/10"
      >
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Select Vendor</Label>
              <Select
                value={selectedSupplierId}
                onValueChange={setSelectedSupplierId}
              >
                <SelectTrigger className="bg-muted/30 border-accent/10">
                  <SelectValue placeholder="Choose a supplier..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-accent/20">
                  {suppliers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Input
                placeholder="Ref. # or special instructions..."
                className="bg-muted/30 border-accent/10"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="bg-muted/30 border-accent/10">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-accent/20">
                  <SelectItem value="unpaid">Unpaid (Full Credit)</SelectItem>
                  <SelectItem value="partial">Partial Payment</SelectItem>
                  <SelectItem value="paid">Fully Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentStatus !== "unpaid" && (
              <div className="space-y-2">
                <Label>
                  Amount Paid (
                  {paymentStatus === "paid" ? "Total" : "Initial Payment"})
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="bg-muted/30 border-accent/10"
                  value={paymentStatus === "paid" ? totalAmount : amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  disabled={paymentStatus === "paid"}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Due Date (Optional)</Label>
              <Input
                type="date"
                className="bg-muted/30 border-accent/10"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <Card className="border-accent/10 bg-accent/5">
            <CardHeader className="py-3 px-4 bg-accent/10 border-b border-accent/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" /> Add Items to
                Order
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <POAddItemForm
                products={products}
                onAddItem={handleAddLineItem}
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="font-bold text-sm border-b border-accent/10 pb-2 flex items-center justify-between">
              Order Details
              <span className="text-primary">{items.length} line items</span>
            </h3>
            <POLineItemsList
              items={items}
              onRemoveItem={removeLineItem}
              storeType={storeType}
            />
          </div>
        </div>

        <div className="p-6 border-t border-accent/10 bg-accent/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider">
              Estimated Total
            </p>
            <p className="text-3xl font-serif font-black text-primary">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 md:flex-none px-8 h-12 text-lg font-bold shadow-xl shadow-primary/20"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Save Purchase Order"}
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
