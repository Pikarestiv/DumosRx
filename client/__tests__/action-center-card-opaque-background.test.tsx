import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { UserPlus } from "lucide-react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-action-center-alerts", () => ({
  useActionCenterAlerts: () => [
    {
      id: "no-staff",
      title: "No Staff Accounts",
      description: "Create staff PINs for POS access.",
      icon: UserPlus,
      priority: "critical",
      actionLabel: "Create Staff",
      actionRoute: "/settings/staff",
    },
  ],
}));

// A-158: ActionCenterCard passed its priority tint (e.g.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-action-center-card-opaque-background-test-tsx-L24
describe("ActionCenterCard background", () => {
  it("keeps the Card's opaque bg-card base alongside its priority tint", async () => {
    const { DashboardActionCenter } = await import(
      "@/components/dashboard/dashboard-action-center"
    );
    const { container } = render(
      <DashboardActionCenter
        expiringCount={0}
        lowStockCount={0}
        missingExpiryCount={0}
        oversoldCount={0}
      />,
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toMatch(/\bbg-card\b/);
  });
});
