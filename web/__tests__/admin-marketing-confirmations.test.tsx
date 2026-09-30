import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CouponsManager } from "@/components/admin/marketing/coupons-manager";
import { useStoreImpersonation } from "@/hooks/use-store-impersonation";
import type { AdminStoreSummary } from "@/lib/types/admin";

const {
  mockDeleteMutateAsync,
  mockToggleMutateAsync,
  mockToastError,
  mockImpersonateMutate,
  environment,
} = vi.hoisted(() => ({
  mockDeleteMutateAsync: vi.fn(async () => undefined),
  mockToggleMutateAsync: vi.fn(async () => undefined),
  mockToastError: vi.fn(),
  mockImpersonateMutate: vi.fn(),
  environment: { name: "Local Server", appUrl: "https://app.dumosrx.com" },
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

vi.mock("@/lib/api/admin-hooks-stores", () => ({
  useImpersonateStoreMutation: () => ({ mutate: mockImpersonateMutate }),
}));

vi.mock("@/components/ui/server-selector", () => ({
  getCurrentEnvironmentName: () => environment.name,
  ServerSelector: () => null,
}));

vi.mock("@/lib/constants", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/constants")>("@/lib/constants");
  return {
    ...actual,
    APP_URL: "https://app.dumosrx.com",
    getAppURL: () => environment.appUrl,
  };
});

const store = { id: "store-1", name: "Pikarestiv" } as AdminStoreSummary;

describe("coupon delete confirmation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks in an in-app dialog instead of a native confirm()", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<CouponsManager />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /delete coupon welcome10/i }),
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("WELCOME10");

    await user.click(screen.getByRole("button", { name: "Delete coupon" }));

    await waitFor(() =>
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith("coupon-1"),
    );
  });
});

describe("impersonation environment challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.name = "Local Server";
    environment.appUrl = "https://app.dumosrx.com";
  });

  it("raises an in-app challenge rather than window.confirm on a mismatch", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { result } = renderHook(() => useStoreImpersonation());

    act(() => result.current.startImpersonation(store));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockImpersonateMutate).not.toHaveBeenCalled();
    expect(result.current.environmentChallenge).not.toBeNull();

    act(() => result.current.dismissEnvironmentChallenge());
    expect(mockImpersonateMutate).not.toHaveBeenCalled();

    act(() => result.current.startImpersonation(store));
    act(() => result.current.confirmEnvironmentChallenge());
    expect(mockImpersonateMutate).toHaveBeenCalled();
    expect(result.current.environmentChallenge).toBeNull();
  });

  it("does not challenge when the API environment and App URL agree", () => {
    environment.name = "Production Server";
    const { result } = renderHook(() => useStoreImpersonation());

    act(() => result.current.startImpersonation(store));

    expect(result.current.environmentChallenge).toBeNull();
    expect(mockImpersonateMutate).toHaveBeenCalled();
  });
});
