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
  onReceiveDraft: () => void;
  onDownloadPdf: () => void;
}

const BUTTON = "h-12 rounded-[10px] text-[15px] font-semibold";

interface FooterAction {
  label: string;
  run: () => void;
  primary: boolean;
  disabled?: boolean;
}

export function PoDetailsFooter({
  po,
  canManage,
  canReceive,
  isMutating,
  isGeneratingPdf,
  onEdit,
  onSend,
  onReceive,
  onReceiveDraft,
  onDownloadPdf,
}: PoDetailsFooterProps) {
  const isDraft = po.status === "pending";
  const isWalkIn = !po.supplier_id;
  const actions: FooterAction[] = [];
  if (isDraft) {
    if (canReceive) actions.push({ label: "Receive stock", run: onReceiveDraft, primary: isWalkIn });
    if (!isWalkIn && canManage) {
      actions.push({ label: isMutating ? "Working..." : "Send to vendor", run: onSend, primary: true, disabled: isMutating });
    }
  } else if (canReceive && po.status === "sent") {
    actions.push({ label: "Receive Items", run: onReceive, primary: true });
  } else if (canReceive && po.status === "partially_received") {
    actions.push({ label: "Receive Remaining", run: onReceive, primary: true });
  }

  return (
    <div className="mt-auto flex flex-col gap-2.5 border-t border-border bg-card px-5 pb-5 pt-4">
      <div className="flex flex-wrap gap-3">
        {isDraft && canManage && (
          <Button variant="outline" className={`flex-1 ${BUTTON}`} onClick={onEdit}>
            <Edit2 className="h-[18px] w-[18px]" />
            Edit
          </Button>
        )}
        <Button variant="outline" className={`flex-1 ${BUTTON}`} onClick={onDownloadPdf} disabled={isGeneratingPdf}>
          {isGeneratingPdf ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Download className="h-[18px] w-[18px]" />}
          {isGeneratingPdf ? "Preparing..." : "Download PDF"}
        </Button>
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.primary ? "default" : "outline"}
            className={`${action.primary ? "flex-[2]" : "flex-1"} ${BUTTON}`}
            onClick={action.run}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {po.status === "received" && (
        <p className="text-center text-[13px] text-muted-foreground">
          All items received. This order is now locked.
        </p>
      )}
    </div>
  );
}
