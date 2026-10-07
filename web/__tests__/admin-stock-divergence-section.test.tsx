import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreStockDivergenceSection } from "@/components/admin/stores/details/store-stock-divergence-section";
import type { StoreStockDivergence } from "@/lib/types/admin-platform";

const device = (over: Partial<StoreStockDivergence["devices"][0]> = {}) => ({
  device_id: "DESKTOP-ONE",
  device_batch_count: 3,
  device_quantity_sum: 30,
  server_batch_count: 3,
  server_quantity_sum: 30,
  quantity_delta: 0,
  batch_delta: 0,
  diverged: false,
  reported_at: "2026-10-07T09:00:00Z",
  ...over,
});

describe("StoreStockDivergenceSection", () => {
  /** The rule this feature could most easily break. */
  it("says agreement is unknown when nothing has reported", () => {
    render(
      <StoreStockDivergenceSection
        data={{ measured: false, diverged_devices: 0, devices: [] }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/agreement is unknown/i)).toBeDefined();
    expect(screen.queryByText(/agrees with the cloud/i)).toBeNull();
  });

  it("confirms agreement only when devices actually reported it", () => {
    render(
      <StoreStockDivergenceSection
        data={{ measured: true, diverged_devices: 0, devices: [device()] }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/every reporting device agrees/i)).toBeDefined();
  });

  it("names how many devices disagree and by how much", () => {
    render(
      <StoreStockDivergenceSection
        data={{
          measured: true,
          diverged_devices: 1,
          devices: [device({ diverged: true, quantity_delta: -56, device_quantity_sum: 974 })],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/1 of 1 devices disagree/i)).toBeDefined();
    expect(screen.getByText("-56")).toBeDefined();
  });

  it("renders unavailable on a failed request rather than claiming agreement", () => {
    render(<StoreStockDivergenceSection data={undefined} isLoading={false} isError />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/agreement is unknown/i)).toBeNull();
  });
});
