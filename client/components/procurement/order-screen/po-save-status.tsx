"use client";

import { AlertTriangle, CheckCircle2, Cloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AutosaveState } from "@/lib/utils/autosave-scheduler";

interface PoSaveStatusProps {
  saveState: AutosaveState;
  persisted: boolean;
  pendingWrites: number;
  onSaveNow: () => void;
}

export function saveStatusText({ saveState, persisted, pendingWrites }: Omit<PoSaveStatusProps, "onSaveNow">): string {
  if (saveState === "error") return "Not saved";
  if (saveState === "saving" || saveState === "pending") return "Saving...";
  if (!persisted) return "Add an item to start a draft";
  return pendingWrites > 0 ? "Saved on this device" : "Saved · synced";
}

export function PoSaveStatus(props: PoSaveStatusProps) {
  const text = saveStatusText(props);
  const busy = props.saveState === "saving" || props.saveState === "pending";
  const Icon = props.saveState === "error" ? AlertTriangle : busy ? Loader2 : props.pendingWrites > 0 ? CheckCircle2 : Cloud;

  return (
    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground" role="status" aria-live="polite">
      <Icon className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
      <span>{text}</span>
      {props.persisted && !busy && (
        <Button variant="link" size="sm" className="h-auto p-0 text-[12px]" onClick={props.onSaveNow}>
          Save now
        </Button>
      )}
    </div>
  );
}

interface PoSaveBannerProps {
  tone: "error" | "warning";
  title: string;
  description: string;
  actions: { label: string; run: () => void }[];
}

export function PoSaveBanner({ tone, title, description, actions }: PoSaveBannerProps) {
  const toneClass = tone === "error"
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  return (
    <div role="alert" className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[13px] font-semibold">{title}</p>
          <p className="text-[12.5px]">{description}</p>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button key={action.label} size="sm" variant="outline" onClick={action.run}>
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
