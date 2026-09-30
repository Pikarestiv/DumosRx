import type { IntentDefinition } from "../types";
import { parseDatePhrase, toDateOnly } from "../date-phrases";

export const FINANCE_INTENTS: IntentDefinition[] = [
  {
    id: "profit_summary",
    tool: "profit_summary",
    label: "Profit summary",
    phrases: [
      /\bprofit(s|t|ability|able)?\b/,
      /\bmargin\b/,
      /\brevenue\b/,
      /\bp and l\b/,
      /\bpnl\b/,
      /\bnet income\b/,
      /\bearnings\b/,
      /\bbottom line\b/,
      /\bafter expenses\b/,
      /\bcogs\b/,
      /\bcost of (goods|sales)\b/,
      /\b(total|our|the|on|all) expenses\b/,
      /\bexpenses (this|last|for|today|yesterday|on)\b/,
      /\b(spend|spent) on\b/,
    ],
    keywords: ["profit", "margin", "revenue", "expenses", "cogs", "earnings", "income"],
    buildArgs: (_captures, utterance, ctx) => {
      const parsed = parseDatePhrase(utterance, ctx.now);
      const today = toDateOnly(ctx.now);
      return { from: parsed?.from ?? today, to: parsed?.to ?? today };
    },
  },
];
