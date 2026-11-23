import { formatActionLabel } from "./format-action-label";
import { capitalizeWords } from "@/lib/hooks/use-uppercase-display";

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

export function formatTableLabel(tableName?: string | null): string {
  const noun = tableNoun(tableName);
  if (!noun) return "General";
  return noun.replace(/\b\w/g, (ch) => ch.toUpperCase());
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
  BATCH_DETAILS_CORRECTED: "Corrected batch details",
  TILL_RELINK_CODE_ISSUED: "Issued till re-link code",
};

const ACTION_VERBS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Removed",
  HARD_DELETE: "Permanently deleted",
  STOCK_ADJUSTMENT: "Adjusted",
  BATCH_COST_CORRECTED: "Corrected",
  BATCH_DETAILS_CORRECTED: "Corrected",
};

export function describeActionVerb(action: string): string {
  const key = (action || "").toUpperCase();
  return STANDALONE_ACTIONS[key] || ACTION_VERBS[key] || formatActionLabel(action);
}

function parseDetails(details?: string | null): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details !== "string") return details as Record<string, unknown>;
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatSignedQuantity(qty: unknown): string {
  const n = Number(qty);
  if (!Number.isFinite(n)) return "";
  return n > 0 ? `+${n}` : `${n}`;
}

export function describeActivity(row: {
  action: string;
  table_name?: string | null;
  details?: string | null;
  record_id?: string | null;
  product_name?: string | null;
}): string {
  const key = (row.action || "").toUpperCase();
  const parsed = parseDetails(row.details);

  if (row.table_name === "sales") {
    const txn = parsed?.transaction_number || (row.record_id ? `#${row.record_id.slice(0, 8)}` : "");
    const amount = parsed?.total_amount != null ? ` · ₦${Number(parsed.total_amount).toLocaleString("en-NG")}` : "";
    return `Sale ${txn}${amount}`.trim();
  }

  const rawProductName =
    (typeof parsed?.product_name === "string" && parsed.product_name) ||
    (typeof parsed?.name === "string" && row.table_name === "products" ? parsed.name : null) ||
    row.product_name ||
    null;
  const resolvedProductName = rawProductName ? capitalizeWords(rawProductName) : null;

  if (row.table_name === "products" && resolvedProductName) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} product "${resolvedProductName}"`;
  }

  if (row.table_name === "stock_movements") {
    const qtyLabel = parsed?.quantity != null ? ` (${formatSignedQuantity(parsed.quantity)})` : "";
    const movementType = typeof parsed?.movement_type === "string"
      ? parsed.movement_type.replace(/_/g, " ")
      : null;
    const reason = typeof parsed?.reason === "string" ? parsed.reason : null;
    if (key === "STOCK_EXPIRED" || key === "STOCK_DAMAGED") {
      const base = STANDALONE_ACTIONS[key];
      return resolvedProductName ? `${base}${qtyLabel}: ${resolvedProductName}` : `${base}${qtyLabel}`;
    }
    const prefix = movementType ? `Stock ${movementType}${qtyLabel}` : `Stock movement${qtyLabel}`;
    if (resolvedProductName) return `${prefix}: ${resolvedProductName}`;
    if (reason) return `${prefix} · ${reason}`;
    return prefix;
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

  if (row.table_name === "stock_batches") {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    if (parsed?.batch_number) return `${verb} batch #${parsed.batch_number}`;
    if (resolvedProductName) return `${verb} batch for "${resolvedProductName}"`;
  }

  if (row.table_name === "suppliers" && parsed?.name) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} supplier "${parsed.name}"`;
  }

  if (row.table_name === "categories" && parsed?.name) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} category "${parsed.name}"`;
  }

  if (row.table_name === "services" && parsed?.name) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} service "${parsed.name}"`;
  }

  if (row.table_name === "payment_accounts" && (parsed?.name || parsed?.account_name)) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} payment account "${parsed.name || parsed.account_name}"`;
  }

  if (row.table_name === "prescriptions" && (parsed?.prescription_number || parsed?.patient_name)) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    const ref = parsed.prescription_number || parsed.patient_name;
    return `${verb} prescription ${ref}`;
  }

  if (row.table_name === "returns") {
    const ref = parsed?.return_number || (row.record_id ? `#${row.record_id.slice(0, 8)}` : "");
    return `Processed return ${ref}`.trim();
  }

  if (row.table_name === "system_configs" && parsed?.key) {
    const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
    return `${verb} setting "${parsed.key}"`;
  }

  if (key === "LOGIN" || key === "LOGOUT" || key === "LOGIN_FAILED") {
    const base = STANDALONE_ACTIONS[key];
    return typeof parsed?.username === "string" && parsed.username
      ? `${base} (${parsed.username})`
      : base;
  }

  if (row.table_name === "users" && !STANDALONE_ACTIONS[key]) {
    const fullName = [parsed?.first_name, parsed?.last_name].filter(Boolean).join(" ").trim()
      || (typeof parsed?.username === "string" ? parsed.username : "");
    if (fullName) {
      const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
      return `${verb} staff "${fullName}"`;
    }
  }

  if (STANDALONE_ACTIONS[key]) return STANDALONE_ACTIONS[key];

  if (typeof parsed?.description === "string" && parsed.description.trim()) {
    return parsed.description.trim();
  }

  const verb = ACTION_VERBS[key] || formatActionLabel(row.action);
  const noun = tableNoun(row.table_name);
  if (!noun) return verb;

  return NO_ARTICLE_NOUNS.has(noun) ? `${verb} ${noun}` : `${verb} a ${noun}`;
}

export function summarizeActivityDetails(row: {
  action: string;
  table_name?: string | null;
  details?: string | null;
}): string | null {
  const parsed = parseDetails(row.details);
  if (!parsed) return null;

  const parts: string[] = [];
  if (typeof parsed.reason === "string" && parsed.reason.trim()) {
    parts.push(parsed.reason.trim());
  }
  if (typeof parsed.notes === "string" && parsed.notes.trim() && parsed.notes !== parsed.reason) {
    parts.push(parsed.notes.trim());
  }
  if (typeof parsed.batch_number === "string" && row.table_name !== "stock_batches") {
    parts.push(`Batch #${parsed.batch_number}`);
  }
  if (typeof parsed.payment_method === "string" && parsed.payment_method) {
    parts.push(parsed.payment_method.replace(/_/g, " "));
  }
  if (parts.length > 0) return parts.join(" · ");

  if (typeof parsed.description === "string" && parsed.description.trim()) {
    return parsed.description.trim();
  }
  return null;
}
