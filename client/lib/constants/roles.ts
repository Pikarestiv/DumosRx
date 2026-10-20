// The fixed set of staff system roles:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-roles-ts-L1
export const STAFF_ROLES = [
  { value: "admin", label: "Admin (Local Master)" },
  { value: "manager", label: "Manager (Admin)" },
  { value: "specialist", label: "Specialist (Sub-account)" },
  { value: "sales_staff", label: "Sales Staff / Cashier" },
  { value: "auditor", label: "Auditor (Read-only)" },
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number]["value"];
