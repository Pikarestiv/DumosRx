import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// exceljs and @react-pdf/renderer are the two heaviest dependencies in the client, and both used to be pulled into ordinar…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-heavy-dependency-laziness-test-ts-L5

const CLIENT_ROOT = join(__dirname, "..");

function source(relativePath: string): string {
  return readFileSync(join(CLIENT_ROOT, relativePath), "utf8");
}

/** Matches a top-level value import of `pkg`, ignoring `import type`. */
function hasStaticValueImport(code: string, pkg: string): boolean {
  const pattern = new RegExp(
    `^import\\s+(?!type\\b)[^;]*?from\\s+["']${pkg}["']`,
    "m",
  );
  return pattern.test(code);
}

describe("heavy dependencies stay out of route chunks", () => {
  it("spreadsheet-io loads exceljs only on demand", () => {
    const code = source("lib/utils/spreadsheet-io.ts");
    expect(hasStaticValueImport(code, "exceljs")).toBe(false);
    expect(code).toContain('import("exceljs")');
  });

  it("report-pdf loads @react-pdf/renderer only on demand", () => {
    const code = source("lib/utils/report-pdf.tsx");
    expect(hasStaticValueImport(code, "@react-pdf/renderer")).toBe(false);
    expect(code).toContain('import("@react-pdf/renderer")');
  });

  it("daily-close-actions loads @react-pdf/renderer only on demand", () => {
    const code = source("components/reports/daily-close/daily-close-actions.tsx");
    expect(hasStaticValueImport(code, "@react-pdf/renderer")).toBe(false);
    expect(code).toContain('import("@react-pdf/renderer")');
  });

  it("purchase-order-details loads @react-pdf/renderer only on demand", () => {
    const code = source("components/procurement/purchase-order-details.tsx");
    expect(hasStaticValueImport(code, "@react-pdf/renderer")).toBe(false);
    expect(code).toContain('import("@react-pdf/renderer")');
    // The transitive route matters as much as the direct one:
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-heavy-dependency-laziness-test-ts-L61
    expect(hasStaticValueImport(code, "\\./purchase-order-pdf")).toBe(false);
    expect(code).toContain('import("./purchase-order-pdf")');
  });

  it("downloadBlob lives in its own dependency-free module", () => {
    const code = source("lib/utils/download-blob.ts");
    expect(code).toContain("export function downloadBlob");
    expect(hasStaticValueImport(code, "@react-pdf/renderer")).toBe(false);
  });
});
