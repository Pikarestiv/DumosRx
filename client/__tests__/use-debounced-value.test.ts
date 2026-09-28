import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 300));
    expect(result.current).toBe("a");
  });

  it("does not publish a new value before the delay has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(result.current).toBe("a");
  });

  it("publishes the new value once the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("ab");
  });

  it("restarts the delay on every change, so rapid typing publishes only the last value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "" } },
    );

    for (const value of ["p", "pa", "par", "para"]) {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current).toBe("");
    }

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe("para");
  });

  it("publishes immediately when the delay is zero", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 0),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current).toBe("b");
  });

  it("works for non-string values and keeps object identity", () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: first } },
    );

    rerender({ value: second });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(second);
  });

  it("drops a pending value when it is reverted before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "a" });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("a");
  });
});
