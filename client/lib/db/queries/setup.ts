import { query, execute } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import type { PaymentAccount } from "@/lib/types/payment-account";
import type { StoreOption } from "@/lib/types/store";
import type { StoreProfile } from "@/lib/context/store-context";

export async function checkIfTableExists(tableName: string) {
  const tables = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [tableName]
  );
  return tables.length > 0;
}

export async function getExistingCustomers() {
  const existingCustomers = await query<{ first_name?: string; last_name?: string }>("SELECT first_name, last_name FROM customers");
  return existingCustomers;
}

export async function getSyncQueueCount() {
  const result = await query<{ count: number }>("SELECT COUNT(*) as count FROM _sync_queue");
  return result[0]?.count || 0;
}

export async function getTotalRecordCount() {
  const res = await query<{ total: number }>(
    "SELECT (SELECT COUNT(*) FROM products) + (SELECT COUNT(*) FROM sales) as total"
  );
  return res[0]?.total || 0;
}

export async function getStoreById(id: string) {
  const stores = await query<StoreProfile>("SELECT * FROM stores WHERE id = ? AND (_deleted = 0 OR _deleted IS NULL)", [id]);
  return stores[0] || null;
}

export async function getFirstStore() {
  const stores = await query<StoreProfile>("SELECT * FROM stores WHERE (_deleted = 0 OR _deleted IS NULL) LIMIT 1");
  return stores[0] || null;
}

export async function getAllStores() {
  return query<StoreProfile>("SELECT * FROM stores WHERE (_deleted = 0 OR _deleted IS NULL)");
}

export async function getPaymentAccounts(storeId?: string) {
  storeId = storeId ?? getActiveStoreId() ?? undefined;
  if (storeId) {
    return query<PaymentAccount>(
      "SELECT * FROM payment_accounts WHERE _deleted = 0 AND store_id = ? ORDER BY created_at DESC",
      [storeId]
    );
  }
  return query<PaymentAccount>(
    "SELECT * FROM payment_accounts WHERE _deleted = 0 ORDER BY created_at DESC"
  );
}

export async function getActiveUserCount() {
  const result = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE is_active = 1",
  );
  return Number(result[0]?.count || 0);
}

export async function getTotalUserCount() {
  const users = await query<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE _deleted = 0");
  return Number(users[0]?.count || 0);
}

export async function getLocalStores() {
  return query<StoreOption>("SELECT id, name FROM stores WHERE _deleted = 0");
}

export async function getStoreProfile() {
  const profiles = await query<StoreProfile>("SELECT * FROM stores WHERE (_deleted = 0 OR _deleted IS NULL) LIMIT 1");
  return profiles[0] || null;
}

export async function updateStoreMonotonicTime(id: string, timeIso: string) {
  return execute("UPDATE stores SET last_monotonic_time = ? WHERE id = ?", [timeIso, id]);
}
