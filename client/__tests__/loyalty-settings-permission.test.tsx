import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);
let canManageStockBatch = true;

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { role: "manager" }, canManageStockBatch }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  useQuery: () => ({ data: [] }),
}));

vi.mock("@/lib/db/queries/loyalty", () => ({
  getLoyaltyRedemptionOptions: vi.fn(),
}));

vi.mock("@/components/customers/loyalty-settings-dialog", () => ({
  LoyaltySettingsDialog: () => null,
}));

import { LoyaltyTab } from "@/components/customers/loyalty-tab";

const tiers = [
  {
    name: "Bronze",
    minSpent: 0,
    pointsMultiplier: 1,
    benefits: ["Basic rewards"],
    color: "bg-amber-600",
  },
];

/**
 * "manage_loyalty" is about configuring the PROGRAM - tiers, earn rate and
 * redemption options - which is a different act from a cashier spending a
 * customer's earned points at the till (pos-redeem-reward.tsx, deliberately
 * independent of any staff-concession key).
 */
describe("loyalty settings permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
    canManageStockBatch = true;
  });

  it("shows Edit Settings with manage_loyalty", () => {
    render(<LoyaltyTab tiers={tiers} currencyCode="NGN" />);
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
  });

  it("hides Edit Settings without manage_loyalty, leaving the tiers readable", () => {
    hasPermission.mockImplementation((key: string) => key !== "manage_loyalty");
    render(<LoyaltyTab tiers={tiers} currencyCode="NGN" />);
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.getByText("Bronze")).toBeTruthy();
    expect(screen.getByText("Loyalty Tiers Configuration")).toBeTruthy();
  });

  it("still requires the coarse canManageStockBatch baseline underneath", () => {
    canManageStockBatch = false;
    render(<LoyaltyTab tiers={tiers} currencyCode="NGN" />);
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
  });

  it("checks the manage_loyalty key specifically", () => {
    render(<LoyaltyTab tiers={tiers} currencyCode="NGN" />);
    expect(hasPermission).toHaveBeenCalledWith("manage_loyalty");
  });
});
