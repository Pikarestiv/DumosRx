import { describe, it, expect } from "vitest";
import { syncVerdict, type SyncVerdictInput } from "@/lib/admin/sync-verdict";
import type {
  DeviceStockReport,
  DeviceTableAgreementRow,
  DeviceTableReport,
  StoreStockDivergence,
  StoreTableAgreement,
} from "@/lib/types/admin-platform";

function tableRow(overrides: Partial<DeviceTableAgreementRow> = {}): DeviceTableAgreementRow {
  return {
    table: "products",
    device_rows: 10,
    device_version_sum: 10,
    device_pending: 0,
    server_rows: 10,
    server_version_sum: 10,
    row_delta: 0,
    version_delta: 0,
    verdict: "agrees",
    ...overrides,
  };
}

function tableDevice(overrides: Partial<DeviceTableReport> = {}): DeviceTableReport {
  return {
    device_id: "DRX-1",
    device_label: "Front till",
    device_nickname: null,
    tables: [tableRow()],
    diverged_tables: [],
    has_local_copy: true,
    stale: false,
    diverged: false,
    reported_at: "2026-10-19T10:00:00Z",
    ...overrides,
  };
}

function stockDevice(overrides: Partial<DeviceStockReport> = {}): DeviceStockReport {
  return {
    device_id: "DRX-1",
    device_label: "Front till",
    device_nickname: null,
    device_batch_count: 5,
    device_quantity_sum: 50,
    device_value_sum: 500,
    server_batch_count: 5,
    server_quantity_sum: 50,
    server_value_sum: 500,
    quantity_delta: 0,
    batch_delta: 0,
    value_delta: 0,
    has_local_copy: true,
    stale: false,
    diverged: false,
    reported_at: "2026-10-19T10:00:00Z",
    ...overrides,
  };
}

function tableAgreement(devices: DeviceTableReport[], measured = true): StoreTableAgreement {
  return {
    measured,
    diverged_devices: devices.filter((d) => d.diverged).length,
    devices,
  };
}

function stockDivergence(devices: DeviceStockReport[], measured = true): StoreStockDivergence {
  return {
    measured,
    diverged_devices: devices.filter((d) => d.diverged).length,
    devices,
  };
}

const settled: SyncVerdictInput = {
  table: { data: tableAgreement([tableDevice()]), isLoading: false, isError: false },
  stock: { data: stockDivergence([stockDevice()]), isLoading: false, isError: false },
};

