import { Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type UserActionTone = "rose" | "emerald" | "red" | "amber";

const TONE_CLASSES: Record<
  UserActionTone,
  { content: string; title: string; iconBg: string; icon: string; button: string }
> = {
  rose: {
    content: "border-slate-200 dark:border-slate-800",
    title: "",
    iconBg: "bg-rose-500/10",
    icon: "text-rose-500",
    button: "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20",
  },
  emerald: {
    content: "border-slate-200 dark:border-slate-800",
    title: "",
    iconBg: "bg-emerald-500/10",
    icon: "text-emerald-500",
    button: "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20",
  },
  red: {
    content: "border-red-200 dark:border-red-900",
    title: "text-red-600 dark:text-red-500",
    iconBg: "bg-red-500/10",
    icon: "text-red-600",
    button: "bg-red-600 hover:bg-red-700 shadow-red-600/20",
  },
  amber: {
    content: "border-slate-200 dark:border-slate-800",
    title: "",
    iconBg: "bg-amber-500/10",
    icon: "text-amber-500",
    button: "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20",
  },
};

interface UserActionConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  tone: UserActionTone;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  isPending: boolean;
  onConfirm: () => void;
}

/**
 * Shared chrome for the admin/users action-confirmation dialogs (deactivate,
 * reactivate, delete, reset-password) - each of those only differs by icon,
 * tone, copy, and which mutation its onConfirm calls.
 */
export function UserActionConfirmDialog({
  isOpen,
  onOpenChange,
  icon: Icon,
  tone,
  title,
  description,
  confirmLabel,
  isPending,
  onConfirm,
}: UserActionConfirmDialogProps) {
  const classes = TONE_CLASSES[tone];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={cn("rounded-3xl shadow-2xl", classes.content)}>
        <DialogHeader>
          <DialogTitle
            className={cn("text-2xl font-black flex items-center gap-3", classes.title)}
          >
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center",
                classes.iconBg
              )}
            >
              <Icon className={cn("h-5 w-5", classes.icon)} />
            </div>
            {title}
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-2 font-bold h-12"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className={cn("rounded-xl text-white font-bold h-12 shadow-lg", classes.button)}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
