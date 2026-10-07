import type { PaginationMeta } from "./admin";

/**
 * Types for the platform-operations surfaces added in admin phases 4-6:
 * the migration runner, the trend series and the consolidated activity
 * feed. Split out of admin.ts to keep that file under the line limit.
 */
export interface PendingMigration {
  name: string;
  alters_existing_data: boolean;
}

export interface AdminMigrationStatus {
  status: "ok" | "unknown";
  pending: PendingMigration[];
  pending_count: number | null;
  last_batch: number | null;
  error: string | null;
}

export interface TrendPoint {
  bucket: string;
  values: Record<string, number>;
}

export interface TrendSeries {
  currencies: string[];
  points: TrendPoint[];
}

export interface AdminTrends {
  window: "30d" | "6m" | "12m";
  granularity: "day" | "month";
  cash_collected: TrendSeries;
  new_paid_subscriptions: TrendSeries;
  trial_starts: TrendSeries;
  store_signups: TrendSeries;
  churn: TrendSeries;
}

export type ActivityFeedType = "admin_action" | "sync_failure" | "subscription" | "payment";

export interface ActivityFeedEvent {
  id: string;
  type: ActivityFeedType;
  at: string;
  title: string;
  detail: string | null;
  store_id: string | null;
  derived: boolean;
}

export interface AdminActivityFeed {
  events: ActivityFeedEvent[];
  available_types: ActivityFeedType[];
  next_cursor: string | null;
}

/** A `null` rate means nothing has synced in the window — render it as such,
 * never as 0%. See web/AGENTS.md. */
export interface AdminSyncHealth {
  success_rate_today: string | null;
  success_rate_7d: string | null;
  failures_by_reason: Record<string, number>;
  worst_stores: Array<{ store_id: string; store_name: string | null; refused: number }>;
}

export interface SyncFailureRow {
  id: string;
  table_name: string;
  record_id: string | null;
  operation: string | null;
  reason: string;
  created_at: string | null;
}

export interface AdminStoreSyncHealth {
  store_name: string | null;
  last_sync_at: string | null;
  daily: Array<{ date: string; accepted: number; refused: number; conflicted: number }>;
  failures: { data: SyncFailureRow[]; meta?: PaginationMeta };
}

export type SubscriptionBucket = "expiring" | "trials" | "lapsed" | "payments";

export interface SubscriptionWorklistRow {
  user_id: string;
  owner_name: string;
  email: string;
  store_id: string | null;
  store_name: string | null;
  plan: string | null;
  is_trial: boolean;
  end_date: string | null;
  attempts?: number;
  last_attempt_at?: string | null;
  last_status?: string;
  amount?: number;
  currency?: string;
}

export interface AdminSubscriptionWorklist {
  data: SubscriptionWorklistRow[];
  meta?: PaginationMeta;
}

/** `trial_conversion_rate` is null when no trials started in the window —
 * render it as unavailable, never 0% or 100%. See web/AGENTS.md. */
export interface AdminSubscriptionFigures {
  trials_started: number;
  trial_conversion_rate: string | null;
  lapsed_in_period: number;
  recovered_in_period: number;
  payment_mix: { success: number; failed: number; abandoned: number; pending: number };
  bucket_counts: Record<SubscriptionBucket, number>;
}

