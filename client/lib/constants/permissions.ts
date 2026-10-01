// Key stability, category use and the rename ban: see client/AGENTS.md's
// "Enforced permissions" section.
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

// Keys removed from the catalog on 2026-09-29, and the three removed-then-restored
// same day: see client/AGENTS.md's "Removed from the catalog" section.
export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { key: "process_sales", label: "Process Sales", category: "Sales & POS" },
  { key: "apply_discounts", label: "Apply Discounts", category: "Sales & POS" },
  { key: "void_refund_sales", label: "Void / Refund Sales", category: "Sales & POS" },
  { key: "override_price", label: "Override Price at Checkout", category: "Sales & POS" },
  { key: "hold_sales", label: "Hold / Resume a Sale", category: "Sales & POS" },
  { key: "view_sales_history", label: "View Sales History", category: "Sales & POS" },
  { key: "reprint_receipt", label: "Reprint / Re-send a Receipt", category: "Sales & POS" },
  { key: "run_daily_close", label: "Run Daily Close (End of Day)", category: "Sales & POS" },

  { key: "manage_products", label: "Manage Products & Categories", category: "Inventory & Stock" },
  { key: "adjust_stock_counts", label: "Adjust Stock Counts", category: "Inventory & Stock" },
  { key: "manage_purchase_orders", label: "Manage Purchase Orders", category: "Inventory & Stock" },
  { key: "receive_purchase_orders", label: "Receive Purchase Orders", category: "Inventory & Stock" },
  { key: "manage_suppliers", label: "Manage Suppliers", category: "Inventory & Stock" },
  { key: "request_stock_transfers", label: "Request Stock Transfers", category: "Inventory & Stock" },
  { key: "approve_stock_transfers", label: "Review Stock Transfers", category: "Inventory & Stock" },
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

// How these five lists were derived, and why each omission is deliberate:
// see client/AGENTS.md's "The default-group lists themselves" section.
export const DEFAULT_GROUP_PERMISSIONS: Record<
  "admin" | "manager" | "specialist" | "sales_staff" | "auditor",
  string[]
> = {
  admin: PERMISSION_CATALOG.map((p) => p.key), // admin/store_owner-tier: everything
  manager: [
    "process_sales", "apply_discounts", "void_refund_sales", "override_price",
    "manage_products", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions",
    "manage_customers", "manage_loyalty",
    "view_reports", "export_reports",
    "record_expenses", "view_all_expenses",
    "manage_staff",
    "manage_store_settings", "manage_payment_accounts", "manage_online_store", "backup_restore_data",
    // 2026-09-28 granularity pass (QuickBooks POS security-rights comparison):
    "hold_sales", "view_sales_history", "reprint_receipt", "run_daily_close",
    "view_cost_fields", "edit_product_cost", "edit_product_price", "delete_products",
    "perform_stock_audit", "view_stock_adjustment_history", "print_product_labels",
    "export_product_list", "view_suppliers", "delete_suppliers",
    "approve_stock_transfers",
    "delete_customers", "view_customer_balances",
    "view_dashboard", "view_financial_reports",
    "manage_device_settings", "install_app_updates",
    // NOT: view_activity_log, manage_roles_permissions, manage_billing, factory_reset
    // (checkCanViewAllActivity/checkCanFactoryReset both exclude "manager" today)
  ],
  specialist: [
    "process_sales",
    "manage_products", "adjust_stock_counts", "manage_purchase_orders",
    "receive_purchase_orders", "manage_suppliers", "request_stock_transfers",
    "dispense_prescriptions", "manage_prescriptions",
    "manage_customers",
    "record_expenses",
    "hold_sales", "view_sales_history",
    "view_cost_fields", "edit_product_cost", "edit_product_price",
    "perform_stock_audit", "view_stock_adjustment_history", "print_product_labels",
    "export_product_list", "view_suppliers",
    "view_dashboard", "manage_device_settings",
    "view_customer_balances",
    // NOT: void_refund_sales/apply_discounts/override_price (checkIsAdmin-only today),
    // NOT: view_reports/export_reports/view_activity_log/manage_staff/manage_* settings
  ],
  sales_staff: [
    "process_sales",
    "manage_customers",
    "record_expenses",
    "hold_sales", "view_sales_history", "reprint_receipt", "view_dashboard",
    "request_stock_transfers",
    "override_price",
    "view_customer_balances",
  ],
  auditor: [
    "view_reports", "export_reports", "view_all_expenses",
    // auditor is read-only today: no process_sales, no manage_* grants.
    // 2026-09-28 granularity pass: every new key that is purely a read right.
    "view_sales_history",
    "view_cost_fields", "view_stock_adjustment_history", "view_suppliers",
    "view_customer_balances", "view_dashboard", "view_financial_reports",
    "export_product_list",
  ],
};

