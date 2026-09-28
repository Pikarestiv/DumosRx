import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Regression coverage for A-22 (docs/KNOWN_BUGS.md, carried from
 * docs/DATABASE_CONCURRENCY.md §2.4): `execute()` fires `void saveDatabase()`
 * without awaiting it and nothing serialised those calls, so two back-to-back
 * writes each took their own `db.export()` and raced their IndexedDB `set()`s
 * — an older image could land on top of a newer one, silently, with no
 * version stamp to notice it by. There was also no `pagehide` flush, so a
 * closing tab never got a chance to persist its last write.
 */

type SetCall = { key: string; value: Uint8Array };

const setCalls: SetCall[] = [];
const completed: string[] = [];
let setGate: ((key: string) => Promise<void>) | null = null;

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async (key: string, value: Uint8Array) => {
    setCalls.push({ key, value });
    if (setGate) await setGate(new TextDecoder().decode(value));
    completed.push(new TextDecoder().decode(value));
  }),
  del: vi.fn(async () => {}),
}));

const isWriterTab = vi.fn(() => true);

vi.mock("@/lib/db/tab-lock", () => ({
  initWriterLock: vi.fn(async () => {}),
  isWriterTab: () => isWriterTab(),
  onWriterTabChange: () => () => {},
  onPromotionFailed: () => () => {},
  requestWriterHandoff: vi.fn(),
  forceWriterTakeover: vi.fn(),
}));

describe("saveDatabase() persistence ordering and exit flush", () => {
  let core: typeof import("@/lib/db/core");
  let exported: string;

  beforeEach(async () => {
    setCalls.length = 0;
    completed.length = 0;
    setGate = null;
    isWriterTab.mockReturnValue(true);
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    core = await import("@/lib/db/core");
    core.__resetExitFlushForTesting();

    exported = "v0";
    core.__setDatabaseForTesting({
      export: () => new TextEncoder().encode(exported),
      run: vi.fn(),
      close: vi.fn(),
    });
  });

  afterEach(() => {
    core.__resetExitFlushForTesting();
  });

  it("never persists an older export on top of a newer one when two saves overlap", async () => {
    const releases: Record<string, () => void> = {};
    setGate = (label) =>
      new Promise<void>((resolve) => {
        releases[label] = resolve;
      });

    exported = "v1";
    const first = core.saveDatabase();
    exported = "v2";
    const second = core.saveDatabase();

    // The slow first write finishes AFTER the second was issued — the exact
    // interleaving that used to leave "v1" persisted over "v2".
    await Promise.resolve();
    releases["v1"]?.();
    await Promise.resolve();
    releases["v2"]?.();

    await Promise.all([first, second]);

    expect(completed[completed.length - 1]).toBe("v2");
  });

  it("collapses a burst of saves into the newest snapshot rather than writing each one", async () => {
    let release!: () => void;
    setGate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });

    exported = "a";
    const first = core.saveDatabase();
    exported = "b";
    const second = core.saveDatabase();
    exported = "c";
    const third = core.saveDatabase();

    await Promise.resolve();
    release();
    await Promise.all([first, second, third]);

    expect(completed[completed.length - 1]).toBe("c");
    expect(setCalls.length).toBeLessThan(3);
  });

  it("flushes the last write when the document goes away", async () => {
    core.installExitFlush();

    exported = "unflushed";
    core.__bumpWriteEpochForTesting();

    window.dispatchEvent(new Event("pagehide"));
    await new Promise((r) => setTimeout(r, 0));

    expect(completed).toContain("unflushed");
  });

  it("does not flush from a read-only tab, which would clobber the writer's blob", async () => {
    core.installExitFlush();
    isWriterTab.mockReturnValue(false);

    exported = "readonly-tab";
    core.__bumpWriteEpochForTesting();

    window.dispatchEvent(new Event("pagehide"));
    await new Promise((r) => setTimeout(r, 0));

    expect(completed).not.toContain("readonly-tab");
  });

  it("does not re-export on exit when everything is already persisted", async () => {
    core.installExitFlush();

    exported = "persisted";
    core.__bumpWriteEpochForTesting();
    await core.saveDatabase();
    const callsAfterSave = setCalls.length;

    window.dispatchEvent(new Event("pagehide"));
    await new Promise((r) => setTimeout(r, 0));

    expect(setCalls.length).toBe(callsAfterSave);
  });
});
