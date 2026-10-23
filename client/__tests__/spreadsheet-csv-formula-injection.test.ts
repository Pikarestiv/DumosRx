import { describe, it, expect } from "vitest";
import { buildBlobFromRows, parseSpreadsheetFile } from "@/lib/utils/spreadsheet-io";

async function csvOf(rows: Record<string, unknown>[]) {
  const blob = await buildBlobFromRows(["Name", "Qty"], rows, "csv");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("CSV export formula neutralisation", () => {
  it("prefixes text cells that a spreadsheet would run as a formula", async () => {
    const text = await csvOf([
      { Name: "=HYPERLINK(\"x\")", Qty: 1 },
      { Name: "+1", Qty: 1 },
      { Name: "-Plus", Qty: 1 },
      { Name: "@cmd", Qty: 1 },
    ]);
    expect(text).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(text).toContain("'+1");
    expect(text).toContain("'-Plus");
    expect(text).toContain("'@cmd");
  });

  it("leaves real numbers, including negatives, untouched", async () => {
    const text = await csvOf([{ Name: "Panadol", Qty: -5 }]);
    expect(text.split("\r\n")[1]).toBe("Panadol,-5");
  });

  it("strips the guard again when the exported file is imported back", async () => {
    const text = await csvOf([{ Name: "-Plus", Qty: 1 }]);
    const file = new File([text], "round-trip.csv", { type: "text/csv" });
    const parsed = await parseSpreadsheetFile(file);
    expect(parsed.rows[0].Name).toBe("-Plus");
  });
});
