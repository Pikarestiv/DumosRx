"use client";

import { useState } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCategoryList,
  createCategory,
  renameCategory,
  deleteCategory,
  seedDefaultCategories,
  type CategoryRow,
} from "@/lib/db/queries/categories";
import { queryKeys } from "@/lib/query-keys";

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCategoriesDialog({ open, onOpenChange }: ManageCategoriesDialogProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: categories = [], isLoading } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
    enabled: open,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.list().queryKey });
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.all().queryKey });
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createCategory(name);
      setNewName("");
      refresh();
    } catch (error) {
      console.error("Failed to add category:", error);
      toast.error("Failed to add category");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      refresh();
    } catch (error) {
      console.error("Failed to delete category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleRename = async (id: string, name: string) => {
    if (!name.trim()) return;
    try {
      await renameCategory(id, name);
      refresh();
    } catch (error) {
      console.error("Failed to rename category:", error);
      toast.error("Failed to rename category");
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const added = await seedDefaultCategories();
      toast.success(added > 0 ? `Added ${added} starter categories` : "Starter categories already exist");
      refresh();
    } catch (error) {
      console.error("Failed to seed default categories:", error);
      toast.error("Failed to add starter categories");
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-serif font-bold">Manage Categories</span>}
      description="Create as many categories as you need, broad or specific."
      className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col"
      footer={
        <div className="flex justify-between items-center w-full">
          <Button type="button" variant="outline" size="sm" onClick={handleSeedDefaults} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Add starter categories
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      }
    >
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="New category, e.g. Drugs"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button type="button" size="icon" onClick={handleAdd} disabled={!newName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isLoading && (
          <div className="text-center py-6 text-sm text-muted-foreground">Loading...</div>
        )}

        {!isLoading && categories.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No categories yet. Add one above, or use the starter set below.
          </div>
        )}

        <div className="space-y-1.5">
          {categories.map((cat: CategoryRow) => (
            <div key={cat.id} className="flex items-center gap-2 border border-border rounded-lg p-1.5">
              <Input
                defaultValue={cat.name}
                className="h-8 text-[13px] bg-transparent border-transparent hover:border-border focus:border-primary"
                onBlur={(e) => e.target.value !== cat.name && handleRename(cat.id, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(cat.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </ResponsiveModal>
  );
}
