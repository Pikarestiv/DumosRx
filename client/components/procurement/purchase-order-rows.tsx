import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  PackageOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import { type PurchaseOrder } from "@/lib/db/procurement";
import { DraftAgeBadge } from "./draft-age-badge";
import { getPayableDueState } from "@/lib/utils/payables";
import { getLocalTodayDate } from "@/lib/utils";
import { formatPONumber } from "@/lib/utils/po-number";

export function PayableDueBadge({ order }: { order: PurchaseOrder }) {
  const state = getPayableDueState(order, getLocalTodayDate());
  if (!state) return null;
  return state === "overdue" ? (
    <Badge className="bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20">
      <AlertTriangle className="w-3 h-3 mr-1" /> Overdue
    </Badge>
  ) : (
    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20">
      <CalendarClock className="w-3 h-3 mr-1" /> Due soon
    </Badge>
  );
}

export function getStatusBadge(status: string) {
  switch (status) {
    case "received":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Received
        </Badge>
      );
    case "partially_received":
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20">
          <PackageOpen className="w-3 h-3 mr-1" /> Partially Received
        </Badge>
      );
    case "sent":
      return (
        <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">
          <ArrowRight className="w-3 h-3 mr-1" /> Ordered
        </Badge>
      );
    case "closed":
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
          Closed short
        </Badge>
      );
    case "pending":
    case "draft":
      return (
        <Badge
          variant="outline"
          className="bg-gray-500/10 text-gray-500 border-gray-500/20"
        >
          <Clock className="w-3 h-3 mr-1" /> Draft
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function NoPurchaseOrdersRow({
  isAdmin,
  isAuditor,
  onRequestProduct,
}: {
  isAdmin: boolean;
  isAuditor: boolean;
  onRequestProduct: () => void;
}) {
  return (
    <TableRow>
      <TableCell colSpan={5} className="h-32">
        <EmptyState
          icon={ClipboardList}
          title="No purchase orders found"
          action={
            isAdmin
              ? { label: "Create Purchase Order", href: "/procurement/new" }
              : isAuditor
                ? undefined
                : { label: "Request Product", onClick: onRequestProduct }
          }
        />
      </TableCell>
    </TableRow>
  );
}

export function PurchaseOrderMobileRow({
  order,
  isSelected,
  onSelect,
}: {
  order: PurchaseOrder;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring ${isSelected ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-primary/5"}`}
    >
      <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px]">
        PO
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold truncate">
          {order.vendor_name || "Unknown Vendor"}
        </div>
        <div className="text-[11.5px] text-muted-foreground truncate">
          {formatPONumber(order.id)} &middot;{" "}
          {formatDateToDDMMYYYY(order.created_at)}
          {order.ordered_by_name && ` · ${order.ordered_by_name}`}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[13.5px] font-bold text-foreground whitespace-nowrap">
          {formatCurrency(order.total_amount)}
        </span>
        {getStatusBadge(order.status)}
        <PayableDueBadge order={order} />
        <DraftAgeBadge order={order} />
      </div>
    </div>
  );
}

export function PurchaseOrderRow({
  order,
  isSelected,
  onSelect,
}: {
  order: PurchaseOrder;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  return (
    <TableRow
      className={`border-b border-border/50 cursor-pointer transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/5" : "hover:bg-accent/50"}`}
      onClick={onSelect}
    >
      <TableCell className="font-mono pl-4 text-xs font-semibold text-foreground py-2.5">
        {formatPONumber(order.id)}
      </TableCell>
      <TableCell className="py-2.5">
        <span className="text-[13px] font-medium text-foreground">
          {order.vendor_name || "Unknown Vendor"}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground text-[12px] font-medium py-2.5">
        <div>{formatDateToDDMMYYYY(order.created_at)}</div>
        {order.ordered_by_name && (
          <div className="text-[11px] text-muted-foreground/75 truncate">
            {order.ordered_by_name}
          </div>
        )}
      </TableCell>
      <TableCell className="font-bold text-[13px] text-foreground py-2.5">
        {formatCurrency(order.total_amount)}
      </TableCell>
      <TableCell className="py-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {getStatusBadge(order.status)}
          <PayableDueBadge order={order} />
          <DraftAgeBadge order={order} />
        </div>
      </TableCell>
    </TableRow>
  );
}
