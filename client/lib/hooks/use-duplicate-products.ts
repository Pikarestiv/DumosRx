import { useMemo } from "react";
import { useProductList } from "@/lib/hooks/use-product-list";
import { findDuplicateProducts, type DuplicateQuery } from "@/lib/utils/duplicate-product";

export function useDuplicateProducts(query: DuplicateQuery) {
  const { data: products = [] } = useProductList();
  const { id, name, strength, barcode } = query;
  return useMemo(
    () => findDuplicateProducts({ id, name, strength, barcode }, products),
    [products, id, name, strength, barcode],
  );
}
