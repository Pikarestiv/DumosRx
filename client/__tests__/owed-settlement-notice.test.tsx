import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  owed: [] as { productId: string; productName: string; outstanding: number }[],
  canSee: true,
}));

vi.mock("@/lib/hooks/use-outstanding-backorders", () => ({ useOutstandingBackorders: () => state.owed }));
vi.mock("@/lib/hooks/use-stock-visibility", () => ({ useStockVisibility: () => ({ canSeeQuantities: state.canSee }) }));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({ useDisplayName: () => (v: string) => v }));

import { OwedSettlementNotice } from "@/components/procurement/owed-settlement-notice";

describe("OwedSettlementNotice", () => {
  it("says how much of the delivery pays off earlier sales and that their profit changes", () => {
    state.owed = [{ productId: "p1", productName: "Cement", outstanding: 5 }];
    render(<OwedSettlementNotice lines={[{ productId: "p1", baseUnits: 20 }]} />);

    expect(screen.getByText(/5 already sold before this delivery\. 15 will go on the shelf\./)).toBeTruthy();
    expect(screen.getByText(/profit already reported for the days they were\s+sold will change/)).toBeTruthy();
  });

  it("renders nothing when nothing is owed on the products being received", () => {
    state.owed = [{ productId: "p2", productName: "Rods", outstanding: 3 }];
    const { container } = render(<OwedSettlementNotice lines={[{ productId: "p1", baseUnits: 20 }]} />);
    expect(container.textContent).toBe("");
  });
});
