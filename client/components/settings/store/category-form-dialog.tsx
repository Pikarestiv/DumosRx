"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import {
  useCreateCategoryMutation,
  useRenameCategoryMutation,
} from "@/lib/hooks/use-category-mutations";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { useStore } from "@/lib/context/store-context";
import type { CategoryRow } from "@/lib/db/queries/categories";

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present to edit that category's name; absent to create a new one. */
  editingCategory?: CategoryRow | null;
  existingNames: string[];
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  editingCategory,
  existingNames,
}: CategoryFormDialogProps) {
  const [name, setName] = useState("");
  const { storeType } = useStore();
  const isPharmacy = storeType === "pharmacy";

  const createMutation = useCreateCategoryMutation();
  const renameMutation = useRenameCategoryMutation();
  const isSubmitting = createMutation.isPending || renameMutation.isPending;

  useEffect(() => {
    if (open) setName(editingCategory?.name ?? "");
  }, [open, editingCategory]);

  // Suggestions matching how the product form already picks a category list
  // by business type, minus names already in use — no point suggesting a
  // category that already exists (the one being edited stays offered, so
  // reselecting the current name isn't blocked).
  const existingLower = new Set(
    existingNames
      .filter((n) => n.toLowerCase() !== editingCategory?.name.toLowerCase())
      .map((n) => n.toLowerCase()),
  );
  const suggestions = (isPharmacy
    ? FORM_SUGGESTIONS.store.categories
    : FORM_SUGGESTIONS.retail.categories
  ).filter((c) => !existingLower.has(c.toLowerCase()));

  // Accepts an explicit value for the Enter-key path: SearchableInput's
  // onCommitKey fires synchronously alongside its own onValueChange call, so
  // reading the `name` state here instead would see it a render behind.
  const handleSubmit = (committedName?: string) => {
    const trimmed = (committedName ?? name).trim();
    if (!trimmed || isSubmitting) return;

    if (editingCategory) {
      renameMutation.mutate(
        { id: editingCategory.id, name: trimmed },
        {
          onSuccess: () => onOpenChange(false),
          onError: (error) => {
            console.error("Failed to rename category:", error);
            toast.error("Failed to rename category");
          },
        },
      );
    } else {
      createMutation.mutate(trimmed, {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          console.error("Failed to add category:", error);
          toast.error("Failed to add category");
        },
      });
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="font-serif font-bold">
          {editingCategory ? "Rename Category" : "New Category"}
        </span>
      }
      description={
        editingCategory
          ? "Update this category's name."
          : "Pick a suggestion or type your own."
      }
      className="sm:max-w-sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {editingCategory ? "Save" : "Add"}
          </Button>
        </div>
      }
    >
      <div className="px-4 py-4 sm:px-6 space-y-2">
        <Label htmlFor="category-name">Category name</Label>
        <SearchableInput
          id="category-name"
          options={suggestions}
          value={name}
          onValueChange={setName}
          onCommitKey={(value) => handleSubmit(value)}
          placeholder="e.g. Drugs"
        />
      </div>
    </ResponsiveModal>
  );
}
