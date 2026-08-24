import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import { getCategoryByName } from "@/lib/db/queries/products";
import { useStore } from "@/lib/context/store-context";
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

  const handleAddProduct = async (payload: NewProductPayload, keepOpen?: boolean) => {
    try {
      const isEditing = !!payload.id;

      // Create locally: is_active is already set correctly (0/1) by
      // AddProductDialog's submit handler, so just pass the payload through.
      const localPayload: NewProductPayload = { ...payload };

      // Resolve category string to UUID
      if (payload.category_id) {
        const categoryName = payload.category_id.trim();
        const categoryId = await getCategoryByName(categoryName);
        if (categoryId) {
          localPayload.category_id = categoryId;
        } else {
          const newId = crypto.randomUUID();
          await insert("categories", {
            id: newId,
            name: categoryName,
            is_active: 1,
            created_at: new Date().toISOString(),
          });
          localPayload.category_id = newId;
        }
      } else {
        localPayload.category_id = undefined;
      }


      if (isEditing) {
        const id = localPayload.id as string;
        delete localPayload.id;
        await update("products", id, localPayload);
        toast.success(`${t("product")} updated successfully`);
      } else {
        await insert("products", localPayload);
        toast.success(`${t("product")} added successfully`);
      }

      refetch();
      if (!keepOpen) {
        setShowAddDialog(false);
      }
    } catch (error) {
      console.error(`Failed to save ${t("product")}:`, error);
      toast.error(`Failed to save ${t("product")}.`);
    }
  };

  return { handleAddProduct };
}
