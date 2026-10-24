import type { SyncVerdictInput } from "@/lib/admin/sync-verdict";
import type {
  DeviceStockReport,
  DeviceTableAgreementRow,
  DeviceTableReport,
  StoreStockDivergence,
  StoreTableAgreement,
} from "@/lib/types/admin-platform";

export function tableRow(overrides: Partial<DeviceTableAgreementRow> = {}): DeviceTableAgreementRow {
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

export function tableDevice(overrides: Partial<DeviceTableReport> = {}): DeviceTableReport {
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

export function stockDevice(overrides: Partial<DeviceStockReport> = {}): DeviceStockReport {
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

export function tableAgreement(devices: DeviceTableReport[], measured = true): StoreTableAgreement {
  return {
    measured,
    diverged_devices: devices.filter((d) => d.diverged).length,
    devices,
  };
}

export function stockDivergence(devices: DeviceStockReport[], measured = true): StoreStockDivergence {
  return {
    measured,
    diverged_devices: devices.filter((d) => d.diverged).length,
    devices,
  };
}

export const settled: SyncVerdictInput = {
  table: { data: tableAgreement([tableDevice()]), isLoading: false, isError: false },
  stock: { data: stockDivergence([stockDevice()]), isLoading: false, isError: false },
};

