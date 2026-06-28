import { useState, useEffect } from "react";

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: string;
  orderDate: string;
  expectedDate: string;
  status: "draft" | "sent" | "confirmed" | "received" | "cancelled";
  totalAmount: number;
  itemCount: number;
  createdBy: string;
}

export function usePurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      try {
        const { getPurchaseOrders } = await import("@/lib/db/local-database");
        const res = await getPurchaseOrders(1, 100);

        const items = (res.data || []).map((o: any) => ({
          id: o.id,
          orderNumber: o.order_number || o.orderNumber || `PO-${o.id}`,
          supplier:
            o.supplier?.name || o.supplier_name || o.vendor_name || "Unknown",
          orderDate: o.order_date || o.created_at,
          expectedDate: o.expected_date || o.order_date || o.created_at,
          status: o.status || "draft",
          totalAmount: Number(o.total_amount) || 0,
          itemCount: o.items?.length || o.item_count || 0,
          createdBy: o.created_by?.name || o.user_name || "System",
        }));
        setOrders(items);
      } catch (error) {
        console.error("Failed to fetch purchase orders:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  const totalOrderValue = orders.reduce(
    (sum, order) => sum + order.totalAmount,
    0,
  );
  const pendingOrders = orders.filter((order) =>
    ["sent", "confirmed"].includes(order.status),
  ).length;
  const draftOrders = orders.filter((order) => order.status === "draft").length;

  return {
    orders,
    loading,
    totalOrderValue,
    pendingOrders,
    draftOrders,
  };
}
