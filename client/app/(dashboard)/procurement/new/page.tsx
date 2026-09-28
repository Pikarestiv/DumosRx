"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SELF_PURCHASE_VENDOR_ID } from "@/components/procurement/po-details-fields";
import { PODetailsDialog } from "@/components/procurement/po-details-dialog";
import { POMobileCreateView } from "@/components/procurement/po-mobile-create-view";
import { PODesktopCreateView } from "@/components/procurement/po-desktop-create-view";
import { POFormSkeleton } from "@/components/procurement/po-form-skeleton";
import { useResolvedMediaQuery } from "@/hooks/use-media-query";
import { getOrderTotal, getValidatedAmountPaid, countSellingPriceOverrides } from "@/components/procurement/po-line-item-math";
import { RequireRole } from "@/components/auth/require-role";
import { toast } from "sonner";
import { errorDescription } from "@/lib/utils/error-description";

import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useCreateSupplierMutation } from "@/lib/hooks/use-supplier-mutations";
import { useCreateProductMutation } from "@/lib/hooks/use-product-mutations";
import {
  useCreatePurchaseOrderMutation,
  useCreateAndReceivePurchaseOrderMutation,
} from "@/lib/hooks/use-purchase-order-mutations";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { NewProductPayload, ProductViewModel } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";

function CreateOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [poType, setPoType] = useState<"standard" | "immediate">("immediate");
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    SELF_PURCHASE_VENDOR_ID,
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POLineItemDraft[]>([]);
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
  const { matches: isDesktop, resolved: layoutResolved } =
    useResolvedMediaQuery("(min-width: 1024px)");

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

  const createPurchaseOrderMutation = useCreatePurchaseOrderMutation();
  const createAndReceivePurchaseOrderMutation =
    useCreateAndReceivePurchaseOrderMutation();
  const isSubmitting =
    createPurchaseOrderMutation.isPending ||
    createAndReceivePurchaseOrderMutation.isPending;

  const handleSubmit = () => {
    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }
    if (isSubmitting) return;

    const supplierId =
      selectedSupplierId === SELF_PURCHASE_VENDOR_ID
        ? null
        : selectedSupplierId;

    if (poType === "immediate") {
      createAndReceivePurchaseOrderMutation.mutate(
        {
          supplierId,
          notes,
          items,
          paymentStatus,
          amountPaid: paymentStatus === "unpaid" ? 0 : paymentStatus === "paid" ? totalAmount : getValidatedAmountPaid(amountPaid, totalAmount),
          dueDate: dueDate || null,
        },
        {
          onSuccess: (poId) => {
            toast.success("Purchase received", {
              description: "Stock has been added to inventory.",
            });
            const priceOverrideCount = countSellingPriceOverrides(items, products);
            if (priceOverrideCount > 0) {
              toast.success(
                priceOverrideCount === 1
                  ? "Selling price updated for 1 item"
                  : `Selling price updated for ${priceOverrideCount} items`,
              );
            }
            router.push(`/procurement?selected=${poId}`);
          },
          onError: (error) => {
            console.error("Failed to create PO:", error);
            toast.error("Couldn't save this purchase", {
              description: errorDescription(error),
            });
          },
        },
      );
    } else {
      createPurchaseOrderMutation.mutate(
        {
          supplierId,
          notes,
          items,
          paymentStatus,
          amountPaid: paymentStatus === "unpaid" ? 0 : paymentStatus === "paid" ? totalAmount : getValidatedAmountPaid(amountPaid, totalAmount),
          dueDate: dueDate || null,
        },
        {
          onSuccess: (poId) => {
            toast.success("Purchase order saved as draft", {
              description:
                "Remember to mark it as sent once it's on its way to the vendor.",
            });
            router.push(`/procurement?selected=${poId}`);
          },
          onError: (error) => {
            console.error("Failed to create PO:", error);
            toast.error("Couldn't save this purchase", {
              description: errorDescription(error),
            });
          },
        },
      );
    }
  };

  /** Lets an Immediate Purchase be parked as an ordinary draft (same call
   * Standard POs use) instead of receiving stock right away, so entry in
   * progress survives a restart. Item-level fields that only exist for the
   * immediate flow (lot/expiry/price overrides) are persisted along with
   * everything else, so resuming the draft shows exactly what was typed. */
  const handleSaveDraft = () => {
    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }
    if (isSubmitting) return;

    const supplierId =
      selectedSupplierId === SELF_PURCHASE_VENDOR_ID
        ? null
        : selectedSupplierId;

    createPurchaseOrderMutation.mutate(
      {
        supplierId,
        notes,
        items,
        paymentStatus,
        amountPaid: paymentStatus === "unpaid" ? 0 : paymentStatus === "paid" ? totalAmount : getValidatedAmountPaid(amountPaid, totalAmount),
        dueDate: dueDate || null,
        type: poType,
      },
      {
        onSuccess: (poId) => {
          toast.success("Purchase order saved as draft", {
            description:
              poType === "immediate"
                ? "Pick up where you left off any time, receive it whenever you're ready."
                : "Remember to mark it as sent once it's on its way to the vendor.",
          });
          router.push(`/procurement?selected=${poId}`);
        },
        onError: (error) => {
          console.error("Failed to save PO draft:", error);
          toast.error("Couldn't save the draft", {
            description: errorDescription(error),
          });
        },
      },
    );
  };

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
    <RequireRole>
      <CreateOrderContent />
    </RequireRole>
  );
}
