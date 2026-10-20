import * as Sentry from "@sentry/nextjs";
import { logAction } from "../core";
import { collectDeviceDiagnostics } from "@/lib/db/queries/diagnostics";
import { buildReport } from "@/components/settings/diagnostics/diagnostics-report";
import { sendDiagnosticsReport } from "@/lib/utils/diagnostics-delivery";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { APP_VERSION, BUILD_SHA } from "@/lib/constants";
import { getStoredActiveStoreId } from "@/lib/storage-keys";

// A super_admin asks one device, once, to send its own diagnostics report.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-device-report-command-L11
export const DEVICE_REPORT_AUDIT_ACTION = "DEVICE_REPORT_SENT_ON_REQUEST";

export async function sendDeviceReportOnRequest(
  commandId: string,
  issuedBy?: string | null,
): Promise<{ status: "applied" | "refused"; result: string }> {
  const data = await collectDeviceDiagnostics();

  const identity = {
    Device: `${getDeviceLabel()} (${getDeviceId()})`,
    Build: `${APP_VERSION} · ${BUILD_SHA}`,
    Store: getStoredActiveStoreId() ?? "unknown",
    Requested: `remotely, command ${commandId}`,
  };

  const report = buildReport(data, identity);
  const delivered: string[] = [];

  // A breadcrumb, not an issue:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-device-report-command-ts-L31
  try {
    Sentry.addBreadcrumb({
      category: "device-report",
      level: "info",
      message: `Device report requested: ${getDeviceLabel()}`,
      data: {
        deviceId: getDeviceId(),
        queueTotal: data.queueTotal,
        conflicts: data.conflicts,
        orphans: data.orphans,
        stuckRows: data.stuckRows.length,
        crashes: data.crashes.length,
        diverged: data.integrity.diverged,
        netUnitDelta: data.integrity.netUnitDelta,
        unappliedDeltas: data.deltas.total,
        missingTables: data.missingTables,
        lastSyncOutcome: data.lastSyncOutcome,
      },
    });
  } catch {
    /* a missing DSN must not stop the support POST below */
  }

  try {
    await sendDiagnosticsReport({
      report,
      storeName: null,
      deviceLabel: getDeviceLabel(),
    });
    delivered.push("support");
  } catch (error) {
    // Only the support POST can confirm anything, so only it decides. Marking
    // this applied on Sentry alone would record a report nobody received.
    return {
      status: "refused",
      result: error instanceof Error ? error.message : "could not deliver the report",
    };
  }

  // Recorded on the device so the store can see a report left their till. An
  // outbound collection the owner cannot discover is not one worth having.
  await logAction(
    DEVICE_REPORT_AUDIT_ACTION,
    "sync_commands",
    commandId,
    { delivered_to: delivered.join(","), requested_remotely: true },
    undefined,
    undefined,
    // The admin who issued it. Without this the row names whoever happened to
    // be signed in at the till as having sent a device report.
    issuedBy ?? undefined,
  ).catch(() => {});

  return { status: "applied", result: `report sent via ${delivered.join(" + ")}` };
}
