import { query, transaction, getActiveStoreId, insert, update, createSupplier } from "@/lib/db/local-database";
import { getCategoryByName, getSupplierByName } from "@/lib/db/queries/products";
import { submitStockAudit } from "@/lib/db/queries/inventory";
import type { ProductImportRow } from "@/lib/utils/product-import-export";

/**
 * Groups row indexes that would collide on import (same dedupe key as
 * importProductRows: name+category, or name alone when no category was
 * mapped). Two rows in the same group would both match the same existing/new
 * product, silently merging what may be two distinct products — the caller
 * surfaces this as a pre-flight warning instead of writing it silently.
 */
export function findInFileDuplicates(rows: ProductImportRow[]): number[][] {
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = `${row.name.trim().toLowerCase()}::${(row.category || "").trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) {
      group.push(index);
    } else {
      groups.set(key, [index]);
    }
  });
  return [...groups.values()].filter((group) => group.length > 1);
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
  const matchedStockUpdates: { productId: string; quantity: number }[] = [];

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
          });
          if (options?.updateStockForMatched && row.quantity !== undefined) {
            matchedStockUpdates.push({ productId: existingId, quantity: row.quantity });
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
        });

        if (row.quantity !== undefined && row.quantity !== 0) {
          const supplierId = await resolveSupplierId(row.supplier);
          await insert("stock_batches", {
            product_id: productId,
            batch_number: "Opening Stock",
            expiry_date: null,
            quantity: row.quantity,
            cost_price: row.costPrice ?? null,
            supplier_id: supplierId ?? null,
            is_active: 1,
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

  if (matchedStockUpdates.length > 0) {
    const ids = matchedStockUpdates.map((u) => u.productId);
    const systemQuantities = await query<{ id: string; qty: number | null }>(
      `SELECT p.id, (SELECT SUM(sb.quantity) FROM stock_batches sb WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1) as qty
       FROM products p WHERE p.id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    const systemQtyById = new Map(systemQuantities.map((r) => [r.id, r.qty ?? 0]));
    result.stockAdjusted = matchedStockUpdates.filter(
      (u) => (systemQtyById.get(u.productId) ?? 0) !== u.quantity,
    ).length;

    await submitStockAudit(
      matchedStockUpdates.map((u) => ({
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
