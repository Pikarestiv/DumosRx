"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { query } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ProcurementDetailsDialogProps {
  po: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
}

export function ProcurementDetailsDialog({
  po,
  open,
  onOpenChange,
  currencyCode = "NGN",
}: ProcurementDetailsDialogProps) {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (po?.id && open) {
      query<any>(
        "SELECT * FROM purchase_order_items WHERE purchase_order_id = ?",
        [po.id]
      ).then((res) => setItems(res || []));
    }
  }, [po?.id, open]);

  if (!po) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Procurement Details"
      description={`PO Number: ${po.po_number}`}
      className="sm:max-w-2xl"
    >
      <div className="space-y-6 pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant="outline" className="mt-1 capitalize">
              {po.status}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="font-medium text-foreground">
              {formatCurrency(po.total_amount, currencyCode)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Order Date</p>
            <p className="font-medium">
              {formatDateTime(po.order_date || po.created_at)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Expected Delivery</p>
            <p className="font-medium">
              {po.expected_delivery_date ? formatDateTime(po.expected_delivery_date) : "N/A"}
            </p>
          </div>
        </div>

        {po.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="font-medium bg-muted/30 p-3 rounded-md mt-1">
              {po.notes}
            </p>
          </div>
        )}

        <div className="border rounded-md mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product_name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.unit_price, currencyCode)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.total_price, currencyCode)}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No items found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </ResponsiveModal>
  );
}
