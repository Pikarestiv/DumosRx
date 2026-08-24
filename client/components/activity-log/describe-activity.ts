import { formatActionLabel } from "./format-action-label";

/** Human-readable noun for each syncable table. Turns "table_name"
 * into something a non-technical reader recognizes instead of a raw SQL
 * table identifier. */
const TABLE_NOUNS: Record<string, string> = {
  products: "product",
  stock_batches: "stock batch",
  categories: "category",
  customers: "customer",
  sales: "sale",
  sale_items: "sale item",
  sale_item_batches: "sale item batch",
  prescriptions: "prescription",
  prescription_items: "prescription item",
  returns: "return",
  return_items: "return item",
  customer_payments: "customer payment",
  stores: "store",
  expenses: "expense",
  users: "staff account",
  purchase_orders: "purchase order",
  purchase_order_items: "purchase order item",
  suppliers: "supplier",
  stock_audits: "stock audit",
  held_transactions: "held sale",
  loyalty_transactions: "loyalty transaction",
  loyalty_tiers: "loyalty tier",
  loyalty_redemption_options: "loyalty reward",
  feedback: "feedback",
  stock_movements: "stock movement",
  payment_accounts: "payment account",
  system_configs: "system setting",
  requested_products: "product request",
  supplier_payments: "supplier payment",
};

// Nouns that read naturally without "a"/"an" in front of them.
const NO_ARTICLE_NOUNS = new Set(["feedback"]);

function tableNoun(tableName?: string | null): string | null {
  if (!tableName) return null;
  return TABLE_NOUNS[tableName] || tableName.replace(/_/g, " ");
}

// Named actions (see lib/db/audit-actions.ts) that are self-explanatory on
// their own and shouldn't have "a {table noun}" appended.
const STANDALONE_ACTIONS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  LOGIN_FAILED: "Failed sign-in attempt",
  PIN_CHANGED: "Changed PIN",
  RECEIVE_PO: "Received goods for a purchase order",
  SALE_RETURN: "Processed a return",
  STOCK_EXPIRED: "Marked stock as expired",
  STOCK_DAMAGED: "Marked stock as damaged",
};

// Short, friendly verb for the generic CRUD ops (see base-helpers.ts) and
// the remaining named actions. Used both standalone (filter labels) and as
// the first word of the full per-row sentence.
const ACTION_VERBS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Removed",
  HARD_DELETE: "Permanently deleted",
  STOCK_ADJUSTMENT: "Adjusted",
};

/** Short verb label for an action, used for the Action filter pill. */
export function describeActionVerb(action: string): string {
  const key = (action || "").toUpperCase();
  return STANDALONE_ACTIONS[key] || ACTION_VERBS[key] || formatActionLabel(action);
}

/** Full human sentence for an activity_log row, e.g. "Added a category",
 * "Removed a purchase order", "Signed in". This is what a non-technical
 * reader sees instead of raw "INSERT" / "purchase_orders". */
export function describeActivity(row: {
  action: string;
  table_name?: string | null;
}): string {
  const key = (row.action || "").toUpperCase();
  if (STANDALONE_ACTIONS[key]) return STANDALONE_ACTIONS[key];

  const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
  const noun = tableNoun(row.table_name);
  if (!noun) return verb;

  return NO_ARTICLE_NOUNS.has(noun) ? `${verb} ${noun}` : `${verb} a ${noun}`;
}
