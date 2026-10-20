import { apiClient } from "@/lib/api/client";
import { buildExportFilename } from "@/lib/utils/export-filename";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { getTillInspectionSession } from "@/lib/utils/till-inspection";

// Getting a device report off a broken till.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-diagnostics-delivery-L6
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

  // The inspecting admin, so a reply reaches whoever is standing at the till; otherwise DumosRx support, never the store's own address — the rep…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-diagnostics-delivery-ts-L41
  const email = session?.admin.email ?? SUPPORT_EMAIL;

  // Plain fetch, no bearer:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-diagnostics-delivery-ts-L46
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
