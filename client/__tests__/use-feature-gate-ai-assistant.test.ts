import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { SubscriptionPlansConfig } from "@/lib/types/subscription-plans";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

let storeProfile: Record<string, unknown> | null = null;
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile }),
}));

import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useSystemConfigStore } from "@/lib/store/system-config-store";

/**
 * The in-app assistant is a plan-gated feature (Pro/Enterprise), matching
 * the smart_suggestions tier split. It is client-only — there is no backend
 * endpoint behind it — so useFeatureGate's canUseAiAssistant is the single
 * entitlement check both render sites read.
 */
describe("useFeatureGate canUseAiAssistant", () => {
  beforeEach(() => {
    storeProfile = null;
    useSystemConfigStore.setState({ subscriptionPlans: null });
  });

  function setPlans(plans: unknown) {
    useSystemConfigStore.setState({
      subscriptionPlans: plans as SubscriptionPlansConfig,
    });
  }

  function gate() {
    return renderHook(() => useFeatureGate()).result.current;
  }

  it("denies the assistant on free and starter when no plan config has loaded", () => {
    storeProfile = { subscription_tier: "free" };
    expect(gate().canUseAiAssistant).toBe(false);
    storeProfile = { subscription_tier: "starter" };
    expect(gate().canUseAiAssistant).toBe(false);
  });

  it("allows the assistant on pro and enterprise when no plan config has loaded", () => {
    storeProfile = { subscription_tier: "pro" };
    expect(gate().canUseAiAssistant).toBe(true);
    storeProfile = { subscription_tier: "enterprise" };
    expect(gate().canUseAiAssistant).toBe(true);
  });

  it("reads the configured ai_assistant flag over the tier fallback", () => {
    storeProfile = { subscription_tier: "starter" };
    setPlans({ tiers: { starter: { limits: {}, features: { ai_assistant: true } } } });
    expect(gate().canUseAiAssistant).toBe(true);

    storeProfile = { subscription_tier: "pro" };
    setPlans({ tiers: { pro: { limits: {}, features: { ai_assistant: false } } } });
    expect(gate().canUseAiAssistant).toBe(false);
  });

  it("treats a trialling pro store as entitled", () => {
    storeProfile = { subscription_tier: "Pro Trial" };
    expect(gate().canUseAiAssistant).toBe(true);
  });

  it("resolves the 'local' tier through the starter plan config", () => {
    storeProfile = { subscription_tier: "local" };
    setPlans({ tiers: { starter: { limits: {}, features: {} } } });
    expect(gate().canUseAiAssistant).toBe(false);
  });

  it("names the lowest plan carrying the assistant in its upgrade message", () => {
    storeProfile = { subscription_tier: "free" };
    setPlans({
      tiers: {
        starter: { limits: {}, features: { ai_assistant: false } },
        pro: { name: "Dumos Pro", limits: {}, features: { ai_assistant: true } },
        enterprise: { limits: {}, features: { ai_assistant: true } },
      },
    });
    expect(gate().getUpgradeMessage("ai_assistant")).toContain("Dumos Pro");
  });
});
