"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/api/logger";

interface AdminErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: AdminErrorProps) {
  const router = useRouter();
  const reportedError = useRef<Error | null>(null);

  useEffect(() => {
    if (reportedError.current === error) return;
    reportedError.current = error;

    reportClientError(
      "RENDER",
      typeof window !== "undefined" ? window.location.href : "/admin",
      undefined,
      error.message || "Unhandled admin render error",
      { digest: error.digest ?? null, stack: error.stack ?? null },
    );
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Something went wrong
          </h2>
        </div>

        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          This page hit an unexpected error and could not finish loading. The problem has been
          reported. Try again, and if it keeps happening let the engineering team know.
        </p>

        {error.digest ? (
          <p className="font-mono text-xs text-slate-400">Reference: {error.digest}</p>
        ) : null}

        <div className="flex gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button
            variant="outline"
            onClick={() => {
              router.push("/admin");
              reset();
            }}
          >
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
