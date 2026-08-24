import { describe, it, expect, beforeEach, vi } from "vitest";

const saveMock = vi.fn();
const openMock = vi.fn();
const copyFileMock = vi.fn();
const appDataDirMock = vi.fn(async () => "/fake/appdata");
const joinMock = vi.fn(async (...parts: string[]) => parts.join("/"));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: saveMock,
  open: openMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  copyFile: copyFileMock,
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: appDataDirMock,
  join: joinMock,
}));

/**
 * These tests exercise the real orchestration logic in
 * backupDatabaseToFile()/restoreDatabaseFromFile() (lib/db/core.ts) against
 * a fake `db` connection and mocked Tauri plugins. They can't prove the
 * native dialogs or VACUUM INTO actually work inside a real Tauri runtime
 * (that needs a live desktop/mobile build), but they do prove the JS-side
 * control flow is correct: the right calls happen in the right order with
 * the right arguments, and cancelling a dialog doesn't touch the database.
 */
describe("Tauri backup/restore orchestration", () => {
  let core: typeof import("@/lib/db/core");
  let fakeDb: { execute: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    core = await import("@/lib/db/core");

    // isTauri() checks these window globals directly.
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    fakeDb = {
      execute: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(true),
    };
    core.__setDatabaseForTesting(fakeDb);
  });

  describe("backupDatabaseToFile()", () => {
    it("does nothing and reports failure when the user cancels the save dialog", async () => {
      saveMock.mockResolvedValueOnce(null);

      const result = await core.backupDatabaseToFile();

      expect(result).toEqual({ success: false });
      expect(fakeDb.execute).not.toHaveBeenCalled();
    });

    it("runs VACUUM INTO against the chosen path when the dialog succeeds", async () => {
      saveMock.mockResolvedValueOnce("/Users/cynthia/Desktop/my_backup.drx");

      const result = await core.backupDatabaseToFile();

      expect(result).toEqual({ success: true, path: "/Users/cynthia/Desktop/my_backup.drx" });
      expect(fakeDb.execute).toHaveBeenCalledTimes(1);
      expect(fakeDb.execute).toHaveBeenCalledWith(
        "VACUUM INTO '/Users/cynthia/Desktop/my_backup.drx'",
      );
    });

    it("escapes single quotes in the destination path so the SQL statement stays valid", async () => {
      saveMock.mockResolvedValueOnce("/Users/o'brien/backups/store.drx");

      await core.backupDatabaseToFile();

      expect(fakeDb.execute).toHaveBeenCalledWith(
        "VACUUM INTO '/Users/o''brien/backups/store.drx'",
      );
    });

    it("throws instead of silently no-oping when called outside a Tauri environment", async () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = undefined;

      await expect(core.backupDatabaseToFile()).rejects.toThrow(/desktop\/mobile-only/);
    });
  });

  describe("restoreDatabaseFromFile()", () => {
    it("does nothing and reports failure when the user cancels the open dialog", async () => {
      openMock.mockResolvedValueOnce(null);

      const result = await core.restoreDatabaseFromFile();

      expect(result).toEqual({ success: false });
      expect(fakeDb.close).not.toHaveBeenCalled();
      expect(copyFileMock).not.toHaveBeenCalled();
    });

    it("closes the live connection before overwriting the real database file", async () => {
      openMock.mockResolvedValueOnce("/Users/cynthia/Downloads/old_backup.drx");

      const result = await core.restoreDatabaseFromFile();

      expect(result).toEqual({ success: true });
      expect(fakeDb.close).toHaveBeenCalledTimes(1);
      expect(copyFileMock).toHaveBeenCalledWith(
        "/Users/cynthia/Downloads/old_backup.drx",
        "/fake/appdata/dumosrx.db",
      );

      // The close() call must happen before the copy, not after: copying
      // over a file that's still open/locked by the old connection is
      // exactly the kind of bug that would only surface on a real desktop
      // run, not in a mock that doesn't enforce ordering by default.
      const closeOrder = fakeDb.close.mock.invocationCallOrder[0];
      const copyOrder = copyFileMock.mock.invocationCallOrder[0];
      expect(closeOrder).toBeLessThan(copyOrder);
    });

    it("still overwrites the file even if closing the old connection throws", async () => {
      openMock.mockResolvedValueOnce("/Users/cynthia/Downloads/old_backup.drx");
      fakeDb.close.mockRejectedValueOnce(new Error("connection already gone"));

      const result = await core.restoreDatabaseFromFile();

      expect(result).toEqual({ success: true });
      expect(copyFileMock).toHaveBeenCalledTimes(1);
    });

    it("throws instead of silently no-oping when called outside a Tauri environment", async () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = undefined;

      await expect(core.restoreDatabaseFromFile()).rejects.toThrow(/desktop\/mobile-only/);
    });
  });
});
