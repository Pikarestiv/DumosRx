import JsBarcode from "jsbarcode";

export interface LabelProduct {
  id: string;
  name: string;
  barcode?: string;
  unit_price: number;
}

export function formatLabelPrice(currency: string | undefined, unitPrice: number): string {
  return `${currency || "NGN"} ${unitPrice.toLocaleString()}`;
}

function barcodeSvg(value: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, value, { width: 1, height: 26, fontSize: 8, margin: 0 });
  return svg;
}

export function buildLabelHtml(product: LabelProduct, currency: string | undefined): string {
  const label = document.createElement("div");
  label.className = "label";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = product.name;
  const price = document.createElement("div");
  price.className = "price";
  price.textContent = formatLabelPrice(currency, product.unit_price);
  let svg: SVGSVGElement;
  try {
    svg = barcodeSvg(product.barcode || product.id);
  } catch {
    svg = barcodeSvg(product.id);
  }
  label.append(name, svg, price);
  return label.outerHTML;
}
