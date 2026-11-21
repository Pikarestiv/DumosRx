import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  Activity,
  PackagePlus,
  PackageMinus,
  PackageCheck,
  Edit,
  ShoppingCart,
  PlusCircle,
  RefreshCcw,
} from "lucide-react";
import { getProductHistory } from "@/lib/db/queries/products";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { resolveMovementDisplayType } from "@/components/stock-batch/stock-movement-utils";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { describeAuditDetails, formatAuditTitle, normalizeAction } from "./product-audit-description";

interface HistoryItem {
  id: string;
  type: "audit" | "movement";
  title: string;
  description: string;
  date: Date;
  action: string;
  user: string;
  meta?: { quantity: number; type: string };
}

function describeMovement(mov: StockMovementHistoryRow) {
  const displayType = resolveMovementDisplayType(mov);
  const absQty = Math.abs(mov.quantity);
  const reasonSuffix = mov.reason ? ` Reason: ${mov.reason}` : "";

  switch (displayType) {
    case "backorder":
      return {
        title: "Stock Shortfall",
        description: `${absQty} units owed to customer.${reasonSuffix}`,
        action: "backorder",
      };
    case "backorder_settlement":
      return {
        title: "Shortfall Settlement",
        description: `${absQty} units settled by receipt.${reasonSuffix}`,
        action: "backorder_settlement",
      };
    case "sale":
      return {
        title: "Stock Deducted",
        description: `-${absQty} units.${reasonSuffix}`,
        action: "sale",
      };
    case "purchase":
    case "in":
    case "addition":
    case "restock":
      return {
        title: "Stock Added",
        description: `+${absQty} units.${reasonSuffix}`,
        action: "purchase",
      };
    case "return":
      return {
        title: "Stock Restocked (Return)",
        description: `+${absQty} units.${reasonSuffix}`,
        action: "return",
      };
    case "damaged":
    case "damage":
      return {
        title: "Stock Damaged",
        description: `-${absQty} units.${reasonSuffix}`,
        action: "damaged",
      };
    case "import":
      return {
        title: "Bulk Import",
        description: `${mov.quantity >= 0 ? "+" : "-"}${absQty} units.${reasonSuffix}`,
        action: "import",
      };
    default: {
      const sign = mov.quantity >= 0 ? "+" : "-";
      return {
        title: "Stock Adjusted",
        description: `${sign}${absQty} units.${reasonSuffix}`,
        action: mov.movement_type,
      };
    }
  }
}

async function loadProductHistory(
  productId: string,
  viewerId: string | undefined,
  canViewCost: boolean,
): Promise<HistoryItem[]> {
  const { auditLogs, stockMovements } = await getProductHistory(productId, viewerId);

  const normalizedLogs: HistoryItem[] = auditLogs.map((log) => ({
    id: `audit-${log.id}`,
    type: "audit",
    title: formatAuditTitle(log.action),
    description: describeAuditDetails(log.action, log.details || null, canViewCost),
    date: new Date(log.created_at || 0),
    action: log.action,
    user: log.user_name || "System",
  }));

  const normalizedMovements: HistoryItem[] = stockMovements.map((mov) => {
    const desc = describeMovement(mov);
    return {
      id: `mov-${mov.id}`,
      type: "movement",
      title: desc.title,
      description: desc.description,
      date: new Date(mov.created_at || mov.movement_date || 0),
      action: desc.action,
      user: mov.performed_by_name || "System",
      meta: { quantity: mov.quantity, type: mov.movement_type },
    };
  });

  return [...normalizedLogs, ...normalizedMovements].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
}

export function ProductHistory({ productId }: { productId: string }) {
  const { user } = useAuth();
  const canViewAllActivity = useHasPermission("view_activity_log");
  const canViewCost = useHasPermission("view_cost_fields");
  const viewerId = canViewAllActivity ? undefined : user?.id;
  const historyKey = queryKeys.products.history(productId, viewerId);

  const { data: history = [], isLoading: loading } = useQuery({
    ...historyKey,
    queryKey: [...historyKey.queryKey, canViewCost],
    queryFn: () => loadProductHistory(productId, viewerId, canViewCost),
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
                {formatDateSafe(item.date, "dd/MM/yyyy HH:mm", "Unknown date")}
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

function getIconForAction(item: HistoryItem) {
  if (item.type === "movement") {
    const t = item.action.toLowerCase();
    if (t === "backorder") return PackageMinus;
    if (t === "backorder_settlement") return PackageCheck;
    if (t.includes("sale")) return ShoppingCart;
    if (t === "in" || t === "addition" || t === "purchase" || t === "return") return PackagePlus;
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
    if (t === "backorder") return "text-amber-500 border-amber-200 dark:text-amber-400 dark:border-amber-500/30";
    if (t === "backorder_settlement") return "text-emerald-500 border-emerald-200 dark:text-emerald-400 dark:border-emerald-500/30";
    if (t === "in" || t === "addition" || t === "purchase" || t === "return")
      return "text-emerald-500 border-emerald-200";
    if (t.includes("sale")) return "text-blue-500 border-blue-200";
    return "text-rose-500 border-rose-200";
  }
  const a = normalizeAction(item.action);
  if (a === "create" || a === "insert") return "text-emerald-500 border-emerald-200";
  if (a === "update") return "text-amber-500 border-amber-200";
  return "text-slate-500 border-slate-200";
}
