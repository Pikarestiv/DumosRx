import type { StaffListItem } from "@/lib/types/user";

function csvField(value: string): string {
  return value.includes(",") ? `"${value}"` : value;
}

export function buildStaffCsv(users: StaffListItem[]): string {
  const header = "Name,Username,Email,Role,Status,Created";
  const rows = users.map((u) => {
    const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
    const created = u.created_at ? u.created_at.slice(0, 10) : "";
    const status = u.is_active === 0 ? "Inactive" : "Active";
    return [
      csvField(name),
      u.username || "",
      u.email || "",
      u.role || "",
      status,
      created,
    ].join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}
