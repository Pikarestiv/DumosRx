import { query, transaction, getActiveStoreId, insert, update, createSupplier } from "@/lib/db/local-database";
import { getCategoryByName, getSupplierByName } from "@/lib/db/queries/products";
import { submitStockAudit, getAllActiveBatchesForProduct } from "@/lib/db/queries/inventory";
import type { ProductImportRow } from "@/lib/utils/product-import-export";

/**
 * Groups row indexes that would collide on import. findExistingProductId()
 * only trusts a barcode when it actually hits an existing DB row — when it
 * doesn't, that row falls through to a name+category lookup instead. So a
 * barcode-only (or name+category-only) key can't predict every real
 * collision: two rows sharing a barcode that doesn't exist in the DB yet
 * would only be caught by name+category, and two rows sharing a barcode
 * that DOES exist would only be caught by the barcode key. Both keys are
 * computed and unioned (not a single fallback key) so a row is flagged as a
 * duplicate if it collides under EITHER one. The barcode key is compared
 * exact/case-sensitive (only trimmed) to match findExistingProductId()'s
 * `barcode = ?` lookup, which has no COLLATE NOCASE.
 */
export function findInFileDuplicates(rows: ProductImportRow[]): number[][] {
  const byBarcode = new Map<string, number[]>();
  const byNameCategory = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const barcode = row.barcode?.trim();
    if (barcode) {
      const key = `barcode::${barcode}`;
      const group = byBarcode.get(key);
      if (group) group.push(index);
      else byBarcode.set(key, [index]);
    }

    const nameKey = `name::${row.name.trim().toLowerCase()}::${(row.category || "").trim().toLowerCase()}`;
    const nameGroup = byNameCategory.get(nameKey);
    if (nameGroup) nameGroup.push(index);
    else byNameCategory.set(nameKey, [index]);
  });

  // Union-find: a row can belong to both a barcode group and a
  // name+category group, and those two groups need merging whenever they
  // share a row, so the reported clusters reflect every transitive
  // collision rather than just one key at a time.
  const parent = rows.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (const group of byBarcode.values()) {
    for (let i = 1; i < group.length; i++) union(group[0], group[i]);
  }
  for (const group of byNameCategory.values()) {
    for (let i = 1; i < group.length; i++) union(group[0], group[i]);
  }

  const clusters = new Map<number, number[]>();
  rows.forEach((_, index) => {
    const root = find(index);
    const cluster = clusters.get(root);
    if (cluster) cluster.push(index);
    else clusters.set(root, [index]);
  });

  return [...clusters.values()].filter((group) => group.length > 1);
}

async function resolveCategoryId(name: string | undefined): Promise<string | undefined> {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const existing = await getCategoryByName(trimmed);
  if (existing) return existing;
  return await insert("categories", { name: trimmed });
}

async function resolveSupplierId(name: string | undefined): Promise<string | undefined> {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const existing = await getSupplierByName(trimmed);
  if (existing) return existing;
  return await createSupplier({ name: trimmed });
}

