"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useQuickEditProductMutation } from "@/lib/hooks/use-product-quick-edit-mutation";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";

interface ReceiveItemCategoryEditorProps {
  productId: string;
  productName: string;
  categoryName?: string | null;
}

// Receiving a delivery is when a store owner actually handles the goods and notices a product is filed under the wrong cat…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-receive-item-category-editor-tsx-L22
export function ReceiveItemCategoryEditor({
  productId,
  productName,
  categoryName,
}: ReceiveItemCategoryEditorProps) {
  const displayName = useDisplayName();
  const canManageProducts = useHasPermission("manage_products");
  const [open, setOpen] = useState(false);
  // The PO detail query keys off purchase_orders/purchase_order_items, so a products write doesn't refetch this row's joined…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-procurement-receive-item-category-editor-tsx-L38
  const [savedCategory, setSavedCategory] = useState<string | null>(null);
  const currentCategory = savedCategory ?? categoryName ?? "";
  const [category, setCategory] = useState(currentCategory);
  const quickEdit = useQuickEditProductMutation();

  const openEditor = () => {
    setCategory(currentCategory);
    setOpen(true);
  };

  if (!canManageProducts) return null;

  const handleSave = async () => {
    try {
      await quickEdit.mutateAsync({ id: productId, category });
      setSavedCategory(category);
      toast.success("Category updated");
      setOpen(false);
    } catch (error) {
      console.error("Failed to update category:", error);
      toast.error("Couldn't update the category");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        aria-label={`Edit category for ${productName}`}
        title={currentCategory ? `Category: ${currentCategory}` : "Set category"}
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <Pencil className="h-3 w-3" />
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={<span className="font-serif font-bold text-lg">Edit category</span>}
        description={`Change the category ${displayName(productName)} is filed under. This updates the product itself, not just this delivery.`}
        className="sm:max-w-md"
        footer={
          <DialogFooter className="gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={quickEdit.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={quickEdit.isPending}
            >
              {quickEdit.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save category
            </Button>
          </DialogFooter>
        }
      >
        <div className="space-y-2 pb-2">
          <Label htmlFor={`receive-category-${productId}`}>Category</Label>
          <CategoryCombobox
            id={`receive-category-${productId}`}
            value={category}
            onValueChange={setCategory}
          />
        </div>
      </ResponsiveModal>
    </>
  );
}
