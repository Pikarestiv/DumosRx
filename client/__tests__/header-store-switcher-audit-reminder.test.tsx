import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HeaderStoreSwitcher } from "@/components/dashboard/header-store-switcher";

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canManageMultiStore: true,
    getUpgradeMessage: () => "",
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, onClick, ...props }: any) => (
    <div
      role="menuitem"
      onClick={() => {
        if (onSelect) onSelect();
        else if (onClick) onClick();
      }}
      {...props}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/components/settings/store/fleet-form-dialog", () => ({
  FleetFormDialog: () => null,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

const mockHasActiveStockAuditCount = vi.fn();
vi.mock("@/lib/hooks/use-stock-audit-draft", () => ({
  hasActiveStockAuditCount: (storeId?: string | null) =>
    mockHasActiveStockAuditCount(storeId),
}));

const sampleStores = [
  { id: "store-1", name: "Main Pharmacy", store_type: "pharmacy" as const },
  { id: "store-2", name: "Branch Pharmacy", store_type: "pharmacy" as const },
];

describe("HeaderStoreSwitcher with active audit", () => {
  it("shows reminder dialog before switching stores when active audit exists", async () => {
    mockHasActiveStockAuditCount.mockReturnValue(true);
    const onSwitchStore = vi.fn();

    render(
      <HeaderStoreSwitcher
        storeProfile={sampleStores[0]}
        availableStores={sampleStores}
        activeStoreId="store-1"
        onSwitchStore={onSwitchStore}
        isAdmin={true}
      />,
    );

    // Open dropdown
    const trigger = screen.getByRole("button", { name: /main pharmacy/i });
    fireEvent.click(trigger);

    // Click target store
    const branchItem = screen.getByText("Branch Pharmacy");
    act(() => {
      fireEvent.click(branchItem);
    });

    // Dialog should be shown, onSwitchStore should NOT have been called yet
    expect(screen.getByText("Stock Audit in Progress")).toBeDefined();
    expect(
      screen.getByText(/Your counted rows stay saved locally on this device/i),
    ).toBeDefined();
    expect(onSwitchStore).not.toHaveBeenCalled();

    // Click confirm "Switch Store"
    const confirmBtn = screen.getByRole("button", { name: /switch store/i });
    act(() => {
      fireEvent.click(confirmBtn);
    });

    expect(onSwitchStore).toHaveBeenCalledWith("store-2");
  });

  it("switches store immediately when no active audit exists", () => {
    mockHasActiveStockAuditCount.mockReturnValue(false);
    const onSwitchStore = vi.fn();

    render(
      <HeaderStoreSwitcher
        storeProfile={sampleStores[0]}
        availableStores={sampleStores}
        activeStoreId="store-1"
        onSwitchStore={onSwitchStore}
        isAdmin={true}
      />,
    );

    const trigger = screen.getByRole("button", { name: /main pharmacy/i });
    fireEvent.click(trigger);

    const branchItem = screen.getByText("Branch Pharmacy");
    fireEvent.click(branchItem);

    expect(onSwitchStore).toHaveBeenCalledWith("store-2");
    expect(screen.queryByText("Stock Audit in Progress")).toBeNull();
  });
});
