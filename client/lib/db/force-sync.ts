import { execute, query } from "./core";
import { serializeRequeuePayload } from "./requeue-payload";

const FORCE_SYNC_TABLES = [
  "products",
  "stock_batches",
  "categories",
  "customers",
  "sales",
  "sale_items",
  "prescriptions",
  "prescription_items",
  "returns",
  "return_items",
  "customer_payments",
  "stores",
  "expenses",
  "users",
  "audit_logs",
  "purchase_orders",
  "purchase_order_items",
  "suppliers",
  "stock_audits",
  "held_transactions",
  "loyalty_transactions",
  "feedback",
  "stock_movements",
  "payment_accounts",
  "system_configs",
  "services",
  "sale_services",
  "return_services",
] as const;

export async function forceSyncAllData() {
  console.log(
    "Marking all local data as un-synced and adding to sync queue...",
  );
  let count = 0;
  await execute(`DELETE FROM _sync_queue`);

  const now = new Date().toISOString();

  for (const table of FORCE_SYNC_TABLES) {
    try {
      await execute(`UPDATE ${table} SET _synced = 0`);
      const records = await query<{ id: string; [key: string]: unknown }>(
        `SELECT * FROM ${table}`,
      );

      for (const record of records) {
        await execute(
          `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [table, record.id, "INSERT", serializeRequeuePayload(record), now],
        );
        count++;
      }
    } catch (_e) {
      // Table might not exist in an older/partial test schema
    }
  }
  console.log(
    `Successfully queued ${count} records for syncing. You can now press 'Sync' on the POS to push everything to the cloud.`,
  );
  return `Done! Queued ${count} records. You can now press 'Sync' on the POS to push everything to the cloud.`;
}
