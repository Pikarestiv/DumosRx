import * as Sentry from "@sentry/nextjs";
import { logAction } from "../core";
import { collectDeviceDiagnostics } from "@/lib/db/queries/diagnostics";
import { buildReport } from "@/components/settings/diagnostics/diagnostics-report";
import { sendDiagnosticsReport } from "@/lib/utils/diagnostics-delivery";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { APP_VERSION, BUILD_SHA } from "@/lib/constants";
import { getStoredActiveStoreId } from "@/lib/storage-keys";

/**
 * A super_admin asks one device, once, to send its own diagnostics report.
 *
 * This exists because the ordinary telemetry channel fails exactly when it is
 * needed: crash rows live in `feedback`, which rides the sync queue, so a till
 * whose push is jammed stops reporting at the moment it has most to say. The
 * report instead goes out over a plain POST that never touches the queue, and
 * to Sentry, which is also fire-and-forget HTTP.
 *
 * The command rides the PUSH response (SyncController::exchangeSyncCommands),
 * not the pull. So a device whose rows fail individually — the "50 changes
 * could not be saved" shape, where the request succeeds and `failed[]` is
 * populated — does receive it. A device whose push REQUEST fails outright
 * (413, 500, timeout) never does, and nor does one with no connection at all.
 * Those are what the on-till inspection session is for.
 */
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

  // Structured context rather than one giant string: Sentry truncates a long
  // message, and the counts are what a fleet-wide search needs.
  try {
    Sentry.captureMessage(`Device report requested: ${getDeviceLabel()}`, {
      level: "info",
      tags: { area: "device-report", device_id: getDeviceId() },
      extra: {
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
        report,
      },
    });
    // "unconfirmed" is the honest word: captureMessage never throws, a
    // missing DSN makes it a silent no-op, and transport failures are async.
    // It can never prove delivery, so it must not be what makes this applied.
    delivered.push("sentry (unconfirmed)");
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
