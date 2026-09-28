import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs } from "@/components/ui/tabs";

/**
 * "view_suppliers" is the read third of the supplier split: it decides
 * whether the Vendors tab exists at all. Hiding the trigger alone is not a
 * gate here - /procurement/vendors is directly reachable - so the route
 * itself carries the same key via RequireRole's `permission` prop (see
 * require-role-permission.test.tsx).
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

import { ProcurementTabNav } from "@/components/procurement/procurement-tab-nav";

function renderNav() {
  render(
    <Tabs value="orders">
      <ProcurementTabNav />
    </Tabs>,
  );
}

describe("Procurement tab nav supplier visibility", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the view_suppliers key", () => {
    renderNav();
    expect(hasPermission).toHaveBeenCalledWith("view_suppliers");
  });

  it("shows the Vendors tab with view_suppliers", () => {
    renderNav();
    expect(screen.queryByText("Vendors")).not.toBeNull();
  });

  it("hides the Vendors tab without view_suppliers, keeping the others", () => {
    hasPermission.mockImplementation((key: string) => key !== "view_suppliers");
    renderNav();
    expect(screen.queryByText("Vendors")).toBeNull();
    expect(screen.queryAllByText(/Orders/).length).toBeGreaterThan(0);
  });
});
