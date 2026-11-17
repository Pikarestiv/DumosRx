"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { useServiceCategories, useServiceCategoryMutations } from "@/lib/hooks/use-service-categories";
import { pluralize } from "@/lib/utils";

export function ServiceCategoriesCard() {
  const capsClass = useUppercaseDisplayClass();
  const categories = useServiceCategories();
  const { rename, remove } = useServiceCategoryMutations();
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ name: string; count: number } | null>(null);

  const commitRename = () => {
    if (!editing) return;
    const to = editing.to.trim();
    if (!to || to === editing.from) {
      setEditing(null);
      return;
    }
    rename.mutate(
      { from: editing.from, to },
      {
        onSuccess: () => setEditing(null),
        onError: () => toast.error("Failed to rename category"),
      },
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Service categories</CardTitle>
          <CardDescription>
            Rename a category to change it on every service that uses it. Removing one leaves those services uncategorised.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No categories yet. Add one when you create or edit a service.
            </p>
          )}
          {categories.map((category) => (
            <div key={category.name} className="flex items-center gap-2 rounded-xl border border-border p-3">
              {editing?.from === category.name ? (
                <>
                  <Input
                    autoFocus
                    aria-label={`New name for ${category.name}`}
                    value={editing.to}
                    onChange={(e) => setEditing({ ...editing, to: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className={`h-9 flex-1 ${capsClass}`}
                  />
                  <Button type="button" size="icon" variant="ghost" aria-label="Save name" onClick={commitRename} disabled={rename.isPending}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Cancel rename" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] font-medium ${capsClass}`}>{category.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {category.count} {pluralize(category.count, "service")}
                    </p>
                  </div>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Rename ${category.name}`} onClick={() => setEditing({ from: category.name, to: category.name })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${category.name}`} onClick={() => setPendingRemove(category)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(next) => !next && setPendingRemove(null)}
        title="Remove category?"
        description={
          pendingRemove
            ? `${pendingRemove.count} ${pluralize(pendingRemove.count, "service")} use "${pendingRemove.name}". They will show as Uncategorized until you give them a new category.`
            : ""
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (!pendingRemove) return;
          remove.mutate(pendingRemove.name, { onError: () => toast.error("Failed to remove category") });
        }}
      />
    </>
  );
}
