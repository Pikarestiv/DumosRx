import type { IntentDefinition } from "../types";
import { parseDatePhrase, toDateOnly } from "../date-phrases";

export const FINANCE_INTENTS: IntentDefinition[] = [
  {
    id: "profit_summary",
    tool: "profit_summary",
    label: "Profit summary",
    phrases: [
      /\bprofit\b/,
      /\bgross profit\b/,
      /\bnet profit\b/,
      /\bprofit and loss\b/,
      /\bprofit margin\b/,
      /\bmargin\b/,
      /\brevenue\b.*\b(today|yesterday|month)\b/,
    ],
    keywords: ["profit", "margin", "revenue", "expenses"],
    buildArgs: (_captures, utterance, ctx) => {
      const parsed = parseDatePhrase(utterance, ctx.now);
      const today = toDateOnly(ctx.now);
      return { from: parsed?.from ?? today, to: parsed?.to ?? today };
    },
  },
];
