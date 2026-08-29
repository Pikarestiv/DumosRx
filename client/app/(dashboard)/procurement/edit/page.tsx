"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { POOrderFormFields, SELF_PURCHASE_VENDOR_ID } from "@/components/procurement/po-order-form-fields";
import {
  createProduct,
  getPurchaseOrderById,
  updatePurchaseOrder,
} from "@/lib/db/local-database";
import { createSupplier } from "@/lib/db/procurement";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { NewProductPayload, ProductViewModel } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";

function EditOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const id = searchParams.get("id");

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POLineItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [initialProductData, setInitialProductData] =
    useState<Partial<ProductViewModel> | null>(null);
  const [newlyCreatedProductId, setNewlyCreatedProductId] = useState<
    string | null
  >(null);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

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
          setSelectedSupplierId(poData.supplier_id || SELF_PURCHASE_VENDOR_ID);
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

  const handleOpenAddProduct = (productData: Partial<ProductViewModel>) => {
    setInitialProductData(productData);
    setIsAddProductOpen(true);
  };

  const handleCreateSupplier = async (payload: SupplierPayload) => {
    try {
      const newId = await createSupplier(payload);
      toast.success(`${payload.name} added to vendors`);
      await fetchData();
      setSelectedSupplierId(newId);
      setIsAddSupplierOpen(false);
    } catch (error) {
      console.error("Failed to add supplier:", error);
      toast.error("Failed to add supplier");
    }
  };

  const handleCreateProduct = async (productData: NewProductPayload, keepOpen?: boolean) => {
    try {
      const newProductId = await createProduct(productData);
      toast.success(`${productData.name} added to catalog`);

      // Refresh products list
      await fetchData();
      await queryClient.invalidateQueries(queryKeys.products.list());
      setNewlyCreatedProductId(newProductId);

      if (!keepOpen) {
        setIsAddProductOpen(false);
      }
    } catch (error) {
      console.error("Failed to add product:", error);
      toast.error("Failed to add product");
    }
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
        selectedSupplierId === SELF_PURCHASE_VENDOR_ID ? null : selectedSupplierId,
        notes,
        items,
        paymentStatus,
        paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
        dueDate || null,
      );
      toast.success("Purchase Order updated successfully");
      router.push(`/procurement?selected=${id}`);
    } catch (error) {
      console.error("Failed to create PO:", error);
      toast.error("Error creating purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-148px)] bg-card border border-border rounded-2xl">
        <Clock className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground font-medium text-sm">
          Loading order...
        </p>
      </div>
    );
  }

  return (
    // Full-screen takeover, same as the Cycle Count session in
    // stock-batch/stock-audits.tsx, so the ledger table gets the whole
    // viewport instead of being cramped inside the dashboard shell.
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div
        className="flex items-center gap-3 px-6 pb-5 border-b border-border bg-card shrink-0"
        style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1.25rem)" }}
      >
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
        <div className="ml-auto flex items-center gap-4">
          <div className="text-[12.5px] text-muted-foreground font-medium">
            PO-{id ? id.split("-")[0]?.toUpperCase() : ""} · {items.length} items
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
              Estimated total
            </div>
            <div className="text-[15px] font-bold font-serif text-primary leading-tight">
              {formatCurrency(totalAmount)}
            </div>
          </div>
          <Button
            className="h-10 px-5 rounded-[10px] text-[13px] font-bold"
            onClick={handleSubmit}
            disabled={isSubmitting || items.length === 0}
          >
            {isSubmitting ? "Saving..." : "Save Purchase Order"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-background/50">
        <POOrderFormFields
          poType="standard"
          setPoType={() => {}}
          hideTypeToggle
          suppliers={suppliers}
          selectedSupplierId={selectedSupplierId}
          setSelectedSupplierId={setSelectedSupplierId}
          notes={notes}
          setNotes={setNotes}
          paymentStatus={paymentStatus}
          setPaymentStatus={setPaymentStatus}
          dueDate={dueDate}
          setDueDate={setDueDate}
          amountPaid={amountPaid}
          setAmountPaid={setAmountPaid}
          totalAmount={totalAmount}
          products={products}
          items={items}
          onItemsChange={setItems}
          onOpenAddProduct={handleOpenAddProduct}
          newlyCreatedProductId={newlyCreatedProductId}
          onNewlyCreatedProductConsumed={() => setNewlyCreatedProductId(null)}
          onOpenAddSupplier={() => setIsAddSupplierOpen(true)}
        />
      </div>

      <AddProductDialog
        open={isAddProductOpen}
        onOpenChange={setIsAddProductOpen}
        onAddProduct={handleCreateProduct}
        initialData={initialProductData ?? undefined}
        hideAddAnother
      />

      <AddSupplierDialog
        open={isAddSupplierOpen}
        onOpenChange={setIsAddSupplierOpen}
        onAddSupplier={handleCreateSupplier}
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
