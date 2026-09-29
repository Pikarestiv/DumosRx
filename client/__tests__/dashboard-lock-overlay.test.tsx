import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { RecentUser } from "@/lib/context/auth-context";
import { drainInputOtpSyncTimeouts } from "./helpers/input-otp-timers";

drainInputOtpSyncTimeouts();

/**
 * Two reported bugs, both reachable only through the dashboard's own lock
 * overlay (not /login's copy of the same LockScreen):
 *
 * 1. Lock-screen bypass. Locking the app, backing out of PIN entry to the
 *    account picker and choosing "Set Up as New Device" used to unlock the
 *    session *before* navigating to the setup flow. Backing out of setup
 *    lands back on /dashboard, which then rendered fully unlocked with no
 *    re-authentication at all.
 * 2. The per-account remove ("x") affordance was missing here, because this
 *    caller never passed an onRemoveUser callback, unlike /login's.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(
  globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }
).ResizeObserver = ResizeObserverStub;

const MOTION_ONLY_PROPS = [
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "whileTap",
  "whileHover",
  "whileFocus",
  "whileInView",
  "layout",
  "layoutId",
];

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ children, ...rest }: Record<string, unknown>) =>
          React.createElement(
            tag,
            Object.fromEntries(
              Object.entries(rest).filter(
                ([key]) => !MOTION_ONLY_PROPS.includes(key),
              ),
            ),
            children as React.ReactNode,
          ),
    },
  ),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: Record<string, unknown> & { alt?: string }) =>
    React.createElement("img", { alt: alt ?? "", ...rest }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/hooks/use-is-touch-device", () => ({
  useIsTouchDevice: () => false,
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canAutoLock: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
    getUpgradeMessage: () => "",
  }),
}));

const currentUser = {
  id: "u1",
  first_name: "Ada",
  last_name: "Ola",
  username: "ada",
  role: "admin",
};

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: currentUser, login: vi.fn() }),
}));

import { DashboardLockOverlay } from "@/components/dashboard/dashboard-lock-overlay";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { getRecentUsers, setRecentUsers } from "@/lib/storage-keys";

const RECENT_USERS: RecentUser[] = [
  { ...currentUser, last_login: new Date().toISOString() },
  {
    id: "u2",
    first_name: "Bem",
    last_name: "Tor",
    username: "bem",
    role: "sales_staff",
    last_login: new Date().toISOString(),
  },
];

function goBackToAccountPicker() {
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
}

describe("dashboard lock overlay", () => {
  beforeEach(() => {
    localStorage.clear();
    setRecentUsers(RECENT_USERS);
    useAutoLockStore.setState({
      isLocked: true,
      forceAccountSelection: false,
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, href: "/dashboard" },
    });
  });

  it("stays locked when leaving for the new-device setup flow", () => {
    render(<DashboardLockOverlay />);

    goBackToAccountPicker();
    fireEvent.click(
      screen.getByRole("button", { name: /set up as new device/i }),
    );

    expect(window.location.href).toContain("tab=setup");
    expect(useAutoLockStore.getState().isLocked).toBe(true);
  });

  it("still shows the lock overlay on the dashboard load that follows the setup flow", () => {
    render(<DashboardLockOverlay />);
    goBackToAccountPicker();
    fireEvent.click(
      screen.getByRole("button", { name: /set up as new device/i }),
    );
    cleanup();

    render(<DashboardLockOverlay />);

    expect(screen.getByText("Enter your PIN to unlock")).toBeTruthy();
  });

  it("stays locked when leaving to sign in as someone else", () => {
    render(<DashboardLockOverlay />);

    goBackToAccountPicker();
    fireEvent.click(screen.getByRole("button", { name: /someone else/i }));

    expect(window.location.href).toContain("mode=new");
    expect(useAutoLockStore.getState().isLocked).toBe(true);
  });

  it("removes an account from the picker reached by backing out of PIN entry", () => {
    render(<DashboardLockOverlay />);

    goBackToAccountPicker();
    fireEvent.click(
      screen.getByRole("button", { name: /remove bem from this device/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));

    expect(getRecentUsers().map((u) => u.id)).toEqual(["u1"]);
    expect(
      screen.queryByRole("button", { name: /remove bem from this device/i }),
    ).toBeNull();
  });

  it("renders nothing while the session is unlocked", () => {
    useAutoLockStore.setState({ isLocked: false });
    const { container } = render(<DashboardLockOverlay />);

    expect(container.innerHTML).toBe("");
  });
});
