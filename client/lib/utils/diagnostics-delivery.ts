import { apiClient } from "@/lib/api/client";
import { buildExportFilename } from "@/lib/utils/export-filename";
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
  contactEmail?: string | null;
}): Promise<void> {
  const { report, storeName, deviceLabel, contactEmail } = options;
  const session = getTillInspectionSession();

  // The admin running the inspection is the right correspondent; their address
  // comes from the server-issued session, not from anything typed on the till.
  const email = session?.admin.email ?? contactEmail;

  if (!email) {
    throw new Error(
      "No address to send from. Download the report and attach it instead.",
    );
  }

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
