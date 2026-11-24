import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { getSettings, updateSettings, toastError, toastSuccess } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: { getStorefrontSettings: getSettings, updateStorefrontSettings: updateSettings },
}));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

import { StorefrontAppearance } from "@/components/settings/store/storefront-appearance";
import type { StorefrontEntitlements, StorefrontPresetId, StorefrontSettings } from "@/lib/types/storefront-settings";
import { LOCKED_STOREFRONT } from "@/lib/utils/storefront-entitlements";

const ALL_PRESETS: StorefrontPresetId[] = ["workshop", "clinic", "studio", "market", "boutique", "grove"];
const enterprise: StorefrontEntitlements = {
  ...LOCKED_STOREFRONT,
  storefront_enabled: true, allowed_presets: ALL_PRESETS, custom_accent_colour: true, checkout_paystack: true,
  remove_powered_by_badge: true, services_on_storefront: true, visitor_language_switch: true, owner_self_edit_look: true,
  rebuild_mode: "on_demand",
};
const pro: StorefrontEntitlements = {
  ...LOCKED_STOREFRONT,
  storefront_enabled: true, allowed_presets: ["workshop", "clinic", "market"], max_online_products: 300,
  checkout_transfer_mobile_money: true, checkout_pay_on_delivery: true, checkout_whatsapp: true,
};

const settingsWith = (overrides: Partial<StorefrontSettings> = {}): StorefrontSettings => ({
  allowed: true,
  theme: "emerald",
  available_themes: ALL_PRESETS,
  accent: null,
  tagline: null,
  whatsapp: null,
  pickup_minutes: null,
  opening_hours: null,
  locale: "en",
  enabled_locales: ["en"],
  available_locales: ["en", "fr"],
  store_type: "retail",
  entitlements: enterprise,
  checkout_warning: null,
  ...overrides,
});

function renderAppearance() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StorefrontAppearance />
    </QueryClientProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: "Save look & details" }) as HTMLButtonElement;

