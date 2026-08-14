import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Check, Copy, Trash2 } from "lucide-react";
import type { RequestedProduct } from "@/lib/db/requested-products-queries";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

interface RequestedProductRowProps {
  req: RequestedProduct;
  onMarkAsOrdered: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string) => void;
}

export function RequestedProductRow({
  req,
  onMarkAsOrdered,
  onDelete,
  onCopy,
}: RequestedProductRowProps) {
  return (
    <TableRow className="border-b border-border/50 hover:bg-accent/20 transition-colors group">
      <TableCell className="font-medium py-[14px] pl-4">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-primary">
            {req.product_name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all"
            onClick={() => onCopy(req.product_name)}
            title="Copy to clipboard"
          >
            <Copy className="h-2 w-2" />
          </Button>
        </div>
        {req.notes && (
          <div
            className="text-[11px] text-muted-foreground mt-1 truncate max-w-[200px]"
            title={req.notes}
          >
            Note: {req.notes}
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-[13.5px] py-[14px]">
        {req.requested_by_customer || "Anonymous"}
      </TableCell>
      <TableCell className="py-[14px]">
        <div className="flex flex-col gap-1 items-start">
          <Badge
            variant={req.quantity > 5 ? "destructive" : "secondary"}
            className="text-xs"
          >
            Qty: {req.quantity || 1}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {req.request_count}{" "}
            {req.request_count === 1 ? "request" : "requests"}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-[14px]">
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
      </TableCell>
      <TableCell className="text-sm text-muted-foreground py-[14px]">
        {formatDateToDDMMYYYY(req.created_at)}
      </TableCell>
      <TableCell className="text-right py-[14px]">
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {req.status === "pending" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMarkAsOrdered(req.id)}
              title="Mark as ordered"
              className="h-8 text-xs"
            >
              <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
              Mark Ordered
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(req.id)}
            title="Delete request"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
