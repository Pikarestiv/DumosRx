import { describe, it, expect } from "vitest";
import {
  isSuppressibleTestNoise,
  installConsoleNoiseFilter,
  type FilterableConsole,
} from "../test-support/console-noise";

/**
 * Vitest's worker forwards every console call to the reporter over an rpc,
 * and the worker closes as soon as the last test finishes. Fire-and-forget
 * async work — `void logCrash(...)`, a sync-engine catch, a DB retry — can
 * write a line after that point, leaving a flush in flight when the rpc
 * closes: `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog"
 * was pending`. The suite is green and the job still exits non-zero.
 *
 * No vitest setting prevents the send (`silent` and `onConsoleLog` are both
 * reporter-side), so the only fix is for those lines not to be written. This
 * predicate decides which are pure noise.
 */
describe("isSuppressibleTestNoise", () => {
  it("suppresses the crash logger's own progress chatter", () => {
    expect(isSuppressibleTestNoise(["[Logger] Crash log written to local database"])).toBe(true);
  });

  it("suppresses a sync-engine or DB diagnostic", () => {
    expect(isSuppressibleTestNoise(["[Sync] Could not deliver command outcomes"])).toBe(true);
    expect(isSuppressibleTestNoise(["[DB] Failed to initialize database:", new Error("locked")])).toBe(
      true,
    );
  });

  /**
   * The straggler actually caught in CI: a mock missing an export makes the
   * crash path throw, and the caught error is logged with a full stack - a
   * big payload, so the slowest thing to flush.
   */
  it("suppresses the mock-shaped failure that was seen pending at teardown", () => {
    expect(
      isSuppressibleTestNoise([
        "[Logger] SQLite not available, queueing crash to localStorage:",
        new Error('No "update" export is defined on the "@/lib/db/local-database" mock'),
      ]),
    ).toBe(true);
  });

  /** Anything a person deliberately printed while debugging must survive. */
  it("keeps an ordinary log", () => {
    expect(isSuppressibleTestNoise(["why is this undefined?", { id: 1 }])).toBe(false);
  });

  it("keeps a line whose prefix is not on the list", () => {
    expect(isSuppressibleTestNoise(["[Checkout] totals disagree"])).toBe(false);
  });

  it("keeps a non-string first argument", () => {
    expect(isSuppressibleTestNoise([new Error("boom")])).toBe(false);
    expect(isSuppressibleTestNoise([])).toBe(false);
  });

  /** A prefix must be at the start, not merely present somewhere. */
  it("does not match a tag appearing mid-message", () => {
    expect(isSuppressibleTestNoise(["assertion failed: expected [Sync] to appear"])).toBe(false);
  });
});

describe("installConsoleNoiseFilter", () => {
  const fakeConsole = () => {
    const log: unknown[][] = [];
    const warn: unknown[][] = [];

    const target: FilterableConsole = {
      log: (...args: unknown[]) => void log.push(args),
      warn: (...args: unknown[]) => void warn.push(args),
    };

    return { target, log, warn };
  };

  it("stops a suppressible line from ever being written", () => {
    const { target, log } = fakeConsole();
    installConsoleNoiseFilter(target, true);

    target.log("[Sync] drained 0 items");

    expect(log).toEqual([]);
  });

  it("still writes everything else", () => {
    const { target, log, warn } = fakeConsole();
    installConsoleNoiseFilter(target, true);

    target.log("a real message", 42);
    target.warn("something worth seeing");

    expect(log).toEqual([["a real message", 42]]);
    expect(warn).toEqual([["something worth seeing"]]);
  });

  it("filters warn as well as log", () => {
    const { target, warn } = fakeConsole();
    installConsoleNoiseFilter(target, true);

    target.warn("[Logger] SQLite not available, queueing crash to localStorage:", new Error("x"));

    expect(warn).toEqual([]);
  });

  /** A local run must keep the output a developer is debugging with. */
  it("does nothing at all when disabled", () => {
    const { target, log } = fakeConsole();
    installConsoleNoiseFilter(target, false);

    target.log("[Sync] drained 0 items");

    expect(log).toEqual([["[Sync] drained 0 items"]]);
  });
});
