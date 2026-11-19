"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { useResolvedMediaQuery } from "@/hooks/use-media-query";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useProcurementData } from "@/lib/hooks/use-procurement-data";
import { useCreateSupplierMutation } from "@/lib/hooks/use-supplier-mutations";
import { errorDescription } from "@/lib/utils/error-description";
import { resolveConflictsForRecords } from "@/lib/db/sync-engine/conflict-log";
import { lockHeldByAnother } from "@/lib/db/procurement-draft";
import { getDeviceId } from "@/lib/utils/device-id";
import { formatDistanceToNowStrict } from "date-fns";
import type { ProductViewModel } from "@/lib/types/product";
import type { SupplierPayload } from "@/lib/types/supplier";
import { SELF_PURCHASE_VENDOR_ID } from "../po-details-fields";
import { PODetailsDialog } from "../po-details-dialog";
import { PODraftReceiveDialog } from "../po-draft-receive-dialog";
import { useCreatePoProduct } from "../use-create-po-product";
import { PoOrderHeader } from "./po-order-header";
import { PoOrderBody } from "./po-order-body";
import { PoOrderBanners } from "./po-order-banners";
import { usePoOrderEditor } from "./use-po-order-editor";
import { usePoOrderActions } from "./use-po-order-actions";

interface PoOrderScreenProps {
  initialId: string | null;
  defaultSupplierId?: string | null;
}

