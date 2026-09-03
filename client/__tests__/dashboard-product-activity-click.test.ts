import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Regression coverage for: Dashboard "Product added" activity rows were
 * dead clicks (_findings-log.md). dashboard-overview.tsx had dialogs wired
 * for sale/expense/purchase_order/prescription/stock_movement/return
 * activity types but no case for `type === "product"`, so clicking one set
 * `selectedActivity` and nothing opened.
 *
 * Fix: route a "product" activity click to Inventory > Catalog with that
 * product's id via `?productId=`, mirroring product-database.tsx's existing
 * `?action=add` deep-link/cleanup mechanism, so it opens the real, current
 * product record instead of a stale rawActivity snapshot.
 *
 * dashboard-overview.tsx pulls in useDashboardOverview() (many DB-backed
 * queries) and product-database.tsx pulls in useQuery/react-query, so this
 * follows dashboard-action-center-routes.test.ts's source-inspection
 * convention (no render harness) rather than mounting either component.
 */
describe("Dashboard 'product' activity click navigation", () => {
  const dashboardOverviewSource = fs.readFileSync(
    path.join(__dirname, "../components/dashboard/dashboard-overview.tsx"),
    "utf-8",
  );
  const productDatabaseSource = fs.readFileSync(
    path.join(__dirname, "../components/products/product-database.tsx"),
    "utf-8",
  );
  const tabPageSource = fs.readFileSync(
    path.join(__dirname, "../app/(dashboard)/inventory/[tab]/page.tsx"),
    "utf-8",
  );

  it('routes a type === "product" activity click to a real, valid /inventory/<tab> route (not a silent no-op)', () => {
    // Must not just silently call setSelectedActivity for type "product"
    // (that's the original dead-click bug - no dialog is wired for it).
    const clickHandlerMatch = dashboardOverviewSource.match(
      /const handleActivityClick = \(activity: ActivityFeedItem\) => \{([\s\S]*?)\n  \};/,
    );
    expect(clickHandlerMatch).not.toBeNull();
    const handlerBody = clickHandlerMatch![1];

    expect(handlerBody).toMatch(/activity\.type === "product"/);

    const routeMatch = handlerBody.match(/router\.push\(`(\/inventory\/[a-z_]+)/);
    expect(routeMatch, "no router.push(...) found for the product-type branch").not.toBeNull();

    const [, routePath] = routeMatch!;
    const tab = routePath.replace("/inventory/", "");

    const allowedTabsMatch = tabPageSource.match(/const allowedTabs = \[([^\]]*)\]/);
    expect(allowedTabsMatch).not.toBeNull();
    const allowedTabs = JSON.parse(
      `[${allowedTabsMatch![1]}]`.replace(/'/g, '"'),
    ) as string[];
    expect(allowedTabs, `"${routePath}" references unknown inventory tab "${tab}"`).toContain(tab);
  });

  it("passes the clicked activity's own id as productId so Catalog can look up the real, current product record", () => {
    expect(dashboardOverviewSource).toMatch(
      /router\.push\(`\/inventory\/catalog\?productId=\$\{activity\.id\}`\)/,
    );
  });

  it("product-database.tsx (Catalog) reads ?productId= and opens that product's detail panel, then cleans up the URL like ?action=add already does", () => {
    expect(productDatabaseSource).toMatch(/searchParams\.get\("productId"\)/);
    expect(productDatabaseSource).toMatch(/setSelectedProduct\(match\)/);
    // Same URL-cleanup mechanism the existing ?action=add handling uses.
    expect(productDatabaseSource).toMatch(/newParams\.delete\("productId"\)/);
  });

  it("every other dashboard activity type keeps opening its existing details dialog (no regression to sale/expense/purchase_order/prescription/stock_movement)", () => {
    for (const type of [
      "sale",
      "expense",
      "purchase_order",
      "prescription",
      "stock_movement",
    ]) {
      expect(dashboardOverviewSource).toContain(`selectedActivity?.type === "${type}"`);
    }
  });
});
