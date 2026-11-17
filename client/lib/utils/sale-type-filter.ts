export const SALE_TYPE_OPTIONS = [
  { value: "Product", label: "Product" },
  { value: "Service", label: "Service" },
  { value: "Reseller", label: "Reseller" },
  { value: "StoreMarkup", label: "Store Markup" },
];

interface SaleTypeFields {
  is_reseller_sale?: number | boolean | null;
  markup_type?: string | null;
  has_product_lines?: number | null;
  has_service_lines?: number | null;
}

export function matchesSaleTypeFilter(sale: SaleTypeFields, filter: string): boolean {
  switch (filter) {
    case "Product":
      return Number(sale.has_product_lines) > 0;
    case "Service":
      return Number(sale.has_service_lines) > 0;
    case "Reseller":
      return Boolean(sale.is_reseller_sale) && sale.markup_type !== "store";
    case "StoreMarkup":
      return Boolean(sale.is_reseller_sale) && sale.markup_type === "store";
    default:
      return true;
  }
}
