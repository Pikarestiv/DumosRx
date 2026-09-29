import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useArrowKeyScroll } from "@/lib/hooks/use-arrow-key-scroll";

// jsdom never lays anything out, so every dimension the hook reads has to be
// stated explicitly on the element.
function makeScrollable({
  vertical = true,
  horizontal = false,
}: { vertical?: boolean; horizontal?: boolean } = {}) {
  const el = document.createElement("div");
  el.style.overflowY = vertical ? "auto" : "visible";
  el.style.overflowX = horizontal ? "auto" : "visible";
  Object.defineProperties(el, {
    scrollHeight: { value: vertical ? 1000 : 300, configurable: true },
    clientHeight: { value: 300, configurable: true },
    scrollWidth: { value: horizontal ? 1000 : 300, configurable: true },
    clientWidth: { value: 300, configurable: true },
  });
  el.getClientRects = () => [{}] as unknown as DOMRectList;
  el.scrollBy = vi.fn();
  document.body.appendChild(el);
  return el;
}

function mountHook(
  el: HTMLElement,
  options?: Parameters<typeof useArrowKeyScroll>[1],
) {
  return renderHook(() => {
    const ref = useRef<HTMLElement | null>(el);
    useArrowKeyScroll(ref, options);
  });
}

function pressArrow(key: string, target: EventTarget = document) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("useArrowKeyScroll", () => {
  it("scrolls the region when nothing else has the arrow keys", () => {
    const el = makeScrollable();
    mountHook(el);

    pressArrow("ArrowDown");
    expect(el.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 48 }),
    );

    pressArrow("ArrowUp");
    expect(el.scrollBy).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: -48 }),
    );
  });

  it("ignores a keypress from a focused text input", () => {
    const el = makeScrollable();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    mountHook(el);

    pressArrow("ArrowDown", input);
    expect(el.scrollBy).not.toHaveBeenCalled();
  });

  it("ignores a keypress from a textarea, select or contenteditable", () => {
    const el = makeScrollable();
    mountHook(el);

    for (const tag of ["textarea", "select"] as const) {
      const node = document.createElement(tag);
      document.body.appendChild(node);
      pressArrow("ArrowDown", node);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
    pressArrow("ArrowDown", editable);

    expect(el.scrollBy).not.toHaveBeenCalled();
  });

  it("ignores a keypress inside a component that handles arrow keys itself", () => {
    const el = makeScrollable();
    const combobox = document.createElement("div");
    combobox.setAttribute("role", "combobox");
    const option = document.createElement("div");
    combobox.appendChild(option);
    document.body.appendChild(combobox);
    mountHook(el);

    pressArrow("ArrowDown", option);
    expect(el.scrollBy).not.toHaveBeenCalled();
  });

  it("stands down when the page has a second scrollable region", () => {
    const el = makeScrollable();
    makeScrollable();
    mountHook(el);

    pressArrow("ArrowDown");
    expect(el.scrollBy).not.toHaveBeenCalled();
  });

  it("only takes the horizontal arrows when the region scrolls horizontally", () => {
    const vertical = makeScrollable();
    mountHook(vertical);
    pressArrow("ArrowRight");
    expect(vertical.scrollBy).not.toHaveBeenCalled();

    document.body.innerHTML = "";
    const both = makeScrollable({ horizontal: true });
    mountHook(both);
    pressArrow("ArrowRight");
    expect(both.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 48 }),
    );
  });

  it("leaves modified keypresses and already-handled events alone", () => {
    const el = makeScrollable();
    mountHook(el);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, metaKey: true }),
    );
    expect(el.scrollBy).not.toHaveBeenCalled();

    const handled = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    document.dispatchEvent(handled);
    expect(el.scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing when disabled or after unmount", () => {
    const el = makeScrollable();
    const disabled = mountHook(el, { enabled: false });
    pressArrow("ArrowDown");
    expect(el.scrollBy).not.toHaveBeenCalled();
    disabled.unmount();

    const active = mountHook(el);
    active.unmount();
    pressArrow("ArrowDown");
    expect(el.scrollBy).not.toHaveBeenCalled();
  });
});
