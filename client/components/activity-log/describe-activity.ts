import { formatActionLabel } from "./format-action-label";

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
  services: "service",
  sale_services: "sale service line",
  return_services: "return service line",
};

const NO_ARTICLE_NOUNS = new Set(["feedback"]);

function tableNoun(tableName?: string | null): string | null {
  if (!tableName) return null;
  return TABLE_NOUNS[tableName] || tableName.replace(/_/g, " ");
}

const STANDALONE_ACTIONS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  LOGIN_FAILED: "Failed sign-in attempt",
  PIN_CHANGED: "Changed PIN",
  RECEIVE_PO: "Received goods for purchase order",
  PO_DRAFT_EDITED: "Edited purchase order",
  PO_CLOSED_SHORT: "Closed purchase order short",
  PO_RECOVERED_COPY: "Kept recovered copy of purchase order",
  RECEIVE_PO_REVERSED: "Voided purchase order receipt",
  SALE_RETURN: "Processed return",
  STOCK_EXPIRED: "Marked stock as expired",
  STOCK_DAMAGED: "Marked stock as damaged",
  BATCH_COST_CORRECTED: "Corrected batch cost price",
  TILL_RELINK_CODE_ISSUED: "Issued till re-link code",
};

const ACTION_VERBS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Removed",
  HARD_DELETE: "Permanently deleted",
  STOCK_ADJUSTMENT: "Adjusted",
};

export function describeActionVerb(action: string): string {
  const key = (action || "").toUpperCase();
  return STANDALONE_ACTIONS[key] || ACTION_VERBS[key] || formatActionLabel(action);
}

function parseDetails(details?: string | null): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details !== "string") return details as Record<string, unknown>;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

export function describeActivity(row: {
  action: string;
  table_name?: string | null;
  details?: string | null;
  record_id?: string | null;
}): string {
  const key = (row.action || "").toUpperCase();
  const parsed = parseDetails(row.details);

  if (row.table_name === "sales") {
    const txn = parsed?.transaction_number || (row.record_id ? `#${row.record_id.slice(0, 8)}` : "");
    const amount = parsed?.total_amount != null ? ` · ₦${Number(parsed.total_amount).toLocaleString("en-NG")}` : "";
    return `Sale ${txn}${amount}`.trim();
  }

  if (row.table_name === "products" && parsed?.name) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} product "${parsed.name}"`;
  }

  if (row.table_name === "purchase_orders") {
    const poNum = parsed?.order_number || (row.record_id ? `#${row.record_id.slice(0, 8)}` : "");
    if (key === "RECEIVE_PO") return `Received PO ${poNum}`.trim();
    if (key === "PO_DRAFT_EDITED") return `Edited PO ${poNum}`.trim();
    if (key === "PO_CLOSED_SHORT") return `Closed PO ${poNum} short`.trim();
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} purchase order ${poNum}`.trim();
  }

  if (row.table_name === "expenses" && (parsed?.category || parsed?.title)) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    const label = parsed.title || parsed.category;
    return `${verb} expense "${label}"`;
  }

  if (row.table_name === "customers" && parsed?.name) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} customer "${parsed.name}"`;
  }

  if (row.table_name === "stock_batches" && parsed?.batch_number) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} batch #${parsed.batch_number}`;
  }

  if (STANDALONE_ACTIONS[key]) return STANDALONE_ACTIONS[key];

  const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
  const noun = tableNoun(row.table_name);
  if (!noun) return verb;

  return NO_ARTICLE_NOUNS.has(noun) ? `${verb} ${noun}` : `${verb} a ${noun}`;
}
