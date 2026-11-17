import { Download, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PurchaseOrder } from "@/lib/db/procurement";

interface PoDetailsFooterProps {
  po: PurchaseOrder;
  canManage: boolean;
  canReceive: boolean;
  isMutating?: boolean;
  isGeneratingPdf: boolean;
  onEdit: () => void;
  onSend: () => void;
  onReceive: () => void;
  onDownloadPdf: () => void;
}

const BUTTON = "h-12 rounded-[10px] text-[15px] font-semibold";

export function PoDetailsFooter({
  po,
  canManage,
  canReceive,
  isMutating,
  isGeneratingPdf,
  onEdit,
  onSend,
  onReceive,
  onDownloadPdf,
}: PoDetailsFooterProps) {
  const isDraft = po.status === "pending";
  const isImmediate = po.type === "immediate";

  const downloadButton = (
    <Button variant="outline" className={`flex-1 ${BUTTON}`} onClick={onDownloadPdf} disabled={isGeneratingPdf}>
      {isGeneratingPdf ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Download className="h-[18px] w-[18px]" />}
      {isGeneratingPdf ? "Preparing..." : "Download PDF"}
    </Button>
  );

  const primary = (() => {
    if (isDraft && isImmediate) return canReceive ? { label: "Receive Goods", run: onReceive } : null;
    if (isDraft) return canManage ? { label: isMutating ? "Working..." : "Mark as Sent", run: onSend } : null;
    if (po.status === "sent") return canReceive ? { label: "Receive Items", run: onReceive } : null;
    if (po.status === "partially_received") return canReceive ? { label: "Receive Remaining", run: onReceive } : null;
    return null;
  })();

  return (
    <div className="mt-auto flex flex-col gap-2.5 border-t border-border bg-card px-5 pb-5 pt-4">
      <div className="flex gap-3">
        {isDraft ? (
          canManage && (
            <Button variant="outline" className={`flex-1 ${BUTTON}`} onClick={onEdit}>
              <Edit2 className="h-[18px] w-[18px]" />
              Edit
            </Button>
          )
        ) : (
          downloadButton
        )}
        {primary && (
          <Button
            className={`flex-[2] ${BUTTON}`}
            onClick={primary.run}
            disabled={isMutating && primary.run === onSend}
          >
            {primary.label}
          </Button>
        )}
      </div>
      {po.status === "received" && (
        <p className="text-center text-[13px] text-muted-foreground">
          All items received. This order is now locked.
        </p>
      )}
    </div>
  );
}
