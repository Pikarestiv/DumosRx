"use client";

import { useState, useMemo } from "react";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calculateProportionalRefund } from "@/lib/utils/pos-calculations";
import { getMaxReturnable } from "@/lib/utils/returns-calculations";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSaleById, getTransactionDetails } from "@/lib/db/queries/sales";
import { queryKeys } from "@/lib/query-keys";
import { useProcessReturnMutation, type ReturnableItem } from "@/lib/hooks/use-process-return-mutation";
import { Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { ReturnItemRow } from "./return-item-row";
import { ReturnConfirmDialog } from "./return-confirm-dialog";
import type { SaleWithDetails, SaleItemDetail } from "@/lib/types/sale";
import { resellerPatchAfterReturn } from "@/lib/utils/reseller-return-adjustment";

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: SaleWithDetails | null;
  onSuccess: () => void;
  currencyCode?: string;
}

interface ItemSelection {
  selected: boolean;
  quantity: number;
  discardQuantity: number;
  discardReason: string;
}

export function ReturnDialog({
  open,
  onOpenChange,
  sale,
  onSuccess,
  currencyCode,
}: ReturnDialogProps) {
  const { user } = useAuth();
  const [selectedItems, setSelectedItems] = useState<Map<string, ItemSelection>>(new Map());
  const [reason, setReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [freshSale, setFreshSale] = useState<SaleWithDetails | null>(null);

  const { data: detailsData, isLoading: loadingSaleItems } = useQuery({
    ...queryKeys.sales.transactionDetails(sale?.id),
    queryFn: () => (sale ? getTransactionDetails(sale.id) : Promise.resolve(null)),
    enabled: !!sale,
  });
  const saleItems = detailsData?.items || [];
  const returnMutation = useProcessReturnMutation();

  const spotSourcedProductIds = useMemo(() => {
    if (!sale?.payment_details) return new Set<string>();
    try {
      const details =
        typeof sale.payment_details === "string"
          ? JSON.parse(sale.payment_details)
          : sale.payment_details;
      const spotList = Array.isArray(details?.spot_sourcing) ? details.spot_sourcing : [];
      return new Set<string>(
        spotList.map((s: { product_id?: string }) => s.product_id).filter(Boolean) as string[],
      );
    } catch {
      return new Set<string>();
    }
  }, [sale?.payment_details]);

  if (!sale) return null;

  const handleToggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      next.set(itemId, {
        selected: !current?.selected,
        quantity: current?.quantity || maxQty,
        discardQuantity: current?.discardQuantity ?? 0,
        discardReason: current?.discardReason ?? "Damaged / Broken",
      });
      return next;
    });
  };

  const handleQtyChange = (itemId: string, qty: number, maxQty: number) => {
    const parsedQty = typeof qty === "number" && !isNaN(qty) ? qty : 1;
    const validQty = Math.min(Math.max(1, parsedQty), maxQty);
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      next.set(itemId, {
        selected: true,
        quantity: validQty,
        discardQuantity: Math.min(current?.discardQuantity ?? 0, validQty),
        discardReason: current?.discardReason ?? "Damaged / Broken",
      });
      return next;
    });
  };

  const handleDiscardQtyChange = (itemId: string, discardQty: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      const returnQty = current?.quantity ?? 1;
      const validDiscard = Math.min(Math.max(0, discardQty), returnQty);
      next.set(itemId, {
        selected: true,
        quantity: returnQty,
        discardQuantity: validDiscard,
        discardReason: current?.discardReason ?? "Damaged / Broken",
      });
      return next;
    });
  };

  const handleDiscardReasonChange = (itemId: string, discardReason: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId);
      if (!current) return prev;
      next.set(itemId, {
        ...current,
        discardReason,
      });
      return next;
    });
  };

  const itemsToReturn: ReturnableItem[] = Array.from(selectedItems.entries())
    .filter(([_, val]) => val.selected)
    .map(([id, val]) => ({
      ...(saleItems?.find((si) => si.id === id) as SaleItemDetail),
      returnQuantity: val.quantity,
      discardQuantity: val.discardQuantity,
      discardReason: val.discardReason,
    }));

  const itemsSubtotal = itemsToReturn.reduce(
    (sum, item) => sum + (item.unit_price || 0) * item.returnQuantity,
    0,
  );
  const saleSubtotal = sale?.subtotal || 0;
  const totalRefund = calculateProportionalRefund({
    itemsSubtotal,
    saleSubtotal,
    saleTaxAmount: sale?.tax_amount || 0,
    saleDiscountAmount: sale?.discount_total ?? sale?.discount_amount ?? 0,
  });

  const commissionOwedBack =
    (sale && saleItems
      ? resellerPatchAfterReturn(
          freshSale ?? sale,
          saleItems,
          itemsToReturn.map((i) => ({ id: i.id, returnQuantity: i.returnQuantity })),
        )?.reseller_commission_owed_back
      : 0) ?? 0;

  const handleInitialSubmit = async () => {
    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }
    setFreshSale(await getSaleById(sale.id));
    setShowConfirm(true);
  };

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
        className="md:max-w-[min(76rem,95vw)] max-h-[90vh] overflow-hidden flex flex-col"
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
              onClick={() => void handleInitialSubmit()}
              disabled={returnMutation.isPending || loadingSaleItems}
              className="bg-accent hover:bg-accent/90"
            >
              {returnMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Return & Refund
            </Button>
          </DialogFooter>
        }
      >
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Qty to Return</TableHead>
                  <TableHead className="text-right">Damaged / Discard</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSaleItems && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                      Loading items from this sale...
                    </TableCell>
                  </TableRow>
                )}
                {!loadingSaleItems &&
                  saleItems?.map((item) => {
                    const maxQty = getMaxReturnable(item);
                    const selection = selectedItems.get(item.id);
                    return (
                      <ReturnItemRow
                        key={item.id}
                        item={item}
                        quantity={selection?.quantity ?? maxQty}
                        discardQuantity={selection?.discardQuantity ?? 0}
                        discardReason={selection?.discardReason ?? "Damaged / Broken"}
                        selected={selection?.selected || false}
                        maxQty={maxQty}
                        currencyCode={currencyCode}
                        isSpotSourced={spotSourcedProductIds.has(item.product_id)}
                        onToggle={() => handleToggleItem(item.id, maxQty)}
                        onQtyChange={(qty) => handleQtyChange(item.id, qty, maxQty)}
                        onDiscardQtyChange={(dQty) => handleDiscardQtyChange(item.id, dQty)}
                        onDiscardReasonChange={(dReason) => handleDiscardReasonChange(item.id, dReason)}
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

      <ReturnConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        itemsToReturn={itemsToReturn}
        totalRefund={totalRefund}
        commissionOwedBack={commissionOwedBack}
        currencyCode={currencyCode}
        onConfirm={handleSubmit}
      />
    </>
  );
}
