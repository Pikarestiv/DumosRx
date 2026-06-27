"use client";

export const ActivityDetails = ({
  details,
  tableName,
  action,
}: {
  details?: string;
  tableName?: string;
  action?: string;
}) => {
  if (!details) return <span>-</span>;

  let parsedContent: any = null;
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "object" && parsed !== null) {
      parsedContent = parsed;
    }
  } catch (_e) {
    // not json
  }

  if (parsedContent) {
    let summary = "";
    const isInsert = action?.toLowerCase() === "insert";

    switch (tableName?.toLowerCase()) {
      case "users":
        summary = isInsert
          ? `Added new staff member: ${parsedContent.first_name || ""} ${parsedContent.last_name || ""}`.trim()
          : `Updated staff member: ${parsedContent.first_name || ""}`;
        break;
      case "customers":
        summary = isInsert
          ? `Added new customer: ${parsedContent.first_name || ""} ${parsedContent.last_name || ""}`.trim()
          : `Updated customer: ${parsedContent.first_name || ""}`;
        break;
      case "products":
        if (parsedContent.stock_quantity !== undefined) {
          summary = `Updated product stock to ${parsedContent.stock_quantity}`;
        } else if (parsedContent.name) {
          summary = isInsert
            ? `Added new product: ${parsedContent.name}`
            : `Updated product: ${parsedContent.name}`;
        } else {
          summary = `Updated product details`;
        }
        break;
      case "sale_items":
        summary = `Sold ${parsedContent.quantity || 1} units`;
        break;
      case "sales":
        summary = `Recorded sale of ${parsedContent.amount_paid ? "₦" + parsedContent.amount_paid : "items"}`;
        break;
      case "held_transactions":
        summary = `Saved a held transaction for ${parsedContent.customer_name || "Walk-in Customer"}`;
        break;
      case "categories":
        summary = isInsert
          ? `Created new category: ${parsedContent.name}`
          : `Updated category`;
        break;
      default:
        // Generic fallback with nice formatting
        const keys = Object.keys(parsedContent).filter(
          (k) =>
            !k.startsWith("_") &&
            k !== "created_at" &&
            k !== "updated_at" &&
            k !== "id",
        );
        summary = isInsert
          ? `Created new record`
          : `Updated ${keys.length} fields`;
    }

    return (
      <div className="flex flex-col gap-1 text-[13px] max-w-[400px]">
        <div className="font-medium text-foreground">{summary}</div>
      </div>
    );
  }

  return (
    <div className="truncate max-w-[350px] text-[13px]" title={details}>
      {details}
    </div>
  );
};

export const filterIndirectSaleLogs = (logs: any[], log: any) => {
  const tableNameStr = (
    log.table_name ||
    log.properties?.table_name ||
    ""
  ).toLowerCase();

  if (tableNameStr === "sale_items") {
    return false;
  }

  if (tableNameStr === "products" && log.action?.toLowerCase() === "update") {
    const logTime = new Date(log.created_at || new Date()).getTime();
    const isPartOfSale = logs.some((otherLog: any) => {
      const otherTable = (
        otherLog.table_name ||
        otherLog.properties?.table_name ||
        ""
      ).toLowerCase();
      if (
        otherTable === "sales" &&
        otherLog.action?.toLowerCase() === "insert"
      ) {
        const otherTime = new Date(otherLog.created_at || new Date()).getTime();
        return (
          log.user_id === otherLog.user_id &&
          Math.abs(logTime - otherTime) < 2000
        );
      }
      return false;
    });

    if (isPartOfSale) {
      try {
        const detailsStr =
          log.details || log.properties?.details || log.description || "";
        const parsed = JSON.parse(detailsStr);
        const keys = Object.keys(parsed).filter(
          (k: string) =>
            !k.startsWith("_") &&
            k !== "created_at" &&
            k !== "updated_at" &&
            k !== "id",
        );
        if (keys.length === 1 && keys[0] === "stock_quantity") {
          return false;
        }
      } catch (_e) {}
    }
  }
  return true;
};
