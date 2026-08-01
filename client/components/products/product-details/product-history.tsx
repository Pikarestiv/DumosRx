import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { format } from "date-fns";
import {
  Activity,
  PackagePlus,
  PackageMinus,
  Edit,
  ShoppingCart,
  PlusCircle,
  RefreshCcw,
} from "lucide-react";
import { getProductHistory } from "@/lib/db/queries/products";

interface HistoryItem {
  id: string;
  type: "audit" | "movement";
  title: string;
  description: string;
  date: Date;
  action: string;
  user: string;
  meta?: any;
}

async function loadProductHistory(productId: string): Promise<HistoryItem[]> {
  const { auditLogs, stockMovements } = await getProductHistory(productId);

  const normalizedLogs: HistoryItem[] = auditLogs.map((log: any) => ({
    id: `audit-${log.id}`,
    type: "audit",
    title: formatAuditTitle(log.action),
    description: describeAuditDetails(log.action, log.details),
    date: new Date(log.created_at),
    action: log.action,
    user: log.user_name || "System",
  }));

  const normalizedMovements: HistoryItem[] = stockMovements.map((mov: any) => {
    const isAddition = ["in", "addition", "purchase"].includes(
      mov.movement_type.toLowerCase()
    );
    return {
      id: `mov-${mov.id}`,
      type: "movement",
      title: isAddition ? "Stock Added" : "Stock Deducted",
      description: `${isAddition ? "+" : "-"}${mov.quantity} units. ${
        mov.reason ? `Reason: ${mov.reason}` : ""
      }`,
      date: new Date(mov.created_at || mov.movement_date),
      action: mov.movement_type,
      user: mov.performed_by_name || "System",
      meta: { quantity: mov.quantity, type: mov.movement_type },
    };
  });

  return [...normalizedLogs, ...normalizedMovements].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
}

export function ProductHistory({ productId }: { productId: string }) {
  const { data: history = [], isLoading: loading } = useQuery({
    ...queryKeys.products.history(productId),
    queryFn: () => loadProductHistory(productId),
    enabled: !!productId,
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <RefreshCcw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Activity className="h-10 w-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm">No history logs found for this product.</p>
      </div>
    );
  }

  return (
    <div className="relative border-l border-muted ml-3 space-y-6 pb-4">
      {history.map((item) => {
        const Icon = getIconForAction(item);
        const colorClass = getColorForAction(item);

        return (
          <div key={item.id} className="relative pl-6">
            <div
              className={`absolute -left-3.5 top-1 p-1 rounded-full border bg-background ${colorClass}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-1">
              <h4 className="text-sm font-medium">{item.title}</h4>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {format(item.date, "MMM d, yyyy • h:mm a")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              {item.description}
            </p>
            <p className="text-xs text-muted-foreground/60">By {item.user}</p>
          </div>
        );
      })}
    </div>
  );
}

/** audit_logs.action is usually the raw DB op ("INSERT"/"UPDATE"/"DELETE"/
 * "HARD_DELETE") from the generic insert()/update()/softDelete() helpers,
 * not a friendly verb — normalize case so both that and any hand-picked
 * AUDIT_ACTIONS value map to a readable title. */
function normalizeAction(action: string) {
  return (action || "").toLowerCase();
}

function formatAuditTitle(action: string) {
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

// Internal/bookkeeping columns that aren't useful to show a user reading history.
const AUDIT_DETAIL_HIDDEN_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "_version",
  "_synced",
  "_synced_at",
  "_deleted",
  "store_id",
  "category_id", // raw UUID, not human-readable
]);

const AUDIT_DETAIL_LABELS: Record<string, string> = {
  name: "Name",
  generic_name: "Generic Name",
  nafdac_number: "NAFDAC No.",
  strength: "Strength",
  dosage_form: "Dosage Form",
  manufacturer: "Manufacturer",
  selling_price: "Selling Price",
  reorder_level: "Reorder Level",
  barcode: "Barcode",
  base_unit: "Base Unit",
  bulk_unit: "Bulk Unit",
  units_per_bulk: "Units per Bulk",
  is_active: "Active",
  show_online: "Show Online",
  requires_prescription: "Requires Prescription",
  is_controlled: "Controlled Substance",
};

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === 1 || value === 0) return value === 1 ? "Yes" : "No";
  return String(value);
}

/** Turns the raw JSON payload logAction() stores into a short, readable
 * summary instead of dumping the JSON blob in the UI. */
function describeAuditDetails(action: string, details: string | null) {
  const a = normalizeAction(action);
  if (a === "delete" || a === "hard_delete") {
    return "Product removed from the catalog.";
  }

  if (!details) return "No details provided";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(details);
  } catch {
    return details;
  }

  const entries = Object.entries(parsed).filter(
    ([key, value]) => !AUDIT_DETAIL_HIDDEN_KEYS.has(key) && value !== undefined,
  );

  if (entries.length === 0) {
    return a === "insert" ? "Product created." : "Details updated.";
  }

  const summary = entries
    .map(([key, value]) => {
      const label = AUDIT_DETAIL_LABELS[key] || key;
      return `${label}: ${formatAuditValue(value)}`;
    })
    .join(" • ");

  return (a === "insert" ? "Created with — " : "Changed — ") + summary;
}

function getIconForAction(item: HistoryItem) {
  if (item.type === "movement") {
    const t = item.action.toLowerCase();
    if (t.includes("sale")) return ShoppingCart;
    if (t === "in" || t === "addition") return PackagePlus;
    return PackageMinus;
  }
  const a = normalizeAction(item.action);
  if (a === "create" || a === "insert") return PlusCircle;
  if (a === "update") return Edit;
  return Activity;
}

function getColorForAction(item: HistoryItem) {
  if (item.type === "movement") {
    const t = item.action.toLowerCase();
    if (t === "in" || t === "addition" || t === "purchase")
      return "text-emerald-500 border-emerald-200";
    if (t.includes("sale")) return "text-blue-500 border-blue-200";
    return "text-rose-500 border-rose-200";
  }
  const a = normalizeAction(item.action);
  if (a === "create" || a === "insert") return "text-emerald-500 border-emerald-200";
  if (a === "update") return "text-amber-500 border-amber-200";
  return "text-slate-500 border-slate-200";
}
