import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { StorefrontEntitlements } from "@/lib/types/storefront-settings";
import { LOCKED_STOREFRONT } from "@/lib/utils/storefront-entitlements";

const { plan, rebuildStorefront, toastSuccess, toastError } = vi.hoisted(() => ({
  plan: { entitlements: null as unknown as StorefrontEntitlements },
  rebuildStorefront: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
});

vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));
vi.mock("@/lib/constants", () => ({ STOREFRONT_BASE_URL: "https://shop.example" }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock("@/lib/api/client", () => ({ apiClient: { rebuildStorefront } }));
vi.mock("@/components/settings/store/storefront-appearance", () => ({ StorefrontAppearance: () => <div>storefront-appearance</div> }));
vi.mock("@/components/settings/store/payment-settings-card", () => ({ PaymentSettingsCard: () => <div>payment-settings-card</div> }));
vi.mock("@/components/settings/store/payment-accounts-card", () => ({ PaymentAccountsCard: () => <div>payment-accounts-card</div> }));
vi.mock("@/components/settings/store/online-payments-section", () => ({ OnlinePaymentsSection: () => <div>online-payments-section</div> }));
vi.mock("@/lib/hooks/use-feature-gate", () => ({ useFeatureGate: () => ({ storefrontEntitlements: plan.entitlements }) }));

import { OnlineStorefrontCard } from "@/components/settings/store/online-storefront-card";
import { PaymentMethodsPanel } from "@/app/(dashboard)/settings/[tab]/panels/payment-methods-panel";
import type { SettingsState } from "@/hooks/use-settings";

const pro: StorefrontEntitlements = { ...LOCKED_STOREFRONT, storefront_enabled: true, allowed_presets: ["workshop"], max_online_products: 300 };
const enterprise: StorefrontEntitlements = { ...pro, max_online_products: null, checkout_paystack: true, rebuild_mode: "on_demand" };

function withQuery(node: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{node}</QueryClientProvider>);
}

const panelProps = { storeProfile: { id: "s1", name: "Store" } } as unknown as SettingsState;

describe("storefront plan gates in Settings", () => {
  beforeEach(() => {
    rebuildStorefront.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("offers Starter and Free an upgrade where the storefront settings would be", () => {
    plan.entitlements = LOCKED_STOREFRONT;
    withQuery(<OnlineStorefrontCard localStoreSlug="my-store" onlineStoreEnabled />);

    expect(screen.getByText(/part of the Pro and Enterprise plans/i)).toBeTruthy();
    expect(screen.queryByText("https://shop.example/my-store")).toBeNull();
    expect(screen.queryByText("storefront-appearance")).toBeNull();
  });

  it("gives Enterprise a Publish changes now button that asks the server to rebuild", async () => {
    plan.entitlements = enterprise;
    rebuildStorefront.mockResolvedValue({ message: "Publishing now." });
    withQuery(<OnlineStorefrontCard localStoreSlug="my-store" onlineStoreEnabled />);

    fireEvent.click(screen.getByRole("button", { name: "Publish changes now" }));

    await waitFor(() => expect(rebuildStorefront).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Publishing now."));
  });

  it("shows the server's reason when a rebuild is refused", async () => {
    plan.entitlements = enterprise;
    rebuildStorefront.mockRejectedValue(new Error("Too many rebuilds this hour"));
    withQuery(<OnlineStorefrontCard localStoreSlug="my-store" onlineStoreEnabled />);

    fireEvent.click(screen.getByRole("button", { name: "Publish changes now" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Too many rebuilds this hour"));
  });

  it("gives Pro the look panel but no rebuild button", () => {
    plan.entitlements = pro;
    withQuery(<OnlineStorefrontCard localStoreSlug="my-store" onlineStoreEnabled />);

    expect(screen.queryByRole("button", { name: "Publish changes now" })).toBeNull();
    expect(screen.getByText("storefront-appearance")).toBeTruthy();
  });

  it("keeps Paystack off the Payment Methods tab on Pro and shows it on Enterprise", () => {
    plan.entitlements = pro;
    const proPanel = withQuery(<PaymentMethodsPanel {...panelProps} />);
    expect(proPanel.container.textContent).not.toContain("online-payments-section");
    expect(screen.getByText(/card payments on your storefront/i)).toBeTruthy();
    expect(screen.getByText("Enterprise")).toBeTruthy();
    proPanel.unmount();

    plan.entitlements = enterprise;
    withQuery(<PaymentMethodsPanel {...panelProps} />);
    expect(screen.getByText("online-payments-section")).toBeTruthy();
  });
});
