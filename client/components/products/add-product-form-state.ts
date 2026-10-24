import { useEffect, useMemo, useState } from "react";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { getSupplierNames } from "@/lib/db/queries/products";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import type { Product } from "./types";
import type { ProductSuggestions } from "./product-form-fields";

export function emptyProductForm(initialData?: Partial<Product>): Product {
  return {
    id: "",
    name: initialData?.name || "",
    genericName: initialData?.genericName || "",
    category: "",
    nafdacNumber: "",
    strength: initialData?.strength || "",
    dosageForm: initialData?.dosageForm || "",
    manufacturer: initialData?.manufacturer || "",
    sellingPrice: 0,
    reorderLevel: 0,
    barcode: "",
    baseUnit: "Unit",
    bulkUnit: "",
    unitsPerBulk: 1,
    status: "active",
    showOnline: false,
    requiresPrescription: false,
    isControlled: false,
    costPrice: 0,
    stockQuantity: 0,
    batchNumber: "",
    expiryDate: "",
  };
}

export function productFormFromEditing(editingProduct: Product): Product {
  return {
    id: editingProduct.id || "",
    name: editingProduct.name || "",
    genericName: editingProduct.genericName || "",
    category: editingProduct.category || "",
    nafdacNumber: editingProduct.nafdacNumber || "",
    strength: editingProduct.strength || "",
    dosageForm: editingProduct.dosageForm || "",
    manufacturer: editingProduct.manufacturer || "",
    sellingPrice: editingProduct.sellingPrice || 0,
    reorderLevel: editingProduct.reorderLevel || 0,
    barcode: editingProduct.barcode || "",
    baseUnit: editingProduct.baseUnit || "Unit",
    bulkUnit: editingProduct.bulkUnit || "",
    unitsPerBulk: editingProduct.unitsPerBulk || 1,
    status: editingProduct.status || "active",
    showOnline: editingProduct.showOnline || false,
    requiresPrescription: editingProduct.requiresPrescription || false,
    isControlled: editingProduct.isControlled || false,
    costPrice: editingProduct.costPrice || 0,
    stockQuantity: editingProduct.stockQuantity || 0,
    batchNumber: editingProduct.batchNumber || "",
    expiryDate: editingProduct.expiryDate || "",
  };
}

function readCachedSuggestions(): typeof FORM_SUGGESTIONS {
  if (typeof window === "undefined") return FORM_SUGGESTIONS;
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.suggestions);
    if (cached) return JSON.parse(cached) as typeof FORM_SUGGESTIONS;
  } catch (e) {
    console.error("Failed to parse cached suggestions", e);
  }
  return FORM_SUGGESTIONS;
}

const mergeAndUnique = (arr1: string[] = [], arr2: string[] = []) =>
  Array.from(new Set([...arr1, ...arr2]));

function buildBaseSuggestions(
  isPharmacy: boolean,
  showRetailSuggestions: boolean,
): Omit<ProductSuggestions, "suppliers"> {
  const baseSuggestions = readCachedSuggestions();
  const pharmList = baseSuggestions.store || FORM_SUGGESTIONS.store;
  const retailList = baseSuggestions.retail || FORM_SUGGESTIONS.retail;
  const pharmNames = pharmList.products?.map((p) => p.name) || [];
  const retailNames = retailList.products?.map((p) => p.name) || [];

  if (!isPharmacy) return { ...retailList, names: retailNames };
  if (!showRetailSuggestions) return { ...pharmList, names: pharmNames };
  return {
    names: mergeAndUnique(pharmNames, retailNames),
    generics: pharmList.generics || [],
    categories: mergeAndUnique(pharmList.categories, retailList.categories),
    manufacturers: mergeAndUnique(
      pharmList.manufacturers,
      retailList.manufacturers,
    ),
    strengths: pharmList.strengths || [],
    dosageForms: pharmList.dosageForms || [],
  };
}

export function useProductSuggestions(
  isPharmacy: boolean,
  showRetailSuggestions: boolean,
): ProductSuggestions {
  const [suppliers, setSuppliers] = useState<string[]>([]);

  useEffect(() => {
    getSupplierNames().then(setSuppliers).catch(console.error);
  }, []);

  const baseSuggestions = useMemo(
    () => buildBaseSuggestions(isPharmacy, showRetailSuggestions),
    [isPharmacy, showRetailSuggestions],
  );

  return useMemo(
    () => ({ ...baseSuggestions, suppliers }),
    [baseSuggestions, suppliers],
  );
}
