import { createElement } from "react";
import { getProductIcon } from "@/lib/constants/product-icons";

export function CategoryIcon({
  categoryName,
  productName,
  className,
}: {
  categoryName?: string | null;
  productName?: string | null;
  className?: string;
}) {
  return createElement(getProductIcon(categoryName, productName), { className });
}
