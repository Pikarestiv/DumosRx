function adjustmentSum(direction: "markup" | "cut") {
  const delta =
    direction === "markup"
      ? "si.unit_price - si.list_price"
      : "si.list_price - si.unit_price";
  return `COALESCE((SELECT SUM((${delta}) * si.quantity) FROM sale_items si WHERE si.sale_id = s.id AND si.list_price IS NOT NULL AND (${delta}) > 0.005 AND (si._deleted = 0 OR si._deleted IS NULL)), 0)`;
}

/** Select-list columns for a query aliasing `sales` as `s`. */
export const PRICE_ADJUSTMENT_COLUMNS_SQL = `${adjustmentSum("markup")} as price_markup_total, ${adjustmentSum("cut")} as price_cut_total`;
