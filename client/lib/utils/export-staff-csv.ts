import type { StaffListItem } from "@/lib/types/user";

// A leading =/+/-/@ is interpreted as a formula by Excel/Sheets when the CSV
// is opened there - prefixing with a tab (invisible, doesn't shift columns)
// neutralizes it without altering the visible value.
const FORMULA_TRIGGER_RE = /^[=+\-@]/;

function csvField(value: string): string {
  const safe = FORMULA_TRIGGER_RE.test(value) ? `\t${value}` : value;
  return safe.includes(",") || safe.includes('"') || safe.includes("\n")
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

export function buildStaffCsv(users: StaffListItem[]): string {
  const header = "Name,Username,Email,Role,Status,Created";
  const rows = users.map((u) => {
    const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
    const created = u.created_at ? u.created_at.slice(0, 10) : "";
    const status = u.is_active === 0 ? "Inactive" : "Active";
    return [
      csvField(name),
      csvField(u.username || ""),
      csvField(u.email || ""),
      csvField(u.role || ""),
      status,
      created,
    ].join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}
