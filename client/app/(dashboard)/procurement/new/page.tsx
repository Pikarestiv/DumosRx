"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SELF_PURCHASE_VENDOR_ID } from "@/components/procurement/po-details-fields";
import { PODetailsDialog } from "@/components/procurement/po-details-dialog";
import { POMobileCreateView } from "@/components/procurement/po-mobile-create-view";
import { PODesktopCreateView } from "@/components/procurement/po-desktop-create-view";
import { POFormSkeleton } from "@/components/procurement/po-form-skeleton";
import { useResolvedMediaQuery } from "@/hooks/use-media-query";
import { getOrderTotal } from "@/components/procurement/po-line-item-math";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { RequireRole } from "@/components/auth/require-role";
import { toast } from "sonner";
import { errorDescription } from "@/lib/utils/error-description";

import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useCreateSupplierMutation } from "@/lib/hooks/use-supplier-mutations";
import { useCreatePoProduct } from "@/components/procurement/use-create-po-product";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { ProductViewModel } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";
import { usePoSubmit } from "./use-po-submit";

function CreateOrderContent() {
  const canEditProducts = useHasPermission("manage_products");
  const canReceive = useHasPermission("receive_purchase_orders");
  const searchParams = useSearchParams();

  const [selectedSupplierId, setSelectedSupplierIdState] = useState(
    SELF_PURCHASE_VENDOR_ID,
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POLineItemDraft[]>([]);
  const [paymentStatus, setPaymentStatusState] = useState("paid");
  const [isPaymentStatusTouched, setIsPaymentStatusTouched] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);

  const setPaymentStatus = (status: string) => {
    setIsPaymentStatusTouched(true);
    setPaymentStatusState(status);
  };

  // A walk-in purchase is paid at the counter; a vendor order is usually on credit until someone says otherwise.
  const setSelectedSupplierId = (id: string) => {
    setSelectedSupplierIdState(id);
    if (!isPaymentStatusTouched) {
      setPaymentStatusState(id === SELF_PURCHASE_VENDOR_ID ? "paid" : "unpaid");
    }
  };

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [initialProductData, setInitialProductData] =
    useState<Partial<ProductViewModel> | null>(null);
  const [newlyCreatedProductId, setNewlyCreatedProductId] = useState<
    string | null
  >(null);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  const { suppliers, products, refetch: fetchData } = useProcurementData();
  const { matches: isDesktop, resolved: layoutResolved } =
    useResolvedMediaQuery("(min-width: 1024px)");

  const requestedSupplierId = searchParams.get("supplierId");
  const validDefaultSupplierId =
    requestedSupplierId && suppliers.some((s) => s.id === requestedSupplierId)
      ? requestedSupplierId
      : null;
  const [appliedDefaultSupplierId, setAppliedDefaultSupplierId] = useState<
    string | null
  >(null);
  if (validDefaultSupplierId && validDefaultSupplierId !== appliedDefaultSupplierId) {
    setAppliedDefaultSupplierId(validDefaultSupplierId);
    setSelectedSupplierId(validDefaultSupplierId);
  }

  const handleOpenAddProduct = (productData: Partial<ProductViewModel>) => {
    setInitialProductData(productData);
    setIsAddProductOpen(true);
  };

  const { handleCreateProduct, isCreatingProduct } = useCreatePoProduct({
    refetchProcurementData: fetchData,
    onCreated: setNewlyCreatedProductId,
    onClose: () => setIsAddProductOpen(false),
  });

  const createSupplierMutation = useCreateSupplierMutation();

  const handleCreateSupplier = (payload: SupplierPayload) => {
    createSupplierMutation.mutate(payload, {
      onSuccess: (newId) => {
        void (async () => {
          toast.success(`${payload.name} added to vendors`);
          await fetchData();
          setSelectedSupplierId(newId);
          setIsAddSupplierOpen(false);
        })();
      },
      onError: (error) => {
        console.error("Failed to add supplier:", error);
        toast.error("Couldn't add the vendor", {
          description: errorDescription(error),
        });
      },
    });
  };

  const totalAmount = getOrderTotal(items, "immediate");

  const { isSubmitting, isWalkIn, handleReceive, handleSend, handleSaveDraft } = usePoSubmit({
    selectedSupplierId,
    notes,
    items,
    paymentStatus,
    amountPaid,
    dueDate,
    totalAmount,
  });

  const selectedSupplierName = useMemo(() => {
    if (selectedSupplierId === SELF_PURCHASE_VENDOR_ID)
      return "Self / Walk-in Purchase";
    return (
      suppliers.find((s) => s.id === selectedSupplierId)?.name ||
      "No vendor selected"
    );
  }, [suppliers, selectedSupplierId]);

  const detailsFieldsProps = {
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

  const createViewProps = {
    canEditProducts,
    canReceive,
    isWalkIn,
    selectedSupplierName,
    paymentStatus,
    dueDate,
    amountPaid,
    totalAmount,
    products,
    items,
    onItemsChange: setItems,
    onOpenAddProduct: handleOpenAddProduct,
    newlyCreatedProductId,
    onNewlyCreatedProductConsumed: () => setNewlyCreatedProductId(null),
    isSubmitting,
    handleReceive,
    handleSend,
    handleSaveDraft,
    setIsEditDetailsOpen,
  };

  if (!layoutResolved) return <POFormSkeleton />;

  return (
    <>
      {isDesktop ? (
        <PODesktopCreateView {...createViewProps} />
      ) : (
        <POMobileCreateView {...createViewProps} />
      )}

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
        isSubmitting={isCreatingProduct}
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

export default function CreateOrderPage() {
  return (
    <RequireRole permission="manage_purchase_orders">
      <CreateOrderContent />
    </RequireRole>
  );
}
