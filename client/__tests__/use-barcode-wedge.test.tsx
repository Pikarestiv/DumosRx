import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { render, renderHook } from "@testing-library/react";
import { useBarcodeWedge, WEDGE_MAX_KEY_GAP_MS } from "@/lib/hooks/use-barcode-wedge";

const FAST_GAP_MS = 10;
const HUMAN_GAP_MS = 150;

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function type(text: string, gapMs: number, target: EventTarget = document.body, terminator = "Enter") {
  for (const char of text) {
    press(char, target);
    vi.advanceTimersByTime(gapMs);
  }
  return press(terminator, target);
}

function mountWedge(options: { disabled?: boolean } = {}) {
  const onScan = vi.fn();
  const searchInputRef = createRef<HTMLInputElement>();
  const searchInput = document.createElement("input");
  document.body.appendChild(searchInput);
  (searchInputRef as { current: HTMLInputElement | null }).current = searchInput;
  const hook = renderHook(
    ({ disabled }) => useBarcodeWedge({ onScan, searchInputRef, disabled }),
    { initialProps: { disabled: options.disabled ?? false } },
  );
  return { onScan, searchInput, ...hook };
}

describe("useBarcodeWedge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scans a fast burst ending in Enter from anywhere on the page, once, and swallows the Enter", () => {
    const { onScan } = mountWedge();
    const button = document.createElement("button");
    document.body.appendChild(button);
    const buttonClick = vi.fn();
    button.addEventListener("keydown", buttonClick);

    const enter = type("6151100012345", FAST_GAP_MS, button);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("6151100012345");
    expect(enter.defaultPrevented).toBe(true);
    expect(buttonClick.mock.calls.filter(([e]) => (e as KeyboardEvent).key === "Enter")).toHaveLength(0);
  });

  it("accepts Tab as the terminator for scanners set to send it", () => {
    const { onScan } = mountWedge();
    type("BATCH-0042", FAST_GAP_MS, document.body, "Tab");
    expect(onScan).toHaveBeenCalledWith("BATCH-0042");
  });

  it("keeps Shift-held uppercase characters in the code", () => {
    const { onScan } = mountWedge();
    for (const char of "AB12") {
      press("Shift");
      press(char, document.body, { shiftKey: true });
      vi.advanceTimersByTime(FAST_GAP_MS);
    }
    press("Enter");
    expect(onScan).toHaveBeenCalledWith("AB12");
  });

  it("never treats human-speed typing as a scan, and leaves its Enter alone", () => {
    const { onScan } = mountWedge();
    const enter = type("123456789", HUMAN_GAP_MS);
    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
  });

  it("drops a burst whose Enter arrives after a human-length pause", () => {
    const { onScan } = mountWedge();
    for (const char of "12345678") {
      press(char);
      vi.advanceTimersByTime(FAST_GAP_MS);
    }
    vi.advanceTimersByTime(WEDGE_MAX_KEY_GAP_MS + 1);
    press("Enter");
    expect(onScan).not.toHaveBeenCalled();
  });

  it("ignores bursts shorter than a barcode", () => {
    const { onScan } = mountWedge();
    type("123", FAST_GAP_MS);
    expect(onScan).not.toHaveBeenCalled();
  });

  it("leaves typing in other fields alone", () => {
    const { onScan } = mountWedge();
    const { container } = render(
      <div>
        <input aria-label="Customer phone" />
        <textarea aria-label="Note" />
        <div contentEditable suppressContentEditableWarning aria-label="Rich" />
      </div>,
    );
    for (const field of Array.from(container.querySelectorAll("input, textarea, [contenteditable]"))) {
      type("6151100012345", FAST_GAP_MS, field);
    }
    expect(onScan).not.toHaveBeenCalled();
  });

  it("does not double-handle a scan into the POS search box, which has its own Enter path", () => {
    const { onScan, searchInput } = mountWedge();
    const enter = type("6151100012345", FAST_GAP_MS, searchInput);
    expect(onScan).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
  });

  it("stands down while any dialog is open", () => {
    const { onScan } = mountWedge();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);

    type("6151100012345", FAST_GAP_MS);
    expect(onScan).not.toHaveBeenCalled();
  });

  it("stands down while the POS says a flow is in progress", () => {
    const { onScan } = mountWedge({ disabled: true });
    type("6151100012345", FAST_GAP_MS);
    expect(onScan).not.toHaveBeenCalled();
  });

  it("ignores keys pressed with Ctrl, Alt or Meta held", () => {
    const { onScan } = mountWedge();
    for (const char of "6151100012345") {
      press(char, document.body, { ctrlKey: true });
      vi.advanceTimersByTime(FAST_GAP_MS);
    }
    press("Enter");
    expect(onScan).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const { onScan, unmount } = mountWedge();
    unmount();
    type("6151100012345", FAST_GAP_MS);
    expect(onScan).not.toHaveBeenCalled();
  });
});
