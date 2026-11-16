import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const { updateStoreProfile, storeContext, gate, auth } = vi.hoisted(() => {
  const updateStoreProfile = vi.fn();
  return {
    updateStoreProfile,
    storeContext: {
      storeProfile: { id: "s1", name: "Divamax", store_slug: "divamax", online_store_enabled: 1, address: "1 Rue", phone: "699", email: "a@b.c" },
      storeType: "retail",
      updateStoreProfile,
      theme: "light",
      setTheme: () => {},
      refetch: () => {},
    },
    gate: { minimumSyncIntervalMinutes: 15, canRemoveBranding: true, canAccessLoyaltyProgramPlan: true },
    auth: { user: { id: "u1" }, isAdmin: true, changePin: () => {}, isCloudLinked: false, permissionGroup: null },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ tab: "business" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => auth,
}));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => storeContext }));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => gate,
}));
vi.mock("@/hooks/use-settings-security", () => ({ useSettingsSecurity: () => ({}) }));
vi.mock("@/hooks/use-settings-sync", () => ({ useSettingsSync: () => ({}) }));
vi.mock("@/hooks/use-settings-tab-resolution", () => ({ useSettingsTabResolution: () => ({ canAccessTab: () => true }) }));
vi.mock("@/lib/hooks/use-permissions", () => ({ hasPermission: () => true }));

import { useSettings } from "@/hooks/use-settings";

describe("saving the business profile", () => {
  beforeEach(() => updateStoreProfile.mockReset());

  it("never pushes the storefront address or the online switch, which only a super admin sets", () => {
    const { result } = renderHook(() => useSettings());

    act(() => result.current.handleSaveProfile());

    expect(updateStoreProfile).toHaveBeenCalledTimes(1);
    const payload = updateStoreProfile.mock.calls[0][0];
    expect(payload).toMatchObject({ name: "Divamax", phone: "699" });
    expect(payload).not.toHaveProperty("store_slug");
    expect(payload).not.toHaveProperty("online_store_enabled");
  });
});
