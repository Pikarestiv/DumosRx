import { escapeCsvCell } from "@/lib/utils";
import type { AdminStoreSummary } from "@/lib/types/admin";

const HEADER = ["ID", "Name", "Device ID", "Owner", "Email", "Plan", "Status", "Date"];

export function downloadStoreFleetCsv(storeList: AdminStoreSummary[]) {
  if (storeList.length === 0) return;

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

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stores-export-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
