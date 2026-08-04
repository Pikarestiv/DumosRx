"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StoreDetail, Transaction } from "@/lib/types/dashboard";

export function StoreTransactionsTab({ store }: { store: StoreDetail }) {
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

  if (!store.recent_transactions || store.recent_transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ShoppingCart className="h-8 w-8 opacity-20 mb-2" />
        <p className="font-medium">
          No recent sales found for this store
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Receipt #</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {store.recent_transactions.map((trx) => (
              <TableRow
                key={trx.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setViewingTransaction(trx)}
              >
                <TableCell className="font-mono text-xs">
                  {trx.transaction_number}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {trx.items
                    ?.map(
                      (item) =>
                        `${item.quantity}x ${item.product_name || "Item"}`,
                    )
                    .join(", ") || "No items"}
                </TableCell>
                <TableCell className="text-right font-black text-green-600">
                  ₦{trx.total_amount}
                </TableCell>
                <TableCell className="text-right text-xs font-medium">
                  {new Date(trx.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!viewingTransaction}
        onOpenChange={() => setViewingTransaction(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              Receipt #{viewingTransaction?.transaction_number}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm font-medium text-muted-foreground">
                <div className="flex flex-col">
                  <span>
                    Date:{" "}
                    {viewingTransaction &&
                      new Date(viewingTransaction.created_at).toLocaleString()}
                  </span>
                  <span>
                    Cashier: {viewingTransaction?.cashier_name || "Unknown"}
                  </span>
                </div>
                <span>Items: {viewingTransaction?.items?.length || 0}</span>
              </div>

              <div className="border rounded-md divide-y">
                {viewingTransaction?.items?.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">
                        {item.product_name || "Item"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} x ₦{item.unit_price}
                      </p>
                    </div>
                    <p className="font-bold">₦{item.total_price}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="font-bold">Total Amount</span>
                <span className="font-black text-green-600 text-lg">
                  ₦{viewingTransaction?.total_amount}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
