# System (Superadmin)

Route: `app/admin/system/page.tsx` (`SystemPage`), plus
`app/admin/system/default-account-manager-card.tsx`.

**Scope confirmation vs. the task brief's guess:** correct — this is a
system health/config/monitoring dashboard: live server resource metrics
(CPU/memory/disk), a static "Service Status" panel, DB connection health,
a real live-fetched Sentry error feed, and one genuine config-editing
widget (default contact specialist / account manager fallback). No
"restart"/"clear cache"-style destructive controls exist on this page at
all — it is read-heavy with exactly one low-risk, reversible write action.

## Data flow

- `useAdminHealth()` (`lib/api/admin-hooks-stores.ts:67`) → `GET admin/health`
  → `AdminController::health` (`AdminController.php:223`, inline
  `hasRole('super_admin')` gate) → `AdminService::getSystemHealth()`
  (`AdminService.php:451`). Returns `{ overallStatus, uptime, latency,
  resources: { cpu, memory, disk, database }, nodes: [...] }` — frontend
  reads all fields flat with no nesting mismatch.
- `useAdminErrors()` (`admin-hooks-stores.ts:75`) → `GET admin/errors` →
  `AdminController::errors` (`AdminController.php:249`) →
  `AdminService::getRecentErrors()` (`AdminService.php:559`), which makes
  a real live server-side call to the Sentry API (`SENTRY_API_TOKEN` +
  `dumos.sentry.org_slug` config) across both `dumosrx-client` and
  `dumosrx-server` Sentry projects, `is:unresolved`, last 14 days, sorted
  by frequency. Returns `{ configured: bool, issues: [...] }`.
- `DefaultAccountManagerCard` uses `useAccountManagerCandidates()`
  (`GET admin/account-managers` → `AdminController::accountManagerCandidates`)
  for the dropdown options, and `webApiClient.getSystemConfig` /
  `updateSystemConfig` (`GET /system-configs/default_account_manager_id`,
  `PUT admin/system-configs/default_account_manager_id`) to read/write the
  actual config value.

## Live walkthrough

Tested at `http://localhost:3002/admin/system`.

- **Page load:** all 4 top metric cards rendered (CPU Load 14.5%, Memory
  "Unknown", Storage 92.3%, Network "Healthy" / ~0.1ms latency), Service
  Status showed 2 static nodes ("Primary Server" / "Database Primary",
  both "Operational"), Database Health showed Connection Load 5% /
  Status "Operational". Network tab confirmed `GET admin/health` → 200 and
  `GET admin/errors` → 200 on load, alongside the unrelated
  `admin/summary`, `admin/session/refresh`, `admin/account-managers`
  calls the shared admin shell always makes.
- **Refresh button:** clicked; confirmed via network tab it re-issues a
  fresh `GET admin/health` (200 OK). Real, correctly wired — not a stub.
- **Recent Errors (Sentry) panel:** rendered a real, live list of ~17
  unresolved issues pulled from the actual Sentry org (`dumos-technologies`),
  spanning both `dumosrx-client` and `dumosrx-server` projects, each with
  a real title, project, culprit, level badge, and event count — e.g.
  `Illuminate\Database\QueryException: SQLSTATE[42S22]: Column not found:
  1054 Unknown column 'account_manager_id'...` on
  `dumosrx-server (/api/v1/admin/stores/.../account-manager)`, and several
  `SQLSTATE[HY000] [2002] Connection refused` DB-connectivity errors. This
  confirms `SENTRY_API_TOKEN` is configured in this dev environment and the
  integration genuinely round-trips to Sentry's real API rather than being
  a stub or hardcoded list. (These are historical/pre-existing Sentry
  issues unrelated to this walkthrough's own actions — not something this
  task investigated further, since fixing/triaging them is out of scope
  and they're not a bug in this admin page itself, which correctly
  displays whatever Sentry reports.) "Open in Sentry" link points to the
  real org's issues URL.
- **Default Contact Specialist card:** loaded with the real current value
  pre-selected ("Josh Odumodu", confirmed via the
  `GET /system-configs/default_account_manager_id` network call returning
  200 before the `<Select>` populated). Clicked "Save Default" with the
  selection unchanged (a deliberate no-op re-save, to verify the write
  path without actually changing platform-visible fallback behavior) —
  confirmed `PUT admin/system-configs/default_account_manager_id` → 200,
  toast "Default contact specialist updated" shown. Real, correctly wired,
  low-risk mutation exercised safely.
- **Console:** no errors observed during the full walkthrough.

## Confirmed, not a bug: "Memory" card always shows "Unknown" on this dev machine

`AdminService::getSystemHealth()`'s memory reading shells out to `free -m`
(`shell_exec('free -m')`), a Linux-only utility that doesn't exist on
macOS (`which free` → not found on this dev machine, confirmed via Bash).
The code already handles this gracefully — `@shell_exec` suppresses the
warning and the pre-seeded `'Unknown'` / `0%` defaults remain, exactly as
rendered live. This is an environment limitation of running the Laravel
backend on macOS for local dev, not a bug in the health-check logic
itself; it would presumably report real figures on the Linux hosts this
is written for.

## Confirmed, not a bug (but a real accuracy caveat worth flagging): "Storage 92.3%" doesn't match this machine's actual disk usage

Live-rendered Storage card shows **92.3%** used. Cross-checked two ways:

```
$ php -r 'echo disk_total_space("/")/1e9," GB total\n"; echo disk_free_space("/")/1e9," GB free\n";'
245.1 GB total
18.8 GB free   → (245.1-18.8)/245.1 = 92.3%  ← matches the displayed figure exactly

$ df -h /
Filesystem     Size   Used  Avail Capacity ...
/dev/disk3s1s1 228Gi  15Gi   18Gi      47%  ...
```

The backend's own math is internally consistent (92.3% is exactly what
PHP's `disk_total_space()`/`disk_free_space()` report for `/` on this
machine) — this is **not** a wiring or calculation bug. But it's wildly
different from what `df` (and Finder/System Settings) would tell a human
sitting at this same machine (47% capacity used). This is a well-known
macOS APFS quirk: `disk_total_space('/')` reports the size of the whole
APFS *container* (which macOS shares synthetically across every volume in
it — Data, Preboot, Recovery, VM, etc.), while `df`'s "Capacity" column
reports usage relative to purchasable/allocatable space specific to that
one volume, excluding space already claimed by sibling volumes in the
container. The two denominators are legitimately different things. On a
typical single-partition Linux production host (what this code is clearly
written for — `free -m`, `disk_total_space('/')` as a single mounted
filesystem) this discrepancy likely wouldn't occur. Flagged here as a
dev-environment caveat for whoever reads this Storage % locally, not as a
code defect.

## Not exercised / out of scope

No destructive or irreversible controls exist on this page. The only write
action (Default Contact Specialist save) was exercised safely as a no-op
re-save of the existing value, so nothing else was held back for caution.
"Platform Settings" and "System Downloads" (separate left-nav items) are
out of this batch's scope (only "Activity" and "System" were assigned) and
were not investigated.
