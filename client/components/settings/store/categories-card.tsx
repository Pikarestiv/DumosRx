"use client";

import { useState } from "react";
import { Tags } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ManageCategoriesDialog } from "@/components/products/manage-categories-dialog";

export function CategoriesCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Categories</CardTitle>
        <CardDescription>
          Add, rename, or remove the categories used across your catalog and
          inventory filters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-primary/10 shrink-0">
              <Tags className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Manage categories</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Changes apply everywhere categories are used — the product
                catalog, filters, and stock audits.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            Manage
          </Button>
        </div>
      </CardContent>

      <ManageCategoriesDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}
