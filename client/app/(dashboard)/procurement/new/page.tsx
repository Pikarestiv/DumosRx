"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { POOrderFormFields } from "@/components/procurement/po-order-form-fields";
import { POSummaryPane } from "@/components/procurement/po-summary-pane";
import { POMobileCreateView } from "@/components/procurement/po-mobile-create-view";
import { createProduct } from "@/lib/db/local-database";
import { createPurchaseOrder, createAndReceivePurchaseOrder, createSupplier } from "@/lib/db/procurement";
import { toast } from "sonner";

import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { NewProductPayload, ProductViewModel } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";

export default function CreateOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [poType, setPoType] = useState<"standard" | "immediate">("immediate");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POLineItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    const defaultSupplierId = searchParams.get("supplierId");
    if (
      defaultSupplierId &&
      suppliers.some((s) => s.id === defaultSupplierId)
    ) {
      setSelectedSupplierId(defaultSupplierId);
    }
  }, [searchParams, suppliers]);

  const handleOpenAddProduct = (productData: Partial<ProductViewModel>) => {
    setInitialProductData(productData);
    setIsAddProductOpen(true);
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

  const totalAmount = items.reduce(
    (sum, item) =>
      sum +
      item.bulk_quantity *
        (poType === "immediate" && item.cost_price_override !== undefined && item.cost_price_override !== ""
          ? Number(item.cost_price_override)
          : item.unit_cost),
    0,
  );

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
      if (poType === "immediate") {
        const poId = await createAndReceivePurchaseOrder(
          selectedSupplierId,
          notes,
          items,
          paymentStatus,
          paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
          dueDate || null,
        );
        toast.success("Purchase received", {
          description: "Stock has been added to inventory.",
        });
        router.push(`/procurement?selected=${poId}`);
      } else {
        const poId = await createPurchaseOrder(
          selectedSupplierId,
          notes,
          items,
          paymentStatus,
          paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
          dueDate || null,
        );
        toast.success("Purchase order saved as draft", {
          description: "Remember to mark it as sent once it's on its way to the vendor.",
        });
        router.push(`/procurement?selected=${poId}`);
      }
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

  const formFieldsProps = {
    poType,
    setPoType,
    suppliers,
    selectedSupplierId,
    setSelectedSupplierId,
    notes,
    setNotes,
    paymentStatus,
    setPaymentStatus,
    dueDate,
    setDueDate,
    amountPaid,
    setAmountPaid,
    totalAmount,
    products,
    items,
    onItemsChange: setItems,
    onOpenAddProduct: handleOpenAddProduct,
    newlyCreatedProductId,
    onNewlyCreatedProductConsumed: () => setNewlyCreatedProductId(null),
    onOpenAddSupplier: () => setIsAddSupplierOpen(true),
  };

  return (
    <>
      {/* Mobile: full-screen takeover, just like POS */}
      <POMobileCreateView
        {...formFieldsProps}
        selectedSupplierName={selectedSupplierName}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
      />

      {/* Desktop: bordered panel within the dashboard shell, sidebar stays visible */}
      <div className="hidden lg:flex flex-col min-h-0 bg-card border border-border rounded-2xl overflow-hidden h-[calc(100vh-148px)] shadow-sm">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border bg-card shrink-0">
          <div
            className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
            onClick={() => router.push("/procurement")}
          >
            <ArrowLeft className="w-[17px] h-[17px]" />
          </div>
          <div>
            <div className="text-[17px] font-serif font-bold leading-tight">
              Create Purchase Order
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              Draft a formal request for stock batch replenishment
            </div>
          </div>
          <div className="ml-auto text-[12.5px] text-muted-foreground font-medium">
            Draft · {items.length} items
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_380px] min-h-0">
          {/* Left Pane */}
          <div className="p-6 overflow-y-auto flex flex-col gap-4 bg-background/50">
            <POOrderFormFields {...formFieldsProps} />
          </div>

          {/* Right Pane (Summary) */}
          <POSummaryPane
            selectedSupplierName={selectedSupplierName}
            itemCount={items.length}
            totalAmount={totalAmount}
            onSave={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </div>
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
    </>
  );
}
