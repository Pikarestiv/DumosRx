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
 * Root cause: SyncIndicator renders two structurally different layouts for
 * collapsed vs. expanded (a small icon button vs. a padded, bordered card
 * with a text label) picked by a plain `if (collapsed)` branch — not by
 * animating shared markup. The sidebar container's width transition takes
 * 300ms (dashboard-sidebar.tsx's `transition-all duration-300`), but the
 * `collapsed` prop itself flips instantly, so the wide card rendered right
 * away into a container that hadn't finished widening yet.
 *
 * The fix debounces the *expand* direction only: collapsing still switches
 * immediately (compact content never needs to reflow), but expanding waits
 * SIDEBAR_WIDTH_TRANSITION_MS (300, matching the sidebar's own duration)
 * before swapping in the wide card. This test proves the timing directly
 * rather than trying to catch a 300ms CSS transition in a screenshot.
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

describe("SyncIndicator collapsed->expanded timing", () => {
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

  const isCompactLayout = () => !!container.querySelector("#tour-sync-indicator button[title]");

  it("stays on the compact layout immediately after collapsed flips to false, then switches once the sidebar's own transition would have finished", async () => {
    await render(true);
    expect(isCompactLayout()).toBe(true);

    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: false }));
    });

    // Immediately after the prop flips — this is the exact moment the old
    // code would have rendered the wide card into a still-narrow sidebar.
    expect(isCompactLayout()).toBe(true);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // Only now, after the sidebar's own 300ms width transition would have
    // completed, does the wide card actually appear.
    expect(isCompactLayout()).toBe(false);
  });

  it("switches back to compact immediately when collapsed flips back to true (no delay needed collapsing)", async () => {
    await render(false);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(isCompactLayout()).toBe(false);

    const { SyncIndicator } = await import(
      "@/components/dashboard/sync-indicator"
    );
    await act(async () => {
      root.render(React.createElement(SyncIndicator, { collapsed: true }));
      await Promise.resolve();
    });

    expect(isCompactLayout()).toBe(true);
  });
});
