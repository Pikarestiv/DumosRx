import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncHealthCard } from "@/components/admin/operations/sync-health-card";
import { StoreSyncHealthSection } from "@/components/admin/stores/details/store-sync-health-section";
import { LifecycleFiguresView } from "@/components/admin/subscriptions/lifecycle-figures";
import { WorklistTable } from "@/components/admin/subscriptions/worklist-table";
import { ActivityFeedList } from "@/components/admin/activity/activity-feed-list";

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

/**
 * Phase 1's rule, applied to the failure case rather than the empty one.
 *
 * Every one of these panels rendered its EMPTY state when its request
 * failed — "No refusals recorded", "Nothing needs attention here", a literal
 * 0 — because only `data` and `isLoading` were read and `error` was dropped.
 * Each of those is a confident factual claim about the platform, made on the
 * basis of a request that never answered.
 */
describe("admin panels distinguish a failed request from an empty result", () => {
  it("SyncHealthCard says unavailable rather than 'no refusals'", () => {
    render(<SyncHealthCard data={undefined} isLoading={false} isError />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/no refusals recorded/i)).toBeNull();
  });

  it("StoreSyncHealthSection says unavailable rather than 'never synced'", () => {
    render(<StoreSyncHealthSection data={undefined} isLoading={false} isError />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/never synced/i)).toBeNull();
  });

  it("LifecycleFiguresView says unavailable rather than showing zeroes", () => {
    render(<LifecycleFiguresView data={undefined} isError />);

    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/no trials started/i)).toBeNull();
  });

  it("WorklistTable says unavailable rather than 'nothing needs attention'", () => {
    render(
      <WorklistTable rows={[]} bucket="expiring" isLoading={false} isError canGrantTrials canNotify />,
    );

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/nothing needs attention/i)).toBeNull();
  });

  it("ActivityFeedList says unavailable rather than 'no activity'", () => {
    render(<ActivityFeedList events={[]} isLoading={false} isError />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/no activity/i)).toBeNull();
  });

  /** A genuine empty result must still read as empty, not as a failure. */
  it("still reports a genuine empty result as empty", () => {
    render(<WorklistTable rows={[]} bucket="expiring" isLoading={false} canGrantTrials canNotify />);

    expect(screen.getByText(/nothing needs attention/i)).toBeDefined();
  });
});
