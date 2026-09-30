import type { IntentDefinition } from "../types";

export const INVENTORY_INTENTS: IntentDefinition[] = [
  {
    id: "product_stock",
    tool: "product_stock",
    label: "Product stock lookup",
    phrases: [
      new RegExp("\\bhow many (?<product>.+) do we have\\b"),
      new RegExp("\\bis (?<product>.+) in stock\\b"),
      new RegExp("\\bstock of (?<product>.+)\\b"),
    ],
    keywords: ["stock", "have", "inventory"],
    buildArgs: (captures) => ({ product: captures.product ?? "" }),
  },
  {
    id: "inventory_status",
    tool: "inventory_status",
    label: "Inventory status",
    phrases: [/\blow on stock\b/, /\bexpiring soon\b/, /\binventory status\b/],
    keywords: ["inventory", "expiring", "expired"],
    buildArgs: () => ({}),
  },
];
