"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, ArrowLeft } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="flex flex-col min-h-0 w-full max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/procurement")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="text-[12px] text-muted-foreground font-medium mb-0.5">
            Procurement
          </div>
          <div className="text-[22px] font-serif font-bold">
            Create Purchase Order
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Details</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

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
              onOpenAddProduct={handleOpenAddProduct}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4 border-b border-accent/10 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              Line Items
            </CardTitle>
            <span className="text-primary text-sm font-medium">
              {items.length} items
            </span>
          </CardHeader>
          <CardContent className="p-4">
            <POLineItemsList
              items={items}
              onRemoveItem={removeLineItem}
              storeType={storeType}
            />
          </CardContent>
        </Card>

        <div className="p-6 border border-accent/10 rounded-xl bg-card flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
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
              onClick={() => router.push("/procurement")}
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
