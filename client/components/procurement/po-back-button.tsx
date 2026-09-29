"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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

interface POBackButtonProps {
  /** Entered lines that leaving would throw away. Nothing entered yet means
   * there is nothing to confirm, so the back button just navigates. */
  itemCount: number;
}

/** The builder views' back control. Every one of them used to
 * router.push("/procurement") outright, silently discarding however many
 * line items had been typed in. */
export function POBackButton({ itemCount }: POBackButtonProps) {
  const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const leave = () => router.push("/procurement");

  return (
    <>
      <button
        type="button"
        aria-label="Back"
        className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        onClick={() => (itemCount > 0 ? setIsConfirmOpen(true) : leave())}
      >
        <ArrowLeft className="w-[17px] h-[17px]" />
      </button>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemCount === 1
                ? "The item you added to this order will be lost."
                : `The ${itemCount} items you added to this order will be lost.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={leave}
              className="!bg-destructive !text-destructive-foreground !hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
