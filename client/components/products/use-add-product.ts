import { toast } from "sonner";
import { insert, update, query } from "@/lib/db/local-database";
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
        const existing = await query<any>(
          "SELECT id FROM categories WHERE name = ? AND _deleted = 0",
          [categoryName],
        );
        if (existing && existing.length > 0) {
          localPayload.category_id = existing[0].id;
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

      // Resolve supplier string to UUID (maps to client suppliers table)
      if (payload.supplier_id) {
        const supplierName = payload.supplier_id.trim();
        const existing = await query<any>(
          "SELECT id FROM suppliers WHERE name = ? AND _deleted = 0",
          [supplierName],
        );
        if (existing && existing.length > 0) {
          localPayload.supplier_id = existing[0].id;
        } else {
          const newId = crypto.randomUUID();
          await insert("suppliers", {
            id: newId,
            name: supplierName,
            is_active: 1,
            created_at: new Date().toISOString(),
          });
          localPayload.supplier_id = newId;
        }
      } else {
        localPayload.supplier_id = null;
      }

      const initialStock = localPayload.stock_quantity;
      const initialExpiry = localPayload.expiry_date;
      const initialBatch = localPayload.batch_number;

      delete localPayload.stock_quantity;
      delete localPayload.expiry_date;
      delete localPayload.batch_number;

      if (isEditing) {
        const id = localPayload.id;
        delete localPayload.id;
        // Use generic update from base-helpers
        await update("products", id, localPayload);
        toast.success(`${t("product")} updated successfully`);
      } else {
        const productId = await insert("products", localPayload);

        // Also create an initial stock batch if there's stock
        if (initialStock > 0) {
          await insert("stock_batches", {
            product_id: productId,
            quantity: initialStock,
            cost_price: localPayload.cost_price || 0,
            batch_number: initialBatch || "INITIAL",
            expiry_date:
              initialExpiry ||
              new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
            is_active: 1,
          });
        }
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
