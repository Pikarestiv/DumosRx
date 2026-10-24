import { describe, it, expect } from "vitest";
import { syncVerdict } from "@/lib/admin/sync-verdict";
import { settled, stockDevice, stockDivergence, tableAgreement, tableDevice } from "./helpers/sync-verdict-fixtures";

describe("syncVerdict — states 0 to 4", () => {
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
});
