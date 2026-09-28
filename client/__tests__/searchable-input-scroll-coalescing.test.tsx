import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import React from "react";
import {
  SearchableInput,
  isSameMenuRect,
} from "@/components/ui/searchable-input";

/**
 * searchable-input registers its `scroll` listener in the capture phase (it
 * has to - see the doc comment on the effect), so it fires for scrolling on
 * every scrollable element on the page while its dropdown is open, and each
 * event used to do a getBoundingClientRect() (a forced layout) plus a state
 * update. Scrolling a long list with a dropdown open is the common case, so
 * the work has to be coalesced to one measurement per frame, and a
 * measurement that produced the same rect must not re-render at all.
 */

describe("isSameMenuRect", () => {
  it("treats two identical rects as unchanged", () => {
    expect(
      isSameMenuRect(
        { top: 10, left: 4, width: 100 },
        { top: 10, left: 4, width: 100 },
      ),
    ).toBe(true);
  });

  it("notices a moved or resized rect", () => {
    const base = { top: 10, left: 4, width: 100 };
    expect(isSameMenuRect(base, { top: 11, left: 4, width: 100 })).toBe(false);
    expect(isSameMenuRect(base, { top: 10, left: 5, width: 100 })).toBe(false);
    expect(isSameMenuRect(base, { top: 10, left: 4, width: 101 })).toBe(false);
  });

  it("notices a flip from below the input to above it", () => {
    expect(
      isSameMenuRect(
        { top: 10, left: 4, width: 100 },
        { bottom: 10, left: 4, width: 100 },
      ),
    ).toBe(false);
  });

  it("treats a missing previous rect as changed", () => {
    expect(isSameMenuRect(null, { top: 10, left: 4, width: 100 })).toBe(false);
  });
});

describe("SearchableInput scroll handling", () => {
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        top: 100,
        bottom: 130,
        left: 20,
        right: 220,
        width: 200,
        height: 30,
        x: 20,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);
  });

  afterEach(() => {
    rectSpy.mockRestore();
  });

  it("measures at most once per frame however many scroll events arrive", async () => {
    const { container } = render(
      <SearchableInput
        value=""
        onChange={() => {}}
        options={["Painkillers", "Antibiotics"]}
      />,
    );

    const input = container.querySelector("input");
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.focus(input as HTMLInputElement);
    });

    rectSpy.mockClear();

    await act(async () => {
      for (let i = 0; i < 20; i += 1) {
        fireEvent.scroll(window);
      }
    });

    // Before coalescing this was one measurement per event.
    expect(rectSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
