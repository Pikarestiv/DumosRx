# Crash reports are sync passengers, never sync drivers

## The problem

`logCrash()` / `flushPendingCrashes()` (`client/lib/utils/error-logger.ts`)
write automatic crash telemetry into the local `feedback` table, which is a
normally-synced table. Every such write therefore did two things the user
never asked for:

1. On a store configured for instant sync (`auto_sync_interval = 0`), it
   triggered a full push/pull round of its own — a background crash loop
   could drive sync traffic all by itself.
2. It incremented the "X changes unsynced" figure shown in the dashboard sync
   indicator, the Action Center alert, and the "Unsynced Changes Detected"
   logout dialog — telling someone they have pending work when what is
   pending is a bug report they never wrote. A crash row the server keeps
   rejecting pinned all three to "pending" indefinitely.

## The policy

Automatic crash reports do not trigger a sync and do not count as unsynced
changes. They are still queued and still pushed, as a passenger on whatever
sync happens next for any other reason (a sale, a stock adjustment, the
interval timer, app mount, reconnect, a manual "Sync Now"). Nothing in the
push path filters them.

Feedback a user deliberately typed into the Help & Feedback form is *not*
covered: it triggers an instant sync and counts as unsynced, because the user
took a deliberate action and expects it to go out promptly.

## How the two are distinguished

A crash report is `type = 'bug'` **and** a non-null `fingerprint`. Nothing on
the user-submitted path (`use-submit-feedback-mutation.ts`) sets a
fingerprint, including a user-typed bug report.
`reportStuckCrashLog()` in `base-helpers.ts` already used this same test, and
`flushPendingCrashes()` now sets a fingerprint too so its rows are classified
the same way as `logCrash()`'s.

Both new checks live in `client/lib/db/crash-report-sync.ts` and share one SQL
fragment, so the trigger-side rule and the count-side rule cannot drift apart:

- `CRASH_REPORT_QUEUE_ROW_SQL` — subtracted from `getSyncQueueCount()`
  (`lib/db/queries/setup.ts`), the single source for all three count surfaces.
- `hasPendingNonCrashFeedback()` — asked by the instant-sync listener in
  `components/dashboard/sync-indicator.tsx` when, after dropping `audit_logs`,
  `feedback` is the only changed table. The listener receives table names
  only, so the table name alone cannot settle whether the change was
  telemetry or a deliberate submission; the pending queue can. A batch that
  also touches any other table (e.g. `["sales", "feedback"]`) triggers as
  before, without the extra query.

The fragment resolves the classification against the live `feedback` row by
`record_id`, not against the queue row's JSON `payload`: an UPDATE's payload
holds only the changed columns (a coalesced crash repeat sends `content` and
`occurrence_count`, never `type`/`fingerprint`) and a DELETE's holds only the
id.

`getSyncQueueBreakdown()` is deliberately untouched — it is a diagnostic shown
in sync failure logs, where seeing the crash rows is useful.

## A different question: what reaches Sentry

This file governs one thing only — whether a crash row is allowed to *drive*
a sync or be counted as the user's pending work. It says nothing about whether
a report should exist at all, or where it should go.

That is a separate policy with a single authority, and it is deliberately not
copied here:

- **`client/AGENTS.md`, "What reaches Sentry"** — the three destinations every
  new report must choose between (a Sentry issue, a breadcrumb, or the local
  `feedback` table plus the `/logs/client-error` POST), the
  `CrashContext.informational` switch, the two throttle windows
  (`REPORT_THROTTLE_MS` 5 min for the POST, `SENTRY_THROTTLE_MS` 60 min for the
  Sentry event), and the environment gating in `lib/utils/sentry-config.ts`.
  This is the authority for both halves of the system.
- **`laravel-server/AGENTS.md`, "What reaches Sentry"** — the server's own DSN
  gate (`null` on `local`/`testing`) and sampling, pointing back at the above
  for the rules.
- **`web/AGENTS.md`, "A Sentry event count is a sample, not an occurrence
  count"** — why the admin panel renders `≥ N events` and why
  `feedback.occurrence_count` is the true figure.

The one consequence worth knowing *here*: because the Sentry send is throttled
and the local `feedback` row is not, the local crash table is the complete
record and Sentry is a sample of it. That is the opposite of the intuition, and
it is why the row still has to be written and still has to ride the next sync —
which is what the policy above is about.
