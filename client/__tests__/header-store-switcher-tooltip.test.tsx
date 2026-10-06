import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { HeaderStoreSwitcher } from "@/components/dashboard/header-store-switcher";
import type { StoreProfile } from "@/lib/context/store-context";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canManageMultiStore: true,
    getUpgradeMessage: () => "",
  }),
}));

vi.mock("@/components/settings/store/fleet-form-dialog", () => ({
  FleetFormDialog: () => null,
}));

// Tooltip content only mounts on real hover via Radix's own timers; mocked
// here (matching the established pattern in assistant-launcher-plan-gate.
// test.tsx) so the test can assert on its content directly without
// simulating pointer events.
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const LONG_NAME = "Nest Pharmacy A2 and Store Extension Branch Agidi";

function makeStore(overrides: Partial<StoreProfile> = {}): StoreProfile {
  return { id: "s1", name: LONG_NAME, ...overrides } as StoreProfile;
}

/**
 * A-158 follow-up: the store name in the header is truncated
 * (`truncate max-w-[...]`) for both the plain non-admin label and the admin
 * switcher button, with nothing to reveal the full name once it's cut off.
 * Reported live by the user.
 */
describe("HeaderStoreSwitcher tooltip", () => {
  it("shows the full store name in a tooltip for the admin switcher button", () => {
    render(
      <HeaderStoreSwitcher
        storeProfile={makeStore()}
        availableStores={[makeStore()]}
        activeStoreId="s1"
        onSwitchStore={vi.fn()}
        isAdmin={true}
      />,
    );
    // One copy in the visible (CSS-truncated) trigger label, one inside the
    // mocked TooltipContent - without a tooltip there'd only be one.
    const matches = screen.getAllByText(LONG_NAME);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("shows the full store name in a tooltip for the non-admin plain label", () => {
    render(
      <HeaderStoreSwitcher
        storeProfile={makeStore()}
        availableStores={[]}
        activeStoreId="s1"
        onSwitchStore={vi.fn()}
        isAdmin={false}
      />,
    );
    const matches = screen.getAllByText(LONG_NAME);
    // Without a tooltip, the truncated label itself already renders the
    // full text node (CSS-only truncation) - the real assertion is that a
    // second copy exists inside the mocked TooltipContent.
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
