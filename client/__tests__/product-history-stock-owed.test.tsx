import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductHistory } from "@/components/products/product-details/product-history";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

const mockGetProductHistory = vi.fn();
vi.mock("@/lib/db/queries/products", () => ({
  getProductHistory: (...args: unknown[]) => mockGetProductHistory(...args),
}));

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("ProductHistory stock movement labels and signs", () => {
  it("formats sales without double minus and labels stock shortfall distinctly from stock deductions", async () => {
    mockGetProductHistory.mockResolvedValueOnce({
      auditLogs: [],
      stockMovements: [
        {
          id: "sm1",
          movement_type: "sale",
          quantity: -2,
          reason: "Customer sale (oversold — insufficient batch stock)",
          created_at: "2026-11-05T22:37:00Z",
          performed_by_name: "Pikalocal Restiv",
        },
        {
          id: "sm2",
          movement_type: "adjustment",
          reference_type: "backorder",
          quantity: 2,
          reason: "Sold before stock was received",
          created_at: "2026-11-05T22:37:00Z",
          performed_by_name: "Pikalocal Restiv",
        },
      ],
    });

    render(<ProductHistory productId="p1" />, { wrapper });

    expect(await screen.findByText("Stock Deducted")).toBeTruthy();
    expect(await screen.findByText("Stock Shortfall")).toBeTruthy();

    expect(screen.getByText(/-2 units\. Reason: Customer sale \(oversold — insufficient batch stock\)/)).toBeTruthy();
    expect(screen.queryByText(/--2 units/)).toBeNull();

    expect(screen.getByText(/2 units owed to customer\. Reason: Sold before stock was received/)).toBeTruthy();
  });
});
