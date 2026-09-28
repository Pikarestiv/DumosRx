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
  { key: "hold_sales", label: "Hold / Resume a Sale", category: "Sales & POS" },
  { key: "view_sales_history", label: "View Sales History", category: "Sales & POS" },
  { key: "edit_completed_sale", label: "Edit a Completed Sale", category: "Sales & POS" },
  { key: "reprint_receipt", label: "Reprint / Re-send a Receipt", category: "Sales & POS" },
  { key: "run_daily_close", label: "Run Daily Close (End of Day)", category: "Sales & POS" },
  { key: "view_drawer_counts", label: "View Drawer Counts & Variances", category: "Sales & POS" },
  { key: "override_credit_limit", label: "Override Customer Credit Limit", category: "Sales & POS" },

  { key: "manage_products", label: "Manage Products & Categories", category: "Inventory & Stock" },
  { key: "manage_stock_batches", label: "Manage Stock Batches", category: "Inventory & Stock" },
  { key: "adjust_stock_counts", label: "Adjust Stock Counts", category: "Inventory & Stock" },
  { key: "manage_purchase_orders", label: "Manage Purchase Orders", category: "Inventory & Stock" },
  { key: "receive_purchase_orders", label: "Receive Purchase Orders", category: "Inventory & Stock" },
  { key: "manage_suppliers", label: "Manage Suppliers", category: "Inventory & Stock" },
  { key: "request_stock_transfers", label: "Request Stock Transfers", category: "Inventory & Stock" },
  { key: "approve_stock_transfers", label: "Approve Incoming Stock Transfers", category: "Inventory & Stock" },
  { key: "view_cost_fields", label: "View Cost & Margin Fields", category: "Inventory & Stock" },
  { key: "edit_product_cost", label: "Edit Product Cost Price", category: "Inventory & Stock" },
  { key: "edit_product_price", label: "Edit Product Selling Price", category: "Inventory & Stock" },
  { key: "delete_products", label: "Delete Products", category: "Inventory & Stock" },
  { key: "perform_stock_audit", label: "Perform Stock Audit (Physical Count)", category: "Inventory & Stock" },
  { key: "view_stock_adjustment_history", label: "View Stock Adjustment History", category: "Inventory & Stock" },
  { key: "print_product_labels", label: "Print Product Labels & Tags", category: "Inventory & Stock" },
  { key: "export_product_list", label: "Export Product List", category: "Inventory & Stock" },
  { key: "view_suppliers", label: "View Supplier Details", category: "Inventory & Stock" },
  { key: "delete_suppliers", label: "Delete Suppliers", category: "Inventory & Stock" },

  { key: "dispense_prescriptions", label: "Dispense Prescriptions", category: "Prescriptions" },
  { key: "manage_prescriptions", label: "Manage Prescription Records", category: "Prescriptions" },

  { key: "manage_customers", label: "Manage Customers", category: "Customers & Loyalty" },
  { key: "manage_loyalty", label: "Manage Loyalty Program", category: "Customers & Loyalty" },
  { key: "delete_customers", label: "Delete Customers", category: "Customers & Loyalty" },
  { key: "view_customer_balances", label: "View Customer Account Balances", category: "Customers & Loyalty" },
  { key: "manage_customer_credit_terms", label: "Manage Customer Credit Terms", category: "Customers & Loyalty" },

  { key: "view_reports", label: "View Reports & Analytics", category: "Reports & Activity" },
  { key: "export_reports", label: "Export / Print Reports", category: "Reports & Activity" },
  { key: "view_activity_log", label: "View Activity Log", category: "Reports & Activity" },
  { key: "view_dashboard", label: "View Dashboard Overview", category: "Reports & Activity" },
  { key: "view_financial_reports", label: "View Financial Reports (P&L, Margins)", category: "Reports & Activity" },

  { key: "record_expenses", label: "Record Expenses", category: "Expenses" },
  { key: "view_all_expenses", label: "View All Expenses", category: "Expenses" },

  { key: "manage_staff", label: "Manage Staff", category: "Staff & Groups" },
  { key: "manage_roles_permissions", label: "Manage Roles & Permission Groups", category: "Staff & Groups" },

  { key: "manage_store_settings", label: "Manage Store Settings", category: "Store & Settings" },
  { key: "manage_payment_accounts", label: "Manage Payment Accounts", category: "Store & Settings" },
  { key: "manage_online_store", label: "Manage Online Store", category: "Store & Settings" },
  { key: "manage_billing", label: "Manage Subscription & Billing", category: "Store & Settings" },
  { key: "backup_restore_data", label: "Backup / Restore Local Data", category: "Store & Settings" },
  { key: "manage_device_settings", label: "Manage This Device's Settings", category: "Store & Settings" },
  { key: "install_app_updates", label: "Install App Updates", category: "Store & Settings" },
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
    // 2026-09-28 granularity pass (QuickBooks POS security-rights comparison):
    "hold_sales", "view_sales_history", "edit_completed_sale", "reprint_receipt", "run_daily_close",
    "view_drawer_counts", "override_credit_limit",
    "view_cost_fields", "edit_product_cost", "edit_product_price", "delete_products",
    "perform_stock_audit", "view_stock_adjustment_history", "print_product_labels",
    "export_product_list", "view_suppliers", "delete_suppliers",
    "delete_customers", "view_customer_balances", "manage_customer_credit_terms",
    "view_dashboard", "view_financial_reports",
    "manage_device_settings", "install_app_updates",
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
    // 2026-09-28 granularity pass: a specialist is the stock-owning role, so
    // it gets the cost/price/audit rights but none of the destructive
    // (delete_*) or money-side (daily close, drawer, credit limit) ones.
    "hold_sales", "view_sales_history",
    "view_cost_fields", "edit_product_cost", "edit_product_price",
    "perform_stock_audit", "view_stock_adjustment_history", "print_product_labels",
    "export_product_list", "view_suppliers",
    "view_dashboard", "manage_device_settings",
    // NOT: void_refund_sales/apply_discounts/open_cash_drawer/override_price (checkIsAdmin-only today),
    // NOT: view_reports/export_reports/view_activity_log/manage_staff/manage_* settings
  ],
  sales_staff: [
    "process_sales",
    "manage_customers",
    "record_expenses",
    // sales_staff has no other grant under any of today's 6 helpers.
    // 2026-09-28 granularity pass: only the rights a cashier needs to work
    // their own till - never cost/margin figures (see AGENTS.md's cashier
    // visibility-gating section).
    "hold_sales", "view_sales_history", "reprint_receipt", "view_dashboard",
    // 2026-09-28 enforcement pass: added once override_price gained a real
    // gate. The app's only price-override surface is the reseller /
    // store-markup unit price (pos-cart-item.tsx), which is floored at the
    // product's own price - it can raise a line, never discount it - and the
    // cashier is who rings reseller sales. Withholding it here would have
    // made the Reseller toggle inert at the till the moment enforcement
    // landed. An owner who wants markup pricing to be a supervisor decision
    // unticks it; that now actually does something.
    "override_price",
  ],
  auditor: [
    "view_reports", "export_reports", "view_all_expenses",
    // auditor is read-only today: no process_sales, no manage_* grants.
    // 2026-09-28 granularity pass: every new key that is purely a read right.
    "view_sales_history", "view_drawer_counts",
    "view_cost_fields", "view_stock_adjustment_history", "view_suppliers",
    "view_customer_balances", "view_dashboard", "view_financial_reports",
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
  "override_price", // pos-cart-item.tsx
  "hold_sales", // pos-cart.tsx, held-transactions-dialog.tsx
  "view_sales_history", // pos-main-tab-nav.tsx, pos-system.tsx
  "reprint_receipt", // transaction-details-dialog.tsx
  "manage_products", // transfer-stock-dialog.tsx, auth-context.tsx (canManageStockBatch)
  "export_reports", // report-center.tsx, report-view-dialog.tsx (canExport)
  "view_activity_log", // activity-log-page.tsx, product-history.tsx, pos-transaction-history.tsx, use-finance-data.ts, use-purchase-orders.ts, use-dashboard-overview.ts, use-pos-data.ts, auth-context.tsx (canViewAllActivity)
  "manage_staff", // pos-layout-header.tsx, auth-context.tsx (isAdmin)
  "manage_roles_permissions", // permission-matrix.tsx
  "factory_reset", // device-danger-zone.tsx
]);
