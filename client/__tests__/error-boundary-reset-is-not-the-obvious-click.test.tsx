import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/utils/error-logger", () => ({ logCrash: vi.fn(async () => {}) }));

function Boom(): React.ReactElement {
  throw new RangeError("Invalid time value");
}

/**
 * A-223's real hazard: the crash screen's remedy wiped unsynced sales. Reload
 * must stay the primary action and the destructive one must state its cost
 * before it can be reached.
 */
describe("ErrorBoundary's destructive escape hatch", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const { ErrorBoundary } = await import("@/components/tauri/error-boundary");
    root = createRoot(container);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root.render(
        React.createElement(ErrorBoundary, null, React.createElement(Boom)),
      );
    });
    spy.mockRestore();
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
  });

  function resetControl(): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-testid="reset-app-data"]');
  }

  it("shows the crash message and a Reload action", () => {
    expect(container.textContent).toContain("Invalid time value");
    expect(container.textContent).toContain("Reload Application");
  });

  it("does not present Reset App Data as a button equal to Reload", () => {
    const reset = resetControl();
    expect(reset).not.toBeNull();
    expect(reset!.className).not.toMatch(/\bborder\b/);
    expect(reset!.className).toMatch(/text-xs|underline/);
  });

  it("states the cost — local data including anything not yet synced — before deleting", async () => {
    await act(async () => resetControl()!.click());

    const text = container.textContent ?? "";
    expect(text).toMatch(/not yet synced|unsynced/i);
    expect(text).toMatch(/delete|erase/i);
    expect(
      container.querySelector('[data-testid="reset-app-data-confirm"]'),
    ).not.toBeNull();
  });

  it("never uses a native window.confirm", async () => {
    const confirmSpy = vi.fn(() => true);
    const original = window.confirm;
    window.confirm = confirmSpy as unknown as typeof window.confirm;
    await act(async () => resetControl()!.click());
    window.confirm = original;
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
