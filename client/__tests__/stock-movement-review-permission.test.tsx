import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { StockMovement } from "@/components/stock-batch/stock-movement-utils";

const hasPermission = vi.fn((_key: string) => true);
const markReviewed = vi.fn(async (_transferId: string) => 2);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

vi.mock("@/lib/db/queries/stock-transfers", () => ({
  markStockTransferReviewed: (id: string) => markReviewed(id),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/ui/responsive-modal", () => ({
  ResponsiveModal: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

import { StockMovementDetailModal } from "@/components/stock-batch/stock-movement-detail-modal";

const flaggedTransfer: StockMovement = {
  id: "m1",
  date: new Date().toISOString(),
  product: "Paracetamol 500mg",
  type: "transfer_in",
  quantity: 20,
  reason: "Transfer from Downtown Branch",
  reference: "transfer-1",
  user: "Ada Cashier",
  needsReview: true,
};

function renderModal(
  movement: StockMovement | null,
  onReviewed = vi.fn(),
) {
  return render(
    <StockMovementDetailModal
      movement={movement}
      onClose={vi.fn()}
      onViewInCatalog={vi.fn()}
      onReviewed={onReviewed}
    />,
  );
}

describe("approve_stock_transfers enforcement (stock-movement-detail-modal.tsx)", () => {
  beforeEach(() => {
    hasPermission.mockImplementation(() => true);
    markReviewed.mockImplementation(async () => 2);
    vi.clearAllMocks();
  });

  it("offers Mark Reviewed on a flagged transfer to a group that holds the key", () => {
    renderModal(flaggedTransfer);
    expect(screen.getByRole("button", { name: /mark reviewed/i })).toBeTruthy();
  });

  it("reads exactly the approve_stock_transfers key", () => {
    renderModal(flaggedTransfer);
    expect(hasPermission).toHaveBeenCalledWith("approve_stock_transfers");
  });

  it("withholds Mark Reviewed from a group without the key, while the flag itself stays visible", () => {
    hasPermission.mockImplementation((key: string) =>
      key === "approve_stock_transfers" ? false : true,
    );
    renderModal(flaggedTransfer);
    expect(
      screen.queryByRole("button", { name: /mark reviewed/i }),
    ).toBeNull();
    expect(screen.getByText(/needs review/i)).toBeTruthy();
  });

  it("shows nothing to review on a transfer that was never flagged", () => {
    renderModal({ ...flaggedTransfer, needsReview: false });
    expect(
      screen.queryByRole("button", { name: /mark reviewed/i }),
    ).toBeNull();
    expect(screen.queryByText(/needs review/i)).toBeNull();
  });

  it("offers nothing on a non-transfer movement even if it somehow carries the flag", () => {
    renderModal({
      ...flaggedTransfer,
      type: "adjustment",
      reference: "",
    });
    expect(
      screen.queryByRole("button", { name: /mark reviewed/i }),
    ).toBeNull();
  });

  it("clears the whole transfer by its reference id and tells the ledger to refetch", async () => {
    const onReviewed = vi.fn();
    renderModal(flaggedTransfer, onReviewed);

    fireEvent.click(screen.getByRole("button", { name: /mark reviewed/i }));

    await waitFor(() => expect(markReviewed).toHaveBeenCalledWith("transfer-1"));
    await waitFor(() => expect(onReviewed).toHaveBeenCalled());
  });

  it("leaves the ledger alone when the review write fails", async () => {
    const onReviewed = vi.fn();
    markReviewed.mockImplementation(async () => {
      throw new Error("offline");
    });
    renderModal(flaggedTransfer, onReviewed);

    fireEvent.click(screen.getByRole("button", { name: /mark reviewed/i }));

    await waitFor(() => expect(markReviewed).toHaveBeenCalled());
    expect(onReviewed).not.toHaveBeenCalled();
  });
});