// What a version means and what bumping it requires: see client/AGENTS.md's
// "Catalog versioning and the default-group backfill" section.
export const PERMISSION_CATALOG_VERSION = 2;

export type DefaultGroupRole = keyof typeof DEFAULT_GROUP_PERMISSIONS;

// Add-only, delta-scoped backfill semantics and why this is a literal table:
// see client/AGENTS.md's catalog-versioning section.
export const DEFAULT_GROUP_PERMISSION_ADDITIONS: Record<number, Record<DefaultGroupRole, string[]>> = {
  2: {
    admin: [
      "hold_sales", "view_sales_history", "reprint_receipt", "run_daily_close",
      "view_cost_fields", "edit_product_cost", "edit_product_price", "delete_products",
      "perform_stock_audit", "view_stock_adjustment_history", "print_product_labels",
      "export_product_list", "view_suppliers", "delete_suppliers",
      "delete_customers", "view_customer_balances",
      "view_dashboard", "view_financial_reports",
      "manage_device_settings", "install_app_updates",
    ],
    manager: [
      "hold_sales", "view_sales_history", "reprint_receipt", "run_daily_close",
      "view_cost_fields", "edit_product_cost", "edit_product_price", "delete_products",
      "perform_stock_audit", "view_stock_adjustment_history", "print_product_labels",
      "export_product_list", "view_suppliers", "delete_suppliers",
      "delete_customers", "view_customer_balances",
      "view_dashboard", "view_financial_reports",
      "manage_device_settings", "install_app_updates",
    ],
    specialist: [
      "hold_sales", "view_sales_history",
      "view_cost_fields", "edit_product_cost", "edit_product_price",
      "perform_stock_audit", "view_stock_adjustment_history", "print_product_labels",
      "export_product_list", "view_suppliers",
      "view_customer_balances", "view_dashboard", "manage_device_settings",
    ],
    sales_staff: [
      "hold_sales", "view_sales_history", "reprint_receipt", "override_price",
      "request_stock_transfers", "view_customer_balances", "view_dashboard",
    ],
    auditor: [
      "view_sales_history", "view_cost_fields", "view_stock_adjustment_history",
      "view_suppliers", "view_customer_balances", "view_dashboard",
      "view_financial_reports", "export_product_list",
    ],
  },
};

