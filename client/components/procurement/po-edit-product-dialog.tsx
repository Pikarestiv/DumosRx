"use client";

import { useQuery } from "@tanstack/react-query";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { useAddProduct } from "@/components/products/use-add-product";
import { transformProduct } from "@/components/products/types";
import { getProductsWithDetails } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";

interface POEditProductDialogProps {
  productId: string;
  onClose: () => void;
  onRenamed: (productId: string, name: string) => void;
}

export function POEditProductDialog({ productId, onClose, onRenamed }: POEditProductDialogProps) {
  const { data: rawProducts } = useQuery({
    ...queryKeys.products.withDetails(),
    queryFn: () => getProductsWithDetails(),
  });
  const product = rawProducts
    ?.map(transformProduct)
    .find((p) => p.id === productId);

  const { handleAddProduct, isSaving } = useAddProduct({
    refetch: () => {},
    setShowAddDialog: (open) => !open && onClose(),
  });

  return (
    <AddProductDialog
      open={!!product}
      onOpenChange={(open) => !open && onClose()}
      onAddProduct={(payload, keepOpen, onSaved) =>
        handleAddProduct(payload, keepOpen, () => {
          onRenamed(productId, payload.name);
          onSaved?.();
        })
      }
      editingProduct={product}
      hideAddAnother
      isSubmitting={isSaving}
    />
  );
}
