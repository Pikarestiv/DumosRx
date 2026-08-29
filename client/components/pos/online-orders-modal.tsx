"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useOnlineOrdersModal } from "@/lib/store/use-online-orders-modal";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { useAuth } from "@/lib/context/auth-context";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle, PackageOpen } from "lucide-react";

import { generateId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import { getStockBatchesForProduct } from "@/lib/db/queries/sales";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";
import type { OnlineOrder } from "@/lib/types/online-order";

function NoOnlineOrdersFound() {
  return (
    <div className="flex flex-col items-center gap-2 text-center p-8 text-muted-foreground">
      <PackageOpen className="w-7 h-7 opacity-30" />
      No online orders found.
    </div>
  );
}

export function OnlineOrdersModal() {
  const { isOpen, onClose } = useOnlineOrdersModal();
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const {
    data: orders = [],
    isLoading: loading,
    refetch: fetchOrders,
  } = useQuery({
    ...queryKeys.onlineOrders.all(),
    queryFn: async (): Promise<OnlineOrder[]> => {
      const data = await apiClient.getOnlineOrders();
      return data?.orders || [];
    },
    enabled: isOpen,
  });

  const handleFulfill = async (order: OnlineOrder) => {
    setFulfillingId(order.id);
    try {
      // 1. Mark as fulfilled on server
      await apiClient.fulfillOnlineOrder(order.id);

      // 2. Record locally in SQLite (as an online sale), via the standard
      // insert()/update() helpers, not raw execute(), so this gets audit
      // logging and cache invalidation like every other mutation.
      const saleId = generateId();

      await insert("sales", {
        id: saleId,
        store_id: user?.store_id,
        total_amount: order.total_amount,
        amount_paid: order.total_amount,
        change_given: 0,
        payment_method: order.payment_method,
        payment_status: "paid",
        receipt_number: `ONL-${order.id.split('-')[0]}`,
        cashier_id: user?.id,
        customer_name: order.customer_name,
        status: "completed",
      });

      // Deduct stock for each item
      for (const item of order.items) {
        await insert("sale_items", {
          sale_id: saleId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
        });

        // Reduce stock in stock_batches (simple FIFO logic or just deduct from first available)
        // Here we just deduct from the latest active batch to keep it simple, since online order didn't pick batch.
        const batches = await getStockBatchesForProduct(item.product_id);

        let remainingToDeduct = item.quantity;
        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(batch.quantity, remainingToDeduct);
          await update("stock_batches", batch.id, {
            quantity: batch.quantity - deduct,
          });
          remainingToDeduct -= deduct;
        }
      }

      toast.success("Order fulfilled and recorded locally");
      await fetchOrders();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to fulfill order");
    } finally {
      setFulfillingId(null);
    }
  };

  return (
    <ResponsiveModal open={isOpen} onOpenChange={onClose} title={<>Online Orders</>}  className="max-w-4xl max-h-[80vh] flex flex-col">
        
        <div className="flex-1 pr-4 overflow-y-auto max-h-[60vh]">
          {loading && (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && orders.length === 0 && <NoOnlineOrdersFound />}
          {!loading && orders.length > 0 && (
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
                    {/* Div-based table; ARIA roles stand in for real <table> semantics */}
                    <div role="table" aria-label="Order items" className="w-full text-sm">
                      <div role="rowgroup">
                        {order.items.map((item) => (
                          <div key={item.id} role="row" className="flex items-center gap-2">
                            <div role="cell" className="py-1 flex-1">{item.product?.name || 'Unknown Product'}</div>
                            <div role="cell" className="py-1 text-right w-[60px] shrink-0">x{item.quantity}</div>
                            <div role="cell" className="py-1 text-right w-[100px] shrink-0">{formatCurrency(Number(item.subtotal), currencyCode)}</div>
                          </div>
                        ))}
                      </div>
                      <div role="rowgroup">
                        <div role="row" className="flex items-center gap-2 border-t font-semibold">
                          <div role="cell" className="py-2 flex-1">Total</div>
                          <div role="cell" className="py-2 text-right w-[100px] shrink-0 text-emerald-600">{formatCurrency(Number(order.total_amount), currencyCode)}</div>
                        </div>
                      </div>
                    </div>
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
      </ResponsiveModal>
  );
}
