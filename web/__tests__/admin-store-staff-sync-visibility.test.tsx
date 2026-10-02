import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreStaffList } from "@/components/admin/stores/store-staff-list";

const mockUseStaffDevices = vi.fn();

vi.mock("@/lib/api/admin-hooks", () => ({
  useStoreStaff: () => ({
    data: {
      data: [
        {
          id: "staff-1",
          name: "Jane Doe",
          email: "jane@example.com",
          role: "Sales Staff",
          status: "Active",
          lastSyncedAt: "5 minutes ago",
          lastSyncDevice: "Chrome on Windows",
        },
        {
          id: "staff-2",
          name: "Never Synced",
          email: "never@example.com",
          role: "Sales Staff",
          status: "Active",
          lastSyncedAt: null,
          lastSyncDevice: null,
        },
      ],
      meta: { total: 2 },
    },
    isLoading: false,
    isError: false,
  }),
  useStaffDevices: (...args: unknown[]) => mockUseStaffDevices(...args),
}));

describe("StoreStaffList sync visibility", () => {
  it("shows the most recently synced device and relative time for a staff member who has synced", () => {
    mockUseStaffDevices.mockReturnValue({ data: undefined, isLoading: false });

    render(<StoreStaffList storeId="store-1" />);

    expect(screen.getByText(/Synced 5 minutes ago · Chrome on Windows/)).toBeInTheDocument();
  });

  it("shows 'Never synced' for a staff member with no device history", () => {
    mockUseStaffDevices.mockReturnValue({ data: undefined, isLoading: false });

    render(<StoreStaffList storeId="store-1" />);

    expect(screen.getByText("Never synced")).toBeInTheDocument();
  });

  it("lazily fetches and displays full device history only once the drill-down is opened", async () => {
    mockUseStaffDevices.mockReturnValue({
      data: {
        devices: [
          { deviceId: "DRX-NEW", deviceLabel: "Chrome on Windows", storeId: "store-1", lastSyncedAt: "5 minutes ago", lastSyncedAtIso: null },
          { deviceId: "DRX-OLD", deviceLabel: "Firefox on Linux", storeId: "store-1", lastSyncedAt: "3 days ago", lastSyncedAtIso: null },
        ],
      },
      isLoading: false,
    });

    render(<StoreStaffList storeId="store-1" />);

    const user = userEvent.setup();
    const triggers = screen.getAllByText("Sync history");
    await user.click(triggers[0]);

    expect(await screen.findByText("Firefox on Linux")).toBeInTheDocument();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
  });
});
