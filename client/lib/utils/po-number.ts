export function formatPONumber(id: string) {
  return `PO-${id.split("-")[0].toUpperCase()}`;
}
