import { APP_NAME } from "@/lib/constants";

interface PageAction {
  label: string;
  path: string;
}

interface PageRoute {
  path: string;
  title: string;
  desc: string;
  action?: PageAction;
  /** Action only shown to roles with stock-management access (admin/manager/specialist/store_owner). */
  actionAdminOnly?: boolean;
}

/** Drives DashboardHeader's title/description/action button per route.
 * Matched by prefix (see getPageRoute), so list more specific paths (e.g.
 * "/inventory/catalog") before their parent ("/inventory"). */
export const PAGE_ROUTES: PageRoute[] = [
  {
    path: "/dashboard",
    title: "Dashboard",
    desc: "Your store's daily overview.",
    action: { label: "New Sale", path: "/pos" },
  },
  {
    path: "/inventory/catalog",
    title: "Product Catalog",
    desc: "Manage your pharmacy's core product database and pricing.",
    action: { label: "Add Product", path: "/inventory/catalog?action=add" },
    actionAdminOnly: true,
  },
  {
    path: "/inventory/batches",
    title: "Stock Inventory",
    desc: "Manage inventory intake, expiration dates, and physical stock.",
    action: { label: "Add Batch", path: "/inventory/batches?action=add" },
    actionAdminOnly: true,
  },
  {
    path: "/inventory/overview",
    title: "Inventory Dashboard",
    desc: "Overview of your inventory health and metrics.",
    action: { label: "Add Product", path: "/inventory/catalog?action=add" },
    actionAdminOnly: true,
  },
  {
    path: "/inventory/ledger",
    title: "Stock Movements",
    desc: "Full audit trail of every stock movement: sales, receipts, and adjustments.",
    action: { label: "Add Product", path: "/inventory/catalog?action=add" },
    actionAdminOnly: true,
  },
  {
    path: "/inventory",
    title: "Inventory Dashboard",
    desc: "Overview of your inventory health and metrics.",
  },
  {
    path: "/customers",
    title: "Customer Management",
    desc: "View and manage customer profiles, credit, and history.",
    action: { label: "Add Customer", path: "/customers?action=add" },
  },
  {
    path: "/sales",
    title: "Sales History",
    desc: "View and manage past transactions and returns.",
  },
  {
    path: "/prescriptions",
    title: "Prescription Management",
    desc: "Track and fulfill patient prescriptions securely.",
    action: { label: "Create Prescription", path: "/prescriptions?action=add" },
  },
  {
    path: "/procurement/vendors",
    title: "Vendors & Suppliers",
    desc: "Manage supplier directory and view debt.",
    action: { label: "Add Supplier", path: "/procurement/vendors?action=add" },
    actionAdminOnly: true,
  },
  {
    path: "/procurement/requests",
    title: "Requested Products",
    desc: "View and manage products requested by staff or customers.",
    action: {
      label: "Request Product",
      path: "/procurement/requests?action=add",
    },
    actionAdminOnly: true,
  },
  {
    path: "/procurement/new",
    title: "Create Purchase Order",
    desc: "Make new purchase orders.",
    // No header action: the page itself already has a back button, title,
    // and item count in its own panel header (desktop), and this header is
    // hidden entirely on mobile for this route (full-screen takeover).
  },
  {
    path: "/procurement",
    title: "Procurement",
    desc: "Manage suppliers, create purchase orders, and track deliveries.",
    action: { label: "Create Order", path: "/procurement/new" },
    actionAdminOnly: true,
  },
  {
    path: "/expenses",
    title: "Expenses",
    desc: "Track and manage your pharmacy's operational expenses.",
    action: { label: "Add Expense", path: "/expenses?action=add" },
    actionAdminOnly: true,
  },
  {
    path: "/reports",
    title: "Reporting Center",
    desc: "View performance metrics and generate detailed reports.",
  },
  {
    path: "/settings",
    title: "Settings",
    desc: "Manage your pharmacy configuration and preferences.",
  },
];

export function getPageRoute(pathname: string) {
  return PAGE_ROUTES.find((route) => pathname.startsWith(route.path));
}

/** Null on the dashboard home route, which uses the time-of-day greeting
 * instead of a page title. Falls back to a bare app-name/no-desc/no-action
 * shell for any route not listed above. */
export function getPageInfo(pathname: string): PageRoute | null {
  if (pathname === "/" || pathname === "/dashboard") return null;

  return getPageRoute(pathname) || { path: pathname, title: APP_NAME, desc: "" };
}

/** Resolves the header's "+ Add X" action for the current route, honoring
 * actionAdminOnly. Greeting pages (dashboard home) don't use pageInfo for
 * title/desc, but can still declare an explicit action via PAGE_ROUTES, so
 * this re-looks-up the route rather than relying solely on pageInfo. */
export function resolveHeaderAction(
  pathname: string,
  pageInfo: PageRoute | null,
  canManageStockBatch: boolean,
): PageAction | null {
  const matchedRoute = pageInfo?.action ? pageInfo : getPageRoute(pathname);
  if (!matchedRoute?.action) return null;
  if (matchedRoute.actionAdminOnly && !canManageStockBatch) return null;
  return matchedRoute.action;
}
