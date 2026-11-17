import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { reportAge } from "@/lib/admin/report-age";
import { StoreTableAgreementSection } from "@/components/admin/stores/details/store-table-agreement-section";
import type { DeviceTableAgreementRow, DeviceTableReport } from "@/lib/types/admin-platform";

const NOW = new Date("2026-11-17T12:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe("reportAge", () => {
  it("reads in minutes, hours and days", () => {
    expect(reportAge(ago(0), NOW)?.label).toBe("just now");
    expect(reportAge(ago(12), NOW)?.label).toBe("12 min ago");
    expect(reportAge(ago(3 * 60), NOW)?.label).toBe("3 h ago");
    expect(reportAge(ago(24 * 60), NOW)?.label).toBe("1 day ago");
    expect(reportAge(ago(50 * 60), NOW)?.label).toBe("2 days ago");
  });

  it("calls a reading old from six hours", () => {
    expect(reportAge(ago(5 * 60 + 59), NOW)?.old).toBe(false);
    expect(reportAge(ago(6 * 60), NOW)?.old).toBe(true);
  });

  it("returns nothing for an unreadable timestamp", () => {
    expect(reportAge("not a date", NOW)).toBeNull();
  });
});

const row = (over: Partial<DeviceTableAgreementRow> = {}): DeviceTableAgreementRow => ({
  table: "purchase_order_items",
  device_rows: 12,
  device_version_sum: 12,
  device_pending: 0,
  server_rows: 10,
  server_version_sum: 10,
  row_delta: 2,
  version_delta: 2,
  verdict: "diverged",
  ...over,
});

const device = (reportedAt: string): DeviceTableReport => ({
  device_id: "DRX-TILL-1",
  device_label: "Chrome on Windows",
  device_nickname: null,
  tables: [row()],
  diverged_tables: ["purchase_order_items"],
  has_local_copy: true,
  stale: false,
  diverged: true,
  reported_at: reportedAt,
});

function renderWith(reportedAt: string) {
  render(
    <StoreTableAgreementSection
      data={{ measured: true, diverged_devices: 1, devices: [device(reportedAt)] }}
      isLoading={false}
    />,
  );
}

describe("Table agreement report age", () => {
  it("shows how old a device's reading is beside the exact time", () => {
    renderWith(new Date(Date.now() - 2 * 60 * 60_000).toISOString());

    expect(screen.getByText(/Reported 2 h ago · \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)).toBeDefined();
    expect(screen.queryByText(/This reading is old/)).toBeNull();
  });

  it("warns that an old disagreement may already have been resolved", () => {
    renderWith(new Date(Date.now() - 30 * 60 * 60_000).toISOString());

    expect(screen.getByText(/Reported 1 day ago/)).toBeDefined();
    expect(screen.getByText(/This reading is old/)).toBeDefined();
  });
});
