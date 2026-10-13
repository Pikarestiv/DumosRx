import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ProductName } from "@/components/ui/product-name";

// jsdom has no matchMedia; the house Tooltip reads it to detect touch.
// `matches: false` keeps this on the pointer (hover) path.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const uppercaseEnabled = { value: 1 };
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { uppercase_display_enabled: uppercaseEnabled.value },
  }),
}));

function setClamped(el: HTMLElement, clamped: boolean) {
  Object.defineProperty(el, "scrollWidth", { value: clamped ? 400 : 100, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: 100, configurable: true });
}

/**
 * Product names are stored lowercase and ledger columns clamp them, so a
 * store with long names could not tell two rows apart - reported from
 * Favour's store, where the cycle count was the worst case.
 */
describe("ProductName", () => {
  beforeEach(() => {
    uppercaseEnabled.value = 1;
    cleanup();
  });

  it("applies the store's uppercase setting", () => {
    render(<ProductName name="cypri gold small syrup" />);
    expect(screen.getByText("cypri gold small syrup").className).toContain("uppercase");
  });

  it("falls back to per-word capitalization when the store turns uppercase off", () => {
    uppercaseEnabled.value = 0;
    render(<ProductName name="cypri gold small syrup" />);
    const el = screen.getByText("cypri gold small syrup");
    expect(el.className).toContain("capitalize");
    expect(el.className).not.toContain("uppercase");
  });

  it("reveals the full name on the FIRST hover when the column clamps it", () => {
    render(<ProductName name="paracetamol 500mg tablets 24s" tooltipSuffix="SKU-1" />);
    const el = screen.getByText("paracetamol 500mg tablets 24s");
    setClamped(el, true);

    fireEvent.pointerEnter(el);
    fireEvent.focus(el);

    // Radix renders the content in a portal once open; both the name and the
    // suffix are in the reveal.
    expect(screen.getAllByText("paracetamol 500mg tablets 24s").length).toBeGreaterThan(1);
    expect(screen.getByText("SKU-1")).toBeTruthy();
  });

  it("stays silent for a name that fits", () => {
    render(<ProductName name="panadol" tooltipSuffix="SKU-2" />);
    const el = screen.getByText("panadol");
    setClamped(el, false);

    fireEvent.pointerEnter(el);
    fireEvent.focus(el);

    expect(screen.queryByText("SKU-2")).toBeNull();
  });

  it("keeps the whole name in the DOM, so a screen reader is never given the clamped form", () => {
    render(<ProductName name="a very long product name indeed" />);
    expect(screen.getByText("a very long product name indeed").textContent).toBe(
      "a very long product name indeed",
    );
  });
});
