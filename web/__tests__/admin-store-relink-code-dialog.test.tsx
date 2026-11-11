import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreRowActions } from "@/components/admin/stores/store-row-actions";
import { StoreRelinkCodeDialog } from "@/components/admin/stores/store-relink-code-dialog";
import type { AdminStoreSummary } from "@/lib/types/admin";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const mockMutateAsync = vi.fn();
vi.mock("@/lib/api/admin-hooks-till-codes", () => ({
  useGenerateStoreRelinkCodeMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

const mockStore: AdminStoreSummary = {
  id: "store-nest-agidi",
  name: "Nest Agidi Pharmacy",
  owner: "Ada Nest",
  email: "ada@nestagidi.com",
  plan: "pro",
  status: "Active",
  date: "11/11/2026",
  revenue: "₦0",
  is_demo: false,
  device_id: "DRX-NESTAGIDI",
};

const defaultHandlers = {
  handleImpersonate: vi.fn(),
  handleViewBilling: vi.fn(),
  handleOpenRelinkCode: vi.fn(),
  setSelectedStore: vi.fn(),
  setIsSuspendDialogOpen: vi.fn(),
  setIsTrialDialogOpen: vi.fn(),
  setIsActivatePlanDialogOpen: vi.fn(),
  handleUnsuspend: vi.fn(),
  handleToggleDemo: vi.fn(),
  handleArchive: vi.fn(),
  handleRestore: vi.fn(),
  handlePurge: vi.fn(),
};

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
} as unknown as AppRouterInstance;

describe("Till Re-link Code CRM fallback", () => {
  it("renders Generate Till Re-link Code option when canImpersonate is true", async () => {
    const user = userEvent.setup();
    render(
      <StoreRowActions
        {...defaultHandlers}
        store={mockStore}
        isSuperAdmin={false}
        canGrantTrials={false}
        canImpersonate={true}
        canManageAccountStatus={false}
        pendingStoreId={null}
        router={mockRouter}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for nest agidi pharmacy/i }));
    expect(screen.getByRole("menuitem", { name: /generate till re-link code/i })).toBeInTheDocument();
  });

  it("omits Generate Till Re-link Code option when canImpersonate is false", async () => {
    const user = userEvent.setup();
    render(
      <StoreRowActions
        {...defaultHandlers}
        store={mockStore}
        isSuperAdmin={false}
        canGrantTrials={false}
        canImpersonate={false}
        canManageAccountStatus={false}
        pendingStoreId={null}
        router={mockRouter}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for nest agidi pharmacy/i }));
    expect(screen.queryByRole("menuitem", { name: /generate till re-link code/i })).not.toBeInTheDocument();
  });

  it("clicking the menu item calls handleOpenRelinkCode with the store", async () => {
    const user = userEvent.setup();
    const handleOpenRelinkCode = vi.fn();
    render(
      <StoreRowActions
        {...defaultHandlers}
        handleOpenRelinkCode={handleOpenRelinkCode}
        store={mockStore}
        isSuperAdmin={false}
        canGrantTrials={false}
        canImpersonate={true}
        canManageAccountStatus={false}
        pendingStoreId={null}
        router={mockRouter}
      />,
    );

    await user.click(screen.getByRole("button", { name: /actions for nest agidi pharmacy/i }));
    await user.click(screen.getByRole("menuitem", { name: /generate till re-link code/i }));

    expect(handleOpenRelinkCode).toHaveBeenCalledWith(mockStore);
  });

  it("StoreRelinkCodeDialog generates and displays the 8-character code", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValueOnce({
      code: "A3K9XP2W",
      expires_at: new Date(Date.now() + 900000).toISOString(),
    });

    render(
      <StoreRelinkCodeDialog
        store={mockStore}
        isOpen={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Nest Agidi Pharmacy/i).length).toBeGreaterThan(0);
    const generateBtn = screen.getByRole("button", { name: /generate re-link code/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByTestId("store-relink-code-value")).toHaveTextContent("A3K9XP2W");
    });

    expect(screen.getByRole("button", { name: /copy code/i })).toBeInTheDocument();
    expect(screen.getByText(/Staff instructions at the till/i)).toBeInTheDocument();
  });
});
