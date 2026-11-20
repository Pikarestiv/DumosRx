import { batchCostReasonLabel } from "@/lib/constants/batch-cost-reasons";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

export function normalizeAction(action: string) {
  return (action || "").toLowerCase();
}

export function formatAuditTitle(action: string) {
  const a = normalizeAction(action);
  if (a === "create" || a === "insert") return "Product Created";
  if (a === "update") return "Product Updated";
  if (a === "delete" || a === "hard_delete") return "Product Deleted";
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const HIDDEN_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "_version",
  "_synced",
  "_synced_at",
  "_deleted",
  "store_id",
  "category_id",
]);

const BOOLEAN_KEYS = new Set(["is_active", "show_online", "requires_prescription", "is_controlled"]);

const LABELS: Record<string, string> = {
  name: "Name",
  generic_name: "Generic name",
  nafdac_number: "NAFDAC no.",
  strength: "Strength",
  dosage_form: "Dosage form",
  manufacturer: "Manufacturer",
  selling_price: "Selling price",
  reorder_level: "Reorder level",
  barcode: "Barcode",
  base_unit: "Base unit",
  bulk_unit: "Bulk unit",
  units_per_bulk: "Units per bulk",
  is_active: "Active",
  show_online: "Show online",
  requires_prescription: "Requires prescription",
  is_controlled: "Controlled substance",
};

const BATCH_DETAIL_LABELS: Record<string, string> = {
  batch_number: "Lot number",
  expiry_date: "Expiry date",
  manufacture_date: "Manufacture date",
};

const DATE_BATCH_DETAILS = new Set(["expiry_date", "manufacture_date"]);

function describeBatchDetailChanges(parsed: Record<string, unknown>): string {
  const changes = (parsed.changes ?? {}) as Record<string, { from?: string | null; to?: string | null }>;
  const show = (field: string, value?: string | null) =>
    !value ? "none" : DATE_BATCH_DETAILS.has(field) ? formatDateToDDMMYYYY(value) : value;
  const lines = Object.entries(changes).map(
    ([field, change]) => `${BATCH_DETAIL_LABELS[field] ?? field} ${show(field, change.from)} → ${show(field, change.to)}`,
  );
  return `Batch #${parsed.batch_number || "Default"}: ${lines.join("; ") || "details updated"}.`;
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

function formatValue(key: string, value: unknown): string {
  if (isEmpty(value)) return "-";
  if (BOOLEAN_KEYS.has(key)) return value === true || value === 1 || value === "1" ? "Yes" : "No";
  return String(value);
}

export function describeAuditDetails(action: string, details: string | null, canViewCost: boolean) {
  const a = normalizeAction(action);
  if (a === "delete" || a === "hard_delete") return "Product removed from the catalog.";
  if (!details) return "No details provided";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(details);
  } catch {
    return details;
  }

  if (a === "batch_cost_corrected") {
    const reason = batchCostReasonLabel(parsed.reason);
    const reasonText = reason ? ` Reason: ${reason}.` : "";
    if (!canViewCost) return `Batch #${parsed.batch_number || "Default"}: cost price corrected.${reasonText}`;
    const formatCost = (value: unknown) => (typeof value === "number" ? value.toLocaleString() : "-");
    return `Batch #${parsed.batch_number || "Default"}: cost price ${formatCost(parsed.previous_cost_price)} → ${formatCost(parsed.cost_price)}.${reasonText}`;
  }

  if (a === "batch_details_corrected") return describeBatchDetailChanges(parsed);

  const isCreate = a === "insert";
  const entries = Object.entries(parsed).filter(
    ([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined && !(isCreate && isEmpty(value)),
  );

  if (entries.length === 0) return isCreate ? "Product created." : "Details updated.";

  const summary = entries.map(([key, value]) => `${LABELS[key] || key}: ${formatValue(key, value)}`).join(" • ");
  return (isCreate ? "Created with: " : "Changed: ") + summary;
}
