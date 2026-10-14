import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeviceRowActions } from "@/components/admin/stores/details/device-row-actions";

const { removeMutate, renameMutate } = vi.hoisted(() => ({
  removeMutate: vi.fn(),
  renameMutate: vi.fn(),
}));

vi.mock("@/lib/api/admin-hooks-sync", () => ({
  useDeleteStockReportMutation: () => ({ mutate: removeMutate, isPending: false }),
  useSetDeviceNicknameMutation: () => ({ mutate: renameMutate, isPending: false }),
}));

const { authState } = vi.hoisted(() => ({
  authState: { user: { role: "super_admin" } as { role: string } | null },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("DeviceRowActions", () => {
  beforeEach(() => {
    authState.user = { role: "super_admin" };
    removeMutate.mockClear();
    renameMutate.mockClear();
  });

  /** Both routes are role:super_admin, so a delegated operator must not see a
   * control that could only ever 403. */
  it("renders nothing for a non-super-admin", () => {
    authState.user = { role: "support" };
    const { container } = render(<DeviceRowActions storeId="s1" deviceId="DRX-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("deletes that one device's report only after the confirm dialog", () => {
    render(<DeviceRowActions storeId="s1" deviceId="DRX-1" />);

    fireEvent.click(screen.getByTitle(/delete this device's report/i));
    expect(removeMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /delete report/i }));
    expect(removeMutate.mock.calls[0][0]).toBe("DRX-1");
  });

  /** Pre-filling with the sniffed label would let a no-op Save freeze
   * "Chrome on macOS" as the nickname, masking the real label for ever. */
  it("pre-fills the nickname, never the sniffed label", () => {
    render(
      <DeviceRowActions storeId="s1" deviceId="DRX-1" deviceLabel="Chrome on macOS" />,
    );

    fireEvent.click(screen.getByTitle(/name this device/i));
    const input = screen.getByPlaceholderText("Chrome on macOS") as HTMLInputElement;

    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "Front counter" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));

    expect(renameMutate.mock.calls[0][0]).toMatchObject({
      deviceId: "DRX-1",
      nickname: "Front counter",
    });
  });

  it("sends a blank nickname to clear it", () => {
    render(<DeviceRowActions storeId="s1" deviceId="DRX-1" deviceNickname="Front counter" />);

    fireEvent.click(screen.getByTitle(/name this device/i));
    const input = screen.getByDisplayValue("Front counter");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));

    expect(renameMutate.mock.calls[0][0]).toMatchObject({ deviceId: "DRX-1", nickname: "" });
  });
});
