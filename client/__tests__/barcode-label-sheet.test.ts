import { describe, it, expect } from "vitest";
import {
  barcodeFit,
  buildLabelSheetHtml,
  clampLabelQuantity,
  clampStartPosition,
  countLabelPages,
  describeLabelPaper,
  getLabelPageStyle,
  labelsPerPage,
  MAX_LABEL_QUANTITY,
} from "@/components/stock-batch/barcode-label-sheet";

// The barcode dialog used to live-mount one <ReactBarcode> per copy off-screen - each doing synchronous SVG generation, al…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-barcode-label-sheet-test-ts-L8
describe("buildLabelSheetHtml on a label roll", () => {
  const label = '<div class="label">X</div>';

  it("repeats the one rendered label once per copy", () => {
    const html = buildLabelSheetHtml(label, 3);
    expect(html.split('class="label"').length - 1).toBe(3);
  });

  it("produces a single label for a quantity of one", () => {
    expect(buildLabelSheetHtml(label, 1)).toBe(label);
  });

  it("produces nothing for a non-positive quantity", () => {
    expect(buildLabelSheetHtml(label, 0)).toBe("");
    expect(buildLabelSheetHtml(label, -5)).toBe("");
  });

  it("produces nothing when there is no label markup to repeat", () => {
    expect(buildLabelSheetHtml("", 10)).toBe("");
  });

  it("caps the copy count so a typo can't ask for a million labels", () => {
    const html = buildLabelSheetHtml(label, MAX_LABEL_QUANTITY + 500);
    expect(html.split('class="label"').length - 1).toBe(MAX_LABEL_QUANTITY);
  });

  it("ignores a start position, since a roll has no used cells to skip", () => {
    expect(buildLabelSheetHtml(label, 2, "roll", 7)).toBe(label + label);
  });
});

describe("buildLabelSheetHtml on an A4 sheet", () => {
  const label = '<div class="label">X</div>';
  const sheetsOf = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return Array.from(host.querySelectorAll(".sheet")).map((sheet) => ({
      labels: sheet.querySelectorAll(".label").length,
      blanks: sheet.querySelectorAll(".blank").length,
      firstCellIsBlank: sheet.firstElementChild?.classList.contains("blank") ?? false,
    }));
  };

  it("packs a full sheet's worth of labels onto one page", () => {
    expect(sheetsOf(buildLabelSheetHtml(label, 24, "a4"))).toEqual([
      { labels: 24, blanks: 0, firstCellIsBlank: false },
    ]);
  });

  it("continues onto a second page only once the first is full", () => {
    expect(sheetsOf(buildLabelSheetHtml(label, 30, "a4"))).toEqual([
      { labels: 24, blanks: 0, firstCellIsBlank: false },
      { labels: 6, blanks: 0, firstCellIsBlank: false },
    ]);
  });

  it("leaves the already-used cells of a partly used sheet empty", () => {
    expect(sheetsOf(buildLabelSheetHtml(label, 5, "a4", 21))).toEqual([
      { labels: 4, blanks: 20, firstCellIsBlank: true },
      { labels: 1, blanks: 0, firstCellIsBlank: false },
    ]);
  });

  it("treats an out-of-range start position as the nearest real cell", () => {
    expect(sheetsOf(buildLabelSheetHtml(label, 1, "a4", 0))).toEqual([
      { labels: 1, blanks: 0, firstCellIsBlank: false },
    ]);
    expect(sheetsOf(buildLabelSheetHtml(label, 1, "a4", 99))).toEqual([
      { labels: 1, blanks: 23, firstCellIsBlank: true },
    ]);
  });

  it("produces nothing for no label or no quantity", () => {
    expect(buildLabelSheetHtml("", 5, "a4")).toBe("");
    expect(buildLabelSheetHtml(label, 0, "a4")).toBe("");
  });
});

