"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShoppingCart, ArrowLeft, Clock } from "lucide-react";
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
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  createProduct,
  getPurchaseOrderById,
  updatePurchaseOrder,
} from "@/lib/db/local-database";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

import { useStore } from "@/lib/context/store-context";
import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useQueryClient } from "@tanstack/react-query";

function EditOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const id = searchParams.get("id");
  const { storeType } = useStore();

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [initialProductData, setInitialProductData] = useState<any>(null);
  const [newlyCreatedProductId, setNewlyCreatedProductId] = useState<
    string | null
  >(null);

  const { suppliers, products, refetch: fetchData } = useProcurementData();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    async function loadPO() {
      if (!id) return;
      setIsLoading(true);
      try {
        const poData = await getPurchaseOrderById(id);
        if (poData) {
          setSelectedSupplierId(poData.supplier_id);
          setNotes(poData.notes || "");
          setItems(poData.items || []);
          setPaymentStatus(poData.payment_status || "unpaid");
          setAmountPaid(poData.amount_paid?.toString() || "");
          setDueDate(poData.due_date || "");
        } else {
          toast.error("Purchase order not found");
          router.push("/procurement");
        }
      } catch (err) {
        console.error("Failed to load PO", err);
        toast.error("Failed to load PO");
      } finally {
        setIsLoading(false);
      }
    }
    loadPO();
  }, [id, router]);

  const handleAddLineItem = (newItem: any) => {
    setItems([...items, newItem]);
  };

  const handleOpenAddProduct = (productData: any) => {
    setInitialProductData(productData);
    setIsAddProductOpen(true);
  };

  const handleCreateProduct = async (productData: any, keepOpen?: boolean) => {
    try {
      const newProductId = await createProduct(productData);
      toast.success(`${productData.name} added to catalog`);

      // Refresh products list
      await fetchData();
      await queryClient.invalidateQueries({ queryKey: ["productList"] });
      setNewlyCreatedProductId(newProductId);

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
    if (!id) {
      toast.error("Purchase order ID is missing");
      return;
    }

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
      await updatePurchaseOrder(
        id,
        selectedSupplierId,
        notes,
        items,
        paymentStatus,
        paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
        dueDate || null,
      );
      toast.success("Purchase Order updated successfully");
      router.push("/procurement");
    } catch (error) {
      console.error("Failed to create PO:", error);
      toast.error("Error creating purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSupplierName = useMemo(() => {
    return (
      suppliers.find((s) => s.id === selectedSupplierId)?.name ||
      "No vendor selected"
    );
  }, [suppliers, selectedSupplierId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] bg-card border border-border rounded-2xl">
        <Clock className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground font-medium text-sm">
          Loading order...
        </p>
      </div>
    );
  }

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
          <div className="text-[17px] font-serif font-bold leading-tight">
            Edit Purchase Order
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            Modify draft or sent purchase order
          </div>
        </div>
        <div className="ml-auto text-[12.5px] text-muted-foreground font-medium">
          PO-{id ? id.split("-")[0]?.toUpperCase() : ""} · {items.length} items
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_380px] min-h-0">
        {/* Left Pane */}
        <div className="p-6 overflow-y-auto flex flex-col gap-4 bg-background/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12.5px] font-semibold text-foreground">
                Select Vendor
              </Label>
              <Select
                value={selectedSupplierId}
                onValueChange={setSelectedSupplierId}
              >
                <SelectTrigger className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm">
                  <SelectValue placeholder="Choose a supplier..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {suppliers.length === 0 ? (
                    <div className="py-4 text-center text-[12.5px] text-muted-foreground px-2 flex flex-col items-center justify-center gap-1.5">
                      <span>No suppliers available</span>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-[11px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/procurement/vendors?action=add");
                        }}
                      >
                        Add a supplier first
                      </Button>
                    </div>
                  ) : (
                    suppliers.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px] font-semibold text-foreground">
                Internal Notes
              </Label>
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
              <Label className="text-[12.5px] font-semibold text-foreground">
                Payment Status
              </Label>
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
              <Label className="text-[12.5px] font-semibold text-foreground">
                Due Date (Optional)
              </Label>
              <DatePickerInput
                value={dueDate}
                onChange={(val) => setDueDate(val)}
                className="w-full [&_input]:bg-card [&_input]:shadow-sm [&_input]:border [&_input]:border-border [&_input]:rounded-[10px] [&_input]:px-3.5 [&_input]:h-11 [&_input]:text-[13px]"
              />
            </div>
          </div>

          {paymentStatus !== "unpaid" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12.5px] font-semibold text-foreground">
                  Amount Paid (
                  {paymentStatus === "paid" ? "Total" : "Initial Payment"})
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
              <div className="text-[13.5px] font-semibold text-foreground">
                Add Items to Order
              </div>
            </div>
            <div className="p-4">
              <POAddItemForm
                products={products}
                onAddItem={handleAddLineItem}
                onOpenAddProduct={handleOpenAddProduct}
                newlyCreatedProductId={newlyCreatedProductId}
                onNewlyCreatedProductConsumed={() =>
                  setNewlyCreatedProductId(null)
                }
              />
            </div>
          </div>
          <div className="text-[11.5px] text-muted-foreground px-1">
            Items appear in the Order Summary panel on the right as you add
            them.
          </div>
        </div>

        {/* Right Pane (Summary) */}
        <div className="bg-card border-l border-border flex-col min-h-0 hidden md:flex">
          <div className="p-5 border-b border-border shrink-0">
            <div className="text-[14.5px] font-semibold text-foreground">
              Order Summary
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
              {selectedSupplierName}
            </div>
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
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Estimated total
              </div>
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
        initialData={initialProductData}
        hideAddAnother
      />
    </div>
  );
}

export default function EditOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 flex items-center justify-center">
          <Clock className="animate-spin text-muted-foreground w-6 h-6" />
        </div>
      }
    >
      <EditOrderContent />
    </Suspense>
  );
}
