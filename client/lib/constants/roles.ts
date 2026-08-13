/** The fixed set of staff system roles — shared between the staff editor
 * (assigning a role) and anywhere roles need to be listed/filtered (e.g.
 * Activity Log), so the two can't drift out of sync. */
export const STAFF_ROLES = [
  { value: "admin", label: "Admin (Local Master)" },
  { value: "manager", label: "Manager (Admin)" },
  { value: "specialist", label: "Specialist (Sub-account)" },
  { value: "sales_staff", label: "Sales Staff / Cashier" },
  { value: "auditor", label: "Auditor (Read-only)" },
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number]["value"];