describe("label paper math", () => {
  it("fits 24 labels on an A4 sheet and one per roll label", () => {
    expect(labelsPerPage("a4")).toBe(24);
    expect(labelsPerPage("roll")).toBe(1);
  });

  it("counts the pages a job uses, including skipped cells", () => {
    expect(countLabelPages("a4", 24, 1)).toBe(1);
    expect(countLabelPages("a4", 25, 1)).toBe(2);
    expect(countLabelPages("a4", 24, 2)).toBe(2);
    expect(countLabelPages("a4", MAX_LABEL_QUANTITY, 1)).toBe(21);
    expect(countLabelPages("roll", 12, 5)).toBe(12);
  });

  it("clamps the start position to the cells a sheet has", () => {
    expect(clampStartPosition("a4", 0)).toBe(1);
    expect(clampStartPosition("a4", 24)).toBe(24);
    expect(clampStartPosition("a4", 25)).toBe(24);
    expect(clampStartPosition("a4", Number.NaN)).toBe(1);
    expect(clampStartPosition("roll", 9)).toBe(1);
  });

  it("tells the owner how much paper the job will use", () => {
    expect(describeLabelPaper("a4", 1, 1)).toBe("1 label on 1 A4 sheet");
    expect(describeLabelPaper("a4", 30, 1)).toBe("30 labels on 2 A4 sheets");
    expect(describeLabelPaper("roll", 1, 1)).toBe("1 label on 1 roll label");
    expect(describeLabelPaper("roll", 12, 1)).toBe("12 labels on 12 roll labels");
  });
});

describe("getLabelPageStyle", () => {
  it("sizes the page to one roll label, a page per label", () => {
    const css = getLabelPageStyle("roll", true);
    expect(css).toContain("size: 50mm 25mm");
    expect(css).toMatch(/\.label\s*{[^}]*page-break-after: always/);
  });

  it("lays an A4 page out as a 3 x 8 grid with no break between labels", () => {
    const css = getLabelPageStyle("a4", true);
    expect(css).toContain("size: A4");
    expect(css).toContain("grid-template-columns: repeat(3, 63.5mm)");
    expect(css).toContain("grid-auto-rows: 33.9mm");
    expect(css).not.toMatch(/\.label\s*{[^}]*page-break-after: always/);
  });

  it("keeps the printed barcode inside its label", () => {
    expect(getLabelPageStyle("roll", true)).toMatch(/\.label svg\s*{[^}]*max-width: 100%/);
  });
});

describe("barcodeFit", () => {
  it("fits a 13-digit EAN on a 50mm roll label at full bar width", () => {
    const fit = barcodeFit("5901234123457", "roll");
    expect(fit.fits).toBe(true);
    expect(fit.neededMm).toBeCloseTo(32.5, 0);
    expect(fit.availableMm).toBe(46);
  });

  it("flags a product id fallback that cannot fit a 50mm label scannably", () => {
    const fit = barcodeFit("3f2b8c1e-9d4a-4e7b-a1c2-5d6e7f8a9b0c", "roll");
    expect(fit.fits).toBe(false);
    expect(fit.neededMm).toBeGreaterThan(100);
  });

  it("gives a wider A4 cell more room than a roll label", () => {
    expect(barcodeFit("ABCDEFGHIJKLMN", "roll").fits).toBe(false);
    expect(barcodeFit("ABCDEFGHIJKLMN", "a4").fits).toBe(true);
  });

  it("treats a value the encoder rejects as not fitting rather than throwing", () => {
    expect(barcodeFit("", "roll").fits).toBe(false);
  });
});

describe("clampLabelQuantity", () => {
  it("keeps a sane quantity as-is", () => {
    expect(clampLabelQuantity(12)).toBe(12);
  });

  it("holds a floor of one", () => {
    expect(clampLabelQuantity(0)).toBe(1);
    expect(clampLabelQuantity(-3)).toBe(1);
  });

  it("holds a ceiling", () => {
    expect(clampLabelQuantity(MAX_LABEL_QUANTITY + 1)).toBe(MAX_LABEL_QUANTITY);
  });

  it("drops a fractional part", () => {
    expect(clampLabelQuantity(2.9)).toBe(2);
  });

  it("falls back to one for a value that isn't a number", () => {
    expect(clampLabelQuantity(Number.NaN)).toBe(1);
  });
});
