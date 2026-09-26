import ExcelJS from "exceljs";

/**
 * CSV/XLSX plumbing, split out of product-import-export.ts (which had grown
 * past the 350-line limit in .agents/AGENTS.md §4) and re-exported from there
 * so existing call sites don't change. This half is format mechanics only —
 * nothing here knows what a product is.
 */
export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

/**
 * Opaque handle returned by readWorkbookFile() and consumed by
 * parseWorkbookSheet(). Deliberately doesn't leak exceljs's own Workbook
 * type to callers (unlike the old xlsx-based version, which returned
 * XLSX.WorkBook directly) - callers only ever need sheetNames plus the
 * ability to parse one of them, and keeping the underlying library's type
 * out of the public API means it can change again later without touching
 * every call site.
 */
export interface ParsedWorkbook {
  sheetNames: string[];
  /** @internal */
  _sheet: (name: string) => ParsedSpreadsheet;
}

/**
 * Minimal RFC 4180 CSV parser (quoted fields, doubled-quote escaping,
 * CRLF/LF line endings). Written directly rather than pulling in a CSV
 * library: exceljs's own CSV support is Node-stream-oriented and awkward to
 * drive from a browser File, and this project's only other spreadsheet
 * dependency (xlsx) was removed entirely for its unpatched CVEs — no reason
 * to reach for a third library for a format this simple.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += char;
    i++;
  }

  // A file with no trailing newline still has one more field/row pending.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvRowsToSpreadsheet(csvRows: string[][]): ParsedSpreadsheet {
  if (csvRows.length === 0) return { headers: [], rows: [] };
  const [headerRow, ...dataRows] = csvRows;
  const headers = headerRow.map(String);
  const rows: Record<string, unknown>[] = [];
  for (const cells of dataRows) {
    // Matches sheet_to_json's default blankrows:false behavior — a row
    // with every cell empty is skipped, not imported as an all-blank row.
    if (cells.every((c) => c === "")) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

function csvEscapeField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildCsvText(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(csvEscapeField).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscapeField(row[h])).join(","));
  }
  return lines.join("\r\n");
}

/** Plain JS value out of an exceljs cell — mirrors what sheet_to_json used
 * to hand back (raw numbers/strings), not exceljs's own richer cell-value
 * shapes (formula results, rich text runs, hyperlink objects, Dates). */
function cellPlainValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    // A broken formula (#REF!/#DIV/0!) is {error} or {formula, result: {error}}.
    if ("error" in value) return "";
    if ("result" in value) return cellPlainValue(value.result ?? "");
    if ("richText" in value) {
      return value.richText.map((t) => t.text).join("");
    }
    if ("text" in value) return (value as { text: unknown }).text ?? "";
    return String(value);
  }
  return value;
}

function worksheetToSpreadsheet(worksheet: ExcelJS.Worksheet): ParsedSpreadsheet {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cellPlainValue(cell.value) ?? "");
  });
  // Trailing undefined slots (a header row shorter than some later data row
  // would otherwise leave holes) collapse to "" like sheet_to_json did.
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === undefined) headers[i] = "";
  }

  const rows: Record<string, unknown>[] = [];
  // worksheet.actualRowCount is the count of NON-EMPTY rows, not the last
  // row's index - a sheet with any blank row (common in real QuickBooks/
  // Moniebook exports as a section separator) made this loop stop short and
  // silently drop every row after it. worksheet.rowCount is the real last
  // row number; the hasValue check below already skips blank rows within
  // that range, matching sheet_to_json's old blankrows:false behavior.
  const rowCount = worksheet.rowCount;
  for (let r = 2; r <= rowCount; r++) {
    const excelRow = worksheet.getRow(r);
    if (!excelRow || excelRow.cellCount === 0) continue;
    const row: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      if (!header) return;
      const value = cellPlainValue(excelRow.getCell(idx + 1).value);
      row[header] = value === undefined ? "" : value;
      if (row[header] !== "" && row[header] !== undefined) hasValue = true;
    });
    // Matches sheet_to_json's default blankrows:false behavior.
    if (hasValue) rows.push(row);
  }

  return { headers, rows };
}

/**
 * Reads a CSV/XLSX File (from an <input type="file">) for sheet selection.
 * Legacy .xls (the pre-2007 binary Excel format) is deliberately not
 * supported — exceljs (unlike the xlsx package this replaced, which had
 * unpatched prototype-pollution/ReDoS CVEs with no upstream fix) only reads
 * .xlsx/.csv. Real store owners' QuickBooks POS/Moniebook exports can be
 * .xls, so this throws a clear, actionable error rather than a confusing
 * parse failure - the caller (ImportMappingDialog) surfaces it as a toast.
 */
export async function readWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xls") {
    throw new Error(
      "Legacy .xls files aren't supported. Please open this file in Excel or Google Sheets, save it as .xlsx, and try importing again.",
    );
  }

  if (extension === "csv") {
    const text = await file.text();
    const sheet = csvRowsToSpreadsheet(parseCsvRows(text));
    return { sheetNames: ["Sheet1"], _sheet: () => sheet };
  }

  // .xlsx (or an unrecognized extension - let exceljs's own parser reject
  // it with its own error rather than guessing).
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  return {
    sheetNames,
    _sheet: (name: string) => {
      const worksheet = workbook.getWorksheet(name);
      return worksheet ? worksheetToSpreadsheet(worksheet) : { headers: [], rows: [] };
    },
  };
}

/** Parses a single sheet of an already-read workbook into headers + row objects. */
export function parseWorkbookSheet(
  workbook: ParsedWorkbook,
  sheetName: string,
): ParsedSpreadsheet {
  return workbook._sheet(sheetName);
}

/** Reads a CSV/XLSX File and parses its first sheet into headers + row objects. */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const workbook = await readWorkbookFile(file);
  return parseWorkbookSheet(workbook, workbook.sheetNames[0]);
}

/** Shared by buildExportBlob (product columns) and any other flat
 * headers/rows export (e.g. the Stock Audit sheet) that isn't shaped like
 * ExportableProduct - same CSV/XLSX writer, just not tied to product columns.
 * Async (unlike the old xlsx-based version) since exceljs's own writer is
 * promise-based. */
export async function buildBlobFromRows(
  headers: string[],
  data: Record<string, unknown>[],
  format: "csv" | "xlsx",
  sheetName = "Sheet1",
): Promise<Blob> {
  if (format === "csv") {
    const csv = buildCsvText(headers, data);
    return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.addRow(headers);
  for (const row of data) {
    worksheet.addRow(headers.map((h) => row[h] ?? ""));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
