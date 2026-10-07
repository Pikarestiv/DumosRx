import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeedFilters } from "@/components/admin/activity/activity-feed-filters";
import { ActivityFeedList } from "@/components/admin/activity/activity-feed-list";
import type { ActivityFeedEvent } from "@/lib/types/admin";

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const events: ActivityFeedEvent[] = [
  {
    id: "payment:1",
    type: "payment",
    at: "2026-10-07T09:30:00Z",
    title: "Payment success",
    detail: "NGN 25,000.00 via paystack",
    store_id: null,
    derived: false,
  },
  {
    id: "subscription_started:1",
    type: "subscription",
    at: "2026-10-06T08:00:00Z",
    title: "Subscription started",
    detail: "Premium",
    store_id: null,
    derived: true,
  },
];

describe("ActivityFeedFilters", () => {
  it("renders a quick filter for every available type, plus All", () => {
    render(
      <ActivityFeedFilters
        available={["admin_action", "sync_failure", "subscription", "payment"]}
        active={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /^all$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /admin actions/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /sync failures/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /subscriptions/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /payments/i })).toBeDefined();
  });

  /**
   * The server decides which sources a caller may read, so a filter the caller
   * cannot use must not be rendered at all — a button that always returns a
   * refusal is worse than an absent one.
   */
  it("omits a filter the caller is not allowed to use", () => {
    render(
      <ActivityFeedFilters
        available={["admin_action", "sync_failure", "subscription"]}
        active={null}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /payments/i })).toBeNull();
    expect(screen.getByRole("button", { name: /admin actions/i })).toBeDefined();
  });
});

describe("ActivityFeedList", () => {
  it("renders each event with its title and detail", () => {
    render(<ActivityFeedList events={events} isLoading={false} />);

    expect(screen.getByText("Payment success")).toBeDefined();
    expect(screen.getByText(/NGN 25,000.00/)).toBeDefined();
  });

  /** §6: DD/MM/YYYY, never the US order. */
  it("renders timestamps in DD/MM/YYYY", () => {
    render(<ActivityFeedList events={events} isLoading={false} />);

    expect(screen.getByText(/07\/10\/2026/)).toBeDefined();
  });

  /**
   * There is no subscription event table; these are derived from start_date
   * and end_date. Saying so is the difference between a record and an
   * inference presented as one.
   */
  it("marks a derived event as derived", () => {
    render(<ActivityFeedList events={events} isLoading={false} />);

    expect(screen.getByText(/derived/i)).toBeDefined();
  });

  it("says nothing happened rather than rendering an empty list", () => {
    render(<ActivityFeedList events={[]} isLoading={false} />);

    expect(screen.getByText(/no activity/i)).toBeDefined();
  });
});
