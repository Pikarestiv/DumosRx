"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ManageCategoriesDialog } from "@/components/products/manage-categories-dialog";
import { getCategoryList } from "@/lib/db/queries/categories";
import { queryKeys } from "@/lib/query-keys";

export function CategoriesCard() {
  const [open, setOpen] = useState(false);

  const { data: categories = [], isLoading } = useQuery({
    ...queryKeys.categories.list(),
    queryFn: () => getCategoryList(),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Categories used across your catalog, inventory filters, and stock
            audits.
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-muted-foreground italic">Loading...</p>
        )}
        {!isLoading && categories.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No categories yet. Use Manage to add some.
          </p>
        )}
        {!isLoading && categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Badge key={cat.id} variant="secondary" className="py-1.5">
                {cat.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <ManageCategoriesDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}
