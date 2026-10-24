import { createElement } from "react";
import { getCategoryIcon } from "@/lib/constants/category-icons";

export function CategoryIcon({
  categoryName,
  className,
}: {
  categoryName?: string | null;
  className?: string;
}) {
  return createElement(getCategoryIcon(categoryName), { className });
}
