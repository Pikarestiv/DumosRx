import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCreateProductMutation } from "@/lib/hooks/use-product-mutations";
import { queryKeys } from "@/lib/query-keys";
import { errorDescription } from "@/lib/utils/error-description";
import type { NewProductPayload } from "@/lib/types/product";

interface UseCreatePoProductOptions {
  refetchProcurementData: () => Promise<unknown> | void;
  onCreated: (productId: string) => void;
  onClose: () => void;
}

export function useCreatePoProduct({
  refetchProcurementData,
  onCreated,
  onClose,
}: UseCreatePoProductOptions) {
  const queryClient = useQueryClient();
  const createProductMutation = useCreateProductMutation();

  const handleCreateProduct = (
    productData: NewProductPayload,
    keepOpen?: boolean,
    onSaved?: () => void,
  ) => {
    createProductMutation.mutate(productData, {
      onSuccess: (newProductId) => {
        void (async () => {
          toast.success(`${productData.name} added to catalog`);
          await refetchProcurementData();
          await queryClient.invalidateQueries(queryKeys.products.list());
          onCreated(newProductId);
          onSaved?.();
          if (!keepOpen) onClose();
        })();
      },
      onError: (error) => {
        console.error("Failed to add product:", error);
        toast.error("Couldn't add the product", {
          description: errorDescription(error),
        });
      },
    });
  };

  return { handleCreateProduct, isCreatingProduct: createProductMutation.isPending };
}
