import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LifecycleFiguresView } from "@/components/admin/subscriptions/lifecycle-figures";
import { WorklistTable } from "@/components/admin/subscriptions/worklist-table";
import type { AdminSubscriptionFigures, SubscriptionWorklistRow } from "@/lib/types/admin";

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

const figures: AdminSubscriptionFigures = {
  trials_started: 10,
  trial_conversion_rate: "40%",
  lapsed_in_period: 2,
  recovered_in_period: 1,
  payment_mix: { success: 12, failed: 3, abandoned: 1, pending: 2 },
  bucket_counts: { expiring: 4, trials: 2, lapsed: 2, payments: 4 },
};

const row: SubscriptionWorklistRow = {
  user_id: "u1",
  owner_name: "Ada Okonkwo",
  email: "ada@example.com",
  store_id: "s1",
  store_name: "Ikeja Branch",
  plan: "Premium",
  is_trial: false,
  end_date: "2026-10-07",
};

describe("LifecycleFiguresView", () => {
  it("shows the conversion rate when there is one", () => {
    render(<LifecycleFiguresView data={figures} />);

    expect(screen.getByText("40%")).toBeDefined();
  });

  /** Phase 1's rule: an empty denominator is unavailable, not 0%. */
  it("reports an unavailable conversion rate rather than zero", () => {
    render(
      <LifecycleFiguresView
        data={{ ...figures, trial_conversion_rate: null, trials_started: 0 }}
      />,
    );

    expect(screen.getByText(/no trials started/i)).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("does not crash when the payload is missing entirely", () => {
    render(<LifecycleFiguresView data={undefined} />);

    expect(screen.getByText(/no trials started/i)).toBeDefined();
  });
});

describe("WorklistTable", () => {
  it("says nothing needs attention rather than rendering an empty table", () => {
    render(
      <WorklistTable rows={[]} bucket="expiring" isLoading={false} canGrantTrials canNotify />,
    );

    expect(screen.getByText(/nothing needs attention/i)).toBeDefined();
  });

  /** web/AGENTS.md: a missing permission HIDES the control, never disables it. */
  it("hides the grant-trial action from a caller without the permission", () => {
    render(
      <WorklistTable
        rows={[row]}
        bucket="expiring"
        isLoading={false}
        canGrantTrials={false}
        canNotify
      />,
    );

    expect(screen.queryByRole("button", { name: /grant trial/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /activate plan/i })).toBeNull();
    expect(screen.getByRole("button", { name: /notify/i })).toBeDefined();
  });

  it("hides the notify action from a caller without that permission", () => {
    render(
      <WorklistTable
        rows={[row]}
        bucket="expiring"
        isLoading={false}
        canGrantTrials
        canNotify={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /notify/i })).toBeNull();
    expect(screen.getByRole("button", { name: /grant trial/i })).toBeDefined();
  });

  /** §6, and Phase 2's finding that a bare YYYY-MM-DD shifts a day west of UTC. */
  it("renders a date-only end date in DD/MM/YYYY without shifting it", () => {
    render(
      <WorklistTable rows={[row]} bucket="expiring" isLoading={false} canGrantTrials canNotify />,
    );

    expect(screen.getByText("07/10/2026")).toBeDefined();
  });

  it("shows attempt counts on the payments bucket", () => {
    render(
      <WorklistTable
        rows={[{ ...row, attempts: 3, last_attempt_at: "2026-10-07T09:00:00Z", amount: 10000, currency: "NGN" }]}
        bucket="payments"
        isLoading={false}
        canGrantTrials
        canNotify
      />,
    );

    expect(screen.getByText(/3 attempts/i)).toBeDefined();
  });
});
