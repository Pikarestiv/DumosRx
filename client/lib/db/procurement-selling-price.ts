import { update } from "./base-helpers";

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
  previous: Map<string, number | null> = new Map(),
) {
  for (const line of lines) {
    const sellingPrice = coerceOptionalNumber(line.selling_price);
    if (sellingPrice == null || previous.get(line.product_id) === sellingPrice) continue;
    await update("products", line.product_id, {
      selling_price: Math.max(0, sellingPrice),
    });
  }
}
