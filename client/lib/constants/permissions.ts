/** Stable permission keys - referenced by permission_groups.permissions
 * (a JSON array of these), never renamed once shipped (old synced rows
 * would silently lose that grant). Grouped into categories for the
 * Roles & Permissions matrix UI (Task 9). */
export interface PermissionCatalogEntry {
  key: string;
  label: string;
  category:
    | "Sales & POS"
    | "Inventory & Stock"
    | "Prescriptions"
    | "Customers & Loyalty"
    | "Reports & Activity"
    | "Expenses"
    | "Staff & Groups"
    | "Store & Settings";
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { key: "process_sales", label: "Process Sales", category: "Sales & POS" },
  { key: "apply_discounts", label: "Apply Discounts", category: "Sales & POS" },
  { key: "void_refund_sales", label: "Void / Refund Sales", category: "Sales & POS" },
  { key: "open_cash_drawer", label: "Open Cash Drawer (no sale)", category: "Sales & POS" },
  { key: "override_price", label: "Override Price at Checkout", category: "Sales & POS" },

  { key: "manage_products", label: "Manage Products & Categories", category: "Inventory & Stock" },
  { key: "manage_stock_batches", label: "Manage Stock Batches", category: "Inventory & Stock" },
  { key: "adjust_stock_counts", label: "Adjust Stock Counts", category: "Inventory & Stock" },
  { key: "manage_purchase_orders", label: "Manage Purchase Orders", category: "Inventory & Stock" },
  { key: "receive_purchase_orders", label: "Receive Purchase Orders", category: "Inventory & Stock" },
  { key: "manage_suppliers", label: "Manage Suppliers", category: "Inventory & Stock" },
  { key: "request_stock_transfers", label: "Request Stock Transfers", category: "Inventory & Stock" },
  { key: "approve_stock_transfers", label: "Approve Incoming Stock Transfers", category: "Inventory & Stock" },

  { key: "dispense_prescriptions", label: "Dispense Prescriptions", category: "Prescriptions" },
  { key: "manage_prescriptions", label: "Manage Prescription Records", category: "Prescriptions" },

  { key: "manage_customers", label: "Manage Customers", category: "Customers & Loyalty" },
  { key: "manage_loyalty", label: "Manage Loyalty Program", category: "Customers & Loyalty" },

  { key: "view_reports", label: "View Reports & Analytics", category: "Reports & Activity" },
  { key: "export_reports", label: "Export / Print Reports", category: "Reports & Activity" },
  { key: "view_activity_log", label: "View Activity Log", category: "Reports & Activity" },

  { key: "record_expenses", label: "Record Expenses", category: "Expenses" },
  { key: "view_all_expenses", label: "View All Expenses", category: "Expenses" },

  { key: "manage_staff", label: "Manage Staff", category: "Staff & Groups" },
  { key: "manage_roles_permissions", label: "Manage Roles & Permission Groups", category: "Staff & Groups" },

  { key: "manage_store_settings", label: "Manage Store Settings", category: "Store & Settings" },
  { key: "manage_payment_accounts", label: "Manage Payment Accounts", category: "Store & Settings" },
  { key: "manage_online_store", label: "Manage Online Store", category: "Store & Settings" },
  { key: "manage_billing", label: "Manage Subscription & Billing", category: "Store & Settings" },
  { key: "backup_restore_data", label: "Backup / Restore Local Data", category: "Store & Settings" },
  { key: "factory_reset", label: "Factory Reset Device", category: "Store & Settings" },
];

/**
 * The exact permission set each default group is seeded with (Task 5) and
 * restored to by "Revert to Default" (Task 10) - derived to reproduce
 * today's 6-helper behavior exactly for each role, so migrating an
 * existing store changes nothing on day one. Cross-referenced against
 * auth-context.tsx's checkIsAdmin/checkCanManageStockBatch/
 * checkCanProcessSales/checkCanViewAllActivity/checkCanFactoryReset arrays
 * as they stood before Task 8's migration.
 */
export const DEFAULT_GROUP_PERMISSIONS: Record<
  "admin" | "manager" | "specialist" | "sales_staff" | "auditor",
  string[]
> = {
  admin: PERMISSION_CATALOG.map((p) => p.key), // admin/store_owner-tier: everything
  manager: [
    "process_sales", "apply_discounts", "void_refund_sales", "open_cash_drawer", "override_price",
    "manage_products", "manage_stock_batches", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers", "approve_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions",
    "manage_customers", "manage_loyalty",
    "view_reports", "export_reports",
    "record_expenses", "view_all_expenses",
    "manage_staff",
    "manage_store_settings", "manage_payment_accounts", "manage_online_store", "backup_restore_data",
    // NOT: view_activity_log, manage_roles_permissions, manage_billing, factory_reset
    // (checkCanViewAllActivity/checkCanFactoryReset both exclude "manager" today)
  ],
  specialist: [
    "process_sales",
    "manage_products", "manage_stock_batches", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions",
    "manage_customers",
    "record_expenses",
    // NOT: void_refund_sales/apply_discounts/open_cash_drawer/override_price (checkIsAdmin-only today),
    // NOT: view_reports/export_reports/view_activity_log/manage_staff/manage_* settings
  ],
  sales_staff: [
    "process_sales",
    "manage_customers",
    "record_expenses",
    // sales_staff has no other grant under any of today's 6 helpers
  ],
  auditor: [
    "view_reports", "export_reports", "view_all_expenses",
    // auditor is read-only today: no process_sales, no manage_* grants
  ],
};

/**
 * Permission keys with a real useHasPermission()/hasPermission() call site
 * gating something in the app today - every OTHER key in PERMISSION_CATALOG
 * is a real, toggleable checkbox in the Roles & Permissions matrix that
 * currently does nothing anywhere else in the app (final review, Important
 * I5: toggling one of those looks like it changes behavior but doesn't,
 * which is worse than not having the checkbox at all). The matrix UI reads
 * this set to mark unenforced rows honestly instead of implying parity with
 * the 7 keys actually wired up. Update this set in the SAME commit as any
 * new useHasPermission(key)/hasPermission(user, group, key) call site -
 * it is not derived automatically from the codebase.
 */
export const ENFORCED_PERMISSION_KEYS: ReadonlySet<string> = new Set([
  "process_sales", // pos-layout-header.tsx, auth-context.tsx (canProcessSales)
  "apply_discounts", // pos-cart.tsx
  "void_refund_sales", // pos-transaction-history.tsx
  "manage_products", // transfer-stock-dialog.tsx, auth-context.tsx (canManageStockBatch)
  "view_activity_log", // activity-log-page.tsx, product-history.tsx, pos-transaction-history.tsx, use-finance-data.ts, use-purchase-orders.ts, use-dashboard-overview.ts, use-pos-data.ts, auth-context.tsx (canViewAllActivity)
  "manage_staff", // pos-layout-header.tsx, auth-context.tsx (isAdmin)
  "manage_roles_permissions", // permission-matrix.tsx
  "factory_reset", // device-danger-zone.tsx
]);
