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

  it("shows a queued command and still lets the operator ask again", () => {
    commands.rows = [
      { id: "c1", status: "pending", device_id: "DRX-TILL-1", action: "send_device_report" },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByText(/report queued/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /request again/i })).toBeDefined();
  });

  /**
   * The server flips the row to `sent` the moment the device claims it, and the
   * status stays there until that device reports a result. A till that goes
   * quiet therefore used to leave this control as a badge with no button at
   * all — observed stuck at "Sent to till" for seven days, with no way to ask
   * again. The badge still tells the truth about the last request; it must
   * never be the only thing on screen.
   */
  it("says the request reached the till, and never strands the operator without a control", () => {
    commands.rows = [
      { id: "c1", status: "sent", device_id: "DRX-TILL-1", action: "send_device_report" },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByText(/sent to till/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /request again/i })).toBeDefined();
  });

  it("confirms an applied report with when it arrived, and keeps the result readable", () => {
    commands.rows = [
      {
        id: "c1",
        status: "applied",
        device_id: "DRX-TILL-1",
        action: "send_device_report",
        result: "report sent via sentry (unconfirmed) + support",
        acted_at: "2026-10-17T10:31:00Z",
      },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    const received = screen.getByText(/report received/i);
    expect(received).toBeDefined();
    expect(received.textContent).toContain("17/10/2026");
    expect(received.getAttribute("title")).toContain("report sent via sentry");
  });

  /**
   * Shipped in 0470a731: `applied` returned only the badge, so one successful
   * report turned the control into a permanent label and the device could
   * never be re-checked after a change — which is the entire point of it.
   */
  it("still lets a super admin ask again once a report has arrived", () => {
    commands.rows = [
      {
        id: "c1",
        status: "applied",
        device_id: "DRX-TILL-1",
        action: "send_device_report",
        result: "report sent",
        acted_at: "2026-10-17T10:31:00Z",
      },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByText(/report received/i)).toBeDefined();

    const again = screen.getByRole("button", { name: /request again/i });
    again.click();

    expect(issueMutate.mock.calls[0][0]).toMatchObject({
      device_id: "DRX-TILL-1",
      action: "send_device_report",
    });
  });

  it("hides the re-request from a non-super_admin on an applied row too", () => {
    authState.user = { role: "support" };
    commands.rows = [
      {
        id: "c1",
        status: "applied",
        device_id: "DRX-TILL-1",
        action: "send_device_report",
        acted_at: "2026-10-17T10:31:00Z",
      },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/report received/i)).toBeNull();
  });

  /**
   * The rate limit the till applies to itself. Nobody has ever seen this
   * message, because the badge it would have appeared on had already vanished.
   */
  it("surfaces a refusal with the reason the till gave", () => {
    commands.rows = [
      {
        id: "c1",
        status: "refused",
        device_id: "DRX-TILL-1",
        action: "send_device_report",
        result: "Too many reports sent just now. Download it instead, or wait a minute.",
        acted_at: "2026-10-17T10:31:00Z",
      },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByText(/too many reports sent just now/i)).toBeDefined();
  });

  it("surfaces a failure too, and lets the operator ask again", () => {
    commands.rows = [
      {
        id: "c1",
        status: "failed",
        device_id: "DRX-TILL-1",
        action: "send_device_report",
        result: "could not build the report",
        acted_at: "2026-10-17T10:31:00Z",
      },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByText(/could not build the report/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /request again/i })).toBeDefined();
  });

  /** Only the newest command for the device decides what is shown. */
  it("reads the most recent command, not an older one", () => {
    commands.rows = [
      {
        id: "c2",
        status: "pending",
        device_id: "DRX-TILL-1",
        action: "send_device_report",
      },
      {
        id: "c1",
        status: "applied",
        device_id: "DRX-TILL-1",
        action: "send_device_report",
        result: "report sent",
        acted_at: "2026-10-16T08:00:00Z",
      },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByText(/report queued/i)).toBeDefined();
    expect(screen.queryByText(/report received/i)).toBeNull();
  });

  it("ignores another action's command for the same device", () => {
    commands.rows = [
      { id: "c1", status: "sent", device_id: "DRX-TILL-1", action: "force_full_resync" },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByRole("button", { name: /request report/i })).toBeDefined();
  });

  it("still offers the button when the pending command belongs to another device", () => {
    commands.rows = [
      { id: "c1", status: "pending", device_id: "DRX-OTHER", action: "send_device_report" },
    ];
    render(<DeviceReportAction storeId="s1" deviceId="DRX-TILL-1" />);

    expect(screen.getByRole("button", { name: /request report/i })).toBeDefined();
  });
});
