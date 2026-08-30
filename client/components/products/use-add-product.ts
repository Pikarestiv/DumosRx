import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import { useSaveProductMutation } from "@/lib/hooks/use-save-product-mutation";
import type { NewProductPayload } from "@/lib/types/product";

interface UseAddProductProps {
  refetch: () => void;
  setShowAddDialog: (open: boolean) => void;
}

export function useAddProduct({
  refetch,
  setShowAddDialog,
}: UseAddProductProps) {
  const { t } = useStore();
  const saveProductMutation = useSaveProductMutation();

  const handleAddProduct = (payload: NewProductPayload, keepOpen?: boolean) => {
    if (saveProductMutation.isPending) return;
    saveProductMutation.mutate(
      { payload },
      {
        onSuccess: ({ isEditing }) => {
          toast.success(isEditing ? `${t("product")} updated successfully` : `${t("product")} added successfully`);
          refetch();
          if (!keepOpen) {
            setShowAddDialog(false);
          }
        },
        onError: (error) => {
          console.error(`Failed to save ${t("product")}:`, error);
          toast.error(`Failed to save ${t("product")}.`);
        },
      },
    );
  };

  return { handleAddProduct, isSaving: saveProductMutation.isPending };
}
