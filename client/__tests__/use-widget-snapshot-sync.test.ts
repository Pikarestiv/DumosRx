import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";

const getWidgetSnapshotMock = vi.fn();
const writeWidgetSnapshotMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  apiClient: { getWidgetSnapshot: (...a: unknown[]) => getWidgetSnapshotMock(...a) },
}));
vi.mock("@/lib/native/widget-bridge", () => ({
  writeWidgetSnapshot: (...a: unknown[]) => writeWidgetSnapshotMock(...a),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ isCloudLinked: true }),
}));
// This hook is only meaningful under Tauri (see enabled: isCloudLinked &&
// isTauri() in use-widget-snapshot-sync.ts); simulate that environment so
// the query actually runs in this jsdom-based test.
vi.mock("@/lib/db", () => ({
  isTauri: () => true,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useWidgetSnapshotSync", () => {
  beforeEach(() => {
    getWidgetSnapshotMock.mockReset();
    writeWidgetSnapshotMock.mockReset();
  });

  it("fetches the snapshot and writes it to native storage on mount when cloud-linked", async () => {
    getWidgetSnapshotMock.mockResolvedValue({
      fleet: { today_sales_formatted: "₦0.00", low_stock_alerts: 0, expiring_items: 0 },
      stores: [],
    });
    const { useWidgetSnapshotSync } = await import("@/lib/hooks/use-widget-snapshot-sync");

    renderHook(() => useWidgetSnapshotSync(), { wrapper });

    await waitFor(() => expect(writeWidgetSnapshotMock).toHaveBeenCalledTimes(1));
    const [jsonArg] = writeWidgetSnapshotMock.mock.calls[0];
    const parsed = JSON.parse(jsonArg);
    expect(parsed.linked).toBe(true);
    expect(parsed.fleet.lowStockCount).toBe(0);
  });
});
