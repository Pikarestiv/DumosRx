"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Globe } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { useOnlineListingCap } from "@/lib/hooks/use-online-listing-cap";
import { overCapMessage } from "@/lib/utils/storefront-entitlements";

interface BulkShowOnlineActionsProps {
  onUpdated: () => void;
  // The catalog table's currently-filtered product ids, so this acts on "what's on screen" exactly like Export does — undefi…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-products-bulk-show-online-action-tsx-L28
  filteredProductIds?: string[];
}

export function useBulkShowOnlineActions({
  onUpdated,
  filteredProductIds,
}: BulkShowOnlineActionsProps): { menuItems: ReactNode; overlays: ReactNode } {
  const [pendingShowOnline, setPendingShowOnline] = useState<boolean | null>(null);
  const mutation = useBulkShowOnlineMutation();
  const listingCap = useOnlineListingCap();
  const isFiltered = filteredProductIds !== undefined;
  const scopeLabel = isFiltered
    ? `the ${filteredProductIds.length} product${filteredProductIds.length === 1 ? "" : "s"} currently shown`
    : "every product in this store";

  const handleConfirm = () => {
    const showOnline = pendingShowOnline;
    setPendingShowOnline(null);
    if (showOnline === null) return;
    const maxToList = showOnline && listingCap.applies ? (listingCap.remaining ?? 0) : undefined;
    if (maxToList === 0) {
      toast.error(overCapMessage(listingCap.cap ?? 0));
      return;
    }

    mutation.mutate(
      { showOnline, productIds: filteredProductIds, maxToList },
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

  const menuItems = (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={mutation.isPending}>
        <Globe className="h-3.5 w-3.5" />
        Show or hide in online store
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {isFiltered && (
          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
            Filter active: applies to {filteredProductIds.length} shown product
            {filteredProductIds.length === 1 ? "" : "s"}
          </div>
        )}
        <DropdownMenuItem onSelect={() => setPendingShowOnline(true)}>
          Show online
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPendingShowOnline(false)}>
          Hide online
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  const overlays = (
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
  );

  return { menuItems, overlays };
}
