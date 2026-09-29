"use client";

import { useEffect, type RefObject } from "react";

const DEFAULT_STEP_PX = 48;
const REGION_SCAN_TTL_MS = 200;

/**
 * Anything that already answers to arrow keys itself. A keydown whose target
 * sits inside one of these is that component's to handle, never the page's.
 */
const ARROW_CONSUMING_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button[aria-haspopup]",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='option']",
  "[role='menu']",
  "[role='menubar']",
  "[role='menuitem']",
  "[role='grid']",
  "[role='gridcell']",
  "[role='treegrid']",
  "[role='tablist']",
  "[role='tab']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='radiogroup']",
  "[data-arrow-keys='own']",
].join(",");

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function scrollsOnAxis(element: HTMLElement, axis: "y" | "x"): boolean {
  const overflow =
    axis === "y"
      ? getComputedStyle(element).overflowY
      : getComputedStyle(element).overflowX;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  return axis === "y"
    ? element.scrollHeight > element.clientHeight + 1
    : element.scrollWidth > element.clientWidth + 1;
}

function isScrollRegion(element: HTMLElement): boolean {
  return (
    (element.scrollHeight > element.clientHeight + 1 ||
      element.scrollWidth > element.clientWidth + 1) &&
    isVisible(element) &&
    (scrollsOnAxis(element, "y") || scrollsOnAxis(element, "x"))
  );
}

function hasScrollingAncestorBelow(
  target: Element,
  container: HTMLElement,
): boolean {
  let node: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (node && node !== container) {
    if (isScrollRegion(node)) return true;
    node = node.parentElement;
  }
  return false;
}

function isSoleScrollRegion(container: HTMLElement): boolean {
  const candidates = document.body.querySelectorAll<HTMLElement>("*");
  for (const candidate of candidates) {
    if (candidate === container) continue;
    if (container.contains(candidate) || candidate.contains(container)) continue;
    if (isScrollRegion(candidate)) return false;
  }
  return true;
}

function consumesArrowKeys(node: EventTarget | null): boolean {
  if (!(node instanceof Element)) return false;
  return !!node.closest(ARROW_CONSUMING_SELECTOR);
}

export interface UseArrowKeyScrollOptions {
  /** Pass false on the renders where the region is not the page's only one. */
  enabled?: boolean;
  /** Pixels moved per keypress; roughly a browser's own arrow-key step. */
  step?: number;
}

/**
 * Lets the arrow keys scroll one region the way a browser scrolls a plain
 * page, for pages and tabs whose content lives in a single `overflow-auto`
 * container rather than in the document scroller — where the arrow keys
 * otherwise do nothing at all until the user clicks into the list first.
 *
 * Opt in per page/tab by calling it with that container's ref; it is
 * deliberately not a global listener, because arrow keys are already spoken
 * for on plenty of screens. It stays out of the way when:
 *
 * - focus (or the keydown's target) is in a text field, select, contenteditable,
 *   or any component that handles arrow keys itself (combobox, menu, tablist,
 *   grid, slider — see `ARROW_CONSUMING_SELECTOR`);
 * - a modifier key is held, or something upstream already handled the event;
 * - the event came from inside a nested scroller, which scrolls itself;
 * - the page has any other visible scrollable region, so an open detail panel,
 *   dropdown or dialog suspends it for as long as it is on screen.
 */
export function useArrowKeyScroll(
  ref: RefObject<HTMLElement | null>,
  { enabled = true, step = DEFAULT_STEP_PX }: UseArrowKeyScrollOptions = {},
) {
  useEffect(() => {
    if (!enabled) return;

    let lastScanAt = 0;
    let lastScanWasSole = false;

    const isSoleRegionCached = (container: HTMLElement) => {
      const now = Date.now();
      if (now - lastScanAt < REGION_SCAN_TTL_MS) return lastScanWasSole;
      lastScanAt = now;
      lastScanWasSole = isSoleScrollRegion(container);
      return lastScanWasSole;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const container = ref.current;
      if (!container || !container.isConnected) return;
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const vertical =
        event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      const horizontal =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!vertical && !horizontal) return;

      if (consumesArrowKeys(event.target)) return;
      if (consumesArrowKeys(document.activeElement)) return;

      const axis = vertical ? "y" : "x";
      if (!scrollsOnAxis(container, axis)) return;

      if (
        event.target instanceof Element &&
        container.contains(event.target) &&
        hasScrollingAncestorBelow(event.target, container)
      ) {
        return;
      }

      if (!isSoleRegionCached(container)) return;

      event.preventDefault();
      container.scrollBy({ top: vertical * step, left: horizontal * step });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ref, enabled, step]);
}