describe("StorefrontAppearance", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    getSettings.mockReset();
    updateSettings.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    getSettings.mockResolvedValue(settingsWith());
    updateSettings.mockResolvedValue(settingsWith());
  });

  it("shows the style the store resolves to: Workshop for retail, Clinic for a pharmacy still on a classic theme", async () => {
    renderAppearance();
    expect((await screen.findByRole("radio", { name: /Workshop/ })).getAttribute("aria-checked")).toBe("true");
  });

  it("says a style outside the owner's choices is the account manager's and selects none of the owner's styles", async () => {
    getSettings.mockResolvedValue(settingsWith({ theme: "boutique", available_themes: ["workshop", "clinic", "studio"] }));
    renderAppearance();

    expect(await screen.findByText(/uses the Boutique style, set by your account manager/)).toBeTruthy();
    for (const radio of screen.getAllByRole("radio")) expect(radio.getAttribute("aria-checked")).toBe("false");
  });

  it("selects Clinic for a pharmacy that has never chosen a preset", async () => {
    getSettings.mockResolvedValue(settingsWith({ store_type: "pharmacy" }));
    renderAppearance();

    expect((await screen.findByRole("radio", { name: /Clinic/ })).getAttribute("aria-checked")).toBe("true");
  });

  it("shows a store's saved choices", async () => {
    getSettings.mockResolvedValue(
      settingsWith({ theme: "studio", accent: "#7A4252", tagline: "Skin, ready.", whatsapp: "+237600000000", pickup_minutes: 30, locale: "fr", enabled_locales: ["fr", "en"] }),
    );
    renderAppearance();

    expect((await screen.findByRole("radio", { name: /Studio/ })).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Tagline") as HTMLInputElement).value).toBe("Skin, ready.");
    expect((screen.getByLabelText("Default language") as HTMLSelectElement).value).toBe("fr");
    expect((screen.getByLabelText("Let customers switch language") as HTMLInputElement).checked).toBe(true);
  });

  it("saves the owner's choices in one request", async () => {
    renderAppearance();
    fireEvent.click(await screen.findByRole("radio", { name: /Clinic/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use accent #0F6B58" }));
    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Care you can trust." } });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "+237 6 00 00 00 00" } });
    fireEvent.change(screen.getByLabelText("Pickup time (minutes)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("switch", { name: "Monday open" }));
    fireEvent.change(screen.getByLabelText("Default language"), { target: { value: "fr" } });
    fireEvent.click(screen.getByLabelText("Let customers switch language"));
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(updateSettings).toHaveBeenCalledWith({
      theme: "clinic",
      accent: "#0F6B58",
      tagline: "Care you can trust.",
      whatsapp: "+237 6 00 00 00 00",
      pickup_minutes: 20,
      opening_hours: { mon: { open: "08:00", close: "18:00" } },
      locale: "fr",
      enabled_locales: ["fr", "en"],
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("sends nulls for cleared fields so the defaults return", async () => {
    getSettings.mockResolvedValue(settingsWith({ accent: "#F2B705", tagline: "Old", whatsapp: "+237600000000", pickup_minutes: 30 }));
    renderAppearance();
    fireEvent.change(await screen.findByLabelText("Tagline"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Pickup time (minutes)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /use the style's colour/i }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ accent: null, tagline: null, whatsapp: null, pickup_minutes: null, opening_hours: null, enabled_locales: ["en"] }),
    );
  });

  it("warns about an unreadable accent but not a readable one", async () => {
    renderAppearance();
    const accent = await screen.findByLabelText("Accent colour");

    fireEvent.change(accent, { target: { value: "#7d7d7d" } });
    expect(screen.getByRole("alert").textContent).toMatch(/hard to read/i);
    fireEvent.change(accent, { target: { value: "" } });
    fireEvent.change(accent, { target: { value: "#F2B705" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["Accent colour", "red"],
    ["WhatsApp number", "call me"],
    ["Pickup time (minutes)", "0"],
  ])("will not save a bad %s", async (label, value) => {
    renderAppearance();
    fireEvent.change(await screen.findByLabelText(label), { target: { value } });

    expect(saveButton().disabled).toBe(true);
  });

  it("will not save hours that close before they open", async () => {
    getSettings.mockResolvedValue(settingsWith({ opening_hours: { mon: { open: "08:00", close: "18:00" } } }));
    renderAppearance();
    const closes = await screen.findByLabelText("Monday closes at");
    fireEvent.change(closes, { target: { value: "" } });
    fireEvent.change(closes, { target: { value: "07:00" } });

    expect(screen.getByText(/closing must be after opening/i)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("shows the styles, colour and language switch the plan leaves out as locked Enterprise features", async () => {
    getSettings.mockResolvedValue(settingsWith({
      available_themes: ["workshop", "clinic", "market"], locale: "fr", enabled_locales: ["fr", "en"],
      entitlements: { ...enterprise, custom_accent_colour: false, visitor_language_switch: false },
    }));
    renderAppearance();

    const studio = await screen.findByRole("radio", { name: /Studio/ });
    expect(studio.matches(":disabled")).toBe(true);
    expect(studio.textContent).toMatch(/Enterprise/);
    expect(screen.getByRole("radio", { name: /Market/ }).matches(":disabled")).toBe(false);
    expect(screen.getByLabelText("Accent colour").matches(":disabled")).toBe(true);
    expect((screen.getByLabelText(/Let customers switch language/) as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "Hi" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("accent");
    expect(updateSettings.mock.calls[0][0]).toMatchObject({ enabled_locales: ["fr"] });
  });

  it("shows a Pro owner what their plan includes and what Enterprise adds, with no controls", async () => {
    getSettings.mockResolvedValue({ allowed: false, entitlements: pro, checkout_warning: null });
    renderAppearance();

    expect(await screen.findByText(/upgrade to enterprise/i)).toBeTruthy();
    expect(screen.getByText(/Workshop, Clinic and Market/)).toBeTruthy();
    expect(screen.getAllByText("Enterprise").length).toBeGreaterThan(3);
    expect(screen.getByText(/Your own accent colour/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save look & details" })).toBeNull();
  });

  it("warns the owner when customers are left with no way to pay but online", async () => {
    getSettings.mockResolvedValue({ allowed: false, entitlements: pro, checkout_warning: "Add bank transfer instructions." });
    renderAppearance();

    expect((await screen.findByRole("alert")).textContent).toMatch(/Add bank transfer instructions/);
  });

  it("tells the owner what the server said when a save is refused", async () => {
    updateSettings.mockRejectedValue(new Error("Only the store owner can change the storefront's look."));
    renderAppearance();
    fireEvent.click(await screen.findByRole("radio", { name: /Studio/ }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Only the store owner can change the storefront's look."));
  });

  it("shows only a note to contact the account manager while the super admin has not allowed styling", async () => {
    getSettings.mockResolvedValue({ allowed: false, entitlements: enterprise, checkout_warning: null });
    renderAppearance();

    expect(await screen.findByText(/account manager can change them/i)).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save look & details" })).toBeNull();
  });

  it("falls back to the same note, not an error, when the settings cannot be loaded", async () => {
    getSettings.mockRejectedValue(new Error("offline"));
    renderAppearance();

    expect(await screen.findByText(/account manager can change them/i, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves a classic theme alone when the owner only changes a detail, so the look is not silently replaced", async () => {
    getSettings.mockResolvedValue(settingsWith({ theme: "emerald" }));
    renderAppearance();
    fireEvent.change(await screen.findByLabelText("WhatsApp number"), { target: { value: "+237 6 00 00 00 00" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("theme");
    expect(updateSettings.mock.calls[0][0]).toMatchObject({ whatsapp: "+237 6 00 00 00 00" });
  });
});
