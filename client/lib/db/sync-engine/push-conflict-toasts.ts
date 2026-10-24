import { toast } from "sonner";

// Dropped without a toast: queued by automatic machinery, not a user action.
const SILENT_TERMINAL_REASONS = new Set(["permission_denied"]);

// Best-effort singular labels for the version-conflict toast; anything not
// listed falls back to the raw table name.
const RECORD_LABELS: Record<string, string> = {
  products: "a product",
  stock_batches: "a stock batch",
  customers: "a customer",
  sales: "a sale",
  categories: "a category",
  suppliers: "a supplier",
  expenses: "an expense",
  purchase_orders: "a purchase order",
  prescriptions: "a prescription",
  users: "a staff account",
  stores: "a store",
};

function describeSyncedRecord(tableName: string): string {
  return RECORD_LABELS[tableName] ?? `a ${tableName.replace(/_/g, " ")} record`;
}

export interface PushConflict {
  table_name: string;
  record_id: string;
  reason: string;
}

export function announceTerminalConflicts(
  versionConflicts: PushConflict[],
  silencedConflicts: Omit<PushConflict, "reason">[],
): void {
  // Wording deliberately never blames "another device" — see
  // client/AGENTS.md, "Push details".
  const toastableConflicts = versionConflicts.filter((conflict) => {
    if (SILENT_TERMINAL_REASONS.has(conflict.reason)) {
      console.info(
        `[Sync] ${conflict.table_name} record ${conflict.record_id} was rejected as ${conflict.reason}; queue row dropped. No pull can settle this reason, so the local row keeps the value that lost. No toast shown.`,
      );
      return false;
    }
    // Push-only telemetry the user never edits: log, don't toast.
    if (conflict.table_name === "feedback" || conflict.table_name === "audit_logs") {
      console.info(
        `[Sync] ${conflict.table_name} record ${conflict.record_id} hit a version conflict; server's version kept, no toast shown.`,
      );
      return false;
    }
    return true;
  });
  // Sonner flushSyncs per toast(); a batch's worth in one tick trips
  // React's "Maximum update depth exceeded" and crashes the page.
  const CONFLICT_TOAST_THRESHOLD = 5;
  if (toastableConflicts.length > CONFLICT_TOAST_THRESHOLD) {
    toast.warning(
      `${toastableConflicts.length} changes could not be saved because the records changed since those edits. The server's current versions were kept.`,
    );
  } else {
    for (const conflict of toastableConflicts) {
      toast.warning(
        `A change to ${describeSyncedRecord(conflict.table_name)} could not be saved because the record changed since this edit. The server's current version was kept.`,
      );
    }
  }
  for (const conflict of silencedConflicts) {
    console.info(
      `[Sync] Retried edit to ${conflict.table_name}/${conflict.record_id} hit a version conflict, likely its own earlier attempt already applied; server's version kept, no toast shown.`,
    );
  }
}
