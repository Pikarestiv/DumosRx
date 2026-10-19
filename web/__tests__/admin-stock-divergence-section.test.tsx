import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreStockDivergenceSection } from "@/components/admin/stores/details/store-stock-divergence-section";
import type { StoreStockDivergence } from "@/lib/types/admin-platform";

const device = (over: Partial<StoreStockDivergence["devices"][0]> = {}) => ({
  device_id: "DESKTOP-ONE",
  device_label: "Chrome on Windows",
  device_batch_count: 3,
  device_quantity_sum: 30,
  server_batch_count: 3,
  server_quantity_sum: 30,
  device_value_sum: 1500,
  server_value_sum: 1500,
  quantity_delta: 0,
  batch_delta: 0,
  value_delta: 0,
  diverged: false,
  has_local_copy: true,
  stale: false,
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

  /**
   * A-249/A-252. These rows rendered as `-45,727`, which reads as the store
   * having lost its stock. The device is one of the owner's multi-store tills
   * and honestly holds no copy of this store. It must not read as a
   * divergence, and it must not read as agreement either.
   */
  it("says a device holds no local copy instead of showing a huge divergence", () => {
    render(
      <StoreStockDivergenceSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [
            device({
              has_local_copy: false,
              device_batch_count: 0,
              device_quantity_sum: 0,
              device_value_sum: 0,
              server_quantity_sum: 45727,
              server_batch_count: 900,
              quantity_delta: -45727,
            }),
          ],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/no local copy/i)).toBeDefined();
    expect(screen.queryByText("-45,727")).toBeNull();
    expect(screen.queryByText("Diff")).toBeNull();
    expect(screen.queryByText(/^Agrees$/)).toBeNull();
  });

  it("does not claim every device agrees when one simply has no copy", () => {
    render(
      <StoreStockDivergenceSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [device({ has_local_copy: false, device_batch_count: 0, quantity_delta: -45727 })],
        }}
        isLoading={false}
      />,
    );

    expect(screen.queryByText(/every reporting device agrees/i)).toBeNull();
  });

  /** A-252. A retired device id keeps its last snapshot on screen for ever. */
  it("marks a stale report as not reporting rather than disagreeing", () => {
    render(
      <StoreStockDivergenceSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [device({ stale: true, quantity_delta: 2689, device_quantity_sum: 2689 })],
        }}
        isLoading={false}
      />,
    );

    expect(screen.getByText(/stopped reporting/i)).toBeDefined();
    // A frozen snapshot is still shown, but nothing subtracts it from the
    // cloud: a difference needs a device we can currently compare (A-252).
    expect(screen.queryByText("Diff")).toBeNull();
  });

  it("renders unavailable on a failed request rather than claiming agreement", () => {
    render(<StoreStockDivergenceSection data={undefined} isLoading={false} isError />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/agreement is unknown/i)).toBeNull();
  });

  /** A real store reports five-figure counts; raw digits are unreadable and
   * were how "49680 across 2692 batches" reached the owner. */
  it("groups the unit and batch counts into thousands", () => {
    render(
      <StoreStockDivergenceSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [device({ device_quantity_sum: 49680, device_batch_count: 2692 })],
        }}
        isLoading={false}
        currency="NGN"
      />,
    );

    // Device and Cloud are stacked rows under one Units column, so a gap is
    // visible digit-for-digit rather than parsed out of a sentence.
    expect(screen.getByText("Units")).toBeDefined();
    expect(screen.getByText("Batches")).toBeDefined();
    expect(screen.getByText("49,680")).toBeDefined();
    expect(screen.getByText("2,692")).toBeDefined();
  });

  it("values each device's stock in the store's currency", () => {
    render(
      <StoreStockDivergenceSection
        data={{ measured: true, diverged_devices: 0, devices: [device()] }}
        isLoading={false}
        currency="NGN"
      />,
    );

    // Both sides: the device's own value and the cloud's, so a money gap is
    // as readable as a unit gap.
    expect(screen.getAllByText(/₦1,500/)).toHaveLength(2);
  });

  /** §11: a client older than the value fingerprint reports none. Showing it
   * as zero would read as a device holding no stock at all. */
  it("says a device reported no value rather than showing zero", () => {
    render(
      <StoreStockDivergenceSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [device({ device_value_sum: null, value_delta: null })],
        }}
        isLoading={false}
        currency="NGN"
      />,
    );

    expect(screen.getByText(/not reported/i)).toBeDefined();
  });

  /** The wire is not guaranteed by the TypeScript type: a web bundle ahead of
   * the server, or a cached response, omits the field entirely rather than
   * sending null. `formatMoney(undefined)` throws and blanks the whole card. */
  it("survives a response that omits the value fields altogether", () => {
    const legacy = device();
    delete (legacy as Record<string, unknown>).device_value_sum;
    delete (legacy as Record<string, unknown>).server_value_sum;
    delete (legacy as Record<string, unknown>).value_delta;

    render(
      <StoreStockDivergenceSection
        data={{ measured: true, diverged_devices: 0, devices: [legacy] }}
        isLoading={false}
        currency="NGN"
      />,
    );

    // Neither side has a value, so both rows say so rather than showing zero.
    expect(screen.getAllByText(/not reported/i)).toHaveLength(2);
    expect(screen.getByText(/Agrees/)).toBeDefined();
  });

  /** Units can agree while costs do not, and the badge alone would read as
   * total agreement next to two different money figures. */
  it("flags a cost-only gap on a device whose stock agrees", () => {
    render(
      <StoreStockDivergenceSection
        data={{
          measured: true,
          diverged_devices: 0,
          devices: [device({ device_value_sum: 1600, value_delta: 100 })],
        }}
        isLoading={false}
        currency="NGN"
      />,
    );

    expect(screen.getByText(/costs differ/i)).toBeDefined();
    expect(screen.getByText(/Agrees/)).toBeDefined();
  });
});
