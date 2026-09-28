import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * getRecentSales() reads 100 sales with three correlated subqueries per row and
 * is consumed only by the POS History tab, but it used to run on every POS
 * mount - i.e. for every cashier who only ever rings up sales. use-pos-system
 * already knows the active tab from the URL before it calls usePOSData, so the
 * read is gated on that.
 */

const getRecentSales = vi.fn(async () => []);
const getProductsWithStock = vi.fn(async () => []);

vi.mock("@/lib/db/queries/sales", () => ({
  getRecentSales: () => getRecentSales(),
  getRecentlySoldProductIds: vi.fn(async () => []),
  getCommonlySoldProductIds: vi.fn(async () => []),
}));

vi.mock("@/lib/db/queries/products", () => ({
  getProductsWithStock: () => getProductsWithStock(),
}));

vi.mock("@/lib/db/queries/customers", () => ({
  getAllCustomers: vi.fn(async () => []),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getPaymentAccounts: vi.fn(async () => []),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

import { usePOSData } from "@/lib/hooks/use-pos-data";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("usePOSData history gating", () => {
  beforeEach(() => {
    getRecentSales.mockClear();
    getProductsWithStock.mockClear();
  });

  it("does not read recent sales while the Products tab is active", async () => {
    const { result } = renderHook(() => usePOSData({ historyActive: false }), {
      wrapper,
    });
    await flush();

    expect(getRecentSales).not.toHaveBeenCalled();
    // The catalog read this screen actually needs still happens.
    expect(getProductsWithStock).toHaveBeenCalled();
    expect(result.current.recentSales).toEqual([]);
  });

  it("reads recent sales once the History tab is active", async () => {
    renderHook(() => usePOSData({ historyActive: true }), { wrapper });
    await flush();

    expect(getRecentSales).toHaveBeenCalled();
  });

  it("still reads recent sales when no tab hint is given", async () => {
    renderHook(() => usePOSData(), { wrapper });
    await flush();

    expect(getRecentSales).toHaveBeenCalled();
  });
});
