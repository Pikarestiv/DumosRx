import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailsTab } from "@/components/admin/views/mails-tab";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ webApiClient: { request } }));
vi.mock("@/lib/store/use-admin-auth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/use-admin-auth-store")>()),
  useAdminAuthStore: () => ({ user: { role: "super_admin" } }),
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

const sends = () => request.mock.calls.filter(([path]) => path === "admin/mail/send");

describe("MailsTab audience and HTML mode", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation((path: string) => Promise.resolve(path.startsWith("admin/mail/recipient-count") ? { count: 42 } : { success: true }));
  });

  it("sends the message as HTML after the confirmation, to the default audience", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "New features");
    await user.click(screen.getByRole("switch", { name: /send as html/i }));
    await user.type(screen.getByLabelText("Message Body"), "<p>Hello</p>");
    await user.click(screen.getByRole("button", { name: /send email/i }));
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(sends()).toHaveLength(1));
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

    expect(sends()).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: /send now/i }));

    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0][1].data.is_html).toBe(false);
  });

  it("tells the admin how many people the confirmation will email", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "Hi");
    await user.type(screen.getByLabelText("Message Body"), "Plain");
    expect(await screen.findByText(/42 recipients/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /send email/i }));

    expect((await screen.findByRole("dialog")).textContent).toContain("42 recipients");
  });
});
