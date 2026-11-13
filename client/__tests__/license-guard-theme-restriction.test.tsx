import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";

const THEME_KEY = "dumosrx-ui-theme";
const storeState: { current: { storeProfile: Record<string, unknown> | null } } = {
  current: { storeProfile: null },
};
const updateStoreProfile = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: storeState.current.storeProfile,
    isSwitchingStore: false,
    updateStoreProfile,
  }),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
vi.mock("@/lib/hooks/use-auto-lock", () => ({
  useAutoLockStore: (selector: (s: { isLocked: boolean }) => unknown) =>
    selector({ isLocked: false }),
}));
vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "DUMOS-TEST-0001" }));
vi.mock("@/lib/licensing/licensing-manager", () => ({
  checkLicenseStatus: vi.fn(() =>
    Promise.resolve({
      isValid: true,
      tier: "pro",
      expiryDate: null,
      isClockTampered: false,
      isSuspended: false,
      message: "",
    }),
  ),
}));

async function renderGuard() {
  const { LicenseGuard } = await import("@/components/auth/license-guard");
  const tree = () => (
    <ThemeProvider>
      <LicenseGuard>
        <div>app content</div>
      </LicenseGuard>
    </ThemeProvider>
  );
  const view = render(tree());
  await screen.findByText("app content");
  return { rerender: () => view.rerender(tree()) };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(THEME_KEY, "dark");
  storeState.current = { storeProfile: null };
  updateStoreProfile.mockReset();
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
});

describe("LicenseGuard theme restriction (A-367)", () => {
  it("keeps a stored dark theme while the store profile has not loaded yet", async () => {
    await renderGuard();
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("keeps the dark theme once a Pro store's profile arrives", async () => {
    const { rerender } = await renderGuard();
    storeState.current = { storeProfile: { id: "s1", subscription_tier: "pro", theme: "default" } };
    rerender();
    await screen.findByText("app content");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("still resets a free store to light once its profile has loaded", async () => {
    const { rerender } = await renderGuard();
    storeState.current = { storeProfile: { id: "s1", subscription_tier: "free", theme: "ocean" } };
    rerender();
    await waitFor(() => expect(localStorage.getItem(THEME_KEY)).toBe("light"));
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(updateStoreProfile).toHaveBeenCalledWith({ theme: "default" });
  });
});
