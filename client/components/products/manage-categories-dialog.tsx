"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCategoryTree,
  createCategory,
  renameCategory,
  deleteCategory,
  seedDefaultParentCategories,
  type CategoryTreeNode,
} from "@/lib/db/queries/categories";
import { queryKeys } from "@/lib/query-keys";

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCategoriesDialog({ open, onOpenChange }: ManageCategoriesDialogProps) {
  const queryClient = useQueryClient();
  const [newParentName, setNewParentName] = useState("");
  const [childDraft, setChildDraft] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: tree = [], isLoading } = useQuery({
    ...queryKeys.categories.tree(),
    queryFn: () => getCategoryTree(),
    enabled: open,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.tree().queryKey });
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.all().queryKey });
  };

  const handleAddParent = async () => {
    const name = newParentName.trim();
    if (!name) return;
    try {
      await createCategory(name, null);
      setNewParentName("");
      refresh();
    } catch (error) {
      console.error("Failed to add category:", error);
      toast.error("Failed to add category");
    }
  };

  const handleAddChild = async (parentId: string) => {
    const name = (childDraft[parentId] || "").trim();
    if (!name) return;
    try {
      await createCategory(name, parentId);
      setChildDraft((prev) => ({ ...prev, [parentId]: "" }));
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
      refresh();
    } catch (error) {
      console.error("Failed to add sub-category:", error);
      toast.error("Failed to add sub-category");
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
      const added = await seedDefaultParentCategories();
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
      description="Broad categories group your finer-grained ones — a product can belong to either. Nothing here is created or changed automatically."
      className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
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
            placeholder="New broad category, e.g. Drugs"
            value={newParentName}
            onChange={(e) => setNewParentName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddParent()}
          />
          <Button type="button" size="icon" onClick={handleAddParent} disabled={!newParentName.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isLoading && (
          <div className="text-center py-6 text-sm text-muted-foreground">Loading...</div>
        )}

        {!isLoading && tree.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No categories yet — add one above, or use the starter set below.
          </div>
        )}

        <div className="space-y-2">
          {tree.map((cat: CategoryTreeNode) => {
            const isOpen = expanded[cat.id] ?? false;
            return (
              <div key={cat.id} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 p-2.5 bg-muted/30">
                  <button
                    type="button"
                    className="text-muted-foreground shrink-0"
                    onClick={() => setExpanded((prev) => ({ ...prev, [cat.id]: !isOpen }))}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <Input
                    defaultValue={cat.name}
                    className="h-8 text-[13px] font-semibold bg-transparent border-transparent hover:border-border focus:border-primary"
                    onBlur={(e) => e.target.value !== cat.name && handleRename(cat.id, e.target.value)}
                  />
                  {cat.children.length > 0 && (
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {cat.children.length} sub
                    </span>
                  )}
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

                {isOpen && (
                  <div className="p-2.5 space-y-1.5">
                    {cat.children.map((child) => (
                      <div key={child.id} className="flex items-center gap-2 pl-6">
                        <Input
                          defaultValue={child.name}
                          className="h-8 text-[12.5px] bg-transparent border-transparent hover:border-border focus:border-primary"
                          onBlur={(e) => e.target.value !== child.name && handleRename(child.id, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(child.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pl-6 pt-1">
                      <Input
                        placeholder="Add sub-category"
                        className="h-8 text-[12.5px]"
                        value={childDraft[cat.id] || ""}
                        onChange={(e) => setChildDraft((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleAddChild(cat.id)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleAddChild(cat.id)}
                        disabled={!(childDraft[cat.id] || "").trim()}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ResponsiveModal>
  );
}
