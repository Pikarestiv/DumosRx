import { apiClient } from "@/lib/api/client";
import { buildExportFilename } from "@/lib/utils/export-filename";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { getTillInspectionSession } from "@/lib/utils/till-inspection";

/**
 * Getting a device report off a broken till. Two routes, deliberately:
 *
 * - Download works offline, which is exactly when a till is least able to
 *   send anything, and is the only route that survives a dead sync engine.
 * - Send posts straight to the public `/support` endpoint rather than queueing
 *   a `feedback` row through the sync engine. Filing it locally would put the
 *   report behind the very queue it is reporting on — and `insert()` refuses
 *   during a read-only inspection session anyway.
 */
export function downloadDiagnosticsReport(
  report: string,
  storeName: string | null | undefined,
): string {
  const filename = buildExportFilename({
    kind: "DeviceReport",
    extension: "txt",
    storeName,
  });

  const url = URL.createObjectURL(
    new Blob([report], { type: "text/plain;charset=utf-8" }),
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return filename;
}

export async function sendDiagnosticsReport(options: {
  report: string;
  storeName: string | null | undefined;
  deviceLabel: string;
}): Promise<void> {
  const { report, storeName, deviceLabel } = options;
  const session = getTillInspectionSession();

  // The inspecting admin, so a reply reaches whoever is standing at the till;
  // otherwise DumosRx support, never the store's own address — the report goes
  // TO support and the owner has no use for it.
  const email = session?.admin.email ?? SUPPORT_EMAIL;

  // Plain fetch, no bearer: `/support` is public, and routing it through
  // apiClient would put it on the 401 refresh-and-clear path that can unlink
  // the till's own sync token.
  const response = await fetch(`${apiClient.getBaseURL()}/support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${deviceLabel} (device report)`.slice(0, 255),
      email,
      subject: `Device report - ${storeName ?? "unknown store"}`.slice(0, 255),
      message: report,
    }),
    signal:
      typeof AbortSignal?.timeout === "function"
        ? AbortSignal.timeout(20_000)
        : undefined,
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Too many reports sent just now. Download it instead, or wait a minute."
        : "Could not reach support. Download the report and send it another way.",
    );
  }
}
