"use client";

import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfigLoadErrorProps {
  /** What failed to load, e.g. "pricing configuration". */
  label: string;
  error: unknown;
  onRetry: () => void;
}

/** Shared failed-load state for the system-config editor tabs.
 *
 * These tabs must never render their editable form off bundled defaults when
 * the real stored config could not be fetched: the form is also what Save
 * submits, so an unnoticed failed load turns one click into "overwrite live
 * config with defaults". Defaults are only ever the initial value before the
 * first successful load - never a stand-in for a failed one. */
export function ConfigLoadError({ label, error, onRetry }: ConfigLoadErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <ShieldAlert className="h-10 w-10 text-rose-500" />
      <div className="space-y-1">
        <p className="text-rose-500 font-bold">
          Could not load the {label}.
        </p>
        <p className="text-sm text-muted-foreground max-w-md">
          {error instanceof Error
            ? error.message
            : "The server did not return the stored configuration."}
        </p>
        <p className="text-xs text-muted-foreground max-w-md">
          Editing is disabled until it loads - saving now would overwrite the
          live configuration with bundled defaults.
        </p>
      </div>
      <Button onClick={onRetry} variant="outline">
        Retry
      </Button>
    </div>
  );
}
