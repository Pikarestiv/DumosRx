import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeviceReportAction } from "@/components/admin/stores/details/device-report-action";

const { commands, issueMutate } = vi.hoisted(() => ({
  commands: { rows: [] as Array<Record<string, unknown>> },
  issueMutate: vi.fn(),
}));

vi.mock("@/lib/api/admin-hooks-sync", () => ({
  useIssueSyncCommandMutation: () => ({ mutate: issueMutate, isPending: false }),
  useStoreSyncCommands: () => ({ data: { commands: commands.rows } }),
}));

const { authState } = vi.hoisted(() => ({
  authState: { user: { role: "super_admin" } as { role: string } | null },
}));

vi.mock("@/lib/store/use-admin-auth-store", () => ({
  useAdminAuthStore: () => ({ user: authState.user }),
  checkIsSuperAdmin: (role?: string) => role === "super_admin",
}));

describe("DeviceReportAction", () => {
  beforeEach(() => {
    authState.user = { role: "super_admin" };
    commands.rows = [];
    issueMutate.mockClear();
  });

  it("issues send_device_report against that one device", () => {
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    screen.getByRole("button", { name: /request report/i }).click();

    expect(issueMutate.mock.calls[0][0]).toMatchObject({
      device_id: "DRX-TILL-1",
      action: "send_device_report",
    });
  });

  /** A blank device_id is never claimed by any device (pendingFor matches it
   * exactly), so the command would sit pending forever. */
  it("never issues without a device id", () => {
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);
    screen.getByRole("button", { name: /request report/i }).click();

    expect(issueMutate.mock.calls[0][0].device_id).toBeTruthy();
  });

  it("hides the control from a non-super_admin, who would only be refused", () => {
    authState.user = { role: "support" };
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.queryByRole("button", { name: /request report/i })).toBeNull();
  });

  it("reports a pending command for this device instead of offering another", () => {
    commands.rows = [
      { id: "c1", status: "pending", device_id: "DRX-TILL-1", action: "send_device_report" },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByText(/report queued/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /request report/i })).toBeNull();
  });

  it("still offers the button when the pending command belongs to another device", () => {
    commands.rows = [
      { id: "c1", status: "pending", device_id: "DRX-OTHER", action: "send_device_report" },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByRole("button", { name: /request report/i })).toBeDefined();
  });
});
