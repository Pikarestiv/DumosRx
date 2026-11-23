import { useEffect, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { format } from "date-fns";
import type { AuditLogRow } from "@/lib/types/audit-log";
import { parseLocalDateOnly, toUtcInstant } from "@/lib/utils/date-utils";
import {
  describeActionVerb,
  describeActivity,
  formatTableLabel,
} from "./describe-activity";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { ProductName } from "@/components/ui/product-name";

interface ActivityLogDetailPanelProps {
  entry: AuditLogRow | null;
  /** Other rows sharing this entry's correlation_id (e.g. every other
   * action the same sale wrote), for the "Related Actions" accordion. */
  relatedEntries?: AuditLogRow[];
  onSelectRelated?: (entry: AuditLogRow) => void;
  onClose: () => void;
}

// Internal/bookkeeping columns that aren't useful to show in the "what
// changed" breakdown; every synced table carries these.
const HIDDEN_KEYS = new Set([
  "id",
  "client_id",
  "created_at",
  "updated_at",
  "_version",
  "_synced",
  "_synced_at",
  "_deleted",
  "store_id",
  "pin",
  "password",
]);

const COST_KEY_PATTERN = /cost/i;
const NON_COST_KEYS = new Set(["points_cost"]);

function isCostKey(key: string) {
  return COST_KEY_PATTERN.test(key) && !NON_COST_KEYS.has(key);
}

function sanitizeRawDetails(raw: string): string {
  return raw.replace(
    /(["']?)(\w*cost\w*)(["']?\s*[:=]\s*)(["'][^"']*["']|-?\d+(?:\.\d+)?|null)/gi,
    (match, open: string, key: string, sep: string) =>
      NON_COST_KEYS.has(key.toLowerCase())
        ? match
        : `${open}${key}${sep}[hidden]`,
  );
}

function humanizeKey(key: string) {
  return key
    .replace(/^_+/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

function formatTimestamp(value: string): string {
  try {
    const date = new Date(toUtcInstant(value));
    if (Number.isNaN(date.getTime())) return value;
    return format(date, "dd/MM/yyyy HH:mm");
  } catch {
    return value;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_ONLY_PATTERN.test(trimmed)) {
      const date = parseLocalDateOnly(trimmed);
      return Number.isNaN(date.getTime()) ? value : format(date, "dd/MM/yyyy");
    }
    if (ISO_DATETIME_PATTERN.test(trimmed)) {
      return formatTimestamp(trimmed);
    }
    return value;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "—";
    }
  }
  return String(value);
}

function parseEntryDetails(
  details: string | null | undefined,
  canViewCost: boolean,
) {
  let parsedDetails: Record<string, unknown> | null = null;
  let rawDetails: string | null = null;
  if (details) {
    try {
      parsedDetails = JSON.parse(details);
    } catch {
      rawDetails = details;
    }
  }

  const entries = parsedDetails
    ? Object.entries(parsedDetails).filter(
        ([key, value]) =>
          !HIDDEN_KEYS.has(key) &&
          (canViewCost || !isCostKey(key)) &&
          value !== undefined,
      )
    : [];

  return { entries, rawDetails };
}

function ActivityEntryDetails({
  entry,
  canViewCost,
  compact = false,
}: {
  entry: AuditLogRow;
  canViewCost: boolean;
  compact?: boolean;
}) {
  const { entries: rawEntries, rawDetails } = parseEntryDetails(
    entry.details,
    canViewCost,
  );
  const hasProductRow = rawEntries.some(
    ([k]) =>
      k === "product_name" || (k === "name" && entry.table_name === "products"),
  );
  const entries =
    entry.product_name && !hasProductRow
      ? ([["product", entry.product_name], ...rawEntries] as [
          string,
          unknown,
        ][])
      : rawEntries;

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {compact && entry.created_at && (
        <div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            When
          </div>
          <div className="text-[13px] text-foreground font-medium">
            {formatTimestamp(entry.created_at)}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          Performed By
        </div>
        <div className="text-[13.5px] text-foreground font-medium">
          {entry.user_name?.trim() || "System"}
        </div>
      </div>

      {entry.record_id && (
        <div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
            Record ID
          </div>
          <div className="text-[12px] font-mono text-muted-foreground break-all">
            {entry.record_id}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
          What Changed
        </div>
        {entries.length > 0 ? (
          <div className="flex flex-col gap-2">
            {entries.map(([key, value]) => {
              const isProductField =
                key === "product" ||
                key === "product_name" ||
                (key === "name" && entry.table_name === "products");
              return (
                <div
                  key={key}
                  className="flex items-start justify-between gap-4 text-[13px] border-b border-border/50 pb-2 last:border-0 last:pb-0"
                >
                  <span className="text-muted-foreground shrink-0">{humanizeKey(key)}</span>
                  {isProductField && typeof value === "string" && value.trim() ? (
                    <span className="text-foreground font-medium text-right min-w-0">
                      <ProductName name={value} className="text-right" />
                    </span>
                  ) : (
                    <span className="text-foreground font-medium text-right break-all">
                      {formatValue(value)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : rawDetails ? (
          <pre className="text-[11px] bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {canViewCost ? rawDetails : sanitizeRawDetails(rawDetails)}
          </pre>
        ) : (
          <p className="text-[13px] text-muted-foreground italic">
            No further details recorded.
          </p>
        )}
      </div>
    </div>
  );
}

// Slide-in detail view for a single activity_log row.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-activity-log-activity-log-detail-panel-tsx-L43
export function ActivityLogDetailPanel({
  entry,
  relatedEntries = [],
  onClose,
}: ActivityLogDetailPanelProps) {
  const canViewCost = useHasPermission("view_cost_fields");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedIds(new Set());
    setReviewedIds(new Set());
  }, [entry?.id]);

  if (!entry) return null;

  const toggleRelated = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setReviewedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-card overflow-hidden">
      <div className="flex items-start gap-3 p-5 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold text-foreground break-words">
            {describeActivity(entry)}
          </h3>
          <p className="text-[13px] text-muted-foreground font-medium mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>{formatTableLabel(entry.table_name)}</span>
            {entry.action && (
              <>
                <span>·</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[11px] font-semibold text-foreground/80">
                  {describeActionVerb(entry.action)}
                </span>
              </>
            )}
            {entry.created_at && (
              <>
                <span>·</span>
                <span>
                  {format(new Date(entry.created_at), "d MMM yyyy, h:mm a")}
                </span>
              </>
            )}
            {!!entry.occurrence_count && entry.occurrence_count > 1 && (
              <>
                <span>·</span>
                <span>×{entry.occurrence_count}</span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close activity details"
          className="w-8 h-8 shrink-0 rounded-xl bg-muted/50 flex items-center justify-center hover:bg-muted/80 transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 pb-[calc(2.5rem+var(--tauri-bottom,env(safe-area-inset-bottom,0px)))] sm:pb-5">
        <ActivityEntryDetails entry={entry} canViewCost={canViewCost} />

        {relatedEntries.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                Related Actions ({relatedEntries.length})
              </div>
              {reviewedIds.size > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {reviewedIds.size}/{relatedEntries.length} viewed
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {relatedEntries.map((related, index) => {
                const isExpanded = expandedIds.has(related.id);
                const isReviewed = reviewedIds.has(related.id);
                return (
                  <div
                    key={related.id}
                    className={`rounded-lg border transition-colors ${
                      isExpanded
                        ? "border-primary/40 bg-muted/20"
                        : "border-border/50"
                    }`}
                  >
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleRelated(related.id)}
                      className="w-full flex items-center justify-between gap-2.5 text-left text-[12.5px] px-3 py-2.5 hover:bg-muted/40 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-4">
                          {index + 1}.
                        </span>
                        <span className="min-w-0">
                          <span className="font-medium text-foreground truncate block">
                            {describeActivity(related)}
                          </span>
                          {related.created_at && (
                            <span className="text-[11px] text-muted-foreground block">
                              {formatTimestamp(related.created_at)}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {isReviewed && !isExpanded && (
                          <Check
                            className="w-3.5 h-3.5 text-emerald-600"
                            aria-label="Viewed"
                          />
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {formatTableLabel(related.table_name)}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-2 border-t border-border/50">
                        <ActivityEntryDetails
                          entry={related}
                          canViewCost={canViewCost}
                          compact
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
