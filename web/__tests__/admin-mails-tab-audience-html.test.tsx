import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailsTab } from "@/components/admin/views/mails-tab";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ webApiClient: { request } }));
vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: { role: "super_admin" } }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
}));
vi.mock("@/lib/api/admin-hooks", () => ({
  useAdminUsers: () => ({ data: { data: [], meta: { total: 0, last_page: 1 } }, isLoading: false }),
}));

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <MailsTab />
    </QueryClientProvider>,
  );

describe("MailsTab audience and HTML mode", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ success: true });
  });

  it("sends the message as HTML after the confirmation, to the default audience", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "New features");
    await user.click(screen.getByRole("switch", { name: /send as html/i }));
    await user.type(screen.getByLabelText("Message Body"), "<p>Hello</p>");
    await user.click(screen.getByRole("button", { name: /send email/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith("admin/mail/send", {
      method: "POST",
      data: expect.objectContaining({
        subject: "New features",
        message: "<p>Hello</p>",
        target_type: "all",
        is_html: true,
      }),
    });
  });

  it("sends plain text by default and never before the confirmation", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "Hi");
    await user.type(screen.getByLabelText("Message Body"), "Plain");
    await user.click(screen.getByRole("button", { name: /send email/i }));

    expect(request).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][1].data.is_html).toBe(false);
  });
});
