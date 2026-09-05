import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement matchMedia; components/ui/tooltip.tsx's touch
// detection needs it to exist to mount at all.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * Regression coverage for a real user report: hovering a collapsed sidebar
 * open showed the sync indicator "squished then readjusting" instead of
 * smoothly following the sidebar's own widening animation.
 *
 * First attempt at a fix delayed swapping from a compact layout to a wide
 * one by 300ms (matching the sidebar's width transition) to avoid the wide
 * layout rendering into a still-narrow container. The user correctly
 * pushed back: that just traded one bad look (squish) for another (an
 * abrupt pop-in after a dead pause), and pointed out that every OTHER
 * collapsible bit of sidebar content — nav item labels, the logo wordmark —
 * doesn't have this problem because it's one persistent element whose
 * content reveals inline, not two structurally different trees swapped by
 * a conditional.
 *
 * The actual fix: SyncIndicator is now that same pattern. One persistent
 * card is always rendered; the label, refresh button, and "last synced"
 * line reveal via max-width/max-height + opacity, transitioning on the
 * same 300ms timeline as the sidebar's own width change — so they grow in
 * lockstep with the panel starting the instant `collapsed` flips, with no
 * artificial delay and no separate DOM tree to swap into.
 */

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 0 }),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(async () => 0),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(async () => ({ success: true, pushed: 0, pulled: 0 })),
  isSyncing: () => false,
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: null }),
}));

vi.mock("@/components/dashboard/auth-modal", () => ({
  AuthModal: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/query-keys", () => ({
  queryKeys: { sync: { queueCount: () => ({ queryKey: ["syncQueueCount"] }) } },
}));

describe("SyncIndicator collapsed<->expanded reveal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container.remove();
  });

  async function render(collapsed: boolean) {
    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed }));
    });
  }

  const card = () => container.querySelector("#tour-sync-indicator") as HTMLElement;
  const revealWrappers = () =>
    Array.from(card().querySelectorAll('[class*="max-w-"]'));

  it("is a single persistent card in both states, not two different DOM trees", async () => {
    await render(true);
    const cardCollapsed = card();
    expect(cardCollapsed).not.toBeNull();

    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });

    // Same DOM node survives the prop flip — proof this is one element
    // whose content reveals, not a remount into a different tree.
    expect(card()).toBe(cardCollapsed);
  });

  it("applies the expanded reveal classes the instant collapsed flips, with no artificial delay", async () => {
    await render(true);
    const collapsedClasses = revealWrappers().map((el) => el.className);
    expect(collapsedClasses.some((c) => c.includes("max-w-0"))).toBe(true);

    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
      await Promise.resolve();
    });

    // No setTimeout/delay involved — the very next render already carries
    // the expanded (non-zero max-width) classes, which is what lets the
    // CSS transition animate in lockstep with the sidebar's own width
    // change instead of waiting for it to finish first.
    const expandedClasses = revealWrappers().map((el) => el.className);
    expect(expandedClasses.some((c) => c.includes("max-w-0"))).toBe(false);
  });
});
