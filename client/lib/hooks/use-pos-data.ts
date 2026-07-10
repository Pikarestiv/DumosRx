import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useAuthStore } from "@/lib/auth/store";

export interface Product {
  id: string;
  name: string;
  generic_name: string;
  brand: string;
  strength: string;
  unit_price: number;
  stock: number;
  cost_price?: number;
  barcode?: string;
  batch_number?: string;
  category_id?: string;
}

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
  outstanding_balance: number;
}

export function usePOSData() {
  const { user } = useAuthStore();
  const isRestrictedRole = user?.role === "sales_staff" || user?.role === "specialist";
  const userFilterAliasS = isRestrictedRole && user?.id ? ` AND s.user_id = '${user.id}'` : "";

  const {
    data: products,
    loading: loadingProducts,
    refetch: refetchProducts,
  } = useLocalData<Product>(
    "SELECT p.*, COALESCE(SUM(sb.quantity), 0) as stock_quantity, GROUP_CONCAT(sb.batch_number, ', ') as batch_number, AVG(sb.cost_price) as avg_cost_price FROM products p LEFT JOIN stock_batches sb ON p.id = sb.product_id AND sb._deleted = 0 AND sb.is_active = 1 WHERE p._deleted = 0 GROUP BY p.id ORDER BY p.name ASC",
    [],
    {
      transform: (m: any) => ({
        id: m.id,
        name: m.name,
        generic_name: m.generic_name || "",
        brand: m.brand_name || m.brand || "",
        strength: m.strength || "",
        unit_price: m.selling_price || 0,
        stock: m.stock_quantity || 0,
        cost_price: m.avg_cost_price || 0,
        barcode: m.barcode || "",
        batch_number: m.batch_number || "",
        category_id: m.category_id || "",
      }),
    },
  );

  const { data: recentSales, refetch: refetchSales } = useLocalData<any>(
    `SELECT s.*, c.first_name || ' ' || c.last_name as customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s._deleted = 0${userFilterAliasS} ORDER BY s.created_at DESC LIMIT 10`,
  );

  const { data: recentlySoldData } = useLocalData<any>(
    "SELECT DISTINCT product_id FROM sale_items ORDER BY created_at DESC LIMIT 8",
  );

  const { data: commonlySoldData } = useLocalData<any>(
    "SELECT product_id, SUM(quantity) as total_qty FROM sale_items GROUP BY product_id ORDER BY total_qty DESC LIMIT 8",
  );

  const recentlySoldIds =
    recentlySoldData?.map((item: any) => item.product_id) || [];
  const commonlySoldIds =
    commonlySoldData?.map((item: any) => item.product_id) || [];

  const { data: customers, loading: loadingCustomers } = useLocalData<Customer>(
    "SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC",
    [],
    {
      transform: (c: any) => ({
        id: c.id,
        first_name: c.first_name || "",
        last_name: c.last_name || "",
        phone: c.phone || "",
        loyalty_points: c.loyalty_points || 0,
        outstanding_balance: c.outstanding_balance || 0,
      }),
    },
  );

  const { data: paymentAccounts } = useLocalData<any>(
    "SELECT * FROM payment_accounts WHERE _deleted = 0 ORDER BY created_at DESC",
  );

  return {
    products,
    loadingProducts,
    refetchProducts,
    recentSales,
    refetchSales,
    recentlySoldIds,
    commonlySoldIds,
    customers,
    loadingCustomers,
    paymentAccounts,
  };
}
