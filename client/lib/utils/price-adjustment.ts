const EPSILON = 0.005;

interface PricedLine {
  quantity: number;
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
    if (delta > EPSILON) markup += delta * line.quantity;
    else if (delta < -EPSILON) cut += -delta * line.quantity;
  }
  return { markup, cut };
}
