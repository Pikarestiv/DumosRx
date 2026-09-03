import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression test for a broken-link bug found while smoke-testing the
// Dashboard's Action Center: clicking the "N Items Low Stock" alert
// navigated to `/inventory/products?status=low_stock`, but the inventory
// section's dynamic route (app/(dashboard)/inventory/[tab]/page.tsx) only
// pre-renders a fixed set of tabs via generateStaticParams(). "products"
// isn't one of them, so under `output: export` Next.js throws a full-page
// runtime error ("missing param ... in generateStaticParams()") instead of
// navigating.
//
// This test parses both source files (no component rendering / router
// mocking needed) and asserts every `/inventory/<tab>` actionRoute the
// Action Center can produce resolves to a tab that actually exists.

describe('dashboard action center routes', () => {
  it('every /inventory/<tab> actionRoute points at a real inventory tab', () => {
    const actionCenterSource = fs.readFileSync(
      path.join(__dirname, '../components/dashboard/dashboard-action-center.tsx'),
      'utf-8',
    );
    const tabPageSource = fs.readFileSync(
      path.join(__dirname, '../app/(dashboard)/inventory/[tab]/page.tsx'),
      'utf-8',
    );

    const allowedTabsMatch = tabPageSource.match(/const allowedTabs = \[([^\]]*)\]/);
    expect(allowedTabsMatch).not.toBeNull();
    const allowedTabs = JSON.parse(
      `[${allowedTabsMatch![1]}]`.replace(/'/g, '"'),
    ) as string[];
    expect(allowedTabs.length).toBeGreaterThan(0);

    const routeMatches = [
      ...actionCenterSource.matchAll(/actionRoute:\s*"(\/inventory\/([a-z_]+))/g),
    ];
    expect(routeMatches.length).toBeGreaterThan(0);

    for (const match of routeMatches) {
      const [, fullPath, tab] = match;
      expect(allowedTabs, `${fullPath} references unknown inventory tab "${tab}"`).toContain(tab);
    }
  });

  // Same bug class, found in a second file while smoke-testing Inventory:
  // components/stock-batch/needs-attention.tsx's "View all" link
  // (rendered on the Inventory Overview tab) also hardcoded a
  // `router.push("/inventory/products")` call to the same dead route.
  // This component doesn't use the `actionRoute:` prop pattern the Action
  // Center does — it calls `router.push()` directly inline — so it needs
  // its own regex, but the same allowedTabs source of truth.
  it('every router.push("/inventory/<tab>") call in needs-attention.tsx points at a real inventory tab', () => {
    const needsAttentionSource = fs.readFileSync(
      path.join(__dirname, '../components/stock-batch/needs-attention.tsx'),
      'utf-8',
    );
    const tabPageSource = fs.readFileSync(
      path.join(__dirname, '../app/(dashboard)/inventory/[tab]/page.tsx'),
      'utf-8',
    );

    const allowedTabsMatch = tabPageSource.match(/const allowedTabs = \[([^\]]*)\]/);
    expect(allowedTabsMatch).not.toBeNull();
    const allowedTabs = JSON.parse(
      `[${allowedTabsMatch![1]}]`.replace(/'/g, '"'),
    ) as string[];
    expect(allowedTabs.length).toBeGreaterThan(0);

    const routeMatches = [
      ...needsAttentionSource.matchAll(/router\.push\(`?"?\/inventory\/([a-z_]+)/g),
    ];
    expect(routeMatches.length).toBeGreaterThan(0);

    for (const match of routeMatches) {
      const [fullMatch, tab] = match;
      expect(allowedTabs, `"${fullMatch}" references unknown inventory tab "${tab}"`).toContain(tab);
    }
  });
});
