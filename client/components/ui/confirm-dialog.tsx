"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onConfirm: (pin?: string) => void;
  requirePin?: boolean;
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
}: ConfirmDialogProps) {
  const [pin, setPin] = useState("");

  const handleConfirm = () => {
    onConfirm(requirePin ? pin : undefined);
    setPin("");
    onOpenChange(false);
  };

  const handleClose = () => {
    setPin("");
    onOpenChange(false);
  };

  const isConfirmDisabled = requirePin && !pin.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {typeof description === "string" ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription asChild>
              <div className="text-muted-foreground text-sm font-normal mt-1.5">{description}</div>
            </DialogDescription>
          )}
        </DialogHeader>

        {requirePin && (
          <div className="mt-4 space-y-2 w-full">
            <Label htmlFor="confirmation-pin">Enter PIN to Confirm</Label>
            <Input
              id="confirmation-pin"
              type="password"
              placeholder="Your PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full"
            />
          </div>
        )}

        <DialogFooter>
          {!hideCancel && (
            <Button variant="outline" onClick={handleClose}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
