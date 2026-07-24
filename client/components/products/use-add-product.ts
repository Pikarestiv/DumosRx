import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import { getCategoryByName } from "@/lib/db/queries/products";
import { Product } from "./types";
import { useStore } from "@/lib/context/store-context";

interface UseAddProductProps {
  refetch: () => void;
  setShowAddDialog: (open: boolean) => void;
  setSelectedProduct: (product: Product | null) => void;
}

export function useAddProduct({
  refetch,
  setShowAddDialog,
  setSelectedProduct,
}: UseAddProductProps) {
  const { t } = useStore();

  const handleAddProduct = async (payload: any, keepOpen?: boolean) => {
    try {
      const isEditing = !!payload.id;

      // Create locally
      const localPayload: any = {
        ...payload,
        is_active: payload.status === "inactive" ? 0 : 1,
      };
      delete localPayload.status;

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
        localPayload.category_id = null;
      }


      if (isEditing) {
        const id = localPayload.id;
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
      setSelectedProduct(null);
    } catch (error) {
      console.error(`Failed to save ${t("product")}:`, error);
      toast.error(`Failed to save ${t("product")}.`);
    }
  };

  return { handleAddProduct };
}
