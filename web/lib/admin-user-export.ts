import { escapeCsvCell } from "@/lib/utils";
import { downloadCsv } from "@/lib/admin-metrics-export";
import type { AdminUser } from "@/lib/types/admin";

const HEADER = ["ID", "Name", "Email", "Role", "Store", "Status"];

/** Exports the page of users currently in the table (the API paginates at 50).
 * Returns false when that page is empty so the caller can say so instead of
 * looking like a successful, silent export. */
export function downloadUserDirectoryCsv(userList: AdminUser[]): boolean {
  if (userList.length === 0) return false;

  const csv = [
    HEADER,
    ...userList.map((user) => [
      user.id,
      user.name,
      user.email,
      user.role,
      user.store,
      user.status,
    ]),
  ]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");

  downloadCsv(csv, `users-export-${new Date().toISOString().split("T")[0]}.csv`);
  return true;
}
