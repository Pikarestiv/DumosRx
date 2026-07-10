"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatCurrency } from "@/lib/utils";
import { insert, update } from "@/lib/db/local-database";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSaleItems } from "@/lib/db/queries/sales";
import { getStockBatchById } from "@/lib/db/queries/inventory";
import { Loader2, RotateCcw, Minus, Plus } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface ReturnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: any;
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
  const [selectedItems, setSelectedItems] = useState<
    Map<string, { selected: boolean; quantity: number }>
  >(new Map());
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch items for this sale
  const { data: saleItemsData } = useQuery({
    queryKey: ['saleItems', sale?.id],
    queryFn: () => sale ? getSaleItems(sale.id) : Promise.resolve([]),
    enabled: !!sale
  });
  const saleItems = saleItemsData || [];

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

  const itemsToReturn = Array.from(selectedItems.entries())
    .filter(([_, val]) => val.selected)
    .map(([id, val]) => ({
      ...(saleItems?.find((si: any) => si.id === id) || {}),
      returnQuantity: val.quantity,
    }));

  const totalRefund = itemsToReturn.reduce(
    (sum, item) => sum + (item.unit_price || 0) * item.returnQuantity,
    0,
  );

  const handleInitialSubmit = () => {
    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      // 1. Create return record
      const returnId = await insert("returns", {
        sale_id: sale.id,
        user_id: user?.id || "system",
        reason: reason,
        total_refunded: totalRefund,
        created_at: new Date().toISOString(),
      });

      // 2. Create return items and update stock
      for (const item of itemsToReturn) {
        await insert("return_items", {
          return_id: returnId,
          product_id: item.product_id,
          quantity: item.returnQuantity,
          unit_price: item.unit_price,
          subtotal: item.unit_price * item.returnQuantity,
        });

        // Update stock_batch if applicable
        if (item.stock_batch_id) {
          const currentInv = await getStockBatchById(item.stock_batch_id);
          if (currentInv) {
            await update("stock_batches", item.stock_batch_id, {
              quantity: (currentInv.quantity || 0) + item.returnQuantity,
            });
          }
        }
      }

      // 3. Mark sale as returned
      const allItemsReturned =
        itemsToReturn.length === saleItems.length &&
        itemsToReturn.every((i) => i.returnQuantity === i.quantity);
      await update("sales", sale.id, {
        payment_status: allItemsReturned ? "refunded" : "partially_refunded",
      });

      toast.success(
        `Return processed. Refund amount: ${formatCurrency(totalRefund, currencyCode)}`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Return failed", error);
      toast.error("Failed to process return");
    } finally {
      setProcessing(false);
    }
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-accent" />
            Process Sales Return
          </DialogTitle>
          <DialogDescription>
            Select items from transaction #{sale.transaction_number} to return
            to stock.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
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
                {saleItems?.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                        checked={selectedItems.get(item.id)?.selected || false}
                        onChange={() =>
                          handleToggleItem(item.id, item.quantity)
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.product_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-r-none border-r-0"
                          onClick={() =>
                            handleQtyChange(
                              item.id,
                              (selectedItems.get(item.id)?.quantity ??
                                item.quantity) - 1,
                              item.quantity,
                            )
                          }
                          disabled={
                            (selectedItems.get(item.id)?.quantity ??
                              item.quantity) <= 1
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          className="w-14 h-8 text-center rounded-none px-1"
                          value={
                            selectedItems.get(item.id)?.quantity ??
                            item.quantity
                          }
                          onChange={(e) =>
                            handleQtyChange(
                              item.id,
                              parseInt(e.target.value) || 1,
                              item.quantity,
                            )
                          }
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-l-none border-l-0"
                          onClick={() =>
                            handleQtyChange(
                              item.id,
                              (selectedItems.get(item.id)?.quantity ??
                                item.quantity) + 1,
                              item.quantity,
                            )
                          }
                          disabled={
                            (selectedItems.get(item.id)?.quantity ??
                              item.quantity) >= item.quantity
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        (selectedItems.get(item.id)?.quantity ??
                          item.quantity) * item.unit_price,
                        currencyCode,
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">Reason for Return</Label>
            <Textarea
              id="reason"
              placeholder="e.g. Expired product, customer change of mind, incorrect dosage"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleInitialSubmit}
            disabled={processing}
            className="bg-accent hover:bg-accent/90"
          >
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Return & Refund
          </Button>
        </DialogFooter>
      </DialogContent>

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
              {itemsToReturn.map((item: any) => (
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
    </Dialog>
  );
}
