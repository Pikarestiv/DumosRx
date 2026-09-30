import type { IntentDefinition } from "../types";
import { parseDatePhrase, toDateOnly } from "../date-phrases";

export const SALES_INTENTS: IntentDefinition[] = [
  {
    id: "my_sales_today",
    tool: "my_sales_today",
    label: "My sales today",
    phrases: [
      /\bmy sales\b/,
      /\bhow much have i sold\b/,
      /\bhow much did i sell\b/,
      /\bwhat did i sell\b/,
      /\bwhat have i sold\b/,
    ],
    keywords: ["my", "sold"],
    buildArgs: () => ({}),
  },
  {
    id: "sales_summary",
    tool: "sales_summary",
    label: "Store sales for a date",
    phrases: [
      /\btotal sales\b/,
      /\bhow many sales\b/,
      /\bsales (on|for)\b/,
      /\bhow much did we sell\b/,
      /\bstore sales\b/,
      /\b(todays|yesterdays) sales\b/,
      /\bhow many transactions\b/,
      /\bhow much (money )?did we (make|take)\b/,
    ],
    keywords: ["sales", "transactions"],
    buildArgs: (_captures, utterance, ctx) => {
      const parsed = parseDatePhrase(utterance, ctx.now);
      const date = parsed?.from ?? toDateOnly(ctx.now);
      return parsed && parsed.to !== parsed.from ? { date, requestedTo: parsed.to } : { date };
    },
  },
];
