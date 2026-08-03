export interface OnlineOrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  product?: { name: string };
}

export interface OnlineOrder {
  id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  total_amount: number;
  payment_method: string;
  order_status: "pending" | "fulfilled" | string;
  created_at: string;
  items: OnlineOrderItem[];
}
