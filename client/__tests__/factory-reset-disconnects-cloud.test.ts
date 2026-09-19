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
 *
 * Also covers the follow-up hardening: resetDatabase() wipes audit_logs
 * itself, so logAction() + an immediate sync() push (while the token is
 * still valid) is this action's only chance to leave any trace anywhere.
 */

const resetDatabaseMock = vi.fn(async () => undefined);
const clearTokenMock = vi.fn();
const logActionMock = vi.fn(async (..._args: unknown[]) => undefined);
const syncMock = vi.fn(async (..._args: unknown[]) => ({ success: true, pushed: 1, pulled: 0 }));

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
  logAction: (...args: unknown[]) => logActionMock(...args),
  getActiveStoreId: (): string => "store-1",
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: (...args: unknown[]) => syncMock(...args),
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

  async function renderHook(isCloudLinked: boolean) {
    const { useSettingsSync } = await import("@/hooks/use-settings-sync");

    function Harness() {
      hookResult = useSettingsSync(isCloudLinked, async () => undefined);
      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(Harness));
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the auth token before wiping local tables, so the post-reload auto-sync can't restore what reset just cleared", async () => {
    await renderHook(true);

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

  it("logs the action and pushes it to the server before disconnecting, when cloud-linked", async () => {
    await renderHook(true);

    await act(async () => {
      await hookResult.handleResetDatabase();
    });

    expect(logActionMock).toHaveBeenCalledTimes(1);
    expect(logActionMock).toHaveBeenCalledWith(
      "FACTORY_RESET",
      "stores",
      "store-1",
      expect.objectContaining({ cloud_linked: true }),
    );
    expect(syncMock).toHaveBeenCalledWith(true);

    // The audit log must actually reach the server before the token that
    // would let it get there is cleared - logging it locally right before
    // wiping local tables (and disconnecting) would be no trace at all.
    const logOrder = logActionMock.mock.invocationCallOrder[0];
    const syncOrder = syncMock.mock.invocationCallOrder[0];
    const clearTokenOrder = clearTokenMock.mock.invocationCallOrder[0];
    expect(logOrder).toBeLessThan(syncOrder);
    expect(syncOrder).toBeLessThan(clearTokenOrder);
  });

  it("still logs locally but skips the network push when not cloud-linked", async () => {
    await renderHook(false);

    await act(async () => {
      await hookResult.handleResetDatabase();
    });

    expect(logActionMock).toHaveBeenCalledTimes(1);
    expect(logActionMock).toHaveBeenCalledWith(
      "FACTORY_RESET",
      "stores",
      "store-1",
      expect.objectContaining({ cloud_linked: false }),
    );
    // Nothing to push to and no token to protect - sync() would just fail.
    expect(syncMock).not.toHaveBeenCalled();
    expect(resetDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it("still proceeds with the reset if the audit push fails (e.g. offline)", async () => {
    syncMock.mockRejectedValueOnce(new Error("offline"));
    await renderHook(true);

    await act(async () => {
      await hookResult.handleResetDatabase();
    });

    expect(clearTokenMock).toHaveBeenCalledTimes(1);
    expect(resetDatabaseMock).toHaveBeenCalledTimes(1);
  });
});
