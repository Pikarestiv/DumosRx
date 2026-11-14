import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// manage_online_store is the storefront slice of the Store & Settings category, and it deliberately cuts ACROSS two tabs r…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-online-store-permission-test-tsx-L4

const hasPermission = vi.fn((_key: string) => true);

// jsdom has no matchMedia; components/ui/tooltip.tsx reads it on mount.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canUseEcommerce: true,
    withRestriction: (fn: () => void) => fn,
    getUpgradeMessage: (_f: string, fallback?: string) => fallback ?? "",
  }),
}));
vi.mock("@/lib/constants", () => ({
  STOREFRONT_BASE_URL: "https://shop.example",
}));
vi.mock("@/components/settings/store/storefront-appearance", () => ({
  StorefrontAppearance: () => <div>storefront-appearance</div>,
}));
vi.mock("@/components/settings/store/payment-settings-card", () => ({
  PaymentSettingsCard: () => <div>payment-settings-card</div>,
}));
vi.mock("@/components/settings/store/payment-accounts-card", () => ({
  PaymentAccountsCard: () => <div>payment-accounts-card</div>,
}));
vi.mock("@/components/settings/store/online-payments-section", () => ({
  OnlinePaymentsSection: () => <div>online-payments-section</div>,
}));

import { OnlineStorefrontCard } from "@/components/settings/store/online-storefront-card";
import { StoreProfileSection } from "@/components/settings/store/store-profile-section";
import { PaymentMethodsPanel } from "@/app/(dashboard)/settings/[tab]/panels/payment-methods-panel";
import type { SettingsState } from "@/hooks/use-settings";

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

const sectionProps = {
  storeType: "retail" as const,
  isEditingProfile: true,
  localPcn: "",
  setLocalPcn: vi.fn(),
  loyaltyProgramEnabled: false,
  setLoyaltyProgramEnabled: vi.fn(),
  canAccessLoyaltyProgramPlan: true,
  getUpgradeMessage: (_f: string, fallback?: string) => fallback ?? "",
};

const storefrontProps = {
  localStoreSlug: "my-store",
  setLocalStoreSlug: vi.fn(),
  storeSlugChangedAt: null,
  onlineStoreEnabled: true,
  setOnlineStoreEnabled: vi.fn(),
  handleSaveProfile: vi.fn(),
};

const panelProps = {
  storeProfile: { id: "s1", name: "Store" },
} as unknown as SettingsState;

describe("manage_online_store", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the key specifically in the Online Storefront card", () => {
    render(<OnlineStorefrontCard {...storefrontProps} />);
    expect(hasPermission).toHaveBeenCalledWith("manage_online_store");
  });

  it("shows the storefront URL and the Enable Online Store switch in their own card with the key", () => {
    render(<OnlineStorefrontCard {...storefrontProps} />);
    expect(screen.queryByText("Online Storefront")).not.toBeNull();
    expect(screen.queryByText("Store URL Slug")).not.toBeNull();
    expect(screen.queryByText("Enable Online Store")).not.toBeNull();
  });

  it("hides the whole Online Storefront card without the key", () => {
    deny("manage_online_store");
    const { container } = render(<OnlineStorefrontCard {...storefrontProps} />);
    expect(container.textContent).toBe("");
  });

  it("embeds the look controls only for a store that has an address", () => {
    const withAddress = render(<OnlineStorefrontCard {...storefrontProps} />);
    expect(screen.getByText("storefront-appearance")).toBeTruthy();
    withAddress.unmount();

    render(<OnlineStorefrontCard {...storefrontProps} localStoreSlug="" />);
    expect(screen.queryByText("storefront-appearance")).toBeNull();
  });

  it("has its own edit and save, so the storefront can be saved without opening Business Information", () => {
    const handleSaveProfile = vi.fn();
    render(<OnlineStorefrontCard {...storefrontProps} handleSaveProfile={handleSaveProfile} />);

    expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit online storefront" }));
    fireEvent.click(screen.getByRole("switch"));
    expect(storefrontProps.setOnlineStoreEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(handleSaveProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
  });

  it("keeps the slug locked inside the 6-month change window", () => {
    const recently = new Date().toISOString();
    render(<OnlineStorefrontCard {...storefrontProps} storeSlugChangedAt={recently} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit online storefront" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit storefront URL" }));

    expect(screen.queryByPlaceholderText("my-store")).toBeNull();
  });

  it("no longer carries the storefront controls in Store Profile, which keeps the loyalty toggle", () => {
    render(<StoreProfileSection {...sectionProps} />);
    expect(screen.queryByText("Store URL Slug")).toBeNull();
    expect(screen.queryByText("Enable Online Store")).toBeNull();
    expect(screen.queryByText("Enable Loyalty Program")).not.toBeNull();
  });

  it("renders nothing at all rather than an empty bordered box", () => {
    const { container } = render(
      <StoreProfileSection
        {...sectionProps}
        setLoyaltyProgramEnabled={undefined}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("gates the Paystack payout section on the Payment Methods tab", () => {
    render(<PaymentMethodsPanel {...panelProps} />);
    expect(screen.queryByText("online-payments-section")).not.toBeNull();

    deny("manage_online_store");
    const { container } = render(<PaymentMethodsPanel {...panelProps} />);
    expect(container.textContent).not.toContain("online-payments-section");
    expect(container.textContent).toContain("payment-accounts-card");
  });
});
