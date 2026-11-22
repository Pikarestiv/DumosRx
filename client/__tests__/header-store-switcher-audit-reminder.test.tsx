import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HeaderStoreSwitcher } from "@/components/dashboard/header-store-switcher";

let mockIsDesktop = true;
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => mockIsDesktop,
}));

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

import type { StoreProfile } from "@/lib/context/store-context";

const sampleStores: StoreProfile[] = [
  { id: "store-1", name: "Main Pharmacy", store_type: "pharmacy" } as StoreProfile,
  { id: "store-2", name: "Branch Pharmacy", store_type: "pharmacy" } as StoreProfile,
];

describe("HeaderStoreSwitcher with active audit", () => {
  beforeEach(() => {
    mockIsDesktop = true;
  });

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

    const trigger = screen.getByRole("button", { name: /main pharmacy/i });
    fireEvent.click(trigger);

    expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0);

    const branchItem = screen.getByText("Branch Pharmacy");
    act(() => {
      fireEvent.click(branchItem);
    });

    expect(screen.getByText("Stock Audit in Progress")).toBeDefined();
    expect(
      screen.getByText(/Your counted rows stay saved locally on this device/i),
    ).toBeDefined();
    expect(onSwitchStore).not.toHaveBeenCalled();

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

  it("opens a bottom sheet Drawer instead of a dropdown on mobile and handles audit confirmation", () => {
    mockIsDesktop = false;
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

    const trigger = screen.getByRole("button", { name: /main pharmacy/i });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("menuitem")).toBeNull();

    fireEvent.click(screen.getByText("Branch Pharmacy"));
    expect(screen.getByText("Stock Audit in Progress")).toBeDefined();
    expect(onSwitchStore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /switch store/i }));
    expect(onSwitchStore).toHaveBeenCalledWith("store-2");
  });

  it("switches store directly from the mobile bottom sheet when no audit is active", () => {
    mockIsDesktop = false;
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

    fireEvent.click(screen.getByRole("button", { name: /main pharmacy/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByText("Branch Pharmacy"));
    expect(onSwitchStore).toHaveBeenCalledWith("store-2");
  });
});
