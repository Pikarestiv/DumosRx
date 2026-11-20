import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutosaveScheduler, type AutosaveState } from "@/lib/utils/autosave-scheduler";

describe("createAutosaveScheduler", () => {
  let states: AutosaveState[];

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const make = (save: () => Promise<void>) =>
    createAutosaveScheduler({ save, debounceMs: 600, onState: (s) => states.push(s) });

  it("waits for typing to pause before saving, then saves once", async () => {
    const save = vi.fn(() => Promise.resolve());
    const scheduler = make(save);

    scheduler.request("debounced");
    await vi.advanceTimersByTimeAsync(300);
    scheduler.request("debounced");
    await vi.advanceTimersByTimeAsync(300);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe("saved");
  });

  it("saves at once for an added or removed row, cancelling any pending debounce", async () => {
    const save = vi.fn(() => Promise.resolve());
    const scheduler = make(save);

    scheduler.request("debounced");
    scheduler.request("now");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never runs two saves at once, and saves again after one that was overtaken by an edit", async () => {
    let finish: () => void = () => {};
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const scheduler = make(save);

    scheduler.request("now");
    await vi.advanceTimersByTimeAsync(0);
    scheduler.request("now");
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    finish();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("flushes a pending debounce immediately and resolves once it has landed", async () => {
    const save = vi.fn(() => Promise.resolve());
    const scheduler = make(save);

    scheduler.request("debounced");
    await scheduler.flush();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps an error state after a failed save, and retries when asked", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const scheduler = make(save);

    scheduler.request("now");
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("error");
    expect(scheduler.lastError()?.message).toBe("disk full");

    scheduler.request("now");
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("saved");
    expect(scheduler.lastError()).toBeNull();
  });

  it("does nothing on flush when there is nothing to save", async () => {
    const save = vi.fn(() => Promise.resolve());
    await make(save).flush();
    expect(save).not.toHaveBeenCalled();
  });
});
