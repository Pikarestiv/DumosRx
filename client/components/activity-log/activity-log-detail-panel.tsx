import { X } from "lucide-react";
import { format } from "date-fns";
import type { AuditLogRow } from "@/lib/types/audit-log";
import { describeActivity } from "./describe-activity";

interface ActivityLogDetailPanelProps {
  entry: AuditLogRow | null;
  onClose: () => void;
}

// Internal/bookkeeping columns that aren't useful to show in the "what
// changed" breakdown; every synced table carries these.
const HIDDEN_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "_version",
  "_synced",
  "_synced_at",
  "_deleted",
  "store_id",
  "pin",
]);

function humanizeKey(key: string) {
  return key
    .replace(/^_+/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Slide-in detail view for a single activity_log row. Surfaces the raw
 * `details` JSON payload (captured by logAction() for every insert/update/
 * delete) as a readable field list instead of leaving it invisible. Covers
 * every table generically (no per-table label map), since Activity Log spans
 * the whole store rather than one product's history. */
export function ActivityLogDetailPanel({ entry, onClose }: ActivityLogDetailPanelProps) {
  if (!entry) return null;

  let parsedDetails: Record<string, unknown> | null = null;
  let rawDetails: string | null = null;
  if (entry.details) {
    try {
      parsedDetails = JSON.parse(entry.details);
    } catch {
      rawDetails = entry.details;
    }
  }

  const entries = parsedDetails
    ? Object.entries(parsedDetails).filter(
        ([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined,
      )
    : [];

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-3 p-5 border-b border-border">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold text-foreground truncate">
            {describeActivity(entry)}
          </h3>
          <p className="text-[13px] text-muted-foreground font-medium truncate">
            {entry.table_name || "N/A"}
            {entry.created_at && (
              <> · {format(new Date(entry.created_at), "d MMM yyyy, h:mm a")}</>
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 shrink-0 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-muted/80 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
            Performed By
          </div>
          <div className="text-[13.5px] text-foreground font-medium">
            {entry.user_name?.trim() || "System"}
          </div>
        </div>

        {entry.record_id && (
          <div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
              Record ID
            </div>
            <div className="text-[12px] font-mono text-muted-foreground break-all">
              {entry.record_id}
            </div>
          </div>
        )}

        <div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
            What Changed
          </div>
          {entries.length > 0 ? (
            <div className="flex flex-col gap-2">
              {entries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 text-[13px] border-b border-border/50 pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-muted-foreground shrink-0">{humanizeKey(key)}</span>
                  <span className="text-foreground font-medium text-right break-all">
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </div>
          ) : rawDetails ? (
            <pre className="text-[11px] bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {rawDetails}
            </pre>
          ) : (
            <p className="text-[13px] text-muted-foreground italic">
              No further details recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
