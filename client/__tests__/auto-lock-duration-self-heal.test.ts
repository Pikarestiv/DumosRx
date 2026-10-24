import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Regression coverage for a real reported bug (see issue.png):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-auto-lock-duration-self-heal-test-ts-L20

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canAutoLock: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
    getUpgradeMessage: () => "",
  }),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "test-user" } }),
}));

vi.mock("@/lib/db/queries/auth", () => ({
  updateUserAutoLockDuration: vi.fn().mockResolvedValue(undefined),
}));

describe("Auto-Lock Screen duration self-heal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
    vi.resetModules();
  });

  it("corrects an out-of-range persisted duration to the default instead of leaving the dropdown blank", async () => {
    // Seeds exactly the corrupted state from the real report, in the same
    // shape zustand's persist middleware writes.
    localStorage.setItem(
      "dumos_autolock",
      JSON.stringify({
        state: { duration: 999, isLocked: false, lastActivity: Date.now() },
        version: 0,
      }),
    );

    const { useAutoLockStore } = await import("@/lib/hooks/use-auto-lock");
    expect(useAutoLockStore.getState().duration).toBe(999);

    const { SecuritySettings } = await import(
      "@/components/settings/security-settings"
    );

    root = createRoot(container);
    await act(() => {
      root.render(
        React.createElement(SecuritySettings, {
          currentPin: "",
          setCurrentPin: () => {},
          newPin: "",
          setNewPin: () => {},
          confirmPin: "",
          setConfirmPin: () => {},
          handleUpdateSecurity: () => Promise.resolve(true),
        }),
      );
    });

    // The self-heal effect corrects the store, not just the display — otherwise the same blank dropdown would come right back…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-auto-lock-duration-self-heal-test-ts-L103
    expect(useAutoLockStore.getState().duration).toBe(5);

    const selectValueText = container.querySelector(
      '[data-slot="select-value"]',
    )?.textContent;
    expect(selectValueText).toBe("5 Minutes");
  });

  it("leaves a valid persisted duration untouched", async () => {
    localStorage.setItem(
      "dumos_autolock",
      JSON.stringify({
        state: { duration: 0, isLocked: false, lastActivity: Date.now() },
        version: 0,
      }),
    );

    const { useAutoLockStore } = await import("@/lib/hooks/use-auto-lock");
    const { SecuritySettings } = await import(
      "@/components/settings/security-settings"
    );

    root = createRoot(container);
    await act(() => {
      root.render(
        React.createElement(SecuritySettings, {
          currentPin: "",
          setCurrentPin: () => {},
          newPin: "",
          setNewPin: () => {},
          confirmPin: "",
          setConfirmPin: () => {},
          handleUpdateSecurity: () => Promise.resolve(true),
        }),
      );
    });

    expect(useAutoLockStore.getState().duration).toBe(0);
    const selectValueText = container.querySelector(
      '[data-slot="select-value"]',
    )?.textContent;
    expect(selectValueText).toBe("Off");
  });
});
