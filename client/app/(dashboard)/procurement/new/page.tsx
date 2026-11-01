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
import { RequireRole } from "@/components/auth/require-role";
import { toast } from "sonner";
import { errorDescription } from "@/lib/utils/error-description";

import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useCreateSupplierMutation } from "@/lib/hooks/use-supplier-mutations";
import { useCreateProductMutation } from "@/lib/hooks/use-product-mutations";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { NewProductPayload, ProductViewModel } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";
import { usePoSubmit } from "./use-po-submit";

function CreateOrderContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [poType, setPoTypeState] = useState<"standard" | "immediate">(
    "immediate",
  );
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    SELF_PURCHASE_VENDOR_ID,
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POLineItemDraft[]>([]);
  const [paymentStatus, setPaymentStatusState] = useState("paid");
  const [isPaymentStatusTouched, setIsPaymentStatusTouched] = useState(false);

  const setPaymentStatus = (status: string) => {
    setIsPaymentStatusTouched(true);
    setPaymentStatusState(status);
  };

  // An immediate purchase is money already handed over at the counter, so it opens on Fully Paid; a standard PO is raised be…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-(dashboard)-procurement-new-page-tsx-L52
  const setPoType = (type: "standard" | "immediate") => {
    setPoTypeState(type);
    if (!isPaymentStatusTouched) {
      setPaymentStatusState(type === "immediate" ? "paid" : "unpaid");
    }
  };
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Order details (type/vendor/notes/payment/due-date) are confirmed first; item entry only becomes the dominant content of…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-(dashboard)-procurement-new-page-tsx-L66
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

  const createProductMutation = useCreateProductMutation();

  const handleCreateProduct = (
    productData: NewProductPayload,
    keepOpen?: boolean,
  ) => {
    createProductMutation.mutate(productData, {
      onSuccess: (newProductId) => {
        void (async () => {
          toast.success(`${productData.name} added to catalog`);
          await fetchData();
          await queryClient.invalidateQueries(queryKeys.products.list());
          setNewlyCreatedProductId(newProductId);

          if (!keepOpen) {
            setIsAddProductOpen(false);
          }
        })();
      },
      onError: (error) => {
        console.error("Failed to add product:", error);
        toast.error("Couldn't add the product", {
          description: errorDescription(error),
        });
      },
    });
  };

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

  const totalAmount = getOrderTotal(items, poType);

  const { isSubmitting, handleSubmit, handleSaveDraft } = usePoSubmit({
    poType,
    selectedSupplierId,
    notes,
    items,
    paymentStatus,
    amountPaid,
    dueDate,
    totalAmount,
    products,
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

  const createViewProps = {
    ...detailsFieldsProps,
    products,
    items,
    onItemsChange: setItems,
    onOpenAddProduct: handleOpenAddProduct,
    newlyCreatedProductId,
    onNewlyCreatedProductConsumed: () => setNewlyCreatedProductId(null),
    selectedSupplierName,
    isSubmitting,
    handleSubmit,
    handleSaveDraft,
    detailsConfirmed,
    onContinue: () => setDetailsConfirmed(true),
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
        isSubmitting={createProductMutation.isPending}
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
