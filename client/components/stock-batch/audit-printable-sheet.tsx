import type { RefObject } from "react";
import type { AuditSheet } from "@/lib/hooks/use-audit-sheet-export";

interface AuditPrintableSheetProps {
  sheet: AuditSheet | null;
  storeName: string;
  sheetRef: RefObject<HTMLDivElement | null>;
}

// Off-screen, not display:none, so printNode's clone still lays out; rationale:
// docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-printable-sheet-tsx
export function AuditPrintableSheet({
  sheet,
  storeName,
  sheetRef,
}: AuditPrintableSheetProps) {
  if (!sheet) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: "-9999px" }} aria-hidden="true">
      <div ref={sheetRef} className="p-6">
        <h1 className="text-lg font-bold mb-1">{storeName} - Stock Audit Sheet</h1>
        <p className="text-sm text-muted-foreground mb-4">{sheet.subtitle}</p>
        <div
          role="table"
          aria-label="Stock audit sheet"
          className="table w-full border-collapse text-sm"
        >
          <div role="rowgroup" className="table-header-group">
            <div role="row" className="table-row">
              {sheet.headers.map((h) => (
                <div
                  key={h}
                  role="columnheader"
                  className="table-cell border border-border px-2 py-1 text-left font-bold"
                >
                  {h}
                </div>
              ))}
            </div>
          </div>
          <div role="rowgroup" className="table-row-group">
            {sheet.rows.map((row, i) => (
              <div key={i} role="row" className="table-row">
                {sheet.headers.map((h) => (
                  <div
                    key={h}
                    role="cell"
                    className="table-cell border border-border px-2 py-1"
                  >
                    {String(row[h] ?? "")}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
