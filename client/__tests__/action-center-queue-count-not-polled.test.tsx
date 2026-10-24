import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

// A-18 (docs/KNOWN_BUGS.md):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-action-center-queue-count-not-polled-test-tsx-L7

const state = {
  syncQueueCount: 0,
};

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isAdmin: true,
    user: { role: "store_owner" },
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: null }),
}));

vi.mock("@/lib/db/queries/auth", () => ({
  getStaffCount: vi.fn(() => Promise.resolve(3)),
}));

const getSyncQueueCount = vi.fn(() => Promise.resolve(state.syncQueueCount));
vi.mock("@/lib/db/queries/setup", () => ({
  getSyncQueueCount: () => getSyncQueueCount(),
}));

vi.mock("@/lib/licensing/licensing-manager", () => ({
  checkLicenseStatus: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/db/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/core")>()),
  isTauri: () => false,
}));

vi.mock("@/lib/utils/platform", () => ({
  isStandalonePwa: () => false,
}));

vi.mock("@/lib/hooks/use-widget-pin-prompt", () => ({
  useWidgetPinPrompt: () => ({ showWidgetPrompt: false, promptPinWidget: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("action-centre sync-queue count is event-driven, not polled every 5 s", () => {
  beforeEach(() => {
    state.syncQueueCount = 0;
    getSyncQueueCount.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not re-run the COUNT(*) on a 5-second interval", async () => {
    const { useActionCenterAlerts } = await import(
      "@/lib/hooks/use-action-center-alerts"
    );

    renderHook(() => useActionCenterAlerts(0, 0, 0, 0), { wrapper });

    await waitFor(() => expect(getSyncQueueCount).toHaveBeenCalled());
    const afterMount = getSyncQueueCount.mock.calls.length;

    // Three 5-second windows: the old refetchInterval: 5000 would have
    // fired at least three more times here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
    });

    expect(getSyncQueueCount.mock.calls.length).toBe(afterMount);
  });

  it("refetches the count when the sync queue actually changes", async () => {
    const core = await import("@/lib/db/core");
    const { useActionCenterAlerts } = await import(
      "@/lib/hooks/use-action-center-alerts"
    );

    renderHook(() => useActionCenterAlerts(0, 0, 0, 0), { wrapper });

    await waitFor(() => expect(getSyncQueueCount).toHaveBeenCalled());
    const afterMount = getSyncQueueCount.mock.calls.length;

    state.syncQueueCount = 4;
    await act(() => {
      core.queueTableInvalidation("sales");
    });

    await waitFor(() =>
      expect(getSyncQueueCount.mock.calls.length).toBeGreaterThan(afterMount),
    );
  });
});
