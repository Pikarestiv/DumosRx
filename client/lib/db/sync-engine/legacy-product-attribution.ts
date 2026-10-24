import { execute, query } from "../core";
import { deviceHoldsSeveralStores } from "../device-stores";
import { columnExists } from "../reconcile-identity";

/**
 * A-248: on a multi-store device a store-less legacy product takes the one store its own batches and movements
 * all name, locally and in its pending INSERT. Rules: client/AGENTS.md, "Legacy products are attributed by evidence".
 */
export async function attributeStorelessProductsFromEvidence(): Promise<number> {
  if (!(await columnExists("products", "store_id"))) return 0;
  const [storeless] = await query<{ found: number }>(
    "SELECT EXISTS (SELECT 1 FROM products WHERE store_id IS NULL) AS found",
  );
  if (!storeless?.found || !(await deviceHoldsSeveralStores())) return 0;

  const sources: string[] = [];
  for (const table of ["stock_batches", "stock_movements"]) {
    if (await columnExists(table, "store_id")) {
      sources.push(
        `SELECT product_id, store_id FROM ${table} WHERE store_id IS NOT NULL AND product_id IN (SELECT id FROM products WHERE store_id IS NULL)`,
      );
    }
  }
  if (sources.length === 0) return 0;

  const attributable = await query<{ id: string; store_id: string }>(
    `SELECT e.product_id AS id, MIN(e.store_id) AS store_id
       FROM (${sources.join(" UNION ALL ")}) e
      GROUP BY e.product_id
     HAVING COUNT(DISTINCT e.store_id) = 1`,
  );

  for (const { id, store_id } of attributable) {
    await execute("UPDATE products SET store_id = ? WHERE id = ? AND store_id IS NULL", [store_id, id]);

    const pending = await query<{ id: number; payload: string }>(
      "SELECT id, payload FROM _sync_queue WHERE table_name = 'products' AND record_id = ? AND operation = 'INSERT'",
      [id],
    );
    for (const row of pending) {
      const payload = JSON.parse(row.payload) as Record<string, unknown> | null;
      if (!payload || typeof payload !== "object" || payload.store_id != null) continue;
      await execute("UPDATE _sync_queue SET payload = ? WHERE id = ?", [JSON.stringify({ ...payload, store_id }), row.id]);
    }
  }

  return attributable.length;
}
