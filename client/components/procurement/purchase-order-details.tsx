import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { Card } from "@/components/ui/card";
import { PoStatusTimeline } from "./po-status-timeline";
import { PoLineItems } from "./po-line-items";
import { PoOrderMenu } from "./po-order-menu";
import { PoDetailsFooter } from "./po-details-footer";
import { usePoPdfDownload } from "./use-po-pdf-download";
import { PODraftReceiveDialog } from "./po-draft-receive-dialog";
import { POCloseShortDialog } from "./po-close-short-dialog";
import type { PurchaseOrder } from "@/lib/db/procurement";
import type { ReceivedItemPayload } from "./receive-po-panel";

interface PurchaseOrderDetailsProps {
  selectedPO: PurchaseOrder | null;
  isLoadingDetails: boolean;
  getStatusBadge: (status: string) => React.ReactNode;
  onSendPO: (id: string) => void;
  onDeletePO?: (id: string) => void;
  /** True while a status write is in flight, so "Send to vendor" and "Delete"
   * lock the way "Confirm & Receive" already does. */
  isMutatingPO?: boolean;
  onReceiveGoods: () => void;
  onReceiveDraft: (id: string, items: ReceivedItemPayload[]) => void | Promise<boolean | void>;
  onClose: () => void;
}

export function PurchaseOrderDetails({
  selectedPO,
  isLoadingDetails,
  getStatusBadge,
  onSendPO,
  onDeletePO,
  isMutatingPO,
  onReceiveGoods,
  onReceiveDraft,
  onClose,
}: PurchaseOrderDetailsProps) {
  const [isDraftReceiveOpen, setIsDraftReceiveOpen] = useState(false);
  const [isCloseShortOpen, setIsCloseShortOpen] = useState(false);
  const router = useRouter();
  const canManagePurchaseOrders = useHasPermission("manage_purchase_orders");
  const canReceivePurchaseOrders = useHasPermission("receive_purchase_orders");
  const { download, share, isGenerating } = usePoPdfDownload(selectedPO);

  if (!selectedPO) {
    return (
      <Card className="hidden lg:flex flex-[1] flex-col items-center justify-center rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden text-muted-foreground text-[13.5px] font-medium">
        Select an order to view details
      </Card>
    );
  }

  const isEditable = selectedPO.status === "pending" || selectedPO.status === "sent";
  const editOrder = () => router.push(`/procurement/edit?id=${selectedPO.id}`);

  return (
    <Card className="flex flex-col h-full bg-card overflow-hidden p-0 gap-0 border-none rounded-none shadow-none">
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-start gap-4 border-b border-border px-6 pb-5 pt-6">
          <button
            type="button"
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring"
            onClick={onClose}
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-[22px] font-bold tracking-tight text-foreground">
                PO-{selectedPO.id.split("-")[0].toUpperCase()}
              </h3>
              {getStatusBadge(selectedPO.status)}
            </div>
            <p className="mt-1.5 truncate text-[14px] text-muted-foreground">
              {selectedPO.vendor_name} · {formatDateToDDMMYYYY(selectedPO.created_at)}
              {selectedPO.ordered_by_name && <> · Ordered by {selectedPO.ordered_by_name}</>}
            </p>
          </div>
          <PoOrderMenu
            onEdit={
              canManagePurchaseOrders && selectedPO.status === "sent" ? editOrder : undefined
            }
            onDelete={
              canManagePurchaseOrders && isEditable && onDeletePO
                ? () => onDeletePO(selectedPO.id)
                : undefined
            }
            onDownloadPdf={() => void download()}
            isGeneratingPdf={isGenerating}
            isMutating={isMutatingPO}
          />
        </div>

        <div className="flex-1 overflow-auto">
          <div className="flex flex-col gap-6 p-6">
            {isLoadingDetails ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                <Clock className="mr-2 h-6 w-6 animate-spin opacity-50" />
                Loading details...
              </div>
            ) : (
              <>
                {selectedPO.notes && (
                  <div className="rounded-[10px] bg-muted px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Note
                    </div>
                    <div className="mt-1 text-[15px] text-foreground/80">{selectedPO.notes}</div>
                  </div>
                )}
                <PoLineItems po={selectedPO} />
                <PoStatusTimeline po={selectedPO} />
              </>
            )}
          </div>
        </div>

        <PoDetailsFooter
          po={selectedPO}
          canManage={canManagePurchaseOrders}
          canReceive={canReceivePurchaseOrders}
          isMutating={isMutatingPO}
          isGeneratingPdf={isGenerating}
          onEdit={editOrder}
          onSend={() => {
            onSendPO(selectedPO.id);
            void share({ ...selectedPO, status: "sent" });
          }}
          onReceive={onReceiveGoods}
          onReceiveDraft={() => setIsDraftReceiveOpen(true)}
          onCloseShort={() => setIsCloseShortOpen(true)}
          onDownloadPdf={() => void download()}
        />
        <POCloseShortDialog orderId={selectedPO.id} open={isCloseShortOpen} onOpenChange={setIsCloseShortOpen} />
        <PODraftReceiveDialog
          po={selectedPO}
          open={isDraftReceiveOpen}
          onOpenChange={setIsDraftReceiveOpen}
          onReceive={(id, items) => void onReceiveDraft(id, items)}
        />
      </div>
    </Card>
  );
}
