"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteService } from "@/lib/db/queries/services";
import { queryKeys } from "@/lib/query-keys";
import type { Service } from "@/lib/types/service";

interface ServiceDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: Service | null;
}

export function ServiceDeleteDialog({
  open,
  onOpenChange,
  service,
}: ServiceDeleteDialogProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!service) return;
      await deleteService(service.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all().queryKey });
      onOpenChange(false);
    },
  });

  if (!service) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Deactivate Service</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1.5">
            Are you sure you want to remove{" "}
            <span className="font-semibold text-foreground">{service.name}</span> from the active
            catalog? It will no longer appear at POS checkout. Past sales and receipts remain safe.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Removing..." : "Remove Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
