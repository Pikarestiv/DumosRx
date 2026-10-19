import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeedbackTab } from "@/components/admin/views/feedback-tab";
import type { FeedbackItem } from "@/lib/types/admin";

const { feedback } = vi.hoisted(() => ({ feedback: { items: [] as FeedbackItem[] } }));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: { role: "super_admin" } }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: () => true,
}));

vi.mock("@/lib/api/admin-hooks", () => ({
  useAdminFeedback: () => ({
    data: { data: feedback.items, meta: { total: feedback.items.length, last_page: 1 } },
    isLoading: false,
  }),
  useUpdateFeedbackStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

function item(occurrence_count: number | null): FeedbackItem {
  return {
    id: `crash-${occurrence_count}`,
    type: "bug",
    status: "pending",
    content: "Sync pull failed",
    created_at: "2026-10-19T10:00:00Z",
    occurrence_count,
  };
}

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeedbackTab />
    </QueryClientProvider>,
  );

/**
 * A Sentry event count is a throttled sample; `feedback.occurrence_count` is
 * the real one. The card the operations card points at has to show it.
 */
describe("FeedbackTab occurrence count", () => {
  it("shows the true occurrence count for a repeated crash", () => {
    feedback.items = [item(2896)];
    renderTab();

    expect(screen.getByText(/2,?896 occurrences/)).toBeInTheDocument();
  });

  it("shows nothing extra for a one-off", () => {
    feedback.items = [item(1)];
    renderTab();

    expect(screen.queryByText(/occurrence/i)).not.toBeInTheDocument();
  });
});
