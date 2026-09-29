import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

import { Tabs } from "@/components/ui/tabs";
import { POSMainTabNav } from "@/components/pos/pos-main-tab-nav";

function renderNav() {
  render(
    <Tabs value="products">
      <POSMainTabNav />
    </Tabs>,
  );
}

/**
 * "view_sales_history" answers "does the Recent Sales tab exist for this
 * role at all", which is a different question from "whose sales show up in
 * it" - that one is already answered by "view_activity_log"
 * (pos-transaction-history.tsx scopes getRecentSales to the acting user
 * without it). The two compose: no history key means no tab; the tab plus
 * no activity-log key means own sales only.
 */
describe("POS Recent Sales tab permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("shows the Recent Sales tab to a user with view_sales_history", () => {
    renderNav();
    expect(screen.getByRole("tab", { name: "Recent Sales" })).toBeTruthy();
  });

  it("hides the Recent Sales tab from a user without view_sales_history", () => {
    hasPermission.mockImplementation(
      (key: string) => key !== "view_sales_history",
    );
    renderNav();
    expect(screen.queryByRole("tab", { name: "Recent Sales" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Products" })).toBeTruthy();
  });

  it("checks the view_sales_history key specifically", () => {
    renderNav();
    expect(hasPermission).toHaveBeenCalledWith("view_sales_history");
  });
});
