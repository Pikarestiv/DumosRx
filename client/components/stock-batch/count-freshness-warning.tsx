import React from "react";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { CountFreshness } from "@/lib/hooks/use-count-freshness";

interface CountFreshnessWarningProps {
  freshness: CountFreshness;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

function describeAge(minutes: number | null): string {
  if (minutes === null) return "not synced yet";
  if (minutes < 120) return `${minutes} minutes behind`;
  return `${Math.floor(minutes / 60)} hours behind`;
}

export function CountFreshnessWarning({
  freshness,
  acknowledged,
  onAcknowledgedChange,
}: CountFreshnessWarningProps) {
  if (!freshness.shouldWarn) return null;

  return (
    <div className="mb-5 rounded-2xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
        <div className="space-y-2">
          <div className="text-[14px] font-semibold text-amber-900 dark:text-amber-200">
            This count may be recorded against out-of-date stock
          </div>
          <div className="text-[13px] text-amber-900/80 dark:text-amber-200/80">
            A count is saved as the difference between what you counted and
            what this device currently shows, so anything that has not reached
            this device yet — a sale on another till, a delivery — makes the
            correction wrong by that amount.
          </div>
          {freshness.isLocalStale && (
            <div className="text-[13px] text-amber-900/80 dark:text-amber-200/80">
              This device is {describeAge(freshness.localMinutes)}. Sync it
              before submitting if you can.
            </div>
          )}
          {freshness.stalePeers.length > 0 && (
            <ul className="text-[13px] text-amber-900/80 dark:text-amber-200/80 list-disc pl-4">
              {freshness.stalePeers.map((peer, index) => (
                <li key={`${peer.deviceLabel ?? "device"}-${index}`}>
                  {peer.deviceLabel || "Another device"} is{" "}
                  {describeAge(peer.minutesBehind)}, so its sales may not be
                  counted here yet.
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 pt-1 text-[13px] font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(value) => onAcknowledgedChange(value === true)}
            />
            Submit anyway — I understand the correction may be off
          </label>
        </div>
      </div>
    </div>
  );
}
