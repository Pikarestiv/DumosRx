import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { useKeyboardViewport } from "@/lib/hooks/use-keyboard-viewport";

function Mount() {
  useKeyboardViewport();
  return null;
}

function setViewport(values: { height: number; scale: number; offsetTop?: number }) {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { ...values, offsetTop: values.offsetTop ?? 0, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
}

describe("useKeyboardViewport", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-keyboard-open");
    document.documentElement.style.removeProperty("--kb-inset");
  });

  it("flags the keyboard as open when the visual viewport is much shorter than the window", () => {
    setViewport({ height: 450, scale: 1 });
    render(<Mount />);

    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--kb-inset")).toBe("350px");
  });

  it("does not mistake a pinch zoom for the keyboard", () => {
    setViewport({ height: 450, scale: 2 });
    render(<Mount />);

    expect(document.documentElement.hasAttribute("data-keyboard-open")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--kb-inset")).toBe("0px");
  });
});
