import JsBarcode from "jsbarcode";

/** A thermal label roll is the practical limit here; anything past this is a
 * typo, and each copy is a real page in the print job. */
export const MAX_LABEL_QUANTITY = 500;

const LABEL_PADDING_MM = 2;
const MM_PER_CSS_PX = 25.4 / 96;

export const LABEL_LAYOUTS = {
  roll: {
    title: "Label roll",
    detail: "50 × 25 mm, one per label",
    paper: "roll label",
    widthMm: 50,
    heightMm: 25,
    columns: 1,
    rows: 1,
  },
  a4: {
    title: "A4 sheet",
    detail: "24 per page, 3 × 8 of 63.5 × 33.9 mm",
    paper: "A4 sheet",
    widthMm: 63.5,
    heightMm: 33.9,
    columns: 3,
    rows: 8,
  },
} as const;

export type LabelLayoutId = keyof typeof LABEL_LAYOUTS;

const A4_SHEET = { marginTopMm: 12.9, marginSideMm: 7.25, columnGapMm: 2.5 };

export function isLabelLayoutId(value: unknown): value is LabelLayoutId {
  return value === "roll" || value === "a4";
}

export function clampLabelQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_LABEL_QUANTITY, Math.max(1, Math.floor(quantity)));
}

export function labelsPerPage(layout: LabelLayoutId): number {
  return LABEL_LAYOUTS[layout].columns * LABEL_LAYOUTS[layout].rows;
}

export function clampStartPosition(layout: LabelLayoutId, position: number): number {
  if (!Number.isFinite(position)) return 1;
  return Math.min(labelsPerPage(layout), Math.max(1, Math.floor(position)));
}

export function countLabelPages(layout: LabelLayoutId, quantity: number, startPosition: number): number {
  const skipped = clampStartPosition(layout, startPosition) - 1;
  return Math.ceil((skipped + Math.max(1, Math.floor(quantity))) / labelsPerPage(layout));
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function describeLabelPaper(layout: LabelLayoutId, quantity: number, startPosition: number): string {
  const labels = Math.max(1, Math.floor(quantity));
  const pages = countLabelPages(layout, labels, startPosition);
  return `${plural(labels, "label")} on ${plural(pages, LABEL_LAYOUTS[layout].paper)}`;
}

export const MAX_BULK_LABELS = 2000;

export function packLabels(labels: string[], layout: LabelLayoutId, startPosition = 1): string {
  if (layout === "roll") return labels.join("");
  const blanks = Array<string>(clampStartPosition(layout, startPosition) - 1).fill('<div class="blank"></div>');
  const cells = [...blanks, ...labels];
  const perPage = labelsPerPage(layout);
  const sheets: string[] = [];
  for (let i = 0; i < cells.length; i += perPage) {
    sheets.push(`<div class="sheet">${cells.slice(i, i + perPage).join("")}</div>`);
  }
  return sheets.join("");
}

// Builds the print sheet by repeating ONE rendered label's markup.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-barcode-label-sheet-ts-L10
export function buildLabelSheetHtml(
  labelHtml: string,
  quantity: number,
  layout: LabelLayoutId = "roll",
  startPosition = 1,
): string {
  if (!labelHtml) return "";
  if (quantity <= 0) return "";
  return packLabels(Array<string>(clampLabelQuantity(quantity)).fill(labelHtml), layout, startPosition);
}

export function buildMultiProductSheetHtml(
  labelHtmls: string[],
  copiesEach: number,
  layout: LabelLayoutId,
  startPosition = 1,
): string {
  const copies = clampLabelQuantity(copiesEach);
  const labels = labelHtmls.flatMap((html) => Array<string>(copies).fill(html));
  return packLabels(labels.slice(0, MAX_BULK_LABELS), layout, startPosition);
}

export interface BarcodeFit {
  fits: boolean;
  neededMm: number;
  availableMm: number;
  reason?: "unencodable";
}

export function barcodeFit(value: string, layout: LabelLayoutId): BarcodeFit {
  const availableMm = LABEL_LAYOUTS[layout].widthMm - LABEL_PADDING_MM * 2;
  const encoded: { encodings?: { data: string }[] } = {};
  try {
    JsBarcode(encoded, value, { margin: 0 });
  } catch {
    return { fits: false, neededMm: Number.POSITIVE_INFINITY, availableMm, reason: "unencodable" };
  }
  const modules = (encoded.encodings ?? []).reduce((sum, e) => sum + e.data.length, 0);
  const neededMm = modules * MM_PER_CSS_PX;
  return { fits: modules > 0 && neededMm <= availableMm, neededMm, availableMm };
}

export function canEncodeBarcode(value: string): boolean {
  return barcodeFit(value, "roll").reason !== "unencodable";
}

function rollPageStyle(): string {
  const { widthMm, heightMm } = LABEL_LAYOUTS.roll;
  return `
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  .label { page-break-after: always; }`;
}

function a4PageStyle(): string {
  const { widthMm, heightMm, columns } = LABEL_LAYOUTS.a4;
  const { marginTopMm, marginSideMm, columnGapMm } = A4_SHEET;
  return `
  @page { size: A4; margin: 0; }
  .sheet {
    width: 210mm;
    height: 296mm;
    box-sizing: border-box;
    padding: ${marginTopMm}mm ${marginSideMm}mm 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(${columns}, ${widthMm}mm);
    grid-auto-rows: ${heightMm}mm;
    column-gap: ${columnGapMm}mm;
    break-after: page;
  }
  .sheet:last-child { break-after: auto; }`;
}

// printNode() ships this as a page <style> in the popped-out print window, so it's a plain string, not a Tailwind class.
// Rationale: docs/CLIENT_COMMENTS.md#line-components-stock-batch-barcode-print-dialog-tsx-L34
export function getLabelPageStyle(layout: LabelLayoutId, uppercaseNames: boolean): string {
  const { widthMm, heightMm } = LABEL_LAYOUTS[layout];
  return `${layout === "roll" ? rollPageStyle() : a4PageStyle()}
  body { margin: 0; padding: 0; }
  .label {
    width: ${widthMm}mm;
    height: ${heightMm}mm;
    box-sizing: border-box;
    padding: ${LABEL_PADDING_MM}mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: sans-serif;
  }
  .label svg { max-width: 100%; height: auto; }
  .label .name {
    font-size: 8pt;
    font-weight: bold;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    text-transform: ${uppercaseNames ? "uppercase" : "capitalize"};
  }
  .label .price {
    font-size: 9pt;
    font-weight: bold;
    margin-top: 1mm;
  }
`;
}