async function findExistingProductId(
  row: ProductImportRow,
): Promise<string | null> {
  const storeId = getActiveStoreId();
  if (row.barcode) {
    const byBarcode = await query<{ id: string }>(
      `SELECT id FROM products WHERE barcode = ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
      storeId ? [row.barcode, storeId] : [row.barcode],
    );
    if (byBarcode.length > 0) return byBarcode[0].id;
  }

  if (row.category) {
    const byNameAndCategory = await query<{ id: string }>(
      `SELECT p.id FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.name = ? COLLATE NOCASE AND c.name = ? COLLATE NOCASE AND p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
       LIMIT 1`,
      storeId ? [row.name, row.category, storeId] : [row.name, row.category],
    );
    return byNameAndCategory[0]?.id ?? null;
  }

  const byNameOnly = await query<{ id: string }>(
    `SELECT id FROM products WHERE name = ? COLLATE NOCASE AND _deleted = 0${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
    storeId ? [row.name, storeId] : [row.name],
  );
  return byNameOnly[0]?.id ?? null;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
  /** Matched products whose stock was also adjusted (only nonzero when
   * options.updateStockForMatched was set). */
  stockAdjusted: number;
}

/**
 * Upserts every row inside a single transaction. Matched products only have
 * their fields updated — existing stock_batches are never touched by
 * default, so re-running the same import twice can't double-count quantity
 * (see docs/superpowers/specs/2026-08-31-stock-import-export-design.md).
 * Passing `updateStockForMatched: true` opts into applying the file's
 * quantity to matched products too, as a proper stock-audit adjustment
 * (logged in Stock Movements) rather than silently rewriting stock_batches —
 * for the deliberate "re-sync my counts from this file" case, distinct from
 * the accidental-re-import case the default protects against.
 */
// How often (in rows) to yield to the event loop during a bulk import. Each
// query on the web (sql.js/WASM) path resolves synchronously, so without an
// explicit yield a 1000+ row import runs as one uninterruptible block and
// freezes the tab for its entire duration — this hands control back to the
// browser periodically so it can repaint (e.g. a progress bar) and stay
// responsive, without adding per-row overhead from yielding every iteration.
const YIELD_INTERVAL = 25;

export async function importProductRows(
  rows: ProductImportRow[],
  onProgress?: (completed: number, total: number) => void,
  options?: { updateStockForMatched?: boolean; performedBy?: string | null },
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: [], stockAdjusted: 0 };
  // Collected during the main transaction, applied after it commits: submitStockAudit()
  // opens its own transaction, and this codebase's transaction() serializes
  // via a queue that a nested call would deadlock against (the inner call
  // waits on the outer's own queue slot, which only clears once the outer
  // transaction's fn() — still awaiting the inner call — finishes).
  // Keyed by productId so an in-file duplicate (same product matched by
  // multiple rows) only ever contributes one audit entry — last row wins,
  // consistent with how duplicate rows are already merged elsewhere in this
  // import. Without this, submitStockAudit() below computes every entry's
  // delta against the SAME pre-import systemQty snapshot (it's captured
  // once, before any adjustment is applied), so two rows for one product
  // each apply their full delta on top of that same stale baseline instead
  // of the second seeing the first's result — double-applying the
  // difference and silently driving real stock negative.
  const matchedStockUpdates = new Map<string, { productId: string; quantity: number }>();

  await transaction(async () => {
    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        if (!row.name) {
          result.skipped.push({ row: i, reason: "Missing product name" });
          continue;
        }

        const categoryId = await resolveCategoryId(row.category);
        const existingId = await findExistingProductId(row);

        if (existingId) {
          await update("products", existingId, {
            name: row.name,
            ...(categoryId ? { category_id: categoryId } : {}),
            ...(row.sellingPrice !== undefined ? { selling_price: row.sellingPrice } : {}),
            ...(row.reorderLevel !== undefined ? { reorder_level: row.reorderLevel } : {}),
            ...(row.barcode ? { barcode: row.barcode } : {}),
            ...(row.showOnline !== undefined ? { show_online: row.showOnline ? 1 : 0 } : {}),
          });
          if (options?.updateStockForMatched && row.quantity !== undefined) {
            matchedStockUpdates.set(existingId, { productId: existingId, quantity: row.quantity });
          }
          // cost_price lives on stock_batches, not products - there's no
          // column here to include in the update() above. Re-importing a
          // corrected price list used to leave margin/COGS reporting on
          // the stale cost while reporting the row as "updated." Only
          // correct it when unambiguous (exactly one active batch) - with
          // more than one, which specific batch(es) a blanket file-level
          // cost is meant to correct isn't something this import can infer,
          // and guessing would misattribute cost the same way the
          // now-fixed returned-COGS averaging bug did.
          if (row.costPrice !== undefined) {
            const activeBatches = await getAllActiveBatchesForProduct(existingId);
            if (activeBatches.length === 1) {
              await update("stock_batches", activeBatches[0].id, { cost_price: row.costPrice });
            }
          }
          result.updated++;
          continue;
        }

        const productId = await insert("products", {
          name: row.name,
          category_id: categoryId ?? null,
          selling_price: row.sellingPrice ?? 0,
          reorder_level: row.reorderLevel ?? 10,
          barcode: row.barcode ?? null,
          // Defaults off, matching the schema: a bulk import must not publish
          // a whole catalog to a public storefront unless the file says to.
          show_online: row.showOnline ? 1 : 0,
        });

        if (row.quantity !== undefined && row.quantity !== 0) {
          const supplierId = await resolveSupplierId(row.supplier);
          const batchId = await insert("stock_batches", {
            product_id: productId,
            batch_number: "Opening Stock",
            expiry_date: null,
            quantity: row.quantity,
            cost_price: row.costPrice ?? null,
            supplier_id: supplierId ?? null,
            is_active: 1,
          });
          // The server never trusts stock_batches.quantity from a client
          // payload (INSERT or UPDATE) — it's forced to 0 and re-derived by
          // replaying stock_movements deltas on top, so quantity commutes
          // correctly across concurrent devices/terminals instead of one
          // write silently clobbering another (see SyncController::push's
          // stock_batches handling). Writing the batch row alone is enough
          // to show the right count locally, but without a matching
          // movement the server-side quantity stays permanently 0 for
          // every bulk-imported product once synced. Every other code path
          // that creates an initial batch (procurement receiving, setup's
          // seed data) logs this movement; import must too.
          await insert("stock_movements", {
            product_id: productId,
            stock_batch_id: batchId,
            movement_type: "purchase",
            quantity: row.quantity,
            unit_cost: row.costPrice ?? null,
            total_cost: row.costPrice ? row.costPrice * row.quantity : null,
            reference_type: "import",
            reason: "Bulk import - opening stock",
            performed_by: options?.performedBy ?? null,
            movement_date: new Date().toISOString(),
          });
        }

        result.created++;
      } finally {
        onProgress?.(i + 1, rows.length);
        if ((i + 1) % YIELD_INTERVAL === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
  });

  if (matchedStockUpdates.size > 0) {
    const updates = [...matchedStockUpdates.values()];
    const ids = updates.map((u) => u.productId);
    const systemQuantities = await query<{ id: string; qty: number | null }>(
      `SELECT p.id, (SELECT SUM(sb.quantity) FROM stock_batches sb WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1) as qty
       FROM products p WHERE p.id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    const systemQtyById = new Map(systemQuantities.map((r) => [r.id, r.qty ?? 0]));
    result.stockAdjusted = updates.filter(
      (u) => (systemQtyById.get(u.productId) ?? 0) !== u.quantity,
    ).length;

    await submitStockAudit(
      updates.map((u) => ({
        productId: u.productId,
        systemQty: systemQtyById.get(u.productId) ?? 0,
        countedQty: u.quantity,
        reason: "Bulk import stock update",
      })),
      options?.performedBy ?? null,
    );
  }

  return result;
}
