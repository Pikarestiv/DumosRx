import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { useSettingsSync } from "@/hooks/use-settings-sync";
import { STORE_REFUSED_MESSAGE, type StoreRefusal } from "@/lib/db/sync-engine/store-refusal";
import { SYNC_IN_PROGRESS_ERROR } from "@/lib/db/sync-engine/sync-outcome";

let mockIsSyncing = false;
const mockSync = vi.fn();
const mockForceFullResync = vi.fn();
const mockSyncSubscriptionStatus = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    promise: vi.fn((p: Promise<unknown>) => {
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
      return p;
    }),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: (...args: unknown[]) => mockSync(...args),
  isSyncing: () => mockIsSyncing,
  forceFullResync: (...args: unknown[]) => mockForceFullResync(...args),
  syncSubscriptionStatus: () => mockSyncSubscriptionStatus(),
  SYNC_IN_PROGRESS_ERROR: "Sync already in progress",
}));

vi.mock("@/lib/db/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/core")>();
  return {
    ...actual,
    isTauri: () => false,
    getActiveStoreId: () => "store-b",
  };
});

describe("useSettingsSync in-progress & refusal handling (A-363)", () => {
  const refetchStore = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSyncing = false;
    mockSync.mockResolvedValue({ success: true, pushed: 1, pulled: 2 });
    mockForceFullResync.mockResolvedValue({ success: true, pushed: 0, pulled: 0 });
    mockSyncSubscriptionStatus.mockResolvedValue({ success: true, updated: false });
  });

  it("shows toast.info and skips toast.promise when sync is already in progress on handleSync", async () => {
    mockIsSyncing = true;
    const { result } = renderHook(() => useSettingsSync(true, refetchStore));

    await act(async () => {
      await result.current.handleSync();
    });

    expect(toast.info).toHaveBeenCalledWith(SYNC_IN_PROGRESS_ERROR);
    expect(toast.promise).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("shows toast.info and skips toast.promise when sync is already in progress on handleForceFullResync", async () => {
    mockIsSyncing = true;
    const { result } = renderHook(() => useSettingsSync(true, refetchStore));

    act(() => {
      result.current.handleForceFullResync();
    });

    expect(toast.info).toHaveBeenCalledWith(SYNC_IN_PROGRESS_ERROR);
    expect(toast.promise).not.toHaveBeenCalled();
    expect(mockForceFullResync).not.toHaveBeenCalled();
  });

  it("passes hasFixedStore through to failUnlessSucceeded so store refusal carries its remedy in toast.promise", async () => {
    const refusal: StoreRefusal = {
      storeId: "store-b",
      accessibleStores: [{ id: "store-c", name: "Store C" }],
    };
    mockSync.mockResolvedValue({
      success: false,
      pushed: 0,
      pulled: 0,
      error: STORE_REFUSED_MESSAGE,
      refusal,
    });

    const { result } = renderHook(() => useSettingsSync(true, refetchStore, true));

    await act(async () => {
      await result.current.handleSync();
    });

    expect(toast.promise).toHaveBeenCalledTimes(1);
    const [passedPromise, options] = (toast.promise as any).mock.calls[0];
    await expect(passedPromise).rejects.toThrow(
      `${STORE_REFUSED_MESSAGE} Ask the store owner which store this till should use.`,
    );

    const errorFn = options.error;
    expect(errorFn(new Error("custom error"))).toBe("custom error");
  });
});