export function PoOrderScreen({ initialId, defaultSupplierId }: PoOrderScreenProps) {
  const router = useRouter();
  const editor = usePoOrderEditor({ initialId, defaultSupplierId });
  const actions = usePoOrderActions(editor);
  const { suppliers, products, refetch } = useProcurementData();
  const canEditProducts = useHasPermission("manage_products");
  const canReceive = useHasPermission("receive_purchase_orders");
  const { matches: isDesktop, resolved } = useResolvedMediaQuery("(min-width: 1024px)");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [addProductSeed, setAddProductSeed] = useState<Partial<ProductViewModel> | null>(null);
  const [newProductId, setNewProductId] = useState<string | null>(null);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const createSupplier = useCreateSupplierMutation();
  const { handleCreateProduct, isCreatingProduct } = useCreatePoProduct({
    refetchProcurementData: refetch,
    onCreated: setNewProductId,
    onClose: () => setAddProductSeed(null),
  });

  const { draft, change, autosave } = editor;
  const isWalkIn = draft.supplierId === SELF_PURCHASE_VENDOR_ID;
  const supplierName = isWalkIn
    ? "Self / Walk-in Purchase"
    : suppliers.find((s) => s.id === draft.supplierId)?.name || "No vendor selected";
  const conflictRecords = autosave.conflicts.map((c) => ({ table_name: c.table_name, record_id: c.record_id }));

  const handleCreateSupplier = (payload: SupplierPayload) => {
    createSupplier.mutate(payload, {
      onSuccess: (newId) => {
        void (async () => {
          toast.success(`${payload.name} added to vendors`);
          await refetch();
          editor.setSupplier(newId);
          setIsAddSupplierOpen(false);
        })();
      },
      onError: (error) => toast.error("Couldn't add the vendor", { description: errorDescription(error) }),
    });
  };

  if (editor.loadState === "missing") {
    router.push("/procurement");
    return null;
  }
  if (editor.loadState === "loading" || !resolved) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-148px)] bg-card border border-border rounded-2xl">
        <Clock className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground font-medium text-sm">Loading order...</p>
      </div>
    );
  }

  const lock = autosave.lock;
  const lockedByOther = autosave.blocked === "locked" || (!!lock && lockHeldByAnother(lock, getDeviceId(), new Date()));
  const otherDeviceLabel = lock?.editing_device_id && lock.editing_device_id !== getDeviceId()
    ? lock.editing_device_label || "Unnamed device"
    : "another device";
  const lockedSince = lockedByOther && lock?.editing_at
    ? formatDistanceToNowStrict(new Date(lock.editing_at), { addSuffix: true })
    : lockedByOther ? "recently" : null;
  const readOnly = !editor.isEditable || autosave.blocked !== null || lockedByOther;

  return (
    <div className={`fixed inset-0 ${isDesktop ? "z-50" : "z-40 fixed-visual-viewport"} flex flex-col bg-background`}>
      <PoOrderHeader
        compact={!isDesktop}
        title={initialId || autosave.persisted ? "Purchase Order" : "Create Purchase Order"}
        totalAmount={editor.totalAmount}
        saveState={autosave.saveState}
        persisted={autosave.persisted}
        pendingWrites={autosave.pendingWrites}
        isWalkIn={isWalkIn}
        isDraft={editor.status === "pending"}
        canReceive={canReceive}
        canUndo={editor.canUndo}
        readOnly={readOnly}
        isBusy={actions.isBusy}
        isGeneratingPdf={actions.isGeneratingPdf}
        onBack={() => void actions.back()}
        onSaveNow={() => autosave.scheduler.request("now")}
        onUndo={editor.undo}
        onDownloadPdf={() => void actions.downloadPdf()}
        onReceive={() => void actions.prepareReceive()}
        onSend={() => void actions.send()}
        onDelete={() => void actions.deleteDraft()}
      />
      <PoOrderBody
        compact={!isDesktop}
        banners={
          <PoOrderBanners
            saveError={autosave.saveError}
            conflicts={autosave.conflicts}
            blocked={autosave.blocked === "locked" ? null : autosave.blocked}
            otherDeviceLabel={otherDeviceLabel}
            lockedSince={lockedSince}
            onTakeOver={autosave.takeOver}
            onRetry={() => autosave.scheduler.request("now")}
            onReloadTheirs={() => void resolveConflictsForRecords(conflictRecords).then(() => editor.reload()).then(autosave.refreshSyncState)}
            onKeepMineAsCopy={() => void resolveConflictsForRecords(conflictRecords).then(() => editor.startCopy())}
            onOpenOrder={() => router.push(`/procurement?selected=${editor.orderId}`)}
          />
        }
        supplierName={supplierName}
        draft={draft}
        totalAmount={editor.totalAmount}
        products={products}
        baseline={editor.baseline}
        readOnly={readOnly}
        canEditProducts={canEditProducts}
        newProductId={newProductId}
        onNewProductConsumed={() => setNewProductId(null)}
        onOpenAddProduct={setAddProductSeed}
        onOpenDetails={() => setIsDetailsOpen(true)}
        onChange={change}
        onRevert={editor.revert}
      />

      <PODetailsDialog
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        suppliers={suppliers}
        selectedSupplierId={draft.supplierId}
        setSelectedSupplierId={editor.setSupplier}
        notes={draft.notes}
        setNotes={(notes) => change((d) => ({ ...d, notes }), "debounced")}
        paidInFull={draft.paidInFull}
        setPaidInFull={(paidInFull) => change((d) => ({ ...d, paidInFull, amountPaid: paidInFull ? d.amountPaid : "", paymentTouched: true }), "now")}
        dueDate={draft.dueDate}
        setDueDate={(dueDate) => change((d) => ({ ...d, dueDate }), "now")}
        amountPaid={draft.amountPaid}
        setAmountPaid={(amountPaid) => change((d) => ({ ...d, amountPaid, paidInFull: false, paymentTouched: true }), "debounced")}
        totalAmount={editor.totalAmount}
        onOpenAddSupplier={() => setIsAddSupplierOpen(true)}
      />
      {actions.receivePo && (
        <PODraftReceiveDialog
          po={actions.receivePo}
          open
          onOpenChange={(open) => !open && actions.closeReceive()}
          onReceive={(id, items) => void actions.confirmReceive(id, items)}
        />
      )}
      <AddProductDialog
        open={!!addProductSeed}
        onOpenChange={(open) => !open && setAddProductSeed(null)}
        onAddProduct={handleCreateProduct}
        initialData={addProductSeed ?? undefined}
        hideAddAnother
        isSubmitting={isCreatingProduct}
      />
      <AddSupplierDialog
        open={isAddSupplierOpen}
        onOpenChange={setIsAddSupplierOpen}
        onAddSupplier={handleCreateSupplier}
        isSubmitting={createSupplier.isPending}
      />
    </div>
  );
}
