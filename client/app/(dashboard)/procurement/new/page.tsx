"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, ArrowLeft, X } from "lucide-react";
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
import { POAddItemForm } from "@/components/procurement/po-add-item-form";
import { POLineItemsList } from "@/components/procurement/po-line-items-list";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { createProduct, createPurchaseOrder } from "@/lib/db/local-database";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

import { useStore } from "@/lib/context/store-context";
import { useProcurementData } from "@/lib/hooks/use-procurement-data";

export default function CreateOrderPage() {
  const router = useRouter();
  const { storeType } = useStore();

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [initialProductName, setInitialProductName] = useState("");

  const { suppliers, products, refetch: fetchData } = useProcurementData();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddLineItem = (newItem: any) => {
    setItems([...items, newItem]);
  };

  const handleOpenAddProduct = (initialName: string) => {
    setInitialProductName(initialName);
    setIsAddProductOpen(true);
  };

  const handleCreateProduct = async (productData: any, keepOpen?: boolean) => {
    try {
      const newProduct = await createProduct(productData);
      toast.success(`${productData.name} added to catalog`);

      // Refresh products list
      await fetchData();

      if (!keepOpen) {
        setIsAddProductOpen(false);
      }
    } catch (error) {
      console.error("Failed to add product:", error);
      toast.error("Failed to add product");
    }
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
      router.push("/procurement");
    } catch (error) {
      console.error("Failed to create PO:", error);
      toast.error("Error creating purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSupplierName = useMemo(() => {
    return suppliers.find(s => s.id === selectedSupplierId)?.name || "No vendor selected";
  }, [suppliers, selectedSupplierId]);

  return (
    <div className="flex flex-col min-h-0 bg-card border border-border rounded-2xl overflow-hidden h-[calc(100vh-120px)] shadow-sm">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border bg-card shrink-0">
        <div 
          className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
          onClick={() => router.push("/procurement")}
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </div>
        <div>
          <div className="text-[17px] font-serif font-bold leading-tight">Create Purchase Order</div>
          <div className="text-[12px] text-muted-foreground mt-0.5">Draft a formal request for stock batch replenishment</div>
        </div>
        <div className="ml-auto text-[12.5px] text-muted-foreground font-medium">
          Draft · {items.length} items
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_380px] min-h-0">
        {/* Left Pane */}
        <div className="p-6 overflow-y-auto flex flex-col gap-4 bg-background/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12.5px] font-semibold text-foreground">Select Vendor</Label>
              <Select
                value={selectedSupplierId}
                onValueChange={setSelectedSupplierId}
              >
                <SelectTrigger className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm">
                  <SelectValue placeholder="Choose a supplier..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {suppliers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px] font-semibold text-foreground">Internal Notes</Label>
              <Input
                placeholder="Ref. # or special instructions"
                className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12.5px] font-semibold text-foreground">Payment Status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="unpaid">Unpaid (Full Credit)</SelectItem>
                  <SelectItem value="partial">Partial Payment</SelectItem>
                  <SelectItem value="paid">Fully Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px] font-semibold text-foreground">Due Date (Optional)</Label>
              <Input
                type="date"
                className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {paymentStatus !== "unpaid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12.5px] font-semibold text-foreground">
                  Amount Paid ({paymentStatus === "paid" ? "Total" : "Initial Payment"})
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm"
                  value={paymentStatus === "paid" ? totalAmount : amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  disabled={paymentStatus === "paid"}
                />
              </div>
            </div>
          )}

          <div className="border border-border rounded-xl bg-card mt-2 shadow-sm">
            <div className="bg-primary/5 px-4 py-3 flex items-center gap-2 border-b border-border rounded-t-[11px]">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <div className="text-[13.5px] font-semibold text-foreground">Add Items to Order</div>
            </div>
            <div className="p-4">
              <POAddItemForm
                products={products}
                onAddItem={handleAddLineItem}
                onOpenAddProduct={handleOpenAddProduct}
              />
            </div>
          </div>
          <div className="text-[11.5px] text-muted-foreground px-1">
            Items appear in the Order Summary panel on the right as you add them.
          </div>
        </div>

        {/* Right Pane (Summary) */}
        <div className="bg-card border-l border-border flex flex-col min-h-0 hidden md:flex">
          <div className="p-5 border-b border-border shrink-0">
            <div className="text-[14.5px] font-semibold text-foreground">Order Summary</div>
            <div className="text-[12px] text-muted-foreground mt-0.5 truncate">{selectedSupplierName}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
            <POLineItemsList
              items={items}
              onRemoveItem={removeLineItem}
              storeType={storeType}
            />
          </div>
          <div className="p-5 border-t border-border shrink-0 bg-card">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Estimated total</div>
              <div className="text-[20px] font-bold font-serif text-primary">
                {formatCurrency(totalAmount)}
              </div>
            </div>
            <Button
              className="w-full h-12 rounded-xl text-[14px] font-bold"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Save Purchase Order"}
            </Button>
          </div>
        </div>
      </div>

      <AddProductDialog
        open={isAddProductOpen}
        onOpenChange={setIsAddProductOpen}
        onAddProduct={handleCreateProduct}
        editingProduct={{ name: initialProductName } as any}
      />
    </div>
  );
}
