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
});
