# Android Home-Screen Widget (Glance)

**Date:** 2026-09-07
**Status:** Approved design, pending implementation plan

## Background

Store owners mostly use DumosRx to monitor, not to sell — they want an
at-a-glance view (today's sales, low-stock/expiring alerts) without opening
the app. The request is a native Android home-screen widget. iOS is
explicitly out of scope: there's no iOS project generated in this repo yet
(`src-tauri/gen/ios` doesn't exist), so this spec covers Android only; iOS
widgets would be a separate later spec if/when an iOS app exists.

Key facts established during brainstorming:

- **Home-screen widgets render outside the WebView.** Tauri has no plugin
  that produces a widget surface — it's a native Android
  `AppWidgetProvider`/Glance composable, unrelated to the React/TS app code
  except for the data it displays.
- **`src-tauri/gen/android` is git-tracked, not regenerated from scratch.**
  `.gitignore` explicitly un-ignores it (`!/src-tauri/gen/android/`), and
  custom code already lives as sibling files to
  `app/src/main/java/com/dumostech/dumosrx/MainActivity.kt`, outside the
  CLI-managed `generated/` subfolder. Adding a widget class there is safe.
- **This app is offline-first.** Each device keeps its own local SQLite DB
  (`client/lib/db/core.ts`, via `@tauri-apps/plugin-sql`) scoped to whichever
  store is active on that device, synced to a cloud API
  (`api.dumosrx.com`) via `client/lib/db/sync-engine`. The in-app dashboard's
  "Today's Sales" card is computed **locally**
  (`client/lib/hooks/use-dashboard-overview.ts` →
  `getDashboardOverviewData()`), so it only ever reflects one store. There is
  no existing cross-store "today" aggregate anywhere in the app.
- **A cross-store fleet endpoint already exists and is close to what's
  needed.** `GET /dashboard/stats`
  (`laravel-server/app/Http/Controllers/Api/Web/DashboardController.php` →
  `DashboardService::getStats()`) already returns, per store owned by the
  authenticated user: `sales` (all-time total, not "today"),
  `low_stock_alerts` (count), `expiring_items` (count), plus a fleet-wide
  `total_sales` (all-time + 7-day growth %). It's missing a strict
  calendar-day sales figure.
- **Cloud linking is opt-in.** `client/lib/context/auth-context.tsx` exposes
  `isCloudLinked` / `linkCloudAccount()`. `/dashboard/stats` requires a
  linked cloud account (Sanctum auth) — local-only users can't hit it.
- **No push infrastructure exists** (no FCM, no `push_token` anywhere in
  `client/lib`). Rules out a push-triggered refresh for v1.

## Goals

- A home-screen widget showing today's sales — scoped to one store or
  fleet-wide, matching "they want to see details at a glance for one store
  or all stores."
- A "to-do" section surfacing the same low-stock/expiring alert types
  already shown in the in-app dashboard's Action Center, so the widget isn't
  inventing a new alert taxonomy.
- Tapping the widget (or an individual alert row) deep-links into the
  running app at the relevant screen.
- Visible staleness ("Updated 12m ago") rather than silently-wrong numbers.

## Non-goals

- iOS widgets (no iOS app in this repo yet).
- Real-time/push-triggered updates. Periodic + app-triggered refresh only.
- Per-widget custom date ranges (today only, not "this week" configurable
  inside the widget itself — that's what the app is for).
- Any change to the local-only (non-cloud-linked) experience. The widget is
  a cloud-linked-account feature; local-only users see a setup prompt.

## Architecture

**Pattern: "app writes, widget reads."** The Tauri/React app already owns
auth and networking to the cloud API — the widget must not duplicate that in
Kotlin.

1. **Fetch.** The React app calls the extended `/dashboard/stats` (see
   below) using its existing authenticated API client
   (`client/lib/api/client-fleet-billing.ts` /
   `use-fleet-stats.ts`), same as the in-app fleet overview does today.
2. **Write.** On a successful fetch, the app writes a small summarized JSON
   snapshot into Android `SharedPreferences` via a new thin Tauri
   command/plugin (`widget_write_snapshot` or similar) that calls into a
   sibling Kotlin helper — not the generated Tauri IPC bridge, just a small
   native call the app invokes after fetching.
3. **Trigger refresh.** Two triggers write the snapshot:
   - App foreground + successful sync (opportunistic — the common case for
     an owner who opens the app at least occasionally).
   - A WorkManager periodic job (~30 min interval, Android's practical floor
     for battery-friendly background work) that performs the same
     fetch-and-write independent of whether the app UI is open. This job
     needs its own lightweight auth — reusing the same stored Sanctum token
     the app already persists (not re-implementing login).
4. **Read.** The Glance widget (`AppWidgetProvider` + Jetpack Glance
   composable, new Kotlin sources under
   `src-tauri/gen/android/app/src/main/java/com/dumostech/dumosrx/widget/`)
   reads only from `SharedPreferences` on its own update cycle
   (`onUpdate`/`provideGlance`) — no networking, no auth logic in the widget
   itself.
5. **Tap-through.** Widget root and each alert row carry a
   `PendingIntent` that launches `MainActivity` with an extra (e.g.
   `?deeplink=/inventory?filter=low_stock`) that the existing React router
   already knows how to handle as a normal in-app navigation.

This keeps 100% of auth/networking/business logic in the existing
TypeScript layer; the native surface is display-only plus a scheduling job.

**Backend change:** extend `DashboardService::getStats()` to add a
`today_sales` figure per store (reusing the existing per-store `$cashierIds`
grouping already in that loop, just constrained to `whereDate('created_at',
today())` instead of no date filter) and one fleet-wide `today_sales` total
alongside the existing all-time `total_sales`. Same shape/response,
additive fields only — no breaking change for existing callers of this
endpoint (in-app fleet overview).

**Gating:** if `isCloudLinked` is false, the app writes a
`{ linked: false }` snapshot instead of stats. The widget renders a
"Open DumosRx to connect your account" state with a tap-through to the
cloud-link screen, rather than showing stale/zero data.

## Widget content & states

- **Header:** store name (single-store mode) or "All stores" (fleet mode),
  with a small toggle/config option set at widget-add time (Android's
  standard `AppWidgetProvider` configuration Activity — user picks
  single-store vs. all-stores when they add the widget to their home
  screen; changing it later means removing and re-adding, consistent with
  how most Android widgets handle configuration).
- **Today's sales:** the new `today_sales` figure, formatted the same way
  the in-app dashboard formats currency (reuse `formatCurrency` conventions
  — the native side receives an already-formatted string from the app, it
  doesn't reimplement currency formatting).
- **To-do section:** two rows — "N items low stock" and "N batches expiring
  soon," each tappable, hidden if their count is 0 rather than shown as
  "0 items" (matches the empty-state design principle from the recent
  empty-states work: don't show a dead/no-op row).
- **Footer:** "Updated Xm ago," computed client-side in the widget from the
  snapshot's stored timestamp, not re-fetched.
- **Unlinked state:** as described under Gating above.
- **Stale-data guard:** if the snapshot is older than ~6 hours (e.g. device
  was offline, WorkManager got deferred by Android's Doze mode), swap the
  "Updated Xm ago" footer styling to a warning tone rather than presenting
  a possibly-very-wrong number as current.

## Risks / open questions for the implementation plan

- **Feasibility spike first.** The single biggest unvalidated risk is
  whether `tauri android build`/`tauri android dev` tolerates a new Kotlin
  package (`.../widget/`) and the corresponding `AndroidManifest.xml`
  `<receiver>` entry for the `AppWidgetProvider` without the Tauri CLI
  overwriting or rejecting it. The implementation plan's first task should
  be a throwaway spike: add a trivial static Glance widget (hardcoded text,
  no data plumbing) and run a full `tauri android build` to confirm it
  survives, before building out the real data pipeline. If this doesn't
  work cleanly, the fallback is maintaining the widget module as a
  post-generation patch step in the build script.
- **WorkManager background auth.** Needs confirmation that the Sanctum
  token the app persists is readable from a WorkManager `Worker` context
  (i.e. it's in Android-accessible storage, not only in-memory JS/WebView
  state) without weakening the app's current token-storage security
  posture.
- **Widget reconfiguration UX.** Android's built-in "remove and re-add to
  reconfigure" pattern is the default; a nicer in-widget store switcher is
  possible with Glance's `actionParametersOf` but adds complexity — v1
  should use the standard configuration-Activity pattern and revisit if it
  proves annoying in practice.
