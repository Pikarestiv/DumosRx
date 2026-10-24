import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

// Regression coverage for a real user report:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-indicator-expand-timing-test-ts-L22

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: 0 }),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: vi.fn(() => Promise.resolve(0)),
}));

vi.mock("@/lib/db/sync-engine", () => ({
  sync: vi.fn(() => Promise.resolve({ success: true, pushed: 0, pulled: 0 })),
  isSyncing: () => false,
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: null }),
}));

// SyncIndicator reads isImpersonating from the auth context (sync is disabled wholesale during an impersonated session); t…
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-indicator-expand-timing-test-ts-L62
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isImpersonating: false }),
}));

vi.mock("@/lib/db/DatabaseProvider", () => ({
  useDatabase: () => ({ isReadOnlyTab: false }),
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
    await act(() => {
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
    await act(() => {
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

    // No setTimeout/delay involved — the very next render already carries the expanded (non-zero max-width) classes, which is…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-indicator-expand-timing-test-ts-L143
    const expandedClasses = revealWrappers().map((el) => el.className);
    expect(expandedClasses.some((c) => c.includes("max-w-0"))).toBe(false);
  });
});
