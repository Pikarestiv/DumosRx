import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { LOCK_HEARTBEAT_MS, useLockHeartbeat } from "@/components/procurement/order-screen/use-lock-heartbeat";

describe("the editing lock heartbeat", () => {
  afterEach(() => vi.useRealTimers());

  it("restamps the lock every few minutes while someone is working on the screen", () => {
    vi.useFakeTimers();
    let beats = 0;
    renderHook(() => useLockHeartbeat({ active: true, beat: () => Promise.resolve(void beats++) }));

    vi.advanceTimersByTime(LOCK_HEARTBEAT_MS - 1000);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    vi.advanceTimersByTime(1000);
    expect(beats).toBe(1);
  });

  it("stops restamping after the first interval in which nobody touched the screen", () => {
    vi.useFakeTimers();
    let beats = 0;
    renderHook(() => useLockHeartbeat({ active: true, beat: () => Promise.resolve(void beats++) }));

    vi.advanceTimersByTime(LOCK_HEARTBEAT_MS * 3);
    expect(beats).toBe(1);
  });

  it("never beats for an order that is not saved or is blocked", () => {
    vi.useFakeTimers();
    let beats = 0;
    renderHook(() => useLockHeartbeat({ active: false, beat: () => Promise.resolve(void beats++) }));
    vi.advanceTimersByTime(LOCK_HEARTBEAT_MS * 2);
    expect(beats).toBe(0);
  });
});
