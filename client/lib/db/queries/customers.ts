import { query } from "@/lib/db/local-database";

export async function getCustomers() {
  return query<any>("SELECT * FROM customers WHERE _deleted = 0 ORDER BY created_at DESC");
}

export async function getDebtors() {
  return query<any>(
    "SELECT * FROM customers WHERE outstanding_balance > 0 AND _deleted = 0 ORDER BY outstanding_balance DESC"
  );
}

export async function getCustomerBalance(id: string) {
  return query<{ id: string; balance: number }>(
    "SELECT id, outstanding_balance as balance FROM customers WHERE id = ?",
    [id],
  );
}

export async function getAllCustomers() {
  const items = await query<any>(
    "SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC"
  );
  
  return items.map((c: any) => ({
    id: c.id,
    first_name: c.first_name || "",
    last_name: c.last_name || "",
    phone: c.phone || "",
    loyalty_points: c.loyalty_points || 0,
    outstanding_balance: c.outstanding_balance || 0,
  }));
}
