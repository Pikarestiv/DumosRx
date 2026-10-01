import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";

vi.mock("@/components/ui/responsive-modal", () => ({
  ResponsiveModal: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("@/lib/db/queries/products", () => ({
  getProductBasicInfo: vi.fn(async () => ({ name: "Paracetamol 500mg", dosage_form: null })),
}));

import { StockMovementDetailsDialog } from "@/components/dashboard/modals/stock-movement-details-dialog";

function renderDialog(movement: StockMovementHistoryRow) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <StockMovementDetailsDialog movement={movement} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

const baseMovement: StockMovementHistoryRow = {
  id: "m1",
  product_id: "p1",
  movement_type: "adjustment",
  quantity: 20,
  reason: "Bulk import stock update",
  reference_type: "import",
  created_at: new Date().toISOString(),
};

describe("StockMovementDetailsDialog A-124 import type", () => {
  it("labels a bulk-import correction (reference_type import) as Bulk Import, not Adjustment", async () => {
    renderDialog(baseMovement);
    expect(await screen.findByText("Bulk Import")).toBeTruthy();
    expect(screen.queryByText("adjustment")).toBeNull();
  });

  it("still labels a genuine manual adjustment as adjustment", async () => {
    renderDialog({
      ...baseMovement,
      reference_type: undefined,
      reason: "Damaged stock removed",
    });
    expect(await screen.findByText("adjustment")).toBeTruthy();
  });
});
