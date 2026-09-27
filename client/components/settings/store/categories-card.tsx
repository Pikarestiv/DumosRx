"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Sparkles, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { getCategoryList, type CategoryRow } from "@/lib/db/queries/categories";
import {
  useCreateCategoryMutation,
  useRenameCategoryMutation,
  useDeleteCategoryMutation,
  useSeedDefaultCategoriesMutation,
} from "@/lib/hooks/use-category-mutations";
import { queryKeys } from "@/lib/query-keys";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pluralize } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/constants/category-icons";

export function CategoriesCard() {
  const [newName, setNewName] = useState("");
  const capsClass = useUppercaseDisplayClass();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    productCount: number;
  } | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
  });

  const createMutation = useCreateCategoryMutation();
  const renameMutation = useRenameCategoryMutation();
  const deleteMutation = useDeleteCategoryMutation();
  const seedDefaultsMutation = useSeedDefaultCategoriesMutation();

  const handleAdd = () => {
    const name = newName.trim();
    if (!name || createMutation.isPending) return;
    createMutation.mutate(name, {
      onSuccess: () => setNewName(""),
      onError: (error) => {
        console.error("Failed to add category:", error);
        toast.error("Failed to add category");
      },
    });
  };

  const handleDelete = (id: string, name: string, productCount: number) => {
    if (productCount > 0) {
      setPendingDelete({ id, name, productCount });
      return;
    }
    deleteMutation.mutate(id, {
      onError: (error) => {
        console.error("Failed to delete category:", error);
        toast.error("Failed to delete category");
      },
    });
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.id, {
      onError: (error) => {
        console.error("Failed to delete category:", error);
        toast.error("Failed to delete category");
      },
    });
  };

  const handleRename = (id: string, name: string) => {
    if (!name.trim()) return;
    renameMutation.mutate(
      { id, name },
      {
        onError: (error) => {
          console.error("Failed to rename category:", error);
          toast.error("Failed to rename category");
        },
      },
    );
  };

  const handleSeedDefaults = () => {
    if (seedDefaultsMutation.isPending) return;
    seedDefaultsMutation.mutate(undefined, {
      onSuccess: (added) => {
        toast.success(
          added > 0
            ? `Added ${added} starter categories`
            : "Starter categories already exist",
        );
      },
      onError: (error) => {
        console.error("Failed to seed default categories:", error);
        toast.error("Failed to add starter categories");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>
          Categories used across your catalog, inventory filters, and stock
          audits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="New category, e.g. Drugs"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button
            type="button"
            size="icon"
            onClick={handleAdd}
            disabled={!newName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground italic">Loading...</p>
        )}

        {!isLoading && categories.length === 0 && (
          <EmptyState
            icon={Tag}
            title="No categories yet"
            description="Add one above, or use the starter set below."
          />
        )}

        {!isLoading && categories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((cat: CategoryRow) => {
              const CategoryIcon = getCategoryIcon(cat.name);
              return (
                <div
                  key={cat.id}
                  className="flex items-start gap-3 border border-border rounded-xl p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <CategoryIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <Input
                      defaultValue={cat.name}
                      title={cat.name}
                      className={`h-8 text-[13px] truncate bg-transparent border-transparent hover:border-border focus:border-primary px-1.5 -mx-1.5 ${capsClass}`}
                      onBlur={(e) =>
                        e.target.value !== cat.name &&
                        handleRename(cat.id, e.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground px-1.5">
                      {cat.productCount} {pluralize(cat.productCount, "product")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(cat.id, cat.name, cat.productCount)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSeedDefaults}
          disabled={seedDefaultsMutation.isPending}
          className="gap-1.5"
        >
          {seedDefaultsMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Add starter categories
        </Button>
      </CardFooter>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete category?"
        description={
          pendingDelete
            ? `${pendingDelete.productCount} ${pluralize(pendingDelete.productCount, "product")} still use "${pendingDelete.name}". Deleting it won't remove or reassign those products, they'll show as Uncategorized until you give them a new category.`
            : ""
        }
        confirmLabel="Delete anyway"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </Card>
  );
}
