"use client";

import { CloudOff, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden border border-white/5 bg-card shadow-2xl rounded-2xl">
        <div className="p-8">
          <DialogHeader className="space-y-4">
            <div className="mx-auto w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center mb-1 border border-destructive/10">
              <CloudOff className="h-7 w-7 text-destructive" />
            </div>
            <div className="text-center">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Connection Expired
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-relaxed">
                Your cloud session has timed out.
                Synchronization is <span className="text-destructive font-medium">paused</span> until you re-link.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            <div className="bg-muted/30 rounded-lg p-4 border border-white/5">
              <p className="text-xs text-muted-foreground leading-relaxed text-center">
                For your security, cloud sessions expire periodically.
                Relinking restores your automatic backups and cross-device sync.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                className="h-11 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/settings?tab=cloud");
                }}
              >
                Re-link Cloud Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="h-11 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => onOpenChange(false)}
              >
                Dismiss for now
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
