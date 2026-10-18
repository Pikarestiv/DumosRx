import type {
  DeviceStockReport,
  DeviceTableReport,
  StoreStockDivergence,
  StoreTableAgreement,
} from "@/lib/types/admin-platform";

export type SyncVerdictTone = "rose" | "amber" | "emerald" | "neutral";

export interface SyncVerdict {
  label: string;
  tone: SyncVerdictTone;
  announcement: string;
}

export interface SyncQueryState<T> {
  data?: T;
  isLoading: boolean;
  isError: boolean;
}

export interface SyncVerdictInput {
  table: SyncQueryState<StoreTableAgreement>;
  stock: SyncQueryState<StoreStockDivergence>;
}

type ReportingDevice = DeviceTableReport | DeviceStockReport;

function isComparable(device: ReportingDevice): boolean {
  return device.has_local_copy !== false && !device.stale;
}

function countCatchingUp(devices: DeviceTableReport[]): number {
  return devices.filter(
    (device) =>
      device.diverged_tables.length === 0 &&
      device.tables.some((table) => table.verdict !== "agrees"),
  ).length;
}

function disagreeingDeviceIds(
  tableDevices: DeviceTableReport[],
  stockDevices: DeviceStockReport[],
): Set<string> {
  const ids = new Set<string>();

  for (const device of [...tableDevices, ...stockDevices]) {
    if (device.diverged === true) {
      ids.add(device.device_id);
    }
  }

  return ids;
}

export function syncVerdict(input: SyncVerdictInput): SyncVerdict | null {
  const { table, stock } = input;

  if ((table.isLoading && !table.data) || (stock.isLoading && !stock.data)) {
    return null;
  }

  if (table.isError || stock.isError) {
    return {
      label: "Unavailable",
      tone: "neutral",
      announcement: "Sync status unavailable for this store",
    };
  }

  if (!table.data || !stock.data) {
    return null;
  }

  if (!table.data.measured && !stock.data.measured) {
    return {
      label: "Not measured",
      tone: "neutral",
      announcement: "No device has reported yet, so sync agreement is unknown",
    };
  }

  const allDevices: ReportingDevice[] = [...table.data.devices, ...stock.data.devices];
  const comparableTableDevices = table.data.devices.filter(isComparable);
  const comparableStockDevices = stock.data.devices.filter(isComparable);

  const disagreeing = disagreeingDeviceIds(comparableTableDevices, comparableStockDevices);

  if (disagreeing.size > 0) {
    const label =
      disagreeing.size === 1 ? "1 device disagrees" : `${disagreeing.size} devices disagree`;

    return {
      label,
      tone: "rose",
      announcement: `${label} with the cloud on stock or tables`,
    };
  }

  const noComparableDevice =
    comparableTableDevices.length === 0 && comparableStockDevices.length === 0;

  if (noComparableDevice && allDevices.some((device) => device.stale)) {
    return {
      label: "Stopped reporting",
      tone: "amber",
      announcement: "Every device of this store has stopped reporting",
    };
  }

  if (
    noComparableDevice &&
    allDevices.length > 0 &&
    allDevices.every((device) => device.has_local_copy === false)
  ) {
    return {
      label: "No local copy",
      tone: "neutral",
      announcement:
        "No device currently holds a copy of this store, so agreement cannot be measured",
    };
  }

  const catchingUp = countCatchingUp(comparableTableDevices);

  if (catchingUp > 0) {
    return {
      label: "Catching up",
      tone: "neutral",
      announcement: `No device disagrees with the cloud; ${catchingUp} still catching up`,
    };
  }

  return {
    label: "Agrees",
    tone: "emerald",
    announcement: "Every reporting device agrees with the cloud",
  };
}
