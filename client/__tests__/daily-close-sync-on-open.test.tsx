import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const { sync, authToken } = vi.hoisted(() => ({
  sync: vi.fn(),
  authToken: { value: "token" as string | null },
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync,
  isSyncing: () => false,
  SYNC_IN_PROGRESS_ERROR: "Sync already in progress",
}));

vi.mock("@/lib/storage-keys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage-keys")>()),
  getAuthToken: () => authToken.value,
}));

import { recordSyncOutcome } from "@/lib/db/sync-engine/sync-outcome";
import { DailyCloseSyncNote } from "@/components/reports/daily-close/daily-close-sync-note";
import { SYNC_RECOVERY_POLL_MS } from "@/lib/hooks/use-sync-on-open";

const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { value: online, configurable: true });

describe("Daily Close syncs when it opens", () => {
  beforeEach(() => {
    sync.mockReset();
    authToken.value = "token";
    localStorage.clear();
    setOnline(true);
  });

  afterEach(() => setOnline(true));

  it("pulls the other tills' sales once and clears its notice when the sync lands", async () => {
    let finish: (value: { success: boolean; pushed: number; pulled: number; error?: string }) => void = () => {};
    sync.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    render(<DailyCloseSyncNote />);

    expect((await screen.findByRole("status")).textContent).toMatch(/syncing the latest sales/i);
    finish({ success: true, pushed: 0, pulled: 3 });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("says the report is as of the last sync when the cloud sync fails", async () => {
    sync.mockResolvedValue({ success: false, pushed: 0, pulled: 0, error: "Server error" });

    render(<DailyCloseSyncNote />);

    expect((await screen.findByRole("note")).textContent).toMatch(/last sync/i);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not try to sync offline, and says the report is as of the last sync", async () => {
    setOnline(false);

    render(<DailyCloseSyncNote />);

    expect((await screen.findByRole("note")).textContent).toMatch(/last sync/i);
    expect(sync).not.toHaveBeenCalled();
  });

  it("stays quiet and skips the sync when no cloud account is linked", async () => {
    authToken.value = null;

    render(<DailyCloseSyncNote />);

    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("note")).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  describe("after a sync that could not refresh", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      sync.mockResolvedValue({ success: false, pushed: 0, pulled: 0, error: "Server error" });
    });

    afterEach(() => vi.useRealTimers());

    const waitOnePoll = (polls = 1) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(SYNC_RECOVERY_POLL_MS * polls);
      });

    it("clears the stale-data note once a later sync succeeds", async () => {
      render(<DailyCloseSyncNote />);
      expect(await screen.findByRole("note")).toBeTruthy();

      recordSyncOutcome({ success: true, pushed: 0, pulled: 2 });
      await waitOnePoll();

      expect(screen.queryByRole("note")).toBeNull();
    });

    it("keeps the note when the only recorded success came before the page went stale", async () => {
      recordSyncOutcome({ success: true, pushed: 0, pulled: 2 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      render(<DailyCloseSyncNote />);
      expect(await screen.findByRole("note")).toBeTruthy();

      await waitOnePoll(3);

      expect(screen.getByRole("note")).toBeTruthy();
    });
  });
});
