import type { IntentDefinition } from "../types";

export const INVENTORY_INTENTS: IntentDefinition[] = [
  {
    id: "product_stock",
    tool: "product_stock",
    label: "Product stock lookup",
    phrases: [
      new RegExp("\\bhow many (?<product>.+) do we have\\b"),
      new RegExp("\\bhow much (?<product>.+) (is|are) left\\b"),
      new RegExp("\\bhow much (?<product>.+) do we have\\b"),
      new RegExp("\\bis (?<product>.+) in stock\\b"),
      new RegExp("\\bstock of (?<product>.+)\\b"),
      new RegExp("\\bdo we (have|stock) (any )?(?<product>.+)"),
    ],
    keywords: ["stock", "have", "inventory"],
    buildArgs: (captures) => ({ product: captures.product ?? "" }),
  },
  {
    id: "inventory_status",
    tool: "inventory_status",
    label: "Inventory status",
    phrases: [
      /\blow on stock\b/,
      /\blow stock\b/,
      /\brunning (out|low)\b/,
      /\bout of stock\b/,
      /\bexpiring\b/,
      /\bexpired\b/,
      /\bexpire\b/,
      /\binventory status\b/,
      /\bstock (levels|status)\b/,
    ],
    keywords: ["inventory", "expiring", "expired", "low", "reorder"],
    buildArgs: () => ({}),
  },
];
