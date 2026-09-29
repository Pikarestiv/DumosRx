import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * exceljs and @react-pdf/renderer are the two heaviest dependencies in the
 * client, and both used to be pulled into ordinary route chunks by modules
 * that are imported for other reasons:
 *
 * - exceljs reached Inventory > Catalog through
 *   product-database-filters -> import-export-toolbar ->
 *   product-import-export -> spreadsheet-io.
 * - @react-pdf/renderer reached the catalog, daily-close and
 *   purchase-order-details chunks because report-pdf.tsx also happened to
 *   hold downloadBlob, a ten-line dependency-free helper.
 *
 * Both are now behind `await import(...)` inside the functions that actually
 * need them, so they only ship when a user exports or prints something. These
 * guards fail if a static value import is reintroduced - an easy accident,
 * since the static version type-checks and works fine.
 */

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
    // The transitive route matters as much as the direct one: purchase-order-pdf
    // statically imports @react-pdf/renderer, so a static value import of the
    // wrapper puts the heavy dependency back in the Orders chunk and makes the
    // `await import("@react-pdf/renderer")` above buy nothing.
    expect(hasStaticValueImport(code, "\\./purchase-order-pdf")).toBe(false);
    expect(code).toContain('import("./purchase-order-pdf")');
  });

  it("downloadBlob lives in its own dependency-free module", () => {
    const code = source("lib/utils/download-blob.ts");
    expect(code).toContain("export function downloadBlob");
    expect(hasStaticValueImport(code, "@react-pdf/renderer")).toBe(false);
  });
});
