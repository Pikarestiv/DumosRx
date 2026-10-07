import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { searchParams } = vi.hoisted(() => ({ searchParams: { value: new URLSearchParams() } }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
  usePathname: () => "/admin/activity",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock("@/components/admin/activity/admin-actions-view", () => ({
  AdminActionsView: () => <div data-testid="admin-actions-view" />,
}));

vi.mock("@/components/admin/activity/activity-feed-panel", () => ({
  ActivityFeedPanel: () => <div data-testid="activity-feed-panel" />,
}));

const { default: ActivityPage } = await import("@/app/admin/activity/page");

/**
 * Regression. Adding the Feed tab put AdminActionsView inside a Radix
 * TabsContent, which unmounts the inactive tab — so the only component that
 * reads `?store_id=` was not mounted when the deep link landed. The Store
 * Details "Activity Log" row action therefore dropped its filter silently.
 */
describe("Activity page deep link", () => {
  beforeEach(() => {
    searchParams.value = new URLSearchParams();
  });

  it("opens the Feed tab by default", () => {
    render(<ActivityPage />);

    expect(screen.getByTestId("activity-feed-panel")).toBeDefined();
  });

  it("opens the Admin actions tab when a store filter was requested", () => {
    searchParams.value = new URLSearchParams("store_id=abc&store_name=Ikeja");

    render(<ActivityPage />);

    expect(screen.getByTestId("admin-actions-view")).toBeDefined();
  });

  it("opens the Admin actions tab for a user deep link too", () => {
    searchParams.value = new URLSearchParams("user_id=u1");

    render(<ActivityPage />);

    expect(screen.getByTestId("admin-actions-view")).toBeDefined();
  });
});
