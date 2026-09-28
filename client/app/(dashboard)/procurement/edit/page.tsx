"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock } from "lucide-react";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { SELF_PURCHASE_VENDOR_ID } from "@/components/procurement/po-details-fields";
import { PODetailsDialog } from "@/components/procurement/po-details-dialog";
import { POMobileEditView } from "@/components/procurement/po-mobile-edit-view";
import { PODesktopEditView } from "@/components/procurement/po-desktop-edit-view";
import { useResolvedMediaQuery } from "@/hooks/use-media-query";
import { getPurchaseOrderById } from "@/lib/db/local-database";
import { toast } from "sonner";
import { errorDescription } from "@/lib/utils/error-description";

import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useCreateSupplierMutation } from "@/lib/hooks/use-supplier-mutations";
import { useCreateProductMutation } from "@/lib/hooks/use-product-mutations";
import { useUpdatePurchaseOrderMutation } from "@/lib/hooks/use-purchase-order-mutations";
import { RequireRole } from "@/components/auth/require-role";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import { getOrderTotal, getValidatedAmountPaid } from "@/components/procurement/po-line-item-math";
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
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [initialProductData, setInitialProductData] =
    useState<Partial<ProductViewModel> | null>(null);
  const [newlyCreatedProductId, setNewlyCreatedProductId] = useState<
    string | null
  >(null);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  // Was hardcoded "standard" everywhere below, which hid every
  // Immediate-Purchase-only field (lot/expiry/New Cost/Review Price) when
  // resuming an Immediate draft via "Edit Order" (any PO with status
  // pending/sent gets that button - see purchase-order-details.tsx - not
  // just Standard ones). The values still round-tripped correctly once
  // coerceOptionalNumber's null handling was fixed, just weren't visible
  // or re-editable. The type itself is never changed here (the toggle
  // stays locked/hidden either way), just read for display; set in the
  // seeding effect below once poQuery.data loads.
  const [poType, setPoType] = useState<"standard" | "immediate">("standard");

  const { suppliers, products, refetch: fetchData } = useProcurementData();
  const { matches: isDesktop, resolved: layoutResolved } =
    useResolvedMediaQuery("(min-width: 1024px)");

  const poQuery = useQuery({
    ...queryKeys.purchaseOrders.detail(id),
    queryFn: () => getPurchaseOrderById(id as string),
    enabled: !!id,
  });
  const isLoading = !id || poQuery.isLoading;

  const seededPoIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;
    if (poQuery.isError) {
      console.error("Failed to load PO", poQuery.error);
      toast.error("Couldn't load this purchase order", {
        description: errorDescription(poQuery.error),
      });
      return;
    }
    if (poQuery.data === undefined) return;
    if (poQuery.data === null) {
      toast.error("Purchase order not found");
      router.push("/procurement");
      return;
    }
    // Only seed the form once per PO id — a background refetch (e.g. a sync
    // pull invalidating purchase_orders) must not overwrite in-progress
    // unsaved edits with the freshly refetched data.
    if (seededPoIdRef.current === id) return;
    seededPoIdRef.current = id;
    if (poQuery.data.type === "immediate") setPoType("immediate");
    const poData = poQuery.data;
    setSelectedSupplierId(poData.supplier_id || SELF_PURCHASE_VENDOR_ID);
    setNotes(poData.notes || "");
    setItems(poData.items || []);
    setPaymentStatus(poData.payment_status || "unpaid");
    setAmountPaid(poData.amount_paid?.toString() || "");
    setDueDate(poData.due_date || "");
  }, [id, poQuery.data, poQuery.isError, poQuery.error, router]);

  const handleOpenAddProduct = (productData: Partial<ProductViewModel>) => {
    setInitialProductData(productData);
    setIsAddProductOpen(true);
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

  const createProductMutation = useCreateProductMutation();

  const handleCreateProduct = (productData: NewProductPayload, keepOpen?: boolean) => {
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

  // getLineTotal, not item.subtotal directly: subtotal only gets refreshed
  // when unit cost changes (po-item-ledger-table.tsx), so editing just the
  // quantity leaves it stale - same reason lib/db/procurement.ts recomputes
  // total_amount itself at save time rather than trusting this field.
  const totalAmount = getOrderTotal(items, poType);

  const updatePurchaseOrderMutation = useUpdatePurchaseOrderMutation();
  const isSubmitting = updatePurchaseOrderMutation.isPending;

  const handleSubmit = () => {
    if (!id) {
      toast.error("Purchase order ID is missing");
      return;
    }

    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }
    if (isSubmitting) return;

    updatePurchaseOrderMutation.mutate(
      {
        poId: id,
        supplierId: selectedSupplierId === SELF_PURCHASE_VENDOR_ID ? null : selectedSupplierId,
        notes,
        items,
        paymentStatus,
        amountPaid:
          paymentStatus === "unpaid"
            ? 0
            : paymentStatus === "paid"
              ? totalAmount
              : getValidatedAmountPaid(amountPaid, totalAmount),
        dueDate: dueDate || null,
      },
      {
        onSuccess: () => {
          toast.success("Purchase Order updated successfully");
          router.push(`/procurement?selected=${id}`);
        },
        onError: (error) => {
          console.error("Failed to update PO:", error);
          toast.error("Couldn't save the changes to this order", {
            description: errorDescription(error),
          });
        },
      },
    );
  };

  const selectedSupplierName = useMemo(() => {
    if (selectedSupplierId === SELF_PURCHASE_VENDOR_ID) return "Self / Walk-in Purchase";
    return (
      suppliers.find((s) => s.id === selectedSupplierId)?.name ||
      "No vendor selected"
    );
  }, [suppliers, selectedSupplierId]);

  const editViewProps = {
    poId: id,
    selectedSupplierName,
    poType,
    products,
    items,
    onItemsChange: setItems,
    onOpenAddProduct: handleOpenAddProduct,
    newlyCreatedProductId,
    onNewlyCreatedProductConsumed: () => setNewlyCreatedProductId(null),
    isSubmitting,
    handleSubmit,
    onOpenEditDetails: () => setIsEditDetailsOpen(true),
    paymentStatus,
    dueDate,
    amountPaid,
  };

  if (isLoading || !layoutResolved) {
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
    <>
      {isDesktop ? (
        <PODesktopEditView {...editViewProps} />
      ) : (
        <POMobileEditView {...editViewProps} />
      )}

      <PODetailsDialog
        open={isEditDetailsOpen}
        onOpenChange={setIsEditDetailsOpen}
        poType={poType}
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
        onOpenAddSupplier={() => setIsAddSupplierOpen(true)}
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

export default function EditOrderPage() {
  return (
    <RequireRole permission="manage_purchase_orders">
      <Suspense
        fallback={
          <div className="p-10 flex items-center justify-center">
            <Clock className="animate-spin text-muted-foreground w-6 h-6" />
          </div>
        }
      >
        <EditOrderContent />
      </Suspense>
    </RequireRole>
  );
}
