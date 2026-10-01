import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailsTab } from "@/components/admin/views/mails-tab";
import { FeedbackTab } from "@/components/admin/views/feedback-tab";

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as { role: string } | null,
  },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: () => false,
}));

vi.mock("@/lib/api/admin-hooks", () => ({
  useAdminUsers: () => ({ data: { data: [], meta: { total: 0, last_page: 1 } } }),
  useAdminFeedback: () => ({ data: { data: [], meta: { total: 0, last_page: 1 } }, isLoading: false }),
  useUpdateFeedbackStatusMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderWithQuery = (ui: React.ReactElement) => {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

/**
 * A-135: MailsTab and FeedbackTab previously had no permission check of
 * their own — their only protection was whatever wrapper their parent page
 * happened to render them behind. They must render nothing for a caller who
 * isn't super_admin, independent of their caller.
 */
describe("MailsTab and FeedbackTab self-contained guard", () => {
  it("MailsTab renders nothing for a non-super_admin", () => {
    authState.user = { role: "agent" };
    const { container } = renderWithQuery(<MailsTab />);
    expect(container).toBeEmptyDOMElement();
  });

  it("MailsTab renders for a super_admin", () => {
    authState.user = { role: "super_admin" };
    renderWithQuery(<MailsTab />);
    expect(screen.getByText("Send Email Campaign")).toBeInTheDocument();
  });

  it("FeedbackTab renders nothing for a non-super_admin", () => {
    authState.user = { role: "agent" };
    const { container } = renderWithQuery(<FeedbackTab />);
    expect(container).toBeEmptyDOMElement();
  });

  it("FeedbackTab renders for a super_admin", () => {
    authState.user = { role: "super_admin" };
    renderWithQuery(<FeedbackTab />);
    expect(screen.getByText("User Feedback")).toBeInTheDocument();
  });
});
