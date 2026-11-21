export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: string;
  isRead: boolean;
  category: string;
  link?: string | null;
}

const ACTION_TITLE_MAP: Record<string, string> = {
  RECEIVE_PO: "Purchase Order Received",
  RECEIVE_PO_REVERSED: "PO Receipt Voided",
  PO_DRAFT_EDITED: "Purchase Order Updated",
  PO_CLOSED_SHORT: "Purchase Order Closed Short",
  PO_RECOVERED_COPY: "Purchase Order Recovered Copy",
  TILL_RELINK_CODE_ISSUED: "Till Relink Code Issued",
  TILL_RELINK_CODE_ISSUED_BY_ADMIN: "Till Relink Code Issued",
  SALE_RETURN: "Sale Return Processed",
  STOCK_ADJUSTMENT: "Stock Adjustment",
  STOCK_EXPIRED: "Stock Marked as Expired",
  STOCK_DAMAGED: "Stock Marked as Damaged",
  BATCH_COST_CORRECTED: "Batch Cost Corrected",
  BATCH_DETAILS_CORRECTED: "Batch Details Corrected",
  RESELLER_COMMISSION_REDEEMED: "Commission Redeemed",
  FACTORY_RESET: "Store Reset",
  LOGIN_FAILURE: "Multiple Failed Sign-ins",
  UNAUTHORIZED_ACCESS: "Unauthorized Access Attempt",
  DATA_EXPORT: "Data Export Initiated",
  ACCOUNT_DELETION_REQUESTED: "Account Deletion Requested",
  ACCOUNT_DELETION_CANCELLED: "Account Deletion Cancelled",
};

export function formatNotificationTitle(title: string): string {
  if (!title) return "";
  const key = title.trim();
  if (ACTION_TITLE_MAP[key]) {
    return ACTION_TITLE_MAP[key];
  }
  if (key.includes("_") || (key === key.toUpperCase() && key.length > 2)) {
    return key
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return title;
}

export function formatNotificationDescription(description: string, title?: string): string {
  if (!description) return "";
  const trimmed = description.trim();

  const actionMatch = trimmed.match(/^Action:\s*([A-Za-z0-9_]+)\s+on\s+([a-z0-9_]+)$/i);
  if (actionMatch) {
    const action = actionMatch[1].toUpperCase();
    if (action === "RECEIVE_PO") return "Goods received and recorded into inventory.";
    if (action === "RECEIVE_PO_REVERSED") return "Received goods for purchase order were voided.";
    if (action === "PO_DRAFT_EDITED") return "Purchase order draft was updated.";
    if (action === "PO_CLOSED_SHORT") return "Purchase order was closed with partial items.";
    if (action === "PO_RECOVERED_COPY") return "Unsaved order edits preserved as a recovered copy.";
    if (action === "SALE_RETURN") return "Customer sale return was completed.";
    if (action === "STOCK_ADJUSTMENT") return "Inventory stock levels were adjusted.";
    if (action === "STOCK_EXPIRED") return "Inventory written off as expired.";
    if (action === "STOCK_DAMAGED") return "Inventory written off as damaged.";
    if (action === "BATCH_COST_CORRECTED") return "Batch cost price was updated.";
    if (action === "BATCH_DETAILS_CORRECTED") return "Batch expiry, lot or manufacture date was updated.";

    const formattedAction = formatNotificationTitle(action);
    const formattedTable = actionMatch[2].replace(/_/g, " ");
    return `${formattedAction} on ${formattedTable}.`;
  }

  if (trimmed.toLowerCase() === "till re-link code issued") {
    return "A one-time re-link code was generated for your till.";
  }

  if (title?.includes("_")) {
    const formattedTitle = formatNotificationTitle(title);
    if (trimmed.toUpperCase() === title.toUpperCase()) {
      return formattedTitle;
    }
  }

  return description;
}

export interface NotificationBadgeInfo {
  label: string;
  className: string;
}

export function getNotificationBadge(item: NotificationItem): NotificationBadgeInfo | null {
  if (item.category === "payable") {
    return {
      label: "Payables",
      className: "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/50",
    };
  }

  const text = `${item.title} ${item.description}`.toLowerCase();
  if (text.includes("enterprise free trial") || text.includes("enterprise plan")) {
    return {
      label: "Enterprise",
      className: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/60 dark:border-purple-900/50",
    };
  }
  if (text.includes("pro free trial") || text.includes("pro plan")) {
    return {
      label: "Pro",
      className: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/50",
    };
  }

  const raw = `${item.title} ${item.type}`.toUpperCase();
  if (raw.includes("PO") || raw.includes("PURCHASE_ORDER")) {
    return {
      label: "Procurement",
      className: "bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-900/50",
    };
  }
  if (raw.includes("TILL") || raw.includes("RELINK") || raw.includes("SECURITY")) {
    return {
      label: "Security",
      className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/50",
    };
  }

  return null;
}
