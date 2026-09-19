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

  /** `onSaved` lets the dialog clear its form only after the save actually
   * landed, so a failed save leaves everything the user typed intact. */
  const handleAddProduct = (
    payload: NewProductPayload,
    keepOpen?: boolean,
    onSaved?: () => void,
  ) => {
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
          onSaved?.();
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
