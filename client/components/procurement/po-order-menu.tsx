import { useState } from "react";
import { Download, Edit2, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

interface PoOrderMenuProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onDownloadPdf: () => void;
  isGeneratingPdf: boolean;
  isMutating?: boolean;
}

export function PoOrderMenu({ onEdit, onDelete, onDownloadPdf, isGeneratingPdf, isMutating }: PoOrderMenuProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="More actions"
            className="h-10 w-10 shrink-0 rounded-[10px]"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {onEdit && (
            <DropdownMenuItem className="h-11" onSelect={onEdit}>
              <Edit2 className="h-4 w-4" />
              Edit order
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="h-11" disabled={isGeneratingPdf} onSelect={onDownloadPdf}>
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isGeneratingPdf ? "Preparing..." : "Download PDF"}
          </DropdownMenuItem>
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="h-11 text-destructive focus:text-destructive"
                disabled={isMutating}
                onSelect={() => setConfirmingDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete order…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {onDelete && (
        <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this purchase order and remove its data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="!bg-destructive !text-destructive-foreground !hover:bg-destructive/90"
              >
                Delete Order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