describe("syncVerdict", () => {
  it("state 0 — returns null while either query is loading with no data", () => {
    expect(
      syncVerdict({
        ...settled,
        table: { data: undefined, isLoading: true, isError: false },
      }),
    ).toBeNull();

    expect(
      syncVerdict({
        ...settled,
        stock: { data: undefined, isLoading: true, isError: false },
      }),
    ).toBeNull();
  });

  it("state 1 — reports Unavailable when either query errored", () => {
    expect(
      syncVerdict({
        ...settled,
        table: { data: undefined, isLoading: false, isError: true },
      }),
    ).toEqual({
      label: "Unavailable",
      tone: "neutral",
      announcement: "Sync status unavailable for this store",
    });

    expect(
      syncVerdict({
        ...settled,
        stock: { data: undefined, isLoading: false, isError: true },
      })?.label,
    ).toBe("Unavailable");
  });

  it("state 1 — an error wins over a disagreement the other instrument reports", () => {
    expect(
      syncVerdict({
        table: { data: undefined, isLoading: false, isError: true },
        stock: {
          data: stockDivergence([stockDevice({ diverged: true })]),
          isLoading: false,
          isError: false,
        },
      })?.label,
    ).toBe("Unavailable");
  });

  it("state 2 — reports Not measured when neither instrument has a reading", () => {
    expect(
      syncVerdict({
        table: { data: tableAgreement([], false), isLoading: false, isError: false },
        stock: { data: stockDivergence([], false), isLoading: false, isError: false },
      }),
    ).toEqual({
      label: "Not measured",
      tone: "neutral",
      announcement: "No device has reported yet, so sync agreement is unknown",
    });
  });

  it("state 2 — one instrument having measured is enough to leave Not measured", () => {
    expect(
      syncVerdict({
        table: { data: tableAgreement([tableDevice()]), isLoading: false, isError: false },
        stock: { data: stockDivergence([], false), isLoading: false, isError: false },
      })?.label,
    ).toBe("Agrees");
  });

  it("state 3 — counts one disagreeing device in the singular", () => {
    expect(
      syncVerdict({
        ...settled,
        table: {
          data: tableAgreement([tableDevice({ diverged: true, diverged_tables: ["products"] })]),
          isLoading: false,
          isError: false,
        },
      }),
    ).toEqual({
      label: "1 device disagrees",
      tone: "rose",
      announcement: "1 device disagrees with the cloud on stock or tables",
    });
  });

  it("state 3 — counts devices, not tables, and unions both instruments", () => {
    const verdict = syncVerdict({
      table: {
        data: tableAgreement([
          tableDevice({
            device_id: "DRX-1",
            diverged: true,
            diverged_tables: ["products", "sales", "customers"],
          }),
          tableDevice({ device_id: "DRX-2" }),
        ]),
        isLoading: false,
        isError: false,
      },
      stock: {
        data: stockDivergence([
          stockDevice({ device_id: "DRX-1", diverged: true }),
          stockDevice({ device_id: "DRX-2", diverged: true }),
        ]),
        isLoading: false,
        isError: false,
      },
    });

    expect(verdict).toEqual({
      label: "2 devices disagree",
      tone: "rose",
      announcement: "2 devices disagree with the cloud on stock or tables",
    });
  });

  it("state 3 — ignores a disagreement reported by a copy-less device", () => {
    expect(
      syncVerdict({
        ...settled,
        table: {
          data: tableAgreement([
            tableDevice({ device_id: "DRX-8", diverged: true, has_local_copy: false }),
          ]),
          isLoading: false,
          isError: false,
        },
      })?.label,
    ).toBe("Agrees");
  });

  it("state 4 — a till that went silent while disagreeing does not read calmer than it was", () => {
    expect(
      syncVerdict({
        ...settled,
        table: {
          data: tableAgreement([
            tableDevice({
              device_id: "DRX-9",
              diverged: true,
              diverged_tables: ["products"],
              stale: true,
            }),
          ]),
          isLoading: false,
          isError: false,
        },
      }),
    ).toEqual({
      label: "Stopped reporting while disagreeing",
      tone: "amber",
      announcement:
        "1 device stopped reporting, and its last reading disagreed with the cloud",
    });
  });

  it("state 4 — it outranks the plain stale verdict when that device is the only one", () => {
    expect(
      syncVerdict({
        table: {
          data: tableAgreement([
            tableDevice({ device_id: "DRX-9", diverged: true, stale: true }),
          ]),
          isLoading: false,
          isError: false,
        },
        stock: {
          data: stockDivergence([stockDevice({ device_id: "DRX-9", stale: true })]),
          isLoading: false,
          isError: false,
        },
      })?.label,
    ).toBe("Stopped reporting while disagreeing");
  });

  it("state 4 — counts devices, unions both instruments, and pluralises", () => {
    expect(
      syncVerdict({
        table: {
          data: tableAgreement([
            tableDevice({ device_id: "DRX-1", diverged: true, stale: true }),
          ]),
          isLoading: false,
          isError: false,
        },
        stock: {
          data: stockDivergence([
            stockDevice({ device_id: "DRX-1", diverged: true, stale: true }),
            stockDevice({ device_id: "DRX-2", diverged: true, stale: true }),
          ]),
          isLoading: false,
          isError: false,
        },
      })?.announcement,
    ).toBe("2 devices stopped reporting, and their last reading disagreed with the cloud");
  });

  it("state 4 — a measurable disagreement still outranks a remembered one", () => {
    expect(
      syncVerdict({
        ...settled,
        table: {
          data: tableAgreement([
            tableDevice({ device_id: "DRX-1", diverged: true, diverged_tables: ["sales"] }),
            tableDevice({ device_id: "DRX-9", diverged: true, stale: true }),
          ]),
          isLoading: false,
          isError: false,
        },
      })?.label,
    ).toBe("1 device disagrees");
  });

  it("state 4 — a stale device whose last reading agreed stays on the plain verdict", () => {
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
      })?.label,
    ).toBe("Stopped reporting");
  });

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
