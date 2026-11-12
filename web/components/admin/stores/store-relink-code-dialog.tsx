"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGenerateStoreRelinkCodeMutation } from "@/lib/api/admin-hooks-till-codes";
import { formatDateSafe } from "@/lib/utils/date-utils";
import type { AdminStoreSummary } from "@/lib/types/admin";

export function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export interface StoreRelinkCodeDialogProps {
  store: AdminStoreSummary | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoreRelinkCodeDialog({
  store,
  isOpen,
  onOpenChange,
}: StoreRelinkCodeDialogProps) {
  const generateMutation = useGenerateStoreRelinkCodeMutation();
  const [issued, setIssued] = useState<{ code: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!issued || !isOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [issued, isOpen]);

  const handleClose = (open: boolean) => {
    if (!open) {
      setIssued(null);
      setCopied(false);
    }
    onOpenChange(open);
  };

  const handleGenerate = async () => {
    if (!store) return;
    try {
      const result = await generateMutation.mutateAsync(store.id);
      setIssued(result);
      setNow(Date.now());
      toast.success("Till re-link code generated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate re-link code",
      );
    }
  };

  const handleCopy = () => {
    if (!issued) return;
    void navigator.clipboard.writeText(issued.code);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const remainingMs = issued ? new Date(issued.expires_at).getTime() - now : 0;
  const isExpired = issued !== null && remainingMs <= 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-500" />
            Till Re-link Code
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            {store
              ? `Re-link an unlinked or offline till for ${store.name} without owner credentials.`
              : "Re-link an unlinked or offline till."}
          </DialogDescription>
        </DialogHeader>

        {!issued ? (
          <div className="space-y-4 py-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-sm text-slate-600 dark:text-slate-300 space-y-2">
              <p>
                When a till becomes unlinked or stale, staff can use a single-use 15-minute
                re-link code instead of requiring the owner to be physically present.
              </p>
              <p className="text-xs text-slate-400">
                This code can only be used once, is tied exclusively to {store?.name ?? "this store"},
                and all usage is logged to the store&apos;s activity audit trail.
              </p>
            </div>
            <Button
              className="w-full font-bold h-11"
              onClick={() => void handleGenerate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Code...
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Generate Re-link Code
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                Single-Use Till Code
              </span>
              <div className="flex items-center gap-3">
                <span
                  data-testid="store-relink-code-value"
                  className="font-mono text-3xl font-extrabold tracking-[0.25em] text-slate-900 dark:text-white select-all"
                >
                  {issued.code}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy code"
                  disabled={isExpired}
                  className="h-9 w-9 border-slate-300 dark:border-slate-700"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p
                className={`text-xs mt-3 font-medium ${
                  isExpired
                    ? "text-rose-500"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {isExpired
                  ? "This code has expired. Please generate a new one."
                  : `Expires in ${formatCountdown(remainingMs)} (${formatDateSafe(issued.expires_at, "dd/MM/yyyy HH:mm")})`}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-2 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Staff instructions at the till:
              </p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>On the unlinked device, open DumosRx.</li>
                <li>In Settings &gt; Data or on the re-link prompt, choose &quot;Have a re-link code?&quot;.</li>
                <li>Enter this 8-character code to restore cloud connection.</li>
              </ol>
            </div>

            <div className="flex gap-2">
              {isExpired ? (
                <Button
                  variant="outline"
                  className="w-full font-bold"
                  onClick={() => void handleGenerate()}
                  disabled={generateMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generate New Code
                </Button>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

