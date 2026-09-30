import type { IntentDefinition } from "../types";
import { parseDatePhrase, toDateOnly } from "../date-phrases";

export const SALES_INTENTS: IntentDefinition[] = [
  {
    id: "my_sales_today",
    tool: "my_sales_today",
    label: "My sales today",
    phrases: [
      /\bmy sales\b/,
      /\bhow am i doing\b/,
      /\b(have|did) i (make|made|do|done|sell|sold|serve|served|take|taken)\b/,
      /\b(sales|customers|people|transactions|money) (have|did) i\b/,
      /\bmy (total|totals|takings|figure|figures|numbers?|count|transactions|performance)\b/,
      /\bwhat (did|have) i (sell|sold)\b/,
    ],
    keywords: ["my", "sold", "i", "me"],
    buildArgs: () => ({}),
  },
  {
    id: "sales_summary",
    tool: "sales_summary",
    label: "Store sales for a date",
    phrases: [
      /\btotal sales\b/,
      /\bhow many sales\b/,
      /\bhow much (in )?sales\b/,
      new RegExp(
        "(?<!\\bmy )\\bsales (on|for|today|yesterday|this|last|figure|figures|numbers?|total|count|so far|were|was|like)\\b",
      ),
      new RegExp("\\bsales report (for |on |of )?(today|yesterday|this|last|\\d)"),
      /\bstore sales\b/,
      /\b(todays|yesterdays|daily|cash|card|transfer) sales\b/,
      /\bhow many transactions\b/,
      /\btransactions (today|yesterday|this|last|on|for|so far)\b/,
      /\bnumber of (sales|transactions|receipts|orders)\b/,
      /\bhow much (money )?did (we|the (store|shop)|you) (make|take|earn|do|bring in|get)\b/,
      /\bhow much did we sell\b/,
      /\bwhat did we sell\b/,
      /\bhow (are|r) we doing\b/,
      /\bhows? (the )?business\b/,
      /\bhow (is|was) (the )?(business|trade|trading)\b/,
      /\bhow (did|do) we do\b/,
      /\bwhat were (the |our )?sales\b/,
      /\bhow many (customers|people|receipts|orders|invoices|tickets)\b.*\b(today|yesterday|serve|served|did we|have we)\b/,
      /\bmoney (came|come|coming) in\b/,
      /\btakings\b/,
      /\bsales we (had|made|did)\b/,
    ],
    keywords: ["sales", "transactions"],
    buildArgs: (_captures, utterance, ctx) => {
      const parsed = parseDatePhrase(utterance, ctx.now);
      const date = parsed?.from ?? toDateOnly(ctx.now);
      return parsed && parsed.to !== parsed.from ? { date, requestedTo: parsed.to } : { date };
    },
  },
];
