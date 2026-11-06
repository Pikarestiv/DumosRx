import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";

export interface HeldTransaction {
  id: string;
  customer_id?: string | null;
  customer_name: string;
  items_json: string;
  total_amount: number;
  discount?: number;
  discount_type?: string | null;
  is_reseller_sale?: number | null;
  markup_type?: string | null;
  created_at: string;
}

export async function getHeldTransactions() {
  const storeId = getActiveStoreId();
  return query<HeldTransaction>(
    `SELECT * FROM held_transactions WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""} ORDER BY created_at DESC`,
    storeId ? [storeId] : [],
  );
}

export async function getHeldTransactionCount() {
  const storeId = getActiveStoreId();
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM held_transactions WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  return result[0]?.count || 0;
}

