import { query } from "./core";
import { update } from "./base-helpers";

// Blank/undefined means "not overridden", not zero; also accepts null from a DB reload.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-ts-L11
export function coerceOptionalNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function applyChangedSellingPrices(
  lines: { product_id: string; selling_price?: number | string }[],
) {
  for (const line of lines) {
    const sellingPrice = coerceOptionalNumber(line.selling_price);
    if (sellingPrice == null) continue;
    const [product] = await query<{ selling_price: number | null }>(
      "SELECT selling_price FROM products WHERE id = ?",
      [line.product_id],
    );
    if (product && Number(product.selling_price) === sellingPrice) continue;
    await update("products", line.product_id, {
      selling_price: Math.max(0, sellingPrice),
    });
  }
}
