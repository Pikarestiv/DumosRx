import { query } from "../core";
import { STORAGE_KEYS } from "@/lib/storage-keys";

export interface DeliveredAges {
  under_1m: number;
  under_5m: number;
  under_1h: number;
  under_1d: number;
  over_1d: number;
}

const EMPTY: DeliveredAges = {
  under_1m: 0,
  under_5m: 0,
  under_1h: 0,
  under_1d: 0,
  over_1d: 0,
};

const BUCKETS: Array<[keyof DeliveredAges, number]> = [
  ["under_1m", 60_000],
  ["under_5m", 5 * 60_000],
  ["under_1h", 60 * 60_000],
  ["under_1d", 24 * 60 * 60_000],
];

function bucketFor(ageMs: number): keyof DeliveredAges {
  return BUCKETS.find(([, ceiling]) => ageMs < ceiling)?.[0] ?? "over_1d";
}

// Reads without clearing, for the pasteable support ticket.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-delivery-age-ts-L31
export function peekDeliveredAges(): DeliveredAges | null {
  return read();
}

function read(): DeliveredAges | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.syncDeliveredAges);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DeliveredAges>;

    return {
      under_1m: Number(parsed.under_1m ?? 0),
      under_5m: Number(parsed.under_5m ?? 0),
      under_1h: Number(parsed.under_1h ?? 0),
      under_1d: Number(parsed.under_1d ?? 0),
      over_1d: Number(parsed.over_1d ?? 0),
    };
  } catch {
    return null;
  }
}

// How long each just-accepted edit waited between being queued and being delivered.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-delivery-age-ts-L61
export function recordDeliveredAges(createdAt: string[]): void {
  if (typeof window === "undefined" || createdAt.length === 0) return;

  const totals = read() ?? { ...EMPTY };
  const now = Date.now();

  for (const stamp of createdAt) {
    const queuedAt = Date.parse(stamp);

    if (!Number.isFinite(queuedAt)) continue;

    totals[bucketFor(Math.max(0, now - queuedAt))] += 1;
  }

  try {
    localStorage.setItem(STORAGE_KEYS.syncDeliveredAges, JSON.stringify(totals));
  } catch {
    // Best-effort telemetry; a failed write only loses this interval's ages.
  }
}

// Reads and clears, so each report describes the interval since the last one rather than a cumulative total that only ever grows.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-delivery-age-ts-L88
export function drainDeliveredAges(): DeliveredAges | null {
  const totals = read();

  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEYS.syncDeliveredAges);
    } catch {
      // A stale bucket over-reports one interval; it never blocks a sync.
    }
  }

  return totals;
}

/**
 * The ages of the queue rows about to be deleted by markSynced(). Must run
 * before the DELETE, and must never be able to hold up that drain.
 */
export async function recordAcceptedQueueAges(queueIds: number[]): Promise<void> {
  if (queueIds.length === 0) return;

  try {
    const placeholders = queueIds.map(() => "?").join(", ");
    const queued = await query<{ created_at: string }>(
      `SELECT created_at FROM _sync_queue WHERE id IN (${placeholders})`,
      queueIds,
    );

    recordDeliveredAges(queued.map((row) => row.created_at));
  } catch (err) {
    console.warn("[Sync] Could not record delivered edit ages:", err);
  }
}
