import type { IntentDefinition } from "../types";
import { parseDatePhrase, toDateOnly } from "../date-phrases";

export const SALES_INTENTS: IntentDefinition[] = [
  {
    id: "my_sales_today",
    tool: "my_sales_today",
    label: "My sales today",
    phrases: [/\bmy sales today\b/, /\bhow much have i sold\b/],
    keywords: ["my", "sold"],
    buildArgs: () => ({}),
  },
  {
    id: "sales_summary",
    tool: "sales_summary",
    label: "Store sales for a date",
    phrases: [/\btotal sales\b/, /\bhow many sales\b/, /\bsales on\b/],
    keywords: ["sales", "transactions"],
    buildArgs: (_captures, utterance, ctx) => {
      const parsed = parseDatePhrase(utterance, ctx.now);
      return { date: parsed?.from ?? toDateOnly(ctx.now) };
    },
  },
];
