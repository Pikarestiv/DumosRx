import {
  Search,
  DollarSign,
  RefreshCw,
  AlertTriangle,
  Shield,
  Undo2,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { formatDateLong } from "@/lib/utils/date-utils";

export interface StockMovement {
  id: string;
  date: string;
  product: string;
  type: string;
  quantity: number;
  reason: string;
  reference: string;
  user: string;
  supplier?: string;
  batchNumber?: string;
}

export const FILTER_TYPES = [
  { id: "all", label: "All types" },
  { id: "sale", label: "Sales" },
  { id: "purchase", label: "Restock" },
  { id: "return", label: "Returns" },
  { id: "damaged", label: "Damage" },
  { id: "adjustment", label: "Adjustments" },
  { id: "transfer", label: "Transfers" },
];

export const getTypeColor = (type: string) => {
  switch (type.toLowerCase()) {
    case "adjustment":
      return "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30";
    case "purchase":
    case "restock":
      return "bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30";
    case "return":
      return "bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30";
    case "damaged":
    case "damage":
      return "bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30";
    case "sale":
      return "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30";
    case "transfer_in":
      return "bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-500/20 dark:text-teal-400 dark:border-teal-500/30";
    case "transfer_out":
      return "bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30";
    default:
      return "bg-muted/30 border border-border text-foreground";
  }
};

/**
 * Human label for a movement type. CSS `capitalize` (used everywhere
 * movement.type is rendered) handles every existing single-word type fine
 * on its own, but underscored types like "transfer_in" need an explicit
 * mapping ("transfer_in" -> "Transfer In") since `capitalize` only
 * uppercases the first letter and leaves the underscore in place.
 */
export const getTypeLabel = (type: string) => {
  switch (type.toLowerCase()) {
    case "transfer_in":
      return "Transfer In";
    case "transfer_out":
      return "Transfer Out";
    default:
      return type;
  }
};

export const getTypeIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case "adjustment":
      return <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case "purchase":
    case "restock":
      return <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case "return":
      return <Undo2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    case "damaged":
    case "damage":
      return (
        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
      );
    case "sale":
      return (
        <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
      );
    case "transfer_in":
      return (
        <ArrowDownToLine className="w-4 h-4 text-teal-600 dark:text-teal-400" />
      );
    case "transfer_out":
      return (
        <ArrowUpFromLine className="w-4 h-4 text-orange-600 dark:text-orange-400" />
      );
    default:
      return <Search className="w-4 h-4 text-muted-foreground" />;
  }
};

export const getTypeIconBg = (type: string) => {
  switch (type.toLowerCase()) {
    case "adjustment":
      return "bg-amber-50 dark:bg-amber-500/10";
    case "purchase":
    case "restock":
      return "bg-blue-50 dark:bg-blue-500/10";
    case "return":
      return "bg-purple-50 dark:bg-purple-500/10";
    case "damaged":
    case "damage":
      return "bg-red-50 dark:bg-red-500/10";
    case "sale":
      return "bg-emerald-50 dark:bg-emerald-500/10";
    case "transfer_in":
      return "bg-teal-50 dark:bg-teal-500/10";
    case "transfer_out":
      return "bg-orange-50 dark:bg-orange-500/10";
    default:
      return "bg-muted/30";
  }
};

export const formatMovementTime = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatMovementDate = (dateString: string) => {
  const d = new Date(dateString);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return "Today";
  }
  return formatDateLong(d);
};
