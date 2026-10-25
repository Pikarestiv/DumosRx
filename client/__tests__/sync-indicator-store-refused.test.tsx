import { describe, it, expect, beforeEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STORE_REFUSED = "Sync is paused: this device's store is no longer available to your account.";
const mockSync = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: 0 }) }));
vi.mock("@/lib/db/queries/setup", () => ({ getSyncQueueCount: vi.fn(() => Promise.resolve(0)) }));
vi.mock("@/lib/db/sync-engine", () => ({
  sync: (...args: unknown[]) => mockSync(...args),
  isSyncing: () => false,
  SYNC_IN_PROGRESS_ERROR: "Sync already in progress",
}));
vi.mock("@/lib/db/core", () => ({ addSyncQueueChangeListener: vi.fn(() => () => {}) }));
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a), info: vi.fn() },
}));
vi.mock("@/lib/query-keys", () => ({
  queryKeys: { sync: { queueCount: () => ({ queryKey: ["syncQueueCount"] }) } },
}));
vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ isImpersonating: false, user: { store_id: undefined } }) }));
vi.mock("@/lib/db/DatabaseProvider", () => ({ useDatabase: () => ({ isReadOnlyTab: false }) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: null, switchStore: vi.fn() }) }));

describe("the sync indicator on a refused store (A-323)", () => {
  let state: ReturnType<typeof import("@/lib/hooks/use-sync-indicator-state").useSyncIndicatorState>;

  beforeEach(async () => {
    mockSync.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    const { useSyncIndicatorState } = await import("@/lib/hooks/use-sync-indicator-state");
    function Probe() {
      state = useSyncIndicatorState();
      return null;
    }
    await act(() => {
      createRoot(document.createElement("div")).render(<Probe />);
    });
  });

  it("shows an error naming the problem and the way back instead of reading synced", async () => {
    mockSync.mockResolvedValue({
      success: false,
      pushed: 0,
      pulled: 1,
      error: STORE_REFUSED,
      refusal: { storeId: "store-b", accessibleStores: [{ id: "store-c", name: "Store C" }] },
    });

    await act(async () => {
      await state.handleManualSync();
    });

    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe(`${STORE_REFUSED} Switch to Store C to keep syncing.`);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
