import { describe, it, expect } from "vitest";
import {
  buildLabelSheetHtml,
  clampLabelQuantity,
  MAX_LABEL_QUANTITY,
} from "@/components/stock-batch/barcode-label-sheet";

/**
 * The barcode dialog used to live-mount one <ReactBarcode> per copy off-screen
 * - each doing synchronous SVG generation, all of them re-rendering on every
 * quantity increment, with no upper bound on quantity. Every copy is identical,
 * so only the COUNT varies: one barcode is rendered and its markup repeated.
 */
describe("buildLabelSheetHtml", () => {
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

  it("falls back to one for a value that isn't a number", () => {
    expect(clampLabelQuantity(Number.NaN)).toBe(1);
  });
});
