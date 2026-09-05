import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

/**
 * Regression coverage for a real reported bug (see issue.png): the
 * Auto-Lock Screen dropdown rendered completely blank — not even its own
 * "Select duration" placeholder — for a real account. Root cause: the
 * persisted duration in this account's localStorage (dumos_autolock) was
 * 999, which doesn't match any of the five SelectItem options
 * (0/1/5/15/30). Radix's Select has nothing to match and shows nothing at
 * all, with no way for the user to tell why or fix it themselves short of
 * already knowing to pick a new value.
 *
 * However this particular value got there (an older app version, manual
 * localStorage editing, a since-removed option), the underlying gap is
 * real: nothing ever validated the persisted duration against the actual
 * set of supported options. Fixed by self-healing to the store's own
 * documented default (5) on mount whenever the persisted value doesn't
 * match a real option.
 */

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canAutoLock: true,
    withRestriction: (fn: (...args: unknown[]) => void) => fn,
    getUpgradeMessage: () => "",
  }),
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
    await act(async () => {
      root.render(
        React.createElement(SecuritySettings, {
          currentPin: "",
          setCurrentPin: () => {},
          newPin: "",
          setNewPin: () => {},
          confirmPin: "",
          setConfirmPin: () => {},
          handleUpdateSecurity: async () => true,
        }),
      );
    });

    // The self-heal effect corrects the store, not just the display —
    // otherwise the same blank dropdown would come right back on the next
    // page load.
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
    await act(async () => {
      root.render(
        React.createElement(SecuritySettings, {
          currentPin: "",
          setCurrentPin: () => {},
          newPin: "",
          setNewPin: () => {},
          confirmPin: "",
          setConfirmPin: () => {},
          handleUpdateSecurity: async () => true,
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
