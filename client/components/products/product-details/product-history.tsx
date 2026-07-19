import { useEffect, useState } from "react";
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

export function ProductHistory({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const { auditLogs, stockMovements } = await getProductHistory(productId);

        const normalizedLogs: HistoryItem[] = auditLogs.map((log: any) => ({
          id: `audit-${log.id}`,
          type: "audit",
          title: formatAuditTitle(log.action),
          description: log.details || "No details provided",
          date: new Date(log.created_at),
          action: log.action,
          user: log.user_id || "System",
        }));

        const normalizedMovements: HistoryItem[] = stockMovements.map(
          (mov: any) => {
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
              user: mov.performed_by || "System",
              meta: { quantity: mov.quantity, type: mov.movement_type },
            };
          }
        );

        const combined = [...normalizedLogs, ...normalizedMovements].sort(
          (a, b) => b.date.getTime() - a.date.getTime()
        );

        setHistory(combined);
      } catch (error) {
        console.error("Failed to load product history:", error);
      } finally {
        setLoading(false);
      }
    }

    if (productId) {
      load();
    }
  }, [productId]);

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
      {history.map((item, i) => {
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

function formatAuditTitle(action: string) {
  if (action === "create") return "Product Created";
  if (action === "update") return "Product Updated";
  if (action === "delete") return "Product Deleted";
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function getIconForAction(item: HistoryItem) {
  if (item.type === "movement") {
    const t = item.action.toLowerCase();
    if (t.includes("sale")) return ShoppingCart;
    if (t === "in" || t === "addition") return PackagePlus;
    return PackageMinus;
  }
  if (item.action === "create") return PlusCircle;
  if (item.action === "update") return Edit;
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
  if (item.action === "create") return "text-emerald-500 border-emerald-200";
  if (item.action === "update") return "text-amber-500 border-amber-200";
  return "text-slate-500 border-slate-200";
}
