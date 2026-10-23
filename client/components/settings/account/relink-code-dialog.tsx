"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
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
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useGenerateRelinkCodeMutation } from "@/lib/hooks/use-sessions";
import { formatDateSafe } from "@/lib/utils/date-utils";

export function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function RelinkCodeDialog() {
  const { user, isCloudLinked, isImpersonating } = useAuth();
  const { activeStoreId } = useStore();
  const generate = useGenerateRelinkCodeMutation();
  const [issued, setIssued] = useState<{ code: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const now = useNow(issued !== null);

  if (user?.role !== "store_owner" || !isCloudLinked || isImpersonating || !activeStoreId) {
    return null;
  }

  const handleGenerate = async () => {
    try {
      setIssued(await generate.mutateAsync(activeStoreId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate a re-link code");
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
    <>
      <Button variant="outline" size="sm" onClick={() => void handleGenerate()} disabled={generate.isPending}>
        {generate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
        Generate till re-link code
      </Button>
      <Dialog open={issued !== null} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-center">Till re-link code</DialogTitle>
            <DialogDescription className="text-center">
              On the unlinked till, open Settings &gt; Data, choose &quot;Have a re-link code?&quot; and enter this code.
              It works once, only for this store, and is shown only now.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-2 py-4">
            <span
              data-testid="relink-code-value"
              className="font-mono text-3xl font-bold tracking-[0.3em] text-primary select-all"
            >
              {issued?.code}
            </span>
            <Button variant="ghost" size="icon" onClick={handleCopy} aria-label="Copy code" disabled={isExpired}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className={isExpired ? "text-center text-sm text-destructive" : "text-center text-sm text-muted-foreground"}>
            {isExpired
              ? "This code has expired. Generate a new one."
              : `Expires in ${formatCountdown(remainingMs)} (at ${formatDateSafe(issued?.expires_at, "dd/MM/yyyy HH:mm")})`}
          </p>
          <DialogFooter>
            <Button onClick={() => setIssued(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
