"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBulkShowOnlineMutation } from "@/lib/hooks/use-bulk-show-online-mutation";

interface BulkShowOnlineActionProps {
  onUpdated: () => void;
  /** The catalog table's currently-filtered product ids, so this acts on
   * "what's on screen" exactly like Export does — undefined (no filter
   * active) means every product in the store. */
  filteredProductIds?: string[];
}

export function BulkShowOnlineAction({
  onUpdated,
  filteredProductIds,
}: BulkShowOnlineActionProps) {
  const [pendingShowOnline, setPendingShowOnline] = useState<boolean | null>(null);
  const mutation = useBulkShowOnlineMutation();
  const isFiltered = filteredProductIds !== undefined;
  const scopeLabel = isFiltered
    ? `the ${filteredProductIds.length} product${filteredProductIds.length === 1 ? "" : "s"} currently shown`
    : "every product in this store";

  const handleConfirm = () => {
    const showOnline = pendingShowOnline;
    setPendingShowOnline(null);
    if (showOnline === null) return;

    mutation.mutate(
      { showOnline, productIds: filteredProductIds },
      {
        onSuccess: (changed) => {
          toast.success(
            changed === 0
              ? showOnline
                ? "Those products were already shown online"
                : "Those products were already hidden"
              : `${changed} product${changed === 1 ? "" : "s"} ${showOnline ? "now shown in" : "hidden from"} your online store`,
          );
          onUpdated();
        },
        onError: (error) => {
          console.error(error);
          toast.error(
            error instanceof Error ? error.message : "Couldn't update those products",
          );
        },
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-[12px]"
            disabled={mutation.isPending}
          >
            <Globe className="h-3.5 w-3.5" />
            Online
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isFiltered && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Filter active: applies to {filteredProductIds.length} shown product
              {filteredProductIds.length === 1 ? "" : "s"}
            </div>
          )}
          <DropdownMenuItem onClick={() => setPendingShowOnline(true)}>
            Show online
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPendingShowOnline(false)}>
            Hide online
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={pendingShowOnline !== null}
        onOpenChange={(open) => {
          if (!open) setPendingShowOnline(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingShowOnline ? "Show these products online?" : "Hide these products online?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingShowOnline
                ? `This publishes ${scopeLabel} on your public storefront, with their current prices. Your storefront page refreshes within about 15 minutes.`
                : `This removes ${scopeLabel} from your public storefront. Your storefront page refreshes within about 15 minutes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {pendingShowOnline ? "Show online" : "Hide online"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
