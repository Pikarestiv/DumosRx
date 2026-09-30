import { escapeCsvCell } from "@/lib/utils";
import { downloadCsv } from "@/lib/admin-metrics-export";
import type { AdminStoreSummary } from "@/lib/types/admin";

const HEADER = ["ID", "Name", "Device ID", "Owner", "Email", "Plan", "Status", "Date"];

/** Exports the page of stores currently in the table (the API paginates).
 * Returns false when that page is empty so the caller can say so instead of
 * looking like a successful, silent export. */
export function downloadStoreFleetCsv(storeList: AdminStoreSummary[]): boolean {
  if (storeList.length === 0) return false;

  const csv = [
    HEADER,
    ...storeList.map((store) => [
      store.id,
      store.name,
      store.device_id ?? "",
      store.owner,
      store.email,
      store.plan,
      store.status,
      store.date,
    ]),
  ]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");

  downloadCsv(csv, `stores-export-${new Date().toISOString().split("T")[0]}.csv`);
  return true;
}
