"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string | React.ReactNode;
  description: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
  variant?: "destructive" | "default";
  onConfirm: (pin?: string) => void | Promise<void>;
  requirePin?: boolean;
  /** Focus the confirm button (instead of the default first-focusable
   * element, usually Cancel) when the dialog opens, so pressing Enter
   * immediately confirms. Use for non-destructive confirmations where
   * the fast path should be "continue", not "cancel". */
  autoFocusConfirm?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  hideCancel = false,
  variant = "destructive",
  onConfirm,
  requirePin = false,
  autoFocusConfirm = false,
}: ConfirmDialogProps) {
  const [pin, setPin] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Previously closed the dialog synchronously right after firing
  // onConfirm, before an async handler (e.g. a delete) had actually
  // finished — so there was no in-flight feedback, and if the action
  // failed the dialog had already vanished as if it had succeeded. Now
  // waits for onConfirm to settle (it may be sync or async) before
  // closing, and shows a spinner on the confirm button meanwhile.
  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm(requirePin ? pin : undefined);
    } finally {
      setIsConfirming(false);
    }
    setPin("");
    onOpenChange(false);
  };

  const handleClose = () => {
    if (isConfirming) return;
    setPin("");
    onOpenChange(false);
  };

  const isConfirmDisabled = (requirePin && !pin.trim()) || isConfirming;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          if (autoFocusConfirm) {
            e.preventDefault();
            confirmButtonRef.current?.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {typeof description === "string" && (
                              <DialogDescription>{description}</DialogDescription>
                            )}
                  {!(typeof description === "string") && (
                              <DialogDescription asChild>
                                <div className="text-muted-foreground text-sm font-normal mt-1.5">{description}</div>
                              </DialogDescription>
                            )}
        </DialogHeader>

        {requirePin && (
          <div className="mt-4 space-y-3 flex flex-col items-center">
            <Label htmlFor="confirmation-pin" className="text-center w-full">Enter PIN to Confirm</Label>
            <InputOTP
              maxLength={4}
              value={pin}
              onChange={(value) => setPin(value)}
              className="md:input-mode-numeric"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}

        <DialogFooter>
          {!hideCancel && (
            <Button variant="outline" onClick={handleClose} disabled={isConfirming}>
              {cancelLabel}
            </Button>
          )}
          <Button
            ref={confirmButtonRef}
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            {isConfirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
