"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { createService, updateServiceDetails } from "@/lib/db/queries/services";
import { queryKeys } from "@/lib/query-keys";
import { useStore } from "@/lib/context/store-context";
import type { Service } from "@/lib/types/service";

interface ServiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  onSuccess?: (serviceId: string) => void;
}

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  onSuccess,
}: ServiceFormDialogProps) {
  const queryClient = useQueryClient();
  const { activeStoreId } = useStore();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (service) {
      setName(service.name || "");
      setCode(service.code || "");
      setCategory(service.category || "");
      setPrice(service.price != null ? String(service.price) : "");
      setDescription(service.description || "");
      setIsActive(Boolean(service.is_active));
    } else {
      setName("");
      setCode("");
      setCategory("");
      setPrice("");
      setDescription("");
      setIsActive(true);
    }
    setError(null);
  }, [service, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("Service name is required.");
      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || numericPrice < 0) {
        throw new Error("Please enter a valid price (≥ 0).");
      }

      if (service) {
        await updateServiceDetails(service.id, {
          name: trimmedName,
          code: code.trim() || null,
          category: category.trim() || null,
          price: numericPrice,
          description: description.trim() || null,
          is_active: isActive ? 1 : 0,
        });
        return service.id;
      } else {
        return await createService({
          store_id: activeStoreId || null,
          name: trimmedName,
          code: code.trim() || null,
          category: category.trim() || null,
          price: numericPrice,
          description: description.trim() || null,
          is_active: isActive ? 1 : 0,
        });
      }
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all().queryKey });
      onOpenChange(false);
      onSuccess?.(id);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to save service.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{service ? "Edit Service" : "Add New Service"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                {error}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="srv-name">
                Service Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="srv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Deep Tissue Massage, Consultation, Hair Styling"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="srv-code">Service Code / SKU</Label>
                <Input
                  id="srv-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. SRV-SPA-01"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="srv-category">Category</Label>
                <Input
                  id="srv-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Spa, Clinic, Salon"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="srv-price">
                Standard Price <span className="text-destructive">*</span>
              </Label>
              <Input
                id="srv-price"
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="srv-description">Description</Label>
              <Textarea
                id="srv-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief notes or scope of this service (optional)"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="srv-active" className="text-sm font-medium cursor-pointer">
                  Available for Sale
                </Label>
                <p className="text-xs text-muted-foreground">
                  Active services appear immediately in POS.
                </p>
              </div>
              <Switch
                id="srv-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : service ? "Save Changes" : "Create Service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
