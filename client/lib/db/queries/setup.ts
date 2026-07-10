import { query, execute, insert } from "@/lib/db/local-database";
import { ParsedIIF } from "@/lib/utils/iif-parser";

export async function checkIfTableExists(tableName: string) {
  const tables = await query<any>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [tableName]
  );
  return tables.length > 0;
}

export async function getExistingCustomers() {
  const existingCustomers = await query<any>("SELECT first_name, last_name FROM customers");
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
  const stores = await query<any>("SELECT * FROM stores WHERE id = ?", [id]);
  return stores[0] || null;
}

export async function getFirstStore() {
  const stores = await query<any>("SELECT * FROM stores LIMIT 1");
  return stores[0] || null;
}

export async function getAllStores() {
  return query<any>("SELECT * FROM stores");
}

export async function getPaymentAccounts(storeId?: string) {
  if (storeId) {
    return query<any>(
      "SELECT * FROM payment_accounts WHERE _deleted = 0 AND store_id = ? ORDER BY created_at DESC",
      [storeId]
    );
  }
  return query<any>(
    "SELECT * FROM payment_accounts WHERE _deleted = 0 ORDER BY created_at DESC"
  );
}

export async function getActiveUserCount() {
  const result = await query<any>(
    "SELECT COUNT(*) as count FROM users WHERE is_active = 1",
  );
  return Number(result[0]?.count || 0);
}

export async function getTotalUserCount() {
  const users = await query<any>("SELECT COUNT(*) as count FROM users WHERE _deleted = 0");
  return Number(users[0]?.count || 0);
}

export async function getLocalStores() {
  return query<any>("SELECT id, name FROM stores WHERE _deleted = 0");
}

export async function getStoreProfile() {
  const profiles = await query<any>("SELECT * FROM stores LIMIT 1");
  return profiles[0] || null;
}

export async function updateStoreMonotonicTime(id: string, timeIso: string) {
  return execute("UPDATE stores SET last_monotonic_time = ? WHERE id = ?", [timeIso, id]);
}

export async function importQuickbooksData(
  parsedData: ParsedIIF,
  importProducts: boolean,
  importCustomers: boolean,
  duplicateStrategy: "skip" | "overwrite"
) {
  const now = new Date().toISOString();

  // Import Products
  if (importProducts && parsedData.products.length > 0) {
    const existingProducts = await query<any>("SELECT id, name FROM products");
    const existingNames = new Set(existingProducts.map((m: any) => m.name.toLowerCase()));

    for (const med of parsedData.products) {
      const isDuplicate = existingNames.has(med.name.toLowerCase());

      if (isDuplicate) {
        if (duplicateStrategy === "overwrite") {
          const existingMed = existingProducts.find((p: any) => p.name.toLowerCase() === med.name.toLowerCase());
          if (existingMed) {
            await execute(
              "UPDATE products SET selling_price = ?, updated_at = ? WHERE id = ?",
              [med.unit_price, now, existingMed.id]
            );

            // Update or insert QB_IMPORT batch
            const existingBatch = await query<any>(
              "SELECT id FROM stock_batches WHERE product_id = ? AND batch_number = ? AND _deleted = 0",
              [existingMed.id, "QB_IMPORT"]
            );

            if (existingBatch && existingBatch.length > 0) {
              await execute(
                "UPDATE stock_batches SET quantity = ?, selling_price = ?, updated_at = ? WHERE id = ?",
                [med.stock, med.unit_price, now, existingBatch[0].id]
              );
            } else if (med.stock > 0) {
              await insert("stock_batches", {
                product_id: existingMed.id,
                batch_number: "QB_IMPORT",
                quantity: med.stock,
                cost_price: med.unit_price * 0.8,
                selling_price: med.unit_price,
                expiry_date: new Date(Date.now() + 365*2*24*60*60*1000).toISOString().split('T')[0],
                is_active: 1
              });
            }
          }
        }
      } else {
        const productId = await insert("products", {
          id: med.id,
          name: med.name,
          generic_name: med.generic_name || "",
          brand_name: med.brand || "",
          strength: med.strength || "",
          selling_price: med.unit_price,
          barcode: med.barcode || "",
          created_at: now,
          updated_at: now,
          _deleted: 0,
          _synced: 0
        });

        if (med.stock > 0) {
          await insert("stock_batches", {
            product_id: productId,
            batch_number: "QB_IMPORT",
            quantity: med.stock,
            cost_price: med.unit_price * 0.8,
            selling_price: med.unit_price,
            expiry_date: new Date(Date.now() + 365*2*24*60*60*1000).toISOString().split('T')[0],
            is_active: 1
          });
        }
        existingNames.add(med.name.toLowerCase());
      }
    }
  }

  // Import Customers
  if (importCustomers && parsedData.customers.length > 0) {
    const existingCustomers = await query<any>("SELECT first_name, last_name FROM customers");
    const getFullName = (c: any) => `${c.first_name} ${c.last_name}`.toLowerCase();
    const existingNames = new Set(existingCustomers.map(getFullName));

    for (const cust of parsedData.customers) {
      const fullName = getFullName(cust);
      const isDuplicate = existingNames.has(fullName);

      if (isDuplicate) {
        if (duplicateStrategy === "overwrite") {
          await execute(
            "UPDATE customers SET phone = ?, outstanding_balance = ?, updated_at = ? WHERE LOWER(first_name || ' ' || last_name) = ?",
            [cust.phone, cust.outstanding_balance, now, fullName]
          );
        }
      } else {
        await insert("customers", {
          id: cust.id,
          first_name: cust.first_name,
          last_name: cust.last_name,
          phone: cust.phone || "",
          loyalty_points: cust.loyalty_points || 0,
          outstanding_balance: cust.outstanding_balance || 0,
          created_at: now,
          updated_at: now,
          _deleted: 0,
          _synced: 0
        });
        existingNames.add(fullName);
      }
    }
  }
}
