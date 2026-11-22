import { describe, it, expect, vi, afterEach } from "vitest";
import { registerBeforeReload, runBeforeReload } from "@/lib/utils/reload-guard";

describe("reload guard", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    cleanups.splice(0).forEach((fn) => fn());
    vi.useRealTimers();
  });

  it("waits for every registered save to land before the reload goes ahead", async () => {
    const order: string[] = [];
    cleanups.push(registerBeforeReload(() => {
      order.push("saved");
      return Promise.resolve();
    }));
    await runBeforeReload(1000);
    order.push("reload");
    expect(order).toEqual(["saved", "reload"]);
  });

  it("gives up waiting after the timeout so a stuck save cannot block an update for ever", async () => {
    vi.useFakeTimers();
    cleanups.push(registerBeforeReload(() => new Promise(() => {})));
    const done = vi.fn();
    void runBeforeReload(1500).then(done);
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it("still reloads when a save fails, and forgets a screen that has closed", async () => {
    const stale = vi.fn(() => Promise.resolve());
    registerBeforeReload(stale)();
    cleanups.push(registerBeforeReload(() => Promise.reject(new Error("disk"))));
    await expect(runBeforeReload(1000)).resolves.toBeUndefined();
    expect(stale).not.toHaveBeenCalled();
  });
});
