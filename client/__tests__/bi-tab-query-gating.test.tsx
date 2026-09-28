import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * useStockBatchAlerts (3 reads) and usePurchasePatterns feed only the
 * Analytics dashboard's stock_batches and customers tabs, but both used to run
 * on mount of the whole dashboard - i.e. on the default Sales tab, which never
 * displays either of them. They now take an `enabled` flag driven by the
 * active tab.
 */

const getLowStockAlerts = vi.fn(async () => []);
const getExpiryAlerts = vi.fn(async () => []);
const getOversoldAlerts = vi.fn(async () => []);
const getPurchasePatterns = vi.fn(async () => ({
  timeSlotData: [],
  slotCategoryData: [],
}));

vi.mock("@/lib/db/queries/inventory", () => ({
  getLowStockAlerts: () => getLowStockAlerts(),
  getExpiryAlerts: () => getExpiryAlerts(),
  getOversoldAlerts: () => getOversoldAlerts(),
}));

vi.mock("@/lib/db/queries/reports", () => ({
  getPurchasePatterns: () => getPurchasePatterns(),
}));

import { useStockBatchAlerts } from "@/lib/hooks/use-stock-batch-alerts";
import { usePurchasePatterns } from "@/lib/hooks/use-purchase-patterns";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("Analytics tab query gating", () => {
  beforeEach(() => {
    getLowStockAlerts.mockClear();
    getExpiryAlerts.mockClear();
    getOversoldAlerts.mockClear();
    getPurchasePatterns.mockClear();
  });

  it("reads no stock-batch alerts while its tab is inactive", async () => {
    renderHook(() => useStockBatchAlerts(false), { wrapper });
    await flush();

    expect(getLowStockAlerts).not.toHaveBeenCalled();
    expect(getExpiryAlerts).not.toHaveBeenCalled();
    expect(getOversoldAlerts).not.toHaveBeenCalled();
  });

  it("reads all three stock-batch alert sources once its tab is active", async () => {
    renderHook(() => useStockBatchAlerts(true), { wrapper });
    await flush();

    expect(getLowStockAlerts).toHaveBeenCalled();
    expect(getExpiryAlerts).toHaveBeenCalled();
    expect(getOversoldAlerts).toHaveBeenCalled();
  });

  it("reads no purchase patterns while its tab is inactive", async () => {
    renderHook(() => usePurchasePatterns("2026-01-01", undefined, false), {
      wrapper,
    });
    await flush();

    expect(getPurchasePatterns).not.toHaveBeenCalled();
  });

  it("reads purchase patterns once its tab is active", async () => {
    renderHook(() => usePurchasePatterns("2026-01-01", undefined, true), {
      wrapper,
    });
    await flush();

    expect(getPurchasePatterns).toHaveBeenCalled();
  });

  it("still returns an empty, render-safe shape while gated off", async () => {
    const alerts = renderHook(() => useStockBatchAlerts(false), { wrapper });
    const patterns = renderHook(
      () => usePurchasePatterns("2026-01-01", undefined, false),
      { wrapper },
    );
    await flush();

    expect(alerts.result.current).toEqual([]);
    expect(patterns.result.current).toEqual([]);
  });
});
