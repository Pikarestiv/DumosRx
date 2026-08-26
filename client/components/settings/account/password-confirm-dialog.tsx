"use client";

import { useState, type ReactNode } from "react";
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
import { Loader2 } from "lucide-react";

interface PasswordConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isSubmitting?: boolean;
  onConfirm: (password: string) => void;
  /** Extra form content rendered above the password field, e.g. a reason textarea. */
  extraField?: ReactNode;
}

export function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  isSubmitting = false,
  onConfirm,
  extraField,
}: PasswordConfirmDialogProps) {
  const [password, setPassword] = useState("");

  const handleClose = () => {
    setPassword("");
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm(password);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {extraField}
          <div className="space-y-2">
            <Label htmlFor="password-confirm">Enter your password to confirm</Label>
            <Input
              id="password-confirm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!password.trim() || isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
