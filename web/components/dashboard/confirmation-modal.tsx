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
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password?: string) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
  requirePassword?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  isLoading = false,
  requirePassword = false,
}: ConfirmationModalProps) {
  const [password, setPassword] = useState("");

  const handleConfirm = () => {
    onConfirm(requirePassword ? password : undefined);
    if (!isLoading) {
      setPassword("");
    }
  };

  const handleClose = () => {
    setPassword("");
    onClose();
  };

  const isConfirmDisabled = isLoading || (requirePassword && !password.trim());

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl p-8 border-none shadow-2xl">
        <DialogHeader className="flex flex-col items-center text-center gap-4">
          <div className={`p-4 rounded-full ${variant === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
            <AlertTriangle className="h-8 w-8" />
          </div>
          <DialogTitle className="text-2xl font-black">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground font-medium">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        {requirePassword && (
          <div className="mt-4 space-y-2 w-full">
            <Label htmlFor="confirmation-password">Enter Password to Confirm</Label>
            <Input
              id="confirmation-password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
            />
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1 rounded-xl font-bold h-12"
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            className="flex-1 rounded-xl font-bold h-12 shadow-lg shadow-primary/20"
            disabled={isConfirmDisabled}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
