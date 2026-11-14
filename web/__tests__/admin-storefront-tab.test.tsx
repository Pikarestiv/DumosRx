import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { StoreStorefrontTab } from "@/components/admin/stores/details/store-storefront-tab";
import { WEB_APP_URL } from "@/lib/constants";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ webApiClient: { request } }));
vi.mock("next/font/local", () => ({ default: ({ variable }: { variable: string }) => ({ variable }) }));

const ALL_THEMES = ["emerald", "forest", "navy", "rose", "amber", "slate", "violet", "workshop", "clinic", "studio"];

const storeWith = (storefront: Partial<AdminStoreDetail["storefront"]> = {}) =>
  ({
    id: "store-1",
    name: "Corner Hardware",
    store_type: "retail",
    storefront: {
      online_store_enabled: true,
      store_slug: "corner",
      pending_rebuild: false,
      dirty_since: null,
      theme: "emerald",
      available_themes: ALL_THEMES,
      ...storefront,
    },
  }) as unknown as AdminStoreDetail;

const signInAs = (role: string) =>
  useAdminAuthStore.setState({ user: { id: "u1", email: "a@dumosrx.com", first_name: "A", last_name: "B", role } });

function renderTab(store: AdminStoreDetail) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <StoreStorefrontTab store={store} />
    </QueryClientProvider>,
  );
}

const settingsCall = () => request.mock.calls.find(([url]) => String(url).endsWith("/storefront/settings"));

describe("StoreStorefrontTab", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    request.mockReset();
    request.mockResolvedValue({ message: "ok" });
    signInAs("super_admin");
  });

  it("holds the storefront card with its publish switch and slug", () => {
    renderTab(storeWith());

    expect(screen.getByRole("heading", { name: "Online Storefront" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: /unpublish storefront/i })).toBeTruthy();
    expect(screen.getByText("corner")).toBeTruthy();
  });

  it("lets a super admin pick a style preset, with a preview of each using the store's name", async () => {
    renderTab(storeWith());

    expect(screen.getAllByText("Corner Hardware").length).toBeGreaterThanOrEqual(3);
    await userEvent.click(screen.getByRole("button", { name: "Studio style" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("admin/stores/store-1/storefront/theme", { method: "PUT", body: { theme: "studio" } }),
    );
  });

  it("explains which preset a classic accent theme renders on, until a preset is chosen", () => {
    renderTab(storeWith({ theme: "navy" }));

    expect(screen.getByText(/still uses the classic Navy accent theme/i).textContent).toContain("Workshop");
    expect(screen.queryByText("Selected")).toBeNull();
  });

  it("marks the chosen preset as selected and does not resend it", async () => {
    renderTab(storeWith({ theme: "clinic" }));

    const clinic = screen.getByRole("button", { name: "Clinic style" });
    expect(clinic.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(clinic);

    expect(request).not.toHaveBeenCalled();
  });

  it("shows a platform admin the styles but gives them no way to change or rebuild", () => {
    signInAs("platform_admin");
    renderTab(storeWith({ theme: "clinic" }));

    expect((screen.getByRole("button", { name: "Studio style" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save storefront settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: /rebuild storefronts now/i })).toBeNull();
    expect((screen.getByLabelText("Tagline") as HTMLInputElement).disabled).toBe(true);
  });

  it("saves the accent, tagline, WhatsApp, pickup time and opening hours in one request", async () => {
    renderTab(storeWith());

    await userEvent.click(screen.getByRole("button", { name: "Use accent #0F6B58" }));
    await userEvent.type(screen.getByLabelText("Tagline"), "Wiring and lighting, ready at the counter.");
    await userEvent.type(screen.getByLabelText("WhatsApp number"), "+237 6 00 00 00 00");
    await userEvent.type(screen.getByLabelText("Pickup time (minutes)"), "20");
    await userEvent.click(screen.getByRole("switch", { name: "Monday open" }));
    await userEvent.click(screen.getByRole("button", { name: "Save storefront settings" }));

    await waitFor(() => expect(settingsCall()).toBeTruthy());
    expect(settingsCall()).toEqual([
      "admin/stores/store-1/storefront/settings",
      {
        method: "PUT",
        body: {
          accent: "#0F6B58",
          tagline: "Wiring and lighting, ready at the counter.",
          whatsapp: "+237 6 00 00 00 00",
          pickup_minutes: 20,
          opening_hours: { mon: { open: "08:00", close: "18:00" } },
        },
      },
    ]);
  });

  it("sends nulls for fields the owner has cleared, so the defaults return", async () => {
    renderTab(storeWith({ accent: "#F2B705", tagline: "Old", whatsapp: "+237600000000", pickup_minutes: 30 }));

    await userEvent.clear(screen.getByLabelText("Tagline"));
    await userEvent.clear(screen.getByLabelText("WhatsApp number"));
    await userEvent.clear(screen.getByLabelText("Pickup time (minutes)"));
    await userEvent.click(screen.getByRole("button", { name: /use the preset's colour/i }));
    await userEvent.click(screen.getByRole("button", { name: "Save storefront settings" }));

    await waitFor(() => expect(settingsCall()).toBeTruthy());
    expect(settingsCall()?.[1].body).toEqual({ accent: null, tagline: null, whatsapp: null, pickup_minutes: null, opening_hours: null });
  });

  it("warns when neither white nor dark text is readable on the accent, but not for a readable one", async () => {
    renderTab(storeWith());
    const accent = screen.getByLabelText("Accent colour");

    await userEvent.type(accent, "#7d7d7d");
    expect(screen.getByRole("alert").textContent).toMatch(/hard to read/i);

    await userEvent.clear(accent);
    await userEvent.type(accent, "#F2B705");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["Accent colour", "red", /six-digit hex/i],
    ["WhatsApp number", "call me", /digits, spaces/i],
    ["Pickup time (minutes)", "0", /whole number/i],
  ])("refuses to save a bad %s", async (label, value, message) => {
    renderTab(storeWith());

    await userEvent.type(screen.getByLabelText(label), value);

    expect(screen.getByText(message)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save storefront settings" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses hours that close before they open", async () => {
    renderTab(storeWith({ opening_hours: { mon: { open: "08:00", close: "18:00" } } }));

    const closes = screen.getByLabelText("Monday closes at");
    await userEvent.clear(closes);
    await userEvent.type(closes, "07:00");

    expect(screen.getByText(/closing must be after opening/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save storefront settings" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("rebuilds every storefront only after the admin confirms", async () => {
    renderTab(storeWith({ pending_rebuild: true }));

    await userEvent.click(screen.getByRole("button", { name: /rebuild storefronts now/i }));
    expect(request).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rebuild now" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("admin/storefront/rebuild", { method: "POST" }));
  });

  it("says when changes are saved but not yet live, and when the page is up to date", () => {
    const pending = renderTab(storeWith({ pending_rebuild: true }));
    expect(screen.getByText(/saved but not live/i)).toBeTruthy();
    pending.unmount();

    renderTab(storeWith({ pending_rebuild: false }));
    expect(screen.getByText(/up to date/i)).toBeTruthy();
  });

  it("links to the live storefront only while it is published", () => {
    const published = renderTab(storeWith());
    expect(screen.getByRole("link", { name: /preview storefront/i }).getAttribute("href")).toBe(`${WEB_APP_URL}/store/corner`);
    published.unmount();

    renderTab(storeWith({ online_store_enabled: false }));
    expect(screen.queryByRole("link", { name: /preview storefront/i })).toBeNull();
  });
});
