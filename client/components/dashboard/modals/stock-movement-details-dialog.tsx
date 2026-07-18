"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { query } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

interface StockMovementDetailsDialogProps {
  movement: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
}

export function StockMovementDetailsDialog({
  movement,
  open,
  onOpenChange,
  currencyCode = "NGN",
}: StockMovementDetailsDialogProps) {
  const [productInfo, setProductInfo] = useState<any>(null);

  useEffect(() => {
    if (movement?.product_id && open) {
      query<any>("SELECT name, generic_name, dosage_form FROM products WHERE id = ?", [
        movement.product_id,
      ]).then((res) => {
        if (res && res[0]) setProductInfo(res[0]);
      });
    }
  }, [movement?.product_id, open]);

  if (!movement) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Stock Movement Details"
      description={`Movement Type: ${movement.movement_type}`}
      className="sm:max-w-md"
    >
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <p className="text-sm text-muted-foreground">Product</p>
            <p className="font-medium text-lg text-foreground">
              {productInfo ? `${productInfo.name} (${productInfo.dosage_form || "N/A"})` : "Loading..."}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Quantity</p>
            <p className="font-medium text-lg text-foreground">
              {movement.movement_type === "IN" || movement.movement_type === "RETURN" ? "+" : "-"}
              {Math.abs(movement.quantity)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Type</p>
            <Badge variant="outline" className="mt-1 capitalize">
              {movement.movement_type}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Date</p>
            <p className="font-medium">
              {formatDateTime(movement.created_at || movement.date)}
            </p>
          </div>
          {movement.total_cost > 0 && (
            <div>
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="font-medium">
                {formatCurrency(movement.total_cost, currencyCode)}
              </p>
            </div>
          )}
          {movement.reference_id && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Reference</p>
              <p className="font-medium">{movement.reference_id}</p>
            </div>
          )}
          <div className="col-span-2">
            <p className="text-sm text-muted-foreground">Reason / Notes</p>
            <p className="font-medium bg-muted/30 p-3 rounded-md mt-1">
              {movement.reason || "No additional notes provided."}
            </p>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
