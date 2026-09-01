"use client";

import { useState } from "react";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { calculateProportionalRefund } from "@/lib/utils/pos-calculations";
import { getMaxReturnable } from "@/lib/utils/returns-calculations";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTransactionDetails } from "@/lib/db/queries/sales";
import { queryKeys } from "@/lib/query-keys";
import { useProcessReturnMutation } from "@/lib/hooks/use-process-return-mutation";
import { Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ReturnItemRow } from "./return-item-row";
import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: SaleWithDetails | null;
  onSuccess: () => void;
  currencyCode?: string;
}

type ReturnableItem = SaleItemDetail & {
  returnQuantity: number;
  stock_batch_id?: string;
};

export function ReturnDialog({
  open,
  onOpenChange,
  sale,
  onSuccess,
  currencyCode,
}: ReturnDialogProps) {
  const { user } = useAuth();
  const [selectedItems, setSelectedItems] = useState<
    Map<string, { selected: boolean; quantity: number }>
  >(new Map());
  const [reason, setReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch items for this sale, including how much of each has already been
  // returned in a prior return on this sale — getSaleItems() (the previous
  // data source here) only returns the original sold quantity, with no way
  // to know a customer already returned some of it, which let the same
  // items be returned twice.
  const { data: detailsData } = useQuery({
    ...queryKeys.sales.transactionDetails(sale?.id),
    queryFn: () => (sale ? getTransactionDetails(sale.id) : Promise.resolve(null)),
    enabled: !!sale,
  });
  const saleItems = detailsData?.items || [];
  const returnMutation = useProcessReturnMutation();

  if (!sale) return null;

  const handleToggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      next.set(itemId, {
        selected: !current?.selected,
        quantity: current?.quantity || maxQty,
      });
      return next;
    });
  };

  const handleQtyChange = (itemId: string, qty: number, maxQty: number) => {
    const parsedQty = typeof qty === "number" && !isNaN(qty) ? qty : 1;
    const validQty = Math.min(Math.max(1, parsedQty), maxQty);
    setSelectedItems((prev) => {
      const next = new Map(prev);
      // const current = next.get(itemId);
      next.set(itemId, {
        selected: true,
        quantity: validQty,
      });
      return next;
    });
  };

  const itemsToReturn: ReturnableItem[] = Array.from(selectedItems.entries())
    .filter(([_, val]) => val.selected)
    .map(([id, val]) => ({
      ...(saleItems?.find((si) => si.id === id) as SaleItemDetail),
      returnQuantity: val.quantity,
    }));

  const itemsSubtotal = itemsToReturn.reduce(
    (sum, item) => sum + (item.unit_price || 0) * item.returnQuantity,
    0,
  );
  // Refund proportionally includes the tax and discount the customer actually
  // paid on these items, not just their raw unit price, otherwise a full
  // return of a sale refunds less than the customer paid (the tax/discount
  // share is left behind as phantom "revenue" everywhere downstream: the
  // dashboard, POS today's-sales tile, and BI reports all derive their
  // totals from sales.total_amount minus returns.total_refunded).
  const saleSubtotal = sale?.subtotal || 0;
  const totalRefund = calculateProportionalRefund({
    itemsSubtotal,
    saleSubtotal,
    saleTaxAmount: sale?.tax_amount || 0,
    saleDiscountAmount: sale?.discount_total ?? sale?.discount_amount ?? 0,
  });

  const handleInitialSubmit = () => {
    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }
    setShowConfirm(true);
  };

  // Passed as ConfirmDialog's onConfirm, which awaits it and only closes
  // once it settles. Swallows the mutation's own rejection (already
  // toasted via onError in the hook) so ConfirmDialog closes the same way
  // on both success and failure, matching this dialog's original contract —
  // it's returnMutation.isError / the outer ResponsiveModal staying open
  // that signals failure, not an exception surfacing here.
  const handleSubmit = async () => {
    if (returnMutation.isPending) return;
    try {
      await returnMutation.mutateAsync({
        sale,
        userId: user?.id,
        reason,
        totalRefund,
        itemsToReturn,
        saleItems,
        currencyCode,
      });
      onSuccess();
      onOpenChange(false);
    } catch {
      // no-op — already handled by onError
    }
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-accent" />
            Process Return & Refund
          </span>
        }
        description={`Select the items to return for Receipt #${sale.receipt_number || sale.id.substring(0, 8).toUpperCase()}`}
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        footer={
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={returnMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInitialSubmit}
              disabled={returnMutation.isPending}
              className="bg-accent hover:bg-accent/90"
            >
              {returnMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Return & Refund
            </Button>
          </DialogFooter>
        }
      >
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Qty to Return</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleItems?.map((item) => {
                  const maxQty = getMaxReturnable(item);
                  return (
                    <ReturnItemRow
                      key={item.id}
                      item={item}
                      quantity={
                        selectedItems.get(item.id)?.quantity ?? maxQty
                      }
                      selected={selectedItems.get(item.id)?.selected || false}
                      maxQty={maxQty}
                      currencyCode={currencyCode}
                      onToggle={() => handleToggleItem(item.id, maxQty)}
                      onQtyChange={(qty) =>
                        handleQtyChange(item.id, qty, maxQty)
                      }
                    />
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2 mt-4">
            <Label htmlFor="reason">Reason for Return</Label>
            <Textarea
              id="reason"
              placeholder="e.g. Expired product, customer change of mind, incorrect dosage"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
      </ResponsiveModal>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Confirm Return & Refund"
        confirmLabel="Yes, Process Return"
        description={
          <div className="space-y-3 mt-2 text-left">
            <p className="text-sm">
              You are about to process a return for the following item(s):
            </p>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {itemsToReturn.map((item) => (
                <li key={item.id}>
                  <span className="font-medium">{item.returnQuantity}x</span>{" "}
                  {item.product_name}
                  <span className="text-muted-foreground ml-1">
                    (
                    {formatCurrency(
                      (item.unit_price || 0) * item.returnQuantity,
                      currencyCode,
                    )}
                    )
                  </span>
                </li>
              ))}
            </ul>
            <div className="pt-2 border-t mt-2">
              <p className="font-medium text-destructive">
                Total Refund: {formatCurrency(totalRefund, currencyCode)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              <strong>Consequences:</strong> The returned quantities will be
              immediately restocked into stock batch, and this sale will be
              marked as returned in the transaction history. This action cannot
              be undone.
            </p>
          </div>
        }
        onConfirm={handleSubmit}
      />
    </>
  );
}
