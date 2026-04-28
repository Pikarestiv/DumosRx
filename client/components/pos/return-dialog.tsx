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
import { insert, update, query } from "@/lib/db/local-database";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";

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
  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number }>>({});
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);

  // Fetch items for this sale
  const { data: saleItems } = useLocalData<any>(
    sale ? `SELECT si.*, m.name as medicine_name FROM sale_items si JOIN medicines m ON si.medicine_id = m.id WHERE si.sale_id = ?` : "",
    sale ? [sale.id] : []
  );

  const handleToggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: {
        selected: !prev[itemId]?.selected,
        quantity: prev[itemId]?.quantity || maxQty,
      },
    }));
  };

  const handleQtyChange = (itemId: string, qty: number, maxQty: number) => {
    const validQty = Math.min(Math.max(1, qty), maxQty);
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], quantity: validQty },
    }));
  };

  const handleSubmit = async () => {
    const itemsToReturn = Object.entries(selectedItems)
      .filter(([_, val]) => val.selected)
      .map(([id, val]) => ({
        ...saleItems.find((si: any) => si.id === id),
        returnQuantity: val.quantity,
      }));

    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }

    setProcessing(true);
    try {
      const totalRefund = itemsToReturn.reduce((sum, item) => sum + (item.unit_price * item.returnQuantity), 0);
      
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
          medicine_id: item.medicine_id,
          quantity: item.returnQuantity,
          unit_price: item.unit_price,
          subtotal: item.unit_price * item.returnQuantity,
        });

        // Update medicine stock
        const medicines = await query<any>(`SELECT stock_quantity FROM medicines WHERE id = ?`, [item.medicine_id]);
        const currentMedicine = medicines[0];
        await update("medicines", item.medicine_id, {
          stock_quantity: (currentMedicine?.stock_quantity || 0) + item.returnQuantity
        });
      }

      toast.success(`Return processed. Refund amount: ${formatCurrency(totalRefund, currencyCode)}`);
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
            Select items from transaction #{sale.transaction_number} to return to stock.
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
                        checked={selectedItems[item.id]?.selected || false}
                        onChange={() => handleToggleItem(item.id, item.quantity)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.medicine_name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      <Input 
                        type="number" 
                        className="w-16 h-8 text-right ml-auto"
                        value={selectedItems[item.id]?.quantity || item.quantity}
                        onChange={(e) => handleQtyChange(item.id, parseInt(e.target.value), item.quantity)}
                        disabled={!selectedItems[item.id]?.selected}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency((selectedItems[item.id]?.quantity || item.quantity) * item.unit_price, currencyCode)}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={processing} className="bg-accent hover:bg-accent/90">
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Return & Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
