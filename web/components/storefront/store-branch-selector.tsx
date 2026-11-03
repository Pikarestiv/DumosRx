"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Check, ChevronDown, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StorefrontBranch } from "@/lib/api/storefront-data";
import { useCart } from "@/lib/store/use-cart-store";

interface StoreBranchSelectorProps {
  branches: StorefrontBranch[];
  selectedBranchId: string;
  storeSlug: string;
}

export function StoreBranchSelector({
  branches,
  selectedBranchId,
  storeSlug,
}: StoreBranchSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { items, clearCart } = useCart(storeSlug);

  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!branches || branches.length <= 1) {
    return null;
  }

  const currentBranch =
    branches.find((b) => b.id === selectedBranchId) || branches[0];

  const navigateToBranch = (branchId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("branch", branchId);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSelectBranch = (branchId: string) => {
    if (branchId === currentBranch.id) return;

    if (items.length > 0) {
      setPendingBranchId(branchId);
      setConfirmOpen(true);
      return;
    }

    navigateToBranch(branchId);
  };

  const handleConfirmSwitch = () => {
    if (pendingBranchId) {
      clearCart();
      navigateToBranch(pendingBranchId);
      setPendingBranchId(null);
    }
    setConfirmOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1.5 rounded-full text-xs font-medium px-3 py-1.5 h-auto bg-background/80 hover:bg-background border-border/80 shadow-xs"
          >
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate max-w-[140px] sm:max-w-[200px]">
              {currentBranch.name}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border-slate-200 dark:border-slate-800 shadow-md"
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1 font-semibold">
            Select Pickup Branch
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-1 border-slate-100 dark:border-slate-800" />
          {branches.map((branch) => {
            const isSelected = branch.id === currentBranch.id;
            return (
              <DropdownMenuItem
                key={branch.id}
                onClick={() => handleSelectBranch(branch.id)}
                className={`flex items-start justify-between p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">
                    {branch.name}
                  </span>
                  {(branch.location || branch.address) && (
                    <span className="text-[11px] text-muted-foreground line-clamp-1">
                      {branch.location || branch.address}
                    </span>
                  )}
                </div>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-3xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Switch Branch?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Changing pickup branches will clear the items in your cart because
              stock availability and pricing are specific to each branch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex sm:justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmSwitch}
              className="rounded-full"
            >
              Switch & Clear Cart
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
