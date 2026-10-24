import { describe, it, expect } from "vitest";
import { syncVerdict } from "@/lib/admin/sync-verdict";
import { settled, stockDevice, stockDivergence, tableAgreement, tableDevice, tableRow } from "./helpers/sync-verdict-fixtures";

describe("syncVerdict — states 5 to 8", () => {
  it("state 5 — reports Stopped reporting when every device is stale", () => {
    expect(
      syncVerdict({
        table: {
          data: tableAgreement([tableDevice({ stale: true })]),
          isLoading: false,
          isError: false,
        },
        stock: {
          data: stockDivergence([stockDevice({ stale: true })]),
          isLoading: false,
          isError: false,
        },
      }),
    ).toEqual({
      label: "Stopped reporting",
      tone: "amber",
      announcement: "Every device of this store has stopped reporting",
    });
  });

  it("state 5 — a stale device outranks a copy-less one when both are present", () => {
    expect(
      syncVerdict({
        table: {
          data: tableAgreement([
            tableDevice({ device_id: "DRX-1", stale: true }),
            tableDevice({ device_id: "DRX-2", has_local_copy: false }),
          ]),
          isLoading: false,
          isError: false,
        },
        stock: { data: stockDivergence([], true), isLoading: false, isError: false },
      })?.label,
    ).toBe("Stopped reporting");
  });

  it("state 6 — reports No local copy when no device holds this store", () => {
    expect(
      syncVerdict({
        table: {
          data: tableAgreement([tableDevice({ has_local_copy: false })]),
          isLoading: false,
          isError: false,
        },
        stock: {
          data: stockDivergence([stockDevice({ has_local_copy: false })]),
          isLoading: false,
          isError: false,
        },
      }),
    ).toEqual({
      label: "No local copy",
      tone: "neutral",
      announcement:
        "No device currently holds a copy of this store, so agreement cannot be measured",
    });
  });

  it("state 6 — stock's optional has_local_copy being absent does not read as no copy", () => {
    const device = stockDevice();
    delete device.has_local_copy;

    expect(
      syncVerdict({
        table: { data: tableAgreement([], true), isLoading: false, isError: false },
        stock: { data: stockDivergence([device]), isLoading: false, isError: false },
      })?.label,
    ).toBe("Agrees");
  });

  it("state 7 — reports Catching up for a behind table on a comparable device", () => {
    expect(
      syncVerdict({
        ...settled,
        table: {
          data: tableAgreement([
            tableDevice({ tables: [tableRow({ verdict: "behind", row_delta: -3 })] }),
          ]),
          isLoading: false,
          isError: false,
        },
      }),
    ).toEqual({
      label: "Catching up",
      tone: "neutral",
      announcement: "No device disagrees with the cloud; 1 device still catching up",
    });
  });

  it("state 7 — a syncing table counts as catching up too", () => {
    expect(
      syncVerdict({
        ...settled,
        table: {
          data: tableAgreement([
            tableDevice({ tables: [tableRow({ verdict: "syncing", device_pending: 2 })] }),
          ]),
          isLoading: false,
          isError: false,
        },
      })?.announcement,
    ).toBe("No device disagrees with the cloud; 1 device still catching up");
  });

  it("state 7 — a disagreement outranks a device that is only catching up", () => {
    expect(
      syncVerdict({
        ...settled,
        table: {
          data: tableAgreement([
            tableDevice({ device_id: "DRX-1", diverged: true, diverged_tables: ["sales"] }),
            tableDevice({ device_id: "DRX-2", tables: [tableRow({ verdict: "behind" })] }),
          ]),
          isLoading: false,
          isError: false,
        },
      })?.label,
    ).toBe("1 device disagrees");
  });

  it("state 8 — reports Agrees when every reporting device is settled", () => {
    expect(syncVerdict(settled)).toEqual({
      label: "Agrees",
      tone: "emerald",
      announcement: "Every reporting device agrees with the cloud",
    });
  });
});