// Hand-maintained; add a key here in the same commit as its first call site.
// See client/AGENTS.md's "Enforced permissions" section.
export const ENFORCED_PERMISSION_KEYS: ReadonlySet<string> = new Set([
  "process_sales", // pos-layout-header.tsx, auth-context.tsx (canProcessSales); assistant my_sales_today tool + "Make a sale" help topic
  "apply_discounts", // pos-cart.tsx
  "void_refund_sales", // pos-transaction-history.tsx
  "override_price", // pos-cart-item.tsx
  "hold_sales", // pos-cart.tsx, held-transactions-dialog.tsx
  "view_sales_history", // pos-main-tab-nav.tsx, pos-system.tsx
  "reprint_receipt", // transaction-details-dialog.tsx
  "run_daily_close", // reports/daily-close/daily-close-header.tsx; assistant "Run daily close" help topic
  "manage_products", // transfer-stock-dialog.tsx, auth-context.tsx (canManageStockBatch); assistant "Add a product" help topic
  "adjust_stock_counts", // catalog-row.tsx, catalog-list.tsx, stock-adjustments-ledger.tsx, dashboard-page-routes.ts; assistant "Adjust stock" help topic
  "manage_purchase_orders", // purchase-order-details.tsx, procurement/new + /edit routes, dashboard-page-routes.ts; assistant "Create a purchase order" help topic
  "receive_purchase_orders", // purchase-order-details.tsx
  "manage_suppliers", // supplier-table.tsx, supplier-detail-pane.tsx, supplier-management.tsx, dashboard-page-routes.ts
  "request_stock_transfers", // pos-layout-header.tsx
  "approve_stock_transfers", // stock-movement-detail-modal.tsx (markStockTransferReviewed)
  "view_cost_fields", // catalog-list.tsx, catalog-row.tsx, product-pricing-info.tsx; assistant inventory_status tool (adds stock value to the reply, never denies it)
  "edit_product_cost", // audit-ledger-step.tsx
  "edit_product_price", // catalog-row.tsx, audit-ledger-step.tsx
  "perform_stock_audit", // dashboard-header.tsx, stock-batch-management.tsx, use-stock-batch-management.ts; assistant "Start a stock audit" help topic
  "view_stock_adjustment_history", // stock-batch-tab-nav.tsx, stock-batch-management.tsx, use-stock-batch-management.ts (Movements + Adjustments tabs)
  "print_product_labels", // catalog-detail-panel.tsx, catalog-list.tsx/catalog-row.tsx (opens barcode-print-dialog.tsx)
  "delete_products", // catalog-detail-panel.tsx, catalog-list.tsx/catalog-row.tsx (opens product-delete-dialog.tsx)
  "delete_suppliers", // supplier-detail-pane.tsx (opens supplier-delete-dialog.tsx)
  "export_product_list", // import-export-toolbar.tsx
  "view_suppliers", // procurement-tab-nav.tsx, procurement/vendors route
  "dispense_prescriptions", // prescription-detail-panel.tsx, use-pos-prescription.ts
  "manage_prescriptions", // prescription-detail-panel.tsx, use-prescription-management.ts, dashboard-page-routes.ts
  "manage_customers", // use-customer-management.ts, directory-tab.tsx, customer-detail-panel.tsx, pos-customer-selector.tsx, dashboard-page-routes.ts; assistant "Add a customer" help topic
  "manage_loyalty", // loyalty-tab.tsx, loyalty-settings-dialog.tsx
  "delete_customers", // directory-tab.tsx, customer-detail-panel.tsx
  "view_customer_balances", // directory-tab.tsx, customer-list-rows.tsx, customer-detail-panel.tsx
  "view_reports", // reports/page.tsx, reports/reports-tab-nav.tsx; assistant sales_summary tool (reroutes to my_sales_today on denial) + "View reports" help topic
  "export_reports", // report-center.tsx, report-view-dialog.tsx (canExport)
  "view_financial_reports", // report-center.tsx, business-intelligence-dashboard.tsx, analytics-tab-nav.tsx, bi-key-metrics.tsx; assistant profit_summary tool
  "view_activity_log", // activity-log-page.tsx, product-history.tsx, pos-transaction-history.tsx, use-finance-data.ts, use-purchase-orders.ts, use-dashboard-overview.ts, use-pos-data.ts, auth-context.tsx (canViewAllActivity)
  "record_expenses", // expenses/page.tsx, expense-list.tsx, expense-desktop-row.tsx, expense-detail-dialog.tsx, dashboard-page-routes.ts; assistant "Record an expense" help topic
  "view_all_expenses", // use-finance-data.ts (useExpenseList, useExpenseTotals)
  "manage_staff", // pos-layout-header.tsx, auth-context.tsx (isAdmin); assistant "Add a staff member" help topic
  "manage_roles_permissions", // permission-matrix.tsx
  "manage_store_settings", // settings-tabs.ts (Business Info, Branches, Receipt Settings, Register Configs), appearance-settings.tsx; assistant "Change receipt settings" help topic
  "manage_payment_accounts", // settings-tabs.ts (Payment Methods tab)
  "manage_online_store", // store-profile-section.tsx, payment-methods-panel.tsx
  "manage_billing", // settings-tabs.ts (Billing tab), system-settings.tsx
  "backup_restore_data", // settings-tabs.ts (Data & Sync tab); assistant "Back up or restore data" help topic
  "manage_device_settings", // settings-tabs.ts (System tab)
  "install_app_updates", // tauri/auto-updater.tsx
  "factory_reset", // device-danger-zone.tsx
]);
