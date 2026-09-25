import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * LicenseGuard's performCheck() had no try/catch around
 * `await checkLicenseStatus()` (components/auth/license-guard.tsx) - only
 * the cloud-sync call above it was guarded. If checkLicenseStatus() throws
 * for any reason, the async function rejects before reaching
 * setLoading(false), so `loading` stays true forever and SplashScreen (a
 * `fixed inset-0 z-[100]` overlay) renders permanently, covering the whole
 * app - including DatabaseProvider's read-only-tab banner underneath it at
 * z-50, making its "Use this window instead" handoff button invisible and
 * unclickable.
 *
 * Observed live: on a read-only tab, checkLicenseStatus() itself calls
 * updateStoreMonotonicTime() (a write), which throws because the tab is
 * read-only - exactly this scenario.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: null, isSwitchingStore: false, updateStoreProfile: vi.fn() }),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ currentTier: "free", canUseMobileApp: true }),
}));
vi.mock("@/lib/hooks/use-auto-lock", () => ({
  useAutoLockStore: (selector: (s: { isLocked: boolean }) => unknown) =>
    selector({ isLocked: false }),
}));
vi.mock("@/lib/utils/device-id", () => ({
  getDeviceId: () => "DUMOS-TEST-0001",
}));
vi.mock("@/lib/licensing/licensing-manager", () => ({
  checkLicenseStatus: vi.fn(async () => {
    throw new Error(
      "This tab is read-only because DumosRx is already open in another tab or window.",
    );
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LicenseGuard: checkLicenseStatus() failure", () => {
  it("does not get stuck on the splash screen forever when checkLicenseStatus() throws", async () => {
    const { LicenseGuard } = await import("@/components/auth/license-guard");

    render(
      <LicenseGuard>
        <div>app content</div>
      </LicenseGuard>,
    );

    expect(screen.getByText("Initializing workspace...")).not.toBeNull();

    // Must resolve out of the splash screen rather than hang forever -
    // fails open (renders children) since a failed check is treated as
    // "unknown", never as grounds to hard-lock the account.
    await waitFor(() => expect(screen.queryByText("app content")).not.toBeNull());
    expect(screen.queryByText("Initializing workspace...")).toBeNull();
  });
});
