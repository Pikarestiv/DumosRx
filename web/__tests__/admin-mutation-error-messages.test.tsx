import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CouponsManager } from "@/components/admin/marketing/coupons-manager";

const { mockToggleMutateAsync, mockDeleteMutateAsync, mockToastError } =
  vi.hoisted(() => ({
    mockToggleMutateAsync: vi.fn(async () => undefined),
    mockDeleteMutateAsync: vi.fn(async () => undefined),
    mockToastError: vi.fn(),
  }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mockToastError },
}));

vi.mock("@/lib/api/admin-hooks", () => ({
  useAdminCoupons: () => ({
    data: [
      {
        id: "coupon-1",
        code: "WELCOME10",
        type: "discount_percent",
        value: 10,
        max_uses: null,
        max_uses_per_user: 1,
        usages_count: 0,
        is_active: true,
        expires_at: null,
        target_plan: null,
        target_interval: null,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useGenerateCouponMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useToggleCouponMutation: () => ({
    mutateAsync: mockToggleMutateAsync,
    isPending: false,
  }),
  useDeleteCouponMutation: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
  }),
  useUpdateCouponMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("coupon mutations surface the server's message (A-101)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the server's reason when a toggle fails", async () => {
    mockToggleMutateAsync.mockRejectedValueOnce(
      new Error("This coupon has already been redeemed and cannot be paused."),
    );
    render(<CouponsManager />);

    await userEvent.click(screen.getByRole("switch"));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "This coupon has already been redeemed and cannot be paused.",
      ),
    );
  });

  it("shows the server's reason when a delete fails", async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(
      new Error("A redeemed coupon cannot be deleted."),
    );
    render(<CouponsManager />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /delete coupon welcome10/i }),
    );
    await user.click(screen.getByRole("button", { name: "Delete coupon" }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "A redeemed coupon cannot be deleted.",
      ),
    );
  });
});
