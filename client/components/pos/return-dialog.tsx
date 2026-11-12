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
import { useProcessReturnMutation } from "@/lib/hooks/use-process-return-mutation";
import { Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { ReturnItemRow } from "./return-item-row";
import { ReturnServiceRow } from "./return-service-row";
import { ReturnConfirmDialog } from "./return-confirm-dialog";
import { useReturnSelection } from "./use-return-selection";
import type { SaleWithDetails } from "@/lib/types/sale";
import { resellerPatchAfterReturn } from "@/lib/utils/reseller-return-adjustment";
import { extractSpotSourcedProductIds } from "@/lib/utils/spot-sourcing";

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: SaleWithDetails | null;
  onSuccess: () => void;
  currencyCode?: string;
}

export function ReturnDialog({
  open,
  onOpenChange,
  sale,
  onSuccess,
  currencyCode,
}: ReturnDialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [freshSale, setFreshSale] = useState<SaleWithDetails | null>(null);

  const { data: detailsData, isLoading: loadingSaleItems } = useQuery({
    ...queryKeys.sales.transactionDetails(sale?.id),
    queryFn: () => (sale ? getTransactionDetails(sale.id) : Promise.resolve(null)),
    enabled: !!sale,
  });
  const saleItems = detailsData?.items || [];
  const saleServices = detailsData?.services || [];
  const returnMutation = useProcessReturnMutation();

  const {
    selectedItems,
    selectedServices,
    handleToggleItem,
    handleQtyChange,
    handleDiscardQtyChange,
    handleDiscardReasonChange,
    handleToggleService,
    handleServiceQtyChange,
    itemsToReturn,
    servicesToReturn,
  } = useReturnSelection(saleItems, saleServices);

  const spotSourcedProductIds = useMemo(
    () => extractSpotSourcedProductIds(sale?.payment_details),
    [sale?.payment_details],
  );

  if (!sale) return null;

  const itemsSubtotal = itemsToReturn.reduce(
    (sum, item) => sum + (item.unit_price || 0) * item.returnQuantity,
    0,
  );
  const servicesSubtotal = servicesToReturn.reduce(
    (sum, s) => sum + (s.unitPrice || 0) * s.returnQuantity,
    0,
  );
  const saleSubtotal = sale?.subtotal || 0;
  const totalRefund = calculateProportionalRefund({
    itemsSubtotal: itemsSubtotal + servicesSubtotal,
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
    if (itemsToReturn.length === 0 && servicesToReturn.length === 0) {
      toast.error("Please select at least one item or service to return");
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
        servicesToReturn,
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
                {!loadingSaleItems &&
                  saleServices?.map((svc) => {
                    const maxQty = Math.max(0, svc.quantity - (svc.returned_quantity || 0));
                    const selection = selectedServices.get(svc.id);
                    return (
                      <ReturnServiceRow
                        key={svc.id}
                        service={svc}
                        quantity={selection?.quantity ?? maxQty}
                        selected={selection?.selected || false}
                        maxQty={maxQty}
                        currencyCode={currencyCode}
                        onToggle={() => handleToggleService(svc.id, maxQty)}
                        onQtyChange={(qty) => handleServiceQtyChange(svc.id, qty, maxQty)}
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
        servicesToReturn={servicesToReturn}
        totalRefund={totalRefund}
        commissionOwedBack={commissionOwedBack}
        currencyCode={currencyCode}
        onConfirm={handleSubmit}
      />
    </>
  );
}
