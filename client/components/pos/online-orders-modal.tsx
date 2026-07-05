"use client";

import { useState, useEffect } from "react";
import { useOnlineOrdersModal } from "@/lib/store/use-online-orders-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/context/auth-context";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { useDatabase } from "@/lib/db/DatabaseProvider";
import { generateId, execute, query } from "@/lib/db/core";

export function OnlineOrdersModal() {
  const { isOpen, onClose } = useOnlineOrdersModal();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getOnlineOrders();
      if (data && data.orders) {
        setOrders(data.orders);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load online orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOrders();
    }
  }, [isOpen]);

  const handleFulfill = async (order: any) => {
    setFulfillingId(order.id);
    try {
      // 1. Mark as fulfilled on server
      await apiClient.fulfillOnlineOrder(order.id);

      // 2. Record locally in SQLite (as an online sale)
      const saleId = generateId();
      const now = new Date().toISOString();
      
      await execute(`
        INSERT INTO sales (
          id, store_id, total_amount, amount_paid, change_given, 
          payment_method, payment_status, receipt_number, cashier_id, 
          customer_name, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        saleId, user?.store_id, order.total_amount, order.total_amount, 0,
        order.payment_method, "paid", `ONL-${order.id.split('-')[0]}`, user?.id,
        order.customer_name, "completed", now, now
      ]);

      // Deduct stock for each item
      for (const item of order.items) {
        const saleItemId = generateId();
        await execute(`
          INSERT INTO sale_items (
            id, sale_id, product_id, quantity, unit_price, subtotal, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          saleItemId, saleId, item.product_id, item.quantity, item.unit_price, item.subtotal, now, now
        ]);

        // Reduce stock in stock_batches (simple FIFO logic or just deduct from first available)
        // Here we just deduct from the latest active batch to keep it simple, since online order didn't pick batch.
        const batches = await query<{id: string, quantity: number}>(
          `SELECT id, quantity FROM stock_batches WHERE product_id = ? AND quantity > 0 ORDER BY created_at ASC`,
          [item.product_id]
        );
        
        let remainingToDeduct = item.quantity;
        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(batch.quantity, remainingToDeduct);
          await execute(`UPDATE stock_batches SET quantity = quantity - ? WHERE id = ?`, [deduct, batch.id]);
          remainingToDeduct -= deduct;
        }
      }

      toast.success("Order fulfilled and recorded locally");
      // Trigger a refresh event if components listen to it
      window.dispatchEvent(new CustomEvent("local_db_changed"));
      await fetchOrders();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to fulfill order");
    } finally {
      setFulfillingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Online Orders</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 pr-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              No online orders found.
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map(order => (
                <div key={order.id} className="border rounded-lg p-4 space-y-4 bg-card">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{order.customer_name}</h3>
                      <p className="text-sm text-muted-foreground">{order.customer_phone} • {order.customer_address || "In-store pickup"}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(order.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={order.order_status === 'fulfilled' ? "default" : "secondary"}>
                        {order.order_status.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-xs uppercase">
                        {order.payment_method}
                      </Badge>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded p-3">
                    <table className="w-full text-sm">
                      <tbody>
                        {order.items.map((item: any) => (
                          <tr key={item.id}>
                            <td className="py-1">{item.product?.name || 'Unknown Product'}</td>
                            <td className="py-1 text-right">x{item.quantity}</td>
                            <td className="py-1 text-right">₦{Number(item.subtotal).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td colSpan={2} className="py-2">Total</td>
                          <td className="py-2 text-right text-emerald-600">₦{Number(order.total_amount).toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {order.order_status === 'pending' && (
                    <div className="flex justify-end gap-2 pt-2">
                      <Button 
                        variant="default" 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleFulfill(order)}
                        disabled={fulfillingId === order.id}
                      >
                        {fulfillingId === order.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                        Fulfill & Deduct Stock
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
