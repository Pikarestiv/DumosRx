import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// React 19's `act` warns unless the environment explicitly opts in.
// See __tests__/onboarding-local-restore-reload.test.ts for the same harness
// pattern (no @testing-library/react is installed in this repo).
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression test: handleResetDatabase() ("Factory Reset" in Settings > Data)
 * used to only wipe local tables, leaving the device's auth_token intact. On
 * a cloud-linked device, resetDatabase()'s own window.location.reload()
 * immediately re-triggered store-context.tsx's mount-time auto-sync effect,
 * which did a full pull and silently re-downloaded every just-cleared table
 * (products, sales, stock_movements, etc.) straight back from the server -
 * so "Reset All Data" looked like it had barely done anything.
 *
 * Fix: clear the auth token (same as a normal sign-out) before wiping local
 * tables, so the post-reload auto-sync effect finds no token and skips,
 * exactly like any other signed-out device would.
 */

const resetDatabaseMock = vi.fn(async () => undefined);
const clearTokenMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    promise: vi.fn(),
  },
}));

vi.mock("@/lib/db/core", () => ({
  getDatabaseBinary: vi.fn(),
  restoreDatabase: vi.fn(async () => undefined),
  resetDatabase: () => resetDatabaseMock(),
  isTauri: () => false,
  backupDatabaseToFile: vi.fn(),
  restoreDatabaseFromFile: vi.fn(),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true, pushed: 0, pulled: 0 })),
  syncSubscriptionStatus: vi.fn(async () => ({ updated: false })),
}));

vi.mock("@/lib/utils/post-restore-notice", () => ({
  markRestoredForCloudLinkNotice: vi.fn(),
}));

vi.mock("@/lib/api/token-manager", () => ({
  clearToken: () => clearTokenMock(),
}));

describe("useSettingsSync().handleResetDatabase", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookResult: ReturnType<typeof import("@/hooks/use-settings-sync").useSettingsSync>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { useSettingsSync } = await import("@/hooks/use-settings-sync");

    function Harness() {
      hookResult = useSettingsSync(true, async () => undefined);
      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(Harness));
    });
  });

  it("clears the auth token before wiping local tables, so the post-reload auto-sync can't restore what reset just cleared", async () => {
    await act(async () => {
      await hookResult.handleResetDatabase();
    });

    expect(clearTokenMock).toHaveBeenCalledTimes(1);
    expect(resetDatabaseMock).toHaveBeenCalledTimes(1);

    // Order matters: the token must be gone *before* resetDatabase() runs
    // (and reloads the page), not after - otherwise the mount-time auto-sync
    // effect on the reloaded page still finds a valid token and undoes the
    // reset by pulling everything back down.
    const clearTokenOrder = clearTokenMock.mock.invocationCallOrder[0];
    const resetDatabaseOrder = resetDatabaseMock.mock.invocationCallOrder[0];
    expect(clearTokenOrder).toBeLessThan(resetDatabaseOrder);
  });
});
