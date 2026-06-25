import { useLocalData } from "@/lib/db/hooks/useLocalData";

export interface Medicine {
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
  const {
    data: medicines,
    loading: loadingMedicines,
    refetch: refetchMedicines,
  } = useLocalData<Medicine>(
    "SELECT * FROM medicines WHERE _deleted = 0 ORDER BY name ASC",
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
        cost_price: m.cost_price || 0,
        barcode: m.barcode || "",
        batch_number: m.batch_number || "",
        category_id: m.category_id || "",
      }),
    },
  );

  const { data: recentSales, refetch: refetchSales } = useLocalData<any>(
    "SELECT s.*, c.first_name || ' ' || c.last_name as customer_name FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s._deleted = 0 ORDER BY s.created_at DESC LIMIT 10",
  );

  const { data: recentlySoldData } = useLocalData<any>(
    "SELECT DISTINCT medicine_id FROM sale_items ORDER BY created_at DESC LIMIT 8",
  );

  const { data: commonlySoldData } = useLocalData<any>(
    "SELECT medicine_id, SUM(quantity) as total_qty FROM sale_items GROUP BY medicine_id ORDER BY total_qty DESC LIMIT 8",
  );

  const recentlySoldIds =
    recentlySoldData?.map((item: any) => item.medicine_id) || [];
  const commonlySoldIds =
    commonlySoldData?.map((item: any) => item.medicine_id) || [];

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
    medicines,
    loadingMedicines,
    refetchMedicines,
    recentSales,
    refetchSales,
    recentlySoldIds,
    commonlySoldIds,
    customers,
    loadingCustomers,
    paymentAccounts,
  };
}
