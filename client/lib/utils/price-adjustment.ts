const EPSILON = 0.005;

export interface PricedLine {
  quantity: number;
  returned_quantity?: number | null;
  unit_price: number;
  list_price?: number | null;
}

/** Money charged above / below list price across a sale's lines; lines with no recorded list price are ignored. */
export function sumPriceAdjustments(lines: PricedLine[]) {
  let markup = 0;
  let cut = 0;
  for (const line of lines) {
    if (line.list_price == null) continue;
    const delta = line.unit_price - line.list_price;
    const effectiveQty = Math.max(0, line.quantity - (line.returned_quantity || 0));
    if (effectiveQty <= 0) continue;
    if (delta > EPSILON) markup += delta * effectiveQty;
    else if (delta < -EPSILON) cut += -delta * effectiveQty;
  }
  return {
    markup: Math.round(markup * 100) / 100,
    cut: Math.round(cut * 100) / 100,
  };
}
