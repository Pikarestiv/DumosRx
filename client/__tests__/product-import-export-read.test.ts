import { describe, it, expect } from "vitest";
import {
  readWorkbookFile,
  parseWorkbookSheet,
  parseSpreadsheetFile,
  buildBlobFromRows,
} from "@/lib/utils/product-import-export";

/**
 * Regression coverage for the xlsx -> exceljs migration (docs/KNOWN_BUGS.md
 * H1 - xlsx had unpatched prototype-pollution/ReDoS CVEs with no upstream
 * fix). exceljs doesn't support the legacy .xls binary format at all, so
 * that specific case needed a deliberate, user-facing rejection rather than
 * a confusing parse failure - and the custom CSV parser/writer written to
 * replace xlsx's (exceljs's own CSV support is Node-stream-oriented, not a
 * good fit for a browser File) needed its own round-trip coverage, since
 * none existed for the read path before this migration at all.
 */
describe("readWorkbookFile / parseWorkbookSheet", () => {
  it("rejects legacy .xls files with a clear, actionable message rather than a confusing parse failure", async () => {
    const file = new File(["not a real xls file"], "products.xls", {
      type: "application/vnd.ms-excel",
    });

    await expect(readWorkbookFile(file)).rejects.toThrow(/\.xls files aren't supported/i);
  });

  it("parses a CSV file into headers + row objects, including a quoted field with an embedded comma", async () => {
    const csv = [
      "Product Name,Category,Cost Price",
      'Panadol,"Pain, Fever",50',
      "Amoxicillin,Antibiotics,120",
    ].join("\r\n");
    const file = new File([csv], "products.csv", { type: "text/csv" });

    const parsed = await parseSpreadsheetFile(file);

    expect(parsed.headers).toEqual(["Product Name", "Category", "Cost Price"]);
    expect(parsed.rows).toEqual([
      { "Product Name": "Panadol", "Category": "Pain, Fever", "Cost Price": "50" },
      { "Product Name": "Amoxicillin", "Category": "Antibiotics", "Cost Price": "120" },
    ]);
  });

  it("skips fully-blank CSV rows, matching the previous sheet_to_json behavior", async () => {
    const csv = ["Name,Qty", "Panadol,5", ",", "Amoxicillin,3"].join("\r\n");
    const file = new File([csv], "products.csv", { type: "text/csv" });

    const parsed = await parseSpreadsheetFile(file);

    expect(parsed.rows).toHaveLength(2);
  });

  it("doesn't truncate rows after a blank separator row in an xlsx sheet (worksheet.actualRowCount undercounts vs. rowCount)", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Products");
    sheet.addRow(["Product Name", "Cost Price"]);
    sheet.addRow(["Panadol", 50]);
    sheet.addRow([]); // blank separator row, as real QuickBooks/Moniebook exports often have
    sheet.addRow(["Amoxicillin", 120]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "products.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const parsed = await parseSpreadsheetFile(file);

    expect(parsed.rows).toEqual([
      { "Product Name": "Panadol", "Cost Price": 50 },
      { "Product Name": "Amoxicillin", "Cost Price": 120 },
    ]);
  });

  it("round-trips a real xlsx file: build one with buildBlobFromRows, then read it back and get the same data", async () => {
    const headers = ["Product Name", "Cost Price"];
    const rows = [
      { "Product Name": "Panadol", "Cost Price": 50 },
      { "Product Name": "Amoxicillin", "Cost Price": 120 },
    ];

    const blob = await buildBlobFromRows(headers, rows, "xlsx", "Products");
    const file = new File([await blob.arrayBuffer()], "export.xlsx", {
      type: blob.type,
    });

    const workbook = await readWorkbookFile(file);
    expect(workbook.sheetNames).toEqual(["Products"]);

    const parsed = parseWorkbookSheet(workbook, "Products");
    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows).toEqual([
      { "Product Name": "Panadol", "Cost Price": 50 },
      { "Product Name": "Amoxicillin", "Cost Price": 120 },
    ]);
  });

  it("exposes multiple sheet names from a multi-sheet xlsx workbook", async () => {
    // Two independent single-sheet exports simulate a multi-sheet file by
    // reading the second one's worksheet and renaming it onto the first
    // workbook - simplest way to get a real multi-sheet .xlsx without a
    // second production code path just for this test.
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1").addRow(["A"]);
    workbook.addWorksheet("Sheet2").addRow(["B"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "multi.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const parsedWorkbook = await readWorkbookFile(file);
    expect(parsedWorkbook.sheetNames).toEqual(["Sheet1", "Sheet2"]);
  });
});
