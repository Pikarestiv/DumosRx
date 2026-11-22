import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { usePullToRefresh } from "@/lib/hooks/use-pull-to-refresh";

function Harness({
  onRefresh,
  nestedScrollTop = 0,
}: {
  onRefresh: () => Promise<void> | void;
  nestedScrollTop?: number;
}) {
  const { scrollRef, pullDistance, isRefreshing } = usePullToRefresh<HTMLDivElement>({
    onRefresh,
  });

  return (
    <div ref={scrollRef} data-testid="root" data-pull={pullDistance} data-refreshing={String(isRefreshing)}>
      <div
        data-testid="nested"
        ref={(el) => {
          if (el) el.scrollTop = nestedScrollTop;
        }}
      />
    </div>
  );
}

function touchEvent(type: string, clientY: number, clientX = 0) {
  const evt = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent;
  Object.defineProperty(evt, "touches", {
    value: [{ clientY, clientX }],
  });
  return evt;
}

describe("usePullToRefresh", () => {
  it("triggers onRefresh when pulled down past threshold from scrollTop 0", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const root = getByTestId("root");

    await act(() => {
      root.dispatchEvent(touchEvent("touchstart", 100));
      root.dispatchEvent(touchEvent("touchmove", 260));
      root.dispatchEvent(new Event("touchend", { bubbles: true }));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onRefresh when a nested scroll container is scrolled down", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<Harness onRefresh={onRefresh} nestedScrollTop={40} />);
    const nested = getByTestId("nested");

    await act(() => {
      nested.dispatchEvent(touchEvent("touchstart", 100));
      nested.dispatchEvent(touchEvent("touchmove", 260));
      nested.dispatchEvent(new Event("touchend", { bubbles: true }));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("cancels pull on horizontal swipe", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<Harness onRefresh={onRefresh} />);
    const root = getByTestId("root");

    await act(() => {
      root.dispatchEvent(touchEvent("touchstart", 100, 100));
      root.dispatchEvent(touchEvent("touchmove", 120, 260));
      root.dispatchEvent(new Event("touchend", { bubbles: true }));
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
