import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { StorefrontEntitlements } from "@/lib/types/storefront-settings";
import { LOCKED_STOREFRONT } from "@/lib/utils/storefront-entitlements";

const { gate, getSettings, optInStorefront, toastError } = vi.hoisted(() => ({
  gate: { entitlements: null as unknown as StorefrontEntitlements },
  getSettings: vi.fn(),
  optInStorefront: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));
vi.mock("@/lib/constants", () => ({ STOREFRONT_BASE_URL: "https://shop.example" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock("@/lib/api/client", () => ({ apiClient: { getStorefrontSettings: getSettings, optInStorefront } }));
vi.mock("@/components/settings/store/storefront-appearance", () => ({ StorefrontAppearance: () => <div>storefront-appearance</div> }));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ storefrontEntitlements: gate.entitlements, currentTier: "starter", getUpgradeMessage: (_: string, fallback: string) => fallback }),
}));

import { OnlineStorefrontCard } from "@/components/settings/store/online-storefront-card";
import { StorefrontPlanFeatures } from "@/components/settings/store/storefront-plan-features";
import { useSystemConfigStore } from "@/lib/store/system-config-store";

const starter: StorefrontEntitlements = {
  ...LOCKED_STOREFRONT,
  storefront_enabled: true, allowed_presets: ["clinic"], max_online_products: 50,
  checkout_whatsapp: true, checkout_pay_on_delivery: true, owner_opt_in_required: true,
};
const pro: StorefrontEntitlements = {
  ...LOCKED_STOREFRONT,
  storefront_enabled: true, allowed_presets: ["workshop", "clinic", "market"], max_online_products: 300,
  checkout_whatsapp: true, checkout_pay_on_delivery: true, checkout_transfer_mobile_money: true,
};

function withQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const settings = (optedIn: boolean) => ({
  allowed: false, opt_in_required: true, opted_in: optedIn, checkout_warning: null,
  entitlements: { ...starter, storefront_enabled: optedIn },
});

describe("Starter storefront in Settings", () => {
  beforeEach(() => {
    gate.entitlements = starter;
    getSettings.mockReset();
    optInStorefront.mockReset();
    toastError.mockReset();
    useSystemConfigStore.setState({ subscriptionPlans: null });
  });

  it("keeps a Starter store off until the owner opts in, then shows its address", async () => {
    getSettings.mockResolvedValue(settings(false));
    withQuery(<OnlineStorefrontCard localStoreSlug="corner-shop" onlineStoreEnabled />);

    const button = await screen.findByRole("button", { name: "Turn on my online store" });
    expect(screen.getByText(/up to 50 products/i)).toBeTruthy();
    expect(screen.queryByText("https://shop.example/corner-shop")).toBeNull();
    expect(screen.queryByText("storefront-appearance")).toBeNull();

    optInStorefront.mockResolvedValue({ opted_in: true, entitlements: starter });
    getSettings.mockResolvedValue(settings(true));
    fireEvent.click(button);

    expect(await screen.findByText("https://shop.example/corner-shop")).toBeTruthy();
    expect(optInStorefront).toHaveBeenCalledTimes(1);
    expect(screen.getByText("storefront-appearance")).toBeTruthy();
  });

  it("shows the server's reason when the opt-in is refused", async () => {
    getSettings.mockResolvedValue(settings(false));
    optInStorefront.mockRejectedValue(new Error("Your online store has no address yet."));
    withQuery(<OnlineStorefrontCard localStoreSlug="corner-shop" onlineStoreEnabled />);

    fireEvent.click(await screen.findByRole("button", { name: "Turn on my online store" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Your online store has no address yet."));
  });

  it("gives an opted-in Starter store the storefront panel and no publish button", async () => {
    getSettings.mockResolvedValue(settings(true));
    withQuery(<OnlineStorefrontCard localStoreSlug="corner-shop" onlineStoreEnabled />);

    expect(await screen.findByText("storefront-appearance")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Turn on my online store" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish changes now" })).toBeNull();
  });

  it("shows Starter's limits with Pro and Enterprise locks", () => {
    useSystemConfigStore.setState({ subscriptionPlans: { storefront_entitlements: { pro } } });
    render(<StorefrontPlanFeatures entitlements={starter} />);

    expect(screen.getByText(/Styles on your plan: Clinic\./)).toBeTruthy();
    expect(screen.getByText(/Up to 50 products online/)).toBeTruthy();
    const lockedOn = (label: RegExp) => within(screen.getByText(label).closest("li") as HTMLElement);
    lockedOn(/More styles/).getByText("Pro");
    lockedOn(/Up to 300 products online/).getByText("Pro");
    lockedOn(/Bank transfer and mobile money/).getByText("Pro");
    lockedOn(/Remove the Powered by DumosRx badge/).getByText("Enterprise");
    lockedOn(/Card payments online/).getByText("Enterprise");
    lockedOn(/Publish changes instantly/).getByText("Enterprise");
    expect(screen.getByText(/Upgrade to Pro/)).toBeTruthy();
  });

  it("keeps Pro's own panel to Enterprise locks only", () => {
    useSystemConfigStore.setState({ subscriptionPlans: { storefront_entitlements: { pro } } });
    render(<StorefrontPlanFeatures entitlements={pro} />);

    expect(screen.queryByText("Pro")).toBeNull();
    expect(screen.queryByText(/More styles/)).toBeNull();
    expect(screen.getByText(/upgrade to enterprise/i)).toBeTruthy();
  });
});
