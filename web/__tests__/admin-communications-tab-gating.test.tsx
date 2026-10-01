import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CommunicationsPage from "@/app/admin/communications/page";

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as { role: string; effective_permissions?: string[] } | null,
  },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
  checkHasPermission: (
    user: { role?: string; effective_permissions?: string[] } | null | undefined,
    permission: string,
  ) => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    return (user.effective_permissions ?? []).includes(permission);
  },
}));

vi.mock("@/components/admin/views/broadcasts-tab", () => ({
  BroadcastsTab: () => <div>Broadcasts content</div>,
}));

vi.mock("@/components/admin/views/mails-tab", () => ({
  MailsTab: () => <div>Mails content</div>,
}));

vi.mock("@/components/admin/views/feedback-tab", () => ({
  FeedbackTab: () => <div>Feedback content</div>,
}));

describe("Communications page tab gating", () => {
  it("hides the super_admin-only Mail Campaigns and User Feedback tabs from a platform_admin/agent holding send_notifications", () => {
    authState.user = { role: "agent", effective_permissions: ["send_notifications"] };
    render(<CommunicationsPage />);

    expect(screen.getByText("In-App Broadcasts")).toBeInTheDocument();
    expect(screen.queryByText("Email Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("User Feedback")).not.toBeInTheDocument();
    expect(screen.queryByText("Mails content")).not.toBeInTheDocument();
    expect(screen.queryByText("Feedback content")).not.toBeInTheDocument();
  });

  it("shows every tab to a super_admin", () => {
    authState.user = { role: "super_admin", effective_permissions: [] };
    render(<CommunicationsPage />);

    expect(screen.getByText("In-App Broadcasts")).toBeInTheDocument();
    expect(screen.getByText("Email Campaigns")).toBeInTheDocument();
    expect(screen.getByText("User Feedback")).toBeInTheDocument();
  });
});
