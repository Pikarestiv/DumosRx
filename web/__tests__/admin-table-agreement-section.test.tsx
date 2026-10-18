import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreTableAgreementSection } from "@/components/admin/stores/details/store-table-agreement-section";
import type {
  DeviceTableAgreementRow,
  DeviceTableReport,
} from "@/lib/types/admin-platform";

const row = (over: Partial<DeviceTableAgreementRow> = {}): DeviceTableAgreementRow => ({
  table: "products",
  device_rows: 10,
  device_version_sum: 10,
  device_pending: 0,
  server_rows: 10,
  server_version_sum: 10,
  row_delta: 0,
  version_delta: 0,
  verdict: "agrees",
  ...over,
});

const device = (over: Partial<DeviceTableReport> = {}): DeviceTableReport => ({
  device_id: "DRX-TILL-1",
  device_label: "Chrome on Windows",
  device_nickname: null,
  tables: [row()],
  diverged_tables: [],
  has_local_copy: true,
  stale: false,
  diverged: false,
  reported_at: "2026-10-18T09:05:00Z",
  ...over,
});

describe("StoreTableAgreementSection", () => {
  /** Silence is not agreement — the rule this view would most easily break. */
  it("refuses to imply agreement when nothing has reported", () => {
    render(
      <StoreTableAgreementSection
        data={{ measured: false, diverged_devices: 0, devices: [] }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/agreement is unknown/i)).toBeDefined();
    expect(screen.queryByText(/holds the same rows as the cloud/i)).toBeNull();
  });

  it("names only the tables that disagree, with the row delta", () => {
    render(
      <StoreTableAgreementSection
        data={{
          measured: true,
          diverged_devices: 1,
          devices: [
            device({
              diverged: true,
              diverged_tables: ["categories"],
              tables: [
                row(),
                row({
                  table: "categories",
                  device_rows: 4,
                  server_rows: 7,
                  row_delta: -3,
                  verdict: "diverged",
                }),
              ],
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText("categories")).toBeDefined();
    expect(screen.queryByText("products")).toBeNull();
    expect(screen.getByText("-3 rows")).toBeDefined();
    expect(screen.getByText(/1 table disagree/i)).toBeDefined();
  });

  /**
   * A device whose own in-flight push the cloud has already accepted reads
   * as behind on every push it makes. Rendering that as a disagreement made
   * a working pharmacy look broken all day.
   */
  it("renders a behind table as catching up, not as a disagreement", () => {
    render(
      <StoreTableAgreementSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [
            device({
              tables: [
                row({ table: "sales", row_delta: -2, version_delta: -2, verdict: "behind" }),
              ],
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText("Catching up")).toBeDefined();
    expect(screen.getByText("sales")).toBeDefined();
    expect(screen.queryByText("-2 rows")).toBeNull();
    // Not "every table agrees": that would contradict the row below it.
    expect(screen.getByText("Catching up on 1")).toBeDefined();
    expect(screen.queryByText(/every table agrees/i)).toBeNull();
  });

  it("shows a device with no local copy as such rather than as a huge divergence", () => {
    render(
      <StoreTableAgreementSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [
            device({
              has_local_copy: false,
              tables: [row({ device_rows: 0, device_version_sum: 0, row_delta: -10 })],
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/no local copy of this store/i)).toBeDefined();
    expect(screen.queryByText("-10 rows")).toBeNull();
  });

  it("ages out a stale snapshot instead of reporting it as a disagreement", () => {
    render(
      <StoreTableAgreementSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [
            device({
              stale: true,
              tables: [row({ table: "expenses", row_delta: -4, verdict: "diverged" })],
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/stopped reporting/i)).toBeDefined();
    expect(screen.queryByText("expenses")).toBeNull();
  });

  it("renders the device id with its label and a timestamp carrying its time", () => {
    render(
      <StoreTableAgreementSection
        data={{ measured: true, diverged_devices: 0, devices: [device()] }}
        isLoading={false}
      />,
    );

    expect(screen.getByText("DRX-TILL-1")).toBeDefined();
    expect(screen.getByText("Chrome on Windows")).toBeDefined();
    // A bare date would make two readings hours apart look like one.
    expect(screen.getByText(/^18\/10\/2026 \d{2}:\d{2}$/)).toBeDefined();
  });

  it("calls a same-row, different-version table out rather than reading it as agreement", () => {
    render(
      <StoreTableAgreementSection
        data={{
          measured: true,
          diverged_devices: 1,
          devices: [
            device({
              diverged: true,
              diverged_tables: ["sales"],
              tables: [row({ table: "sales", version_delta: -6, verdict: "diverged" })],
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/same rows, other edits/i)).toBeDefined();
    expect(screen.getByText(/version sum -6/i)).toBeDefined();
  });
});
