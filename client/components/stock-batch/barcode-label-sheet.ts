/** A thermal label roll is the practical limit here; anything past this is a
 * typo, and each copy is a real page in the print job. */
export const MAX_LABEL_QUANTITY = 500;

export function clampLabelQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_LABEL_QUANTITY, Math.max(1, Math.floor(quantity)));
}

// Builds the print sheet by repeating ONE rendered label's markup.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-barcode-label-sheet-ts-L10
export function buildLabelSheetHtml(
  labelHtml: string,
  quantity: number,
): string {
  if (!labelHtml) return "";
  if (quantity <= 0) return "";
  return labelHtml.repeat(clampLabelQuantity(quantity));
}
