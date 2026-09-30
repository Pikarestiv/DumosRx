import type { IntentDefinition } from "../types";

export const SALES_INTENTS: IntentDefinition[] = [
  {
    id: "my_sales_today",
    tool: "my_sales_today",
    label: "My sales today",
    phrases: [/\bmy sales today\b/, /\bhow much have i sold\b/],
    keywords: ["my", "sold"],
    buildArgs: () => ({}),
  },
];
