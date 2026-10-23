import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ canSee: true }));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => key === "view_stock_quantities" && state.canSee,
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { expiry_warning_days: 90 } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/db/queries/inventory", () => ({
  getExpiringBatches: () =>
    Promise.resolve([
      { id: "b1", name: "Amoxil", batch_number: "B-77", expiry_date: "2099-01-01", stock_quantity: 43, base_unit: "tab" },
    ]),
}));

import { NeedsAttention } from "@/components/stock-batch/needs-attention";

const lowItem = {
  id: "s1",
  product_id: "p1",
  product_name: "Panadol",
  quantity: 3,
  reorder_level: 20,
  status: "low" as const,
  base_unit: "tab",
};

async function renderPanel(canSee: boolean) {
  state.canSee = canSee;
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <NeedsAttention stockData={[lowItem]} />
    </QueryClientProvider>,
  );
  await view.findByText(/Batch B-77/);
  return view;
}

describe("Needs attention and view_stock_quantities", () => {
  it("shows on-hand and batch quantities with the permission", async () => {
    const view = await renderPanel(true);
    expect(view.getByText(/3 tabs left · Reorder at 20 tabs/)).toBeTruthy();
    expect(view.getByText(/Batch B-77/).textContent).toContain("43 tabs");
  });

  it("shows only the band and the reorder point without it", async () => {
    const view = await renderPanel(false);
    expect(view.getByText("Low stock · Reorder at 20 tabs")).toBeTruthy();
    const batchLine = view.getByText(/Batch B-77/).textContent ?? "";
    expect(batchLine).not.toContain("43");
    expect(view.container.textContent).not.toMatch(/\b3 tabs|43/);
  });
});
