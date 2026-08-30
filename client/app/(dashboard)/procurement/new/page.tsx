"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { PODetailsFields, SELF_PURCHASE_VENDOR_ID } from "@/components/procurement/po-details-fields";
import { PODetailsSummaryBar } from "@/components/procurement/po-details-summary-bar";
import { PODetailsDialog } from "@/components/procurement/po-details-dialog";
import { POItemBuilder } from "@/components/procurement/po-item-builder";
import { POMobileCreateView } from "@/components/procurement/po-mobile-create-view";
import { getLineTotal } from "@/components/procurement/po-line-item-math";
import { createProduct } from "@/lib/db/local-database";
import { createPurchaseOrder, createAndReceivePurchaseOrder } from "@/lib/db/procurement";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useCreateSupplierMutation } from "@/lib/hooks/use-supplier-mutations";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { NewProductPayload, ProductViewModel } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";

const PO_TYPE_LABEL = {
  immediate: "Immediate Purchase",
  standard: "Purchase Order",
} as const;

export default function CreateOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [poType, setPoType] = useState<"standard" | "immediate">("immediate");
  const [selectedSupplierId, setSelectedSupplierId] = useState(SELF_PURCHASE_VENDOR_ID);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POLineItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Order details (type/vendor/notes/payment/due-date) are confirmed first;
  // item entry only becomes the dominant content of the screen afterward.
  // Details stay editable via PODetailsDialog once confirmed.
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);

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

  const createSupplierMutation = useCreateSupplierMutation();

  const handleCreateSupplier = (payload: SupplierPayload) => {
    createSupplierMutation.mutate(payload, {
      onSuccess: async (newId) => {
        toast.success(`${payload.name} added to vendors`);
        await fetchData();
        setSelectedSupplierId(newId);
        setIsAddSupplierOpen(false);
      },
      onError: (error) => {
        console.error("Failed to add supplier:", error);
        toast.error("Failed to add supplier");
      },
    });
  };

  const totalAmount = items.reduce((sum, item) => sum + getLineTotal(item, poType), 0);

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }

    const supplierId = selectedSupplierId === SELF_PURCHASE_VENDOR_ID ? null : selectedSupplierId;

    setIsSubmitting(true);
    try {
      if (poType === "immediate") {
        const poId = await createAndReceivePurchaseOrder(
          supplierId,
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
          supplierId,
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

  /** Lets an Immediate Purchase be parked as an ordinary draft (same call
   * Standard POs use) instead of receiving stock right away, so entry in
   * progress survives a restart. Item-level fields that only exist for the
   * immediate flow (lot/expiry/price overrides) aren't persisted here — same
   * as a Standard draft, they're re-entered later at receiving time. */
  const handleSaveDraft = async () => {
    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }

    const supplierId = selectedSupplierId === SELF_PURCHASE_VENDOR_ID ? null : selectedSupplierId;

    setIsSubmitting(true);
    try {
      const poId = await createPurchaseOrder(
        supplierId,
        notes,
        items,
        paymentStatus,
        paymentStatus !== "unpaid" ? Number(amountPaid) || 0 : 0,
        dueDate || null,
        poType,
      );
      toast.success("Purchase order saved as draft", {
        description:
          poType === "immediate"
            ? "Pick up where you left off any time — receive it whenever you're ready."
            : "Remember to mark it as sent once it's on its way to the vendor.",
      });
      router.push(`/procurement?selected=${poId}`);
    } catch (error) {
      console.error("Failed to save PO draft:", error);
      toast.error("Error saving purchase order draft");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSupplierName = useMemo(() => {
    if (selectedSupplierId === SELF_PURCHASE_VENDOR_ID) return "Self / Walk-in Purchase";
    return (
      suppliers.find((s) => s.id === selectedSupplierId)?.name ||
      "No vendor selected"
    );
  }, [suppliers, selectedSupplierId]);

  const detailsFieldsProps = {
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
    onOpenAddSupplier: () => setIsAddSupplierOpen(true),
  };

  return (
    <>
      {/* Mobile: full-screen takeover, just like POS */}
      <POMobileCreateView
        {...detailsFieldsProps}
        products={products}
        items={items}
        onItemsChange={setItems}
        onOpenAddProduct={handleOpenAddProduct}
        newlyCreatedProductId={newlyCreatedProductId}
        onNewlyCreatedProductConsumed={() => setNewlyCreatedProductId(null)}
        selectedSupplierName={selectedSupplierName}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        handleSaveDraft={handleSaveDraft}
        detailsConfirmed={detailsConfirmed}
        onContinue={() => setDetailsConfirmed(true)}
        setIsEditDetailsOpen={setIsEditDetailsOpen}
      />

      {/* Desktop: full-screen takeover, same as the Cycle Count session in
          stock-batch/stock-audits.tsx, so the ledger table gets the whole
          viewport instead of being cramped inside the dashboard shell. */}
      <div
        className="hidden lg:flex fixed inset-0 z-50 flex-col bg-background"
      >
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
              Create Purchase Order
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              {detailsConfirmed
                ? "Draft a formal request for stock batch replenishment"
                : "Enter the order details to continue"}
            </div>
          </div>
          {detailsConfirmed && (
            <div className="ml-auto flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Estimated total
                </div>
                <div className="text-[15px] font-bold font-serif text-primary leading-tight">
                  {formatCurrency(totalAmount)}
                </div>
              </div>
              {poType === "immediate" && (
                <Button
                  variant="outline"
                  className="h-10 px-5 rounded-[10px] text-[13px] font-bold"
                  onClick={handleSaveDraft}
                  disabled={isSubmitting || items.length === 0}
                >
                  Save as Draft
                </Button>
              )}
              <Button
                className="h-10 px-5 rounded-[10px] text-[13px] font-bold"
                onClick={handleSubmit}
                disabled={isSubmitting || items.length === 0}
              >
                {isSubmitting
                  ? "Saving..."
                  : poType === "immediate"
                    ? "Save Purchase Order"
                    : "Save as Draft"}
              </Button>
            </div>
          )}
        </div>

        {detailsConfirmed ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-background/50">
            <PODetailsSummaryBar
              vendorName={selectedSupplierName}
              poTypeLabel={PO_TYPE_LABEL[poType]}
              onEdit={() => setIsEditDetailsOpen(true)}
            />
            <POItemBuilder
              poType={poType}
              products={products}
              items={items}
              onItemsChange={setItems}
              onOpenAddProduct={handleOpenAddProduct}
              newlyCreatedProductId={newlyCreatedProductId}
              onNewlyCreatedProductConsumed={() => setNewlyCreatedProductId(null)}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex-1 flex justify-center p-6">
              <div className="w-full max-w-2xl">
                <PODetailsFields {...detailsFieldsProps} />
              </div>
            </div>
            <div className="border-t border-border bg-card p-4 flex justify-center shrink-0">
              <Button
                className="h-11 px-6 rounded-[10px] text-[13.5px] font-bold w-full max-w-2xl"
                onClick={() => setDetailsConfirmed(true)}
              >
                Continue to Add Items
              </Button>
            </div>
          </div>
        )}
      </div>

      <PODetailsDialog
        open={isEditDetailsOpen}
        onOpenChange={setIsEditDetailsOpen}
        {...detailsFieldsProps}
      />

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
        isSubmitting={createSupplierMutation.isPending}
      />
    </>
  );
}
