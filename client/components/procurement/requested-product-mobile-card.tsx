import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Trash2, Loader2 } from "lucide-react";
import type { RequestedProduct } from "@/lib/db/requested-products-queries";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

interface RequestedProductMobileCardProps {
  req: RequestedProduct;
  onMarkAsOrdered: (id: string) => void;
  onDelete: (id: string) => void;
  /** True while this card's mark-as-ordered/delete action is in flight —
   * disables both action buttons so a double-tap can't fire the same
   * mutation twice. */
  busy?: boolean;
}

export function RequestedProductMobileCard({
  req,
  onMarkAsOrdered,
  onDelete,
  busy = false,
}: RequestedProductMobileCardProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card">
      <div className="min-w-0 flex-1">
        <span className="text-[13.5px] font-semibold text-primary truncate block">
          {req.product_name}
        </span>
        {req.notes && (
          <div
            className="text-[11px] text-muted-foreground mt-0.5 truncate"
            title={req.notes}
          >
            Note: {req.notes}
          </div>
        )}
        <div className="text-[11.5px] text-muted-foreground mt-1">
          {req.requested_by_customer || "Anonymous"} &middot; Qty{" "}
          {req.quantity || 1} &middot; {req.request_count}{" "}
          {req.request_count === 1 ? "request" : "requests"}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {formatDateToDDMMYYYY(req.created_at)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <Badge
          variant={req.status === "pending" ? "outline" : "default"}
          className={
            req.status === "ordered"
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-200 shadow-none"
              : "bg-amber-500/10 text-amber-600 border-amber-200 shadow-none"
          }
        >
          {req.status === "pending" ? "Pending" : "Ordered"}
        </Badge>
        <div className="flex items-center gap-1">
          {req.status === "pending" && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onMarkAsOrdered(req.id)}
              title="Mark as ordered"
              disabled={busy}
            >
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(req.id)}
            title="Delete request"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
