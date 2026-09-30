import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT_ROOT = resolve(__dirname, "..");

const NAV_CHROME_QUERY = "(min-width: 1024px)";

const TABLE_LAYOUT_COMPONENTS = [
  "components/stock-batch/stock-adjustments-ledger.tsx",
  "components/stock-batch/stock-movements.tsx",
  "components/stock-batch/supplier-table.tsx",
  "components/expenses/expense-list.tsx",
  "components/customers/activity-tab.tsx",
  "components/procurement/purchase-order-table.tsx",
];

function read(relativePath: string): string {
  return readFileSync(resolve(CLIENT_ROOT, relativePath), "utf8");
}

describe("responsive table breakpoint convention", () => {
  it("keeps MobileBottomNav on the lg breakpoint the convention is defined by", () => {
    expect(read("components/dashboard/mobile-bottom-nav.tsx")).toContain("lg:hidden");
  });

  it.each(TABLE_LAYOUT_COMPONENTS)(
    "%s switches to its desktop table at the nav chrome breakpoint",
    (relativePath) => {
      const source = read(relativePath);
      const queries = [...source.matchAll(/\(min-width:\s*\d+px\)/g)].map((m) => m[0]);

      expect(queries.length).toBeGreaterThan(0);
      for (const query of queries) {
        expect(query.replace(/\s+/g, " ")).toBe(NAV_CHROME_QUERY);
      }
    },
  );
});
