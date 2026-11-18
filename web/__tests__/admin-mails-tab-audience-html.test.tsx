import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailsTab } from "@/components/admin/views/mails-tab";
import { Toaster } from "sonner";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ webApiClient: { request } }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.hasPointerCapture = () => false;
Element.prototype.scrollIntoView = () => undefined;

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <MailsTab />
      <Toaster />
    </QueryClientProvider>,
  );

const sends = () => request.mock.calls.filter(([path]) => path === "admin/mail/send");

describe("MailsTab audience and HTML mode", () => {
  beforeEach(() => {
    useAdminAuthStore.setState({
      user: { id: "a1", first_name: "Ada", last_name: "Min", email: "admin@dumosrx.com", role: "super_admin" },
    });
    request.mockReset();
    request.mockImplementation((path: string) => {
      if (path.startsWith("admin/mail/recipient-count")) return Promise.resolve({ count: 42 });
      if (path.startsWith("admin/users")) {
        const admins = path.includes("account_type=platform");
        return Promise.resolve({
          data: admins
            ? [{ id: "u-admin", name: "Ada Admin", email: "ada@dumosrx.com", role: "platform_admin" }]
            : [{ id: "u-owner", name: "Olu Owner", email: "olu@shop.test", role: "store_owner" }],
          meta: { total: 1, last_page: 1 },
        });
      }
      if (path === "admin/mail/preview") return Promise.resolve({ data: { subject: "x", html: "<p>RENDERED BY SERVER</p>" } });
      return Promise.resolve({ success: true });
    });
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

  it("previews the email the server renders, with the HTML flag, before anything is sent", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "News");
    await user.click(screen.getByRole("switch", { name: /send as html/i }));
    await user.type(screen.getByLabelText("Message Body"), "<p>Hi</p>");
    await user.click(screen.getByRole("button", { name: /preview email/i }));

    await waitFor(() => expect(document.querySelector("iframe")?.getAttribute("srcdoc")).toBe("<p>RENDERED BY SERVER</p>"));
    expect(request).toHaveBeenCalledWith("admin/mail/preview", {
      method: "POST",
      data: { subject: "News", message: "<p>Hi</p>", is_html: true },
    });
    expect(sends()).toHaveLength(0);
  });

  it("sends a test of the campaign to the typed address only", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "News");
    await user.type(screen.getByLabelText("Message Body"), "Plain");
    await user.clear(screen.getByPlaceholderText("you@dumosrx.com"));
    await user.type(screen.getByPlaceholderText("you@dumosrx.com"), "me@example.com");
    await user.click(screen.getByRole("button", { name: /send test/i }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("admin/mail/test", {
        method: "POST",
        data: { subject: "News", message: "Plain", is_html: false, email: "me@example.com" },
      }),
    );
    expect(sends()).toHaveLength(0);
  });

  const chooseCustomAudience = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /custom email addresses/i }));
  };

  it("sends the campaign to typed addresses, without a recipient confirmation", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "Hello");
    await user.type(screen.getByLabelText("Message Body"), "Body");
    await chooseCustomAudience(user);
    await user.type(await screen.findByLabelText("Email addresses"), "a@example.com, b@example.org\nc@example.net");
    await user.click(screen.getByRole("button", { name: /send email/i }));

    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(sends()[0][1].data).toEqual(
      expect.objectContaining({ target_type: "custom", emails: ["a@example.com", "b@example.org", "c@example.net"] }),
    );
  });

  it("refuses to send to a malformed address and names it", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "Hello");
    await user.type(screen.getByLabelText("Message Body"), "Body");
    await chooseCustomAudience(user);
    await user.type(await screen.findByLabelText("Email addresses"), "good@example.com bad-address");
    await user.click(screen.getByRole("button", { name: /send email/i }));

    expect(await screen.findByText(/not a valid email address: bad-address/i)).toBeTruthy();
    expect(sends()).toHaveLength(0);
  });

  it("lets the picker narrow to admins and sends to the one picked", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByLabelText("Email Subject"), "Hello");
    await user.type(screen.getByLabelText("Message Body"), "Body");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /specific users/i }));
    await user.click(await screen.findByText("Select users..."));
    expect(await screen.findByText("Olu Owner")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Admins" }));
    await user.click(await screen.findByText("Ada Admin"));
    await user.click(screen.getByRole("button", { name: /send email/i }));

    await waitFor(() => expect(sends()).toHaveLength(1));
    expect(request).toHaveBeenCalledWith(expect.stringContaining("account_type=platform"));
    expect(sends()[0][1].data).toEqual(expect.objectContaining({ target_type: "specific", user_ids: ["u-admin"] }));
  });
});
