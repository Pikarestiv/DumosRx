import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { SubscriptionPlansConfig } from "@/lib/types/subscription-plans";

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

let storeProfile: Record<string, unknown> | null = null;
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile }),
}));

import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useSystemConfigStore } from "@/lib/store/system-config-store";

/**
 * useFeatureGate() resolves a store's subscription tier into every module
 * gate the app enforces. The pure helpers it delegates to were covered, but
 * the resolution itself — trial-suffix stripping, the "local" -> "starter"
 * config aliasing, -1 meaning unlimited, the alt-key feature fallback, the
 * per-tier fallbacks used when the server config is missing, the upgrade
 * message's plan hierarchy and withRestriction's mobile block — was not.
 */
describe("useFeatureGate tier resolution", () => {
  beforeEach(() => {
    storeProfile = null;
    toastError.mockClear();
    useSystemConfigStore.setState({ subscriptionPlans: null });
    Object.defineProperty(window, "innerWidth", {
      value: 1280,
      configurable: true,
      writable: true,
    });
  });

  function setPlans(plans: unknown) {
    useSystemConfigStore.setState({
      subscriptionPlans: plans as SubscriptionPlansConfig,
    });
  }

  function gate() {
    return renderHook(() => useFeatureGate()).result.current;
  }

  it("falls back to the free tier when the store has no subscription_tier", () => {
    const g = gate();
    expect(g.currentTier).toBe("free");
    expect(g.canCloudSync).toBe(false);
    expect(g.canUseProcurement).toBe(false);
    expect(g.maxStaffAccounts).toBe(0);
  });

  it("strips a ' trial' suffix so a trialling store gets the underlying tier's features", () => {
    storeProfile = { subscription_tier: "Pro Trial" };
    const g = gate();
    expect(g.currentTier).toBe("pro");
    expect(g.canUseAdvancedReports).toBe(true);
    expect(g.canUseMobileApp).toBe(true);
    expect(g.maxStaffAccounts).toBe(10);
  });

  it("reads the 'local' tier's entitlements from the starter plan config", () => {
    storeProfile = { subscription_tier: "local" };
    setPlans({ tiers: { starter: { limits: { staff: 7 }, features: {} } } });
    const g = gate();
    expect(g.currentTier).toBe("local");
    expect(g.maxStaffAccounts).toBe(7);
    // starter-band defaults still apply to anything the config omits
    expect(g.canUseDailyCloseReport).toBe(true);
    expect(g.canUseAdvancedReports).toBe(false);
  });

  it("treats a configured limit of -1 as unlimited", () => {
    storeProfile = { subscription_tier: "pro" };
    setPlans({ tiers: { pro: { limits: { staff: -1 }, features: {} } } });
    expect(gate().maxStaffAccounts).toBe(Infinity);
  });

  it("prefers a configured limit of 0 over the tier fallback instead of treating it as unset", () => {
    storeProfile = { subscription_tier: "pro" };
    setPlans({ tiers: { pro: { limits: { staff: 0 }, features: {} } } });
    expect(gate().maxStaffAccounts).toBe(0);
  });

  it("resolves a feature from its alternate config key when the primary key is absent", () => {
    storeProfile = { subscription_tier: "starter" };
    setPlans({ tiers: { starter: { limits: {}, features: { white_label: true } } } });
    // primary key is remove_branding, alt key is white_label; the starter
    // fallback for it is false.
    expect(gate().canRemoveBranding).toBe(true);
  });

  it("lets an explicit false under the primary key override a tier fallback of true", () => {
    // remove_branding's fallback is true on enterprise, and its alt key
    // (white_label) is absent, so only the primary key can turn it off.
    storeProfile = { subscription_tier: "enterprise" };
    setPlans({
      tiers: { enterprise: { limits: {}, features: { remove_branding: false } } },
    });
    expect(gate().canRemoveBranding).toBe(false);
  });

  it("derives multi-store access from the stores limit rather than a separate flag", () => {
    storeProfile = { subscription_tier: "starter" };
    setPlans({ tiers: { starter: { limits: { stores: 1 }, features: {} } } });
    expect(gate().canManageMultiStore).toBe(false);

    setPlans({ tiers: { starter: { limits: { stores: 3 }, features: {} } } });
    expect(gate().canManageMultiStore).toBe(true);
  });

  it("uses the per-tier default sync interval when the config declares none", () => {
    storeProfile = { subscription_tier: "free" };
    expect(gate().minimumSyncIntervalMinutes).toBe(360);
    storeProfile = { subscription_tier: "starter" };
    expect(gate().minimumSyncIntervalMinutes).toBe(30);
    storeProfile = { subscription_tier: "pro" };
    expect(gate().minimumSyncIntervalMinutes).toBe(15);
    storeProfile = { subscription_tier: "enterprise" };
    expect(gate().minimumSyncIntervalMinutes).toBe(0);
  });

  it("denies prescriptions to a non-pharmacy store whatever its plan allows", () => {
    storeProfile = { subscription_tier: "enterprise", store_type: "supermarket" };
    setPlans({ tiers: { enterprise: { limits: {}, features: { prescriptions: true } } } });
    expect(gate().canUsePrescriptions).toBe(false);

    storeProfile = { subscription_tier: "enterprise", store_type: "pharmacy" };
    expect(gate().canUsePrescriptions).toBe(true);
  });

  it("names the lowest plan that carries the feature in the upgrade message", () => {
    storeProfile = { subscription_tier: "free" };
    setPlans({
      tiers: {
        starter: { limits: {}, features: { expenses: true } },
        pro: { limits: {}, features: { expenses: true, advanced_reports: true } },
        enterprise: {
          name: "Enterprise",
          limits: {},
          features: { expenses: true, advanced_reports: true, ecommerce: true },
        },
      },
    });
    const g = gate();
    expect(g.getUpgradeMessage("expenses")).toContain("Starter");
    expect(g.getUpgradeMessage("advanced_reports")).toContain("Pro");
    expect(g.getUpgradeMessage("ecommerce")).toContain("Enterprise");
  });

  it("returns the caller's fallback message for a feature no plan carries", () => {
    storeProfile = { subscription_tier: "free" };
    setPlans({ tiers: { starter: { limits: {}, features: {} } } });
    expect(gate().getUpgradeMessage("expenses", "nope")).toBe("nope");
  });

  it("returns the caller's fallback message when no plan config has loaded yet", () => {
    storeProfile = { subscription_tier: "free" };
    expect(gate().getUpgradeMessage("expenses", "nope")).toBe("nope");
  });

  describe("withRestriction", () => {
    it("runs the action untouched on a desktop viewport with the feature allowed", () => {
      storeProfile = { subscription_tier: "free" };
      const action = vi.fn(() => "ran");
      const wrapped = gate().withRestriction(action, { featureAllowed: true, featureKey: "x" });
      expect(wrapped()).toBe("ran");
      expect(toastError).not.toHaveBeenCalled();
    });

    it("blocks the action and toasts when the feature is not allowed", () => {
      storeProfile = { subscription_tier: "free" };
      const action = vi.fn();
      const wrapped = gate().withRestriction(action, {
        featureAllowed: false,
        featureKey: "expenses",
      });
      wrapped();
      expect(action).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith("Feature Locked", expect.anything());
    });

    it("still runs the action when featureAllowed is false but no featureKey identifies it", () => {
      storeProfile = { subscription_tier: "free" };
      const action = vi.fn(() => "ran");
      const wrapped = gate().withRestriction(action, { featureAllowed: false });
      expect(wrapped()).toBe("ran");
    });

    it("blocks a mobile viewport on a plan without mobile access", () => {
      storeProfile = { subscription_tier: "starter" };
      Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
      const action = vi.fn();
      gate().withRestriction(action)();
      expect(action).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith("Mobile Access Locked", expect.anything());
    });

    it("allows a mobile viewport on a plan that includes mobile access", () => {
      storeProfile = { subscription_tier: "pro" };
      Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
      const action = vi.fn(() => "ran");
      expect(gate().withRestriction(action)()).toBe("ran");
      expect(toastError).not.toHaveBeenCalled();
    });

    it("skips the mobile check entirely when the caller opts out", () => {
      storeProfile = { subscription_tier: "starter" };
      Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
      const action = vi.fn(() => "ran");
      const wrapped = gate().withRestriction(action, { enforceMobileAccess: false });
      expect(wrapped()).toBe("ran");
      expect(toastError).not.toHaveBeenCalled();
    });

    it("forwards the caller's arguments through to the action", () => {
      storeProfile = { subscription_tier: "pro" };
      const action = vi.fn((a: number, b: number) => a + b);
      expect(gate().withRestriction(action)(2, 3)).toBe(5);
    });
  });
});
