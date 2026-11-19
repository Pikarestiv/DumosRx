import { toast as sonnerToast } from "sonner";
import { deletePurchaseOrder } from "@/lib/db/procurement";

export const DRAFT_DELETE_UNDO_MS = 6000;

interface ToastOptions {
  duration: number;
  action: { label: string; onClick: () => void };
  onAutoClose: () => void;
  onDismiss: () => void;
}

interface ScheduleDraftDeleteOptions {
  onUndo: () => void;
  deleteFn?: (id: string) => Promise<void>;
  showToast?: (message: string, options: ToastOptions) => void;
}

export function scheduleDraftDelete(id: string, { onUndo, deleteFn = deletePurchaseOrder, showToast = sonnerToast }: ScheduleDraftDeleteOptions): void {
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    deleteFn(id).catch((err) => {
      console.error("Failed to delete draft purchase order", err);
      sonnerToast.error("Couldn't delete the draft");
    });
  };
  showToast("Draft deleted", {
    duration: DRAFT_DELETE_UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        settled = true;
        onUndo();
      },
    },
    onAutoClose: commit,
    onDismiss: commit,
  });
}
