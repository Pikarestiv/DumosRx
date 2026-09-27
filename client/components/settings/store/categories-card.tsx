"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { getCategoryList, type CategoryRow } from "@/lib/db/queries/categories";
import { useDeleteCategoryMutation } from "@/lib/hooks/use-category-mutations";
import { queryKeys } from "@/lib/query-keys";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pluralize } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/constants/category-icons";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { CategoryFormDialog } from "./category-form-dialog";

export function CategoriesCard() {
  const capsClass = useUppercaseDisplayClass();
  const [search, setSearch] = useState("");
  const [formState, setFormState] = useState<{
    open: boolean;
    editingCategory: CategoryRow | null;
  }>({ open: false, editingCategory: null });
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    productCount: number;
  } | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
  });

  const deleteMutation = useDeleteCategoryMutation();

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search categories..."
            aria-label="Search categories"
          />
          <Button
            type="button"
            size="icon"
            onClick={() => setFormState({ open: true, editingCategory: null })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isLoading && (
          <p className="text-sm text-muted-foreground italic">Loading...</p>
        )}

        {!isLoading && categories.length === 0 && (
          <EmptyState
            icon={Tag}
            title="No categories yet"
            description="Add your first one above."
          />
        )}

        {!isLoading && categories.length > 0 && filteredCategories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No categories match &quot;{search}&quot;.
          </p>
        )}

        {filteredCategories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredCategories.map((cat: CategoryRow) => {
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
                    <p
                      className={`text-[13px] font-medium truncate ${capsClass}`}
                      title={cat.name}
                    >
                      {cat.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cat.productCount} {pluralize(cat.productCount, "product")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => setFormState({ open: true, editingCategory: cat })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(cat.id, cat.name, cat.productCount)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CategoryFormDialog
        open={formState.open}
        onOpenChange={(open) => setFormState((prev) => ({ ...prev, open }))}
        editingCategory={formState.editingCategory}
        existingNames={categories.map((c) => c.name)}
      />

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
