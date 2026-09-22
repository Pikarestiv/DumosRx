import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinEntry } from "@/components/auth/pin-entry";
import type { RecentUser } from "@/lib/context/auth-context";

// jsdom doesn't implement ResizeObserver; the input-otp library used by
// PinEntry's OTP fields needs one to mount at all.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

/**
 * Regression coverage for a follow-up to the PIN-lockout fix: a lockout
 * was originally surfaced only via a toast (auto-dismisses in a few
 * seconds, easy to miss, no visible reason the Unlock button stopped
 * working). PinEntry must show a persistent, visible countdown and
 * disable PIN input for as long as the lockout is active.
 */

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: Record<string, unknown>) => {
        const { children, ...rest } = props;
        // Strip framer-motion-only props (animate/initial/exit/transition)
        // so React doesn't warn about unknown DOM attributes.
        const domProps = Object.fromEntries(
          Object.entries(rest).filter(
            ([key]) => !["animate", "initial", "exit", "transition"].includes(key),
          ),
        );
        return <div {...domProps}>{children as React.ReactNode}</div>;
      },
    },
  ),
}));

vi.mock("@/lib/hooks/use-is-touch-device", () => ({
  useIsTouchDevice: () => false,
}));

const selectedUser: RecentUser = {
  id: "u1",
  first_name: "Cashier",
  last_name: "One",
  username: "cashier1",
  role: "sales_staff",
  last_login: new Date().toISOString(),
};

const noop = () => {};

describe("PinEntry lockout UI", () => {
  it("shows a persistent countdown and disables PIN input when locked out", () => {
    render(
      <PinEntry
        selectedUser={selectedUser}
        pin=""
        setPin={noop}
        isLoading={false}
        hasError={false}
        lockoutRemainingMs={90_000}
        handleLogin={noop}
        onAutoSubmit={noop}
        onBack={noop}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/too many attempts/i);
    expect(alert.textContent).toMatch(/2m/);

    const otpInput = document.querySelector("input[inputmode]") as HTMLInputElement;
    expect(otpInput.disabled).toBe(true);
  });

  it("does not show the lockout countdown when not locked out", () => {
    render(
      <PinEntry
        selectedUser={selectedUser}
        pin=""
        setPin={noop}
        isLoading={false}
        hasError={false}
        lockoutRemainingMs={null}
        handleLogin={noop}
        onAutoSubmit={noop}
        onBack={noop}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
    const otpInput = document.querySelector("input[inputmode]") as HTMLInputElement;
    expect(otpInput.disabled).toBe(false);
  });

  it("shows a live-updating countdown in seconds for sub-minute remainders", () => {
    render(
      <PinEntry
        selectedUser={selectedUser}
        pin=""
        setPin={noop}
        isLoading={false}
        hasError={false}
        lockoutRemainingMs={15_000}
        handleLogin={noop}
        onAutoSubmit={noop}
        onBack={noop}
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/15s/);
  });
});
