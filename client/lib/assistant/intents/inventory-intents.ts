import type { IntentDefinition } from "../types";

const STOP_WORDS =
  "stock|stocks|inventory|item|items|product|products|thing|things|anything|something|everything|nothing|drugs|medicines|goods|sales|sale|left|any|some|it|them|this|that|low|out|no|current|total|all|our|the|my|your|check|short|dead|excess|expired|expiring|enough|more|much|many|how|hw|do|does|did|i|we|you|is|are|was|were|there|what|whats|which|where|a|an|to|of|for|on|in|at|need|needs|want|good|ok|okay|fine|reorder|restock|add|change|correct|fix|update|count|quantity|qty|sell|buy|order|today|yesterday|please|pls|kindly|can|could|u|me|tell|show|give|so|far|still|even|got|have|has|had|new|old|level|levels";
const WORD = `(?!(?:${STOP_WORDS})\\b)[a-z0-9][a-z0-9/-]*`;
const PRODUCT = `(?<product>${WORD}(?: ${WORD})*?)`;
const TAIL = "( in stock| left| available| remaining| in store| on the shelf| in the store| in the shop)?";

export const INVENTORY_INTENTS: IntentDefinition[] = [
  {
    id: "product_stock",
    tool: "product_stock",
    label: "Product stock lookup",
    phrases: [
      new RegExp(
        `\\bh(ow|w) (many|much) ${PRODUCT} (do we have|have we got|are there|is there|in stock|left|remaining|are left|is left|is remaining|are remaining|available)\\b`,
      ),
      new RegExp(
        `\\bh(ow|w) many (units|packs|pcs|pieces|boxes|bottles|tablets|cartons|sachets|strips|tins|cards) of ${PRODUCT}( do we have| are there| left| remaining)?$`,
      ),
      new RegExp(
        `\\bis (there )?(any |some )?${PRODUCT} (in stock|available|left|remaining|still available|there)\\b`,
      ),
      new RegExp(`\\bis there (any |some )?${PRODUCT}$`),
      new RegExp(
        `^(?!.*\\b(set|change|update|edit|configure)\\b).*\\b(stock|stocks|qty|quantity|count|units|level|levels|balance) (of|for|on) ${PRODUCT}$`,
      ),
      new RegExp(
        `\\b(check|see|know|find out|confirm|tell me) (if|whether) we (still )?(have|stock|got|sell|carry) (any )?${PRODUCT}${TAIL}$`,
      ),
      new RegExp(`\\b(do|did) we (still |even )?(have|stock|got|sell|carry) (any |some )?${PRODUCT}${TAIL}$`),
      new RegExp(`\\bhave we got (any |some )?${PRODUCT}${TAIL}$`),
      new RegExp(`\\bgot any ${PRODUCT}${TAIL}$`),
      new RegExp(`^(do )?we (have|got|stock) (any )?${PRODUCT}${TAIL}$`),
      new RegExp(`^${PRODUCT} (stock|in stock|availability|qty|quantity|balance|stock level)$`),
    ],
    keywords: ["stock", "have", "inventory"],
    buildArgs: (captures) => ({ product: captures.product ?? "" }),
  },
  {
    id: "inventory_status",
    tool: "inventory_status",
    label: "Inventory status",
    phrases: [
      /\blow (on )?stock\b/,
      /\bwhats? (is )?low\b/,
      /\brunning (out|low|short)\b/,
      /\bout of stock\b/,
      new RegExp(
        "^(?!.*\\b(subscription|licen[cs]e|plan|trial|password|session|token|card)\\b).*\\bexpir(e|es|ed|ing|y|ies)\\b",
      ),
      /\bshort[- ]dated\b/,
      /\b(inventory|stock) (looking|doing|situation|check|report|overview|summary|health|position|levels?|status|value|worth|valuation|alerts?|warnings?)\b/,
      /\b(good|ok|okay|fine|alright|covered) (on|for|with) (stock|inventory)\b/,
      /\bneeds? (a )?(restock|restocking|reorder|reordering|topping up|top up)\b/,
      /\b(what|which|anything|something) .*\b(should|do|to) (i|we) (need to )?(reorder|restock|order|buy|top up)\b/,
      /\bhow much (stock|inventory) (do we have|is there|have we got|do we hold)\b/,
      /\bworth of (stock|inventory)\b/,
      /\b(below|under|at|hit) (the |their )?reorder (level|point|threshold)\b/,
      /\breorder (list|alerts?)\b/,
      /\b(finishing|finished|almost finished|about to finish|nearly finished|almost gone|nearly gone|almost out|nearly out)\b/,
      /\banything (low|running|expiring|expired|out|finishing)\b/,
    ],
    keywords: ["inventory", "expiring", "expired", "low", "reorder"],
    buildArgs: () => ({}),
  },
];
