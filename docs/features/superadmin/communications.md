# Superadmin: Communications

`web/app/admin/communications/page.tsx` — a 3-tab hub (`In-App Broadcasts` /
`Email Campaigns` / `User Feedback`) for reaching store owners and reviewing
inbound feedback/bug reports. Tested live against the real Laravel backend
(`localhost:8000`) with a genuine seeded `super_admin` session.

## In-App Broadcasts

`components/admin/views/broadcasts-tab.tsx`. Lists, creates, edits, toggles,
and deletes `Broadcast` records — real, unauthenticated-readable in-app
banners surfaced to end users via `GET /announcements` (used by both the
store-owner `client/` app and, for unauthenticated callers with an
`X-Store-ID` header, non-logged-in contexts).

**Endpoints** (`laravel-server/app/Http/Controllers/Api/BroadcastController.php`,
routes under `admin/announcements`, gated by
`subscription:broadcast_create` middleware):

| Action | Method/Route | Frontend caller |
|---|---|---|
| List (admin) | `GET admin/announcements` | `webApiClient.adminGetBroadcasts()` |
| Create | `POST admin/announcements` | `webApiClient.createBroadcast()` |
| Update | `PUT admin/announcements/{id}` | `webApiClient.updateBroadcast()` |
| Toggle active | `PATCH admin/announcements/{id}/toggle` | `webApiClient.toggleBroadcast()` |
| Delete | `DELETE admin/announcements/{id}` | `webApiClient.deleteBroadcast()` |

All five return `{success, message?, data}` and the frontend's shape
handling (`Array.isArray(response) ? response : response.data`) matches
exactly — no `data`/`meta` nesting mismatch of the kind found in the
Products section in an earlier batch.

**Live round-trip test performed** (deliberately self-scoped to avoid
reaching any real user): created a broadcast titled "SMOKE TEST - ignore
(test-only, self-targeted)" with `target_type: specific` and the *sole*
targeted user set to the currently-logged-in super_admin account itself
(Josh Odumodu / admin@dumosrx.com) — chosen from a real user picker that
also listed genuine seeded accounts (two `sales_staff` users, "Smoke
Tester"/smoketest@example.com, and the real "Pika Restiv"/pikarestiv@gmail.com
owner account), none of which were selected. Confirmed via
`read_network_requests`:

- `POST admin/announcements` → 200, toast "Broadcast created successfully", row appeared live (SPECIFIC audience, Live status, Never expiry)
- `PATCH admin/announcements/{id}/toggle` → row flipped Live → Inactive
- `DELETE admin/announcements/{id}` → 200, toast "Broadcast deleted", list returned to "No broadcasts found"

No bugs found in this flow. One minor code observation, not a bug in
practice: `useDeleteBroadcastMutation` (`lib/api/admin-hooks-misc.ts`)
invalidates the React Query key `["broadcasts"]` on success, but the tab's
own list query is keyed `["admin-broadcasts"]` — a mismatch that would
normally leave a stale list after delete. It doesn't manifest because
`broadcasts-tab.tsx`'s own `confirmDelete` handler separately and
correctly invalidates `["admin-broadcasts"]` right after the mutation
succeeds, so the visible behavior is correct; the mutation's own
invalidation key is simply dead/no-op.

## Email Campaigns

`components/admin/views/mails-tab.tsx` → `POST admin/mail/send`
(`MailController::send`, `laravel-server/app/Http/Controllers/Api/Admin/MailController.php`).
Composes a subject/body and targets either "All Users" or a specific set
picked via `UserSelector` (the same real-user picker seen in Broadcasts).

**Not submitted live** — this is a genuine-risk action explicitly flagged
by this task's scope. Unlike Broadcasts (an in-app banner with no delivery
outside this app), `MailController::send` calls
`Mail::to($user->email)->queue(new AdminCustomMail(...))` for every
targeted user, chunking through *all* users when `target_type: all`. The
real seeded users on this dev backend include a real personal address
(pikarestiv@gmail.com, the store owner "Pika Restiv"). Sending — even to a
single selected test user — would dispatch a real queued email job against
that user's real inbox address. Verified via source read only:
- `laravel-server/.env`: `QUEUE_CONNECTION=database` (jobs land in the `jobs` table; only deliver if a queue worker is running — not verified either way) and `MAIL_MAILER=smtp` / `MAIL_HOST=127.0.0.1` (no local SMTP relay configured on this dev machine, so even if a worker ran, delivery would likely fail — but "likely fail" isn't the same as "confirmed safe", so this was correctly left unexercised).
- Request validation (`subject`, `message`, `target_type: all|specific`, `user_ids` required if `specific`) and the queued-response contract (`{success, message: "Emails have been queued for sending."}`) both check out from source.

No bugs found; deliberately not live-tested end to end.

## User Feedback

`components/admin/views/feedback-tab.tsx` → `GET admin/feedback` /
`POST admin/feedback/{id}/status`
(`laravel-server/app/Http/Controllers/Api/Web/FeedbackController.php`).
Reviews crash reports and support tickets submitted from the client app,
with Resolve/Dismiss actions.

**Data observed is real, high-volume telemetry, not toy data.** Live list
showed real crash reports from `system-logs@dumosrx.com` (an automated
submitter, not a human), e.g. `[CRASH] [WEB] FATAL: Aborted(Error: [unenv]
fs.readFileSync is not implemented yet!)` and `[CRASH] [WEB] Sync limit
reached...` with real stack traces, device IDs, and UAs. Cross-checked via
`php artisan tinker`:

```
Total: 2934   Pending: 2934   Resolved: 0   Dismissed: 0
```

**Live-tested "Resolve" action**: clicked Resolve on one real pending
ticket → `POST admin/feedback/{id}/status` → 200, toast "Feedback marked
as resolved", badge updated live from "Pending" to "Resolved". Endpoint
wiring is correct; no shape mismatch (backend returns Laravel's native
`paginate()` envelope, `{data: [...], ...pagination meta}`, and the
frontend's `data?.data?.map(...)` matches it exactly).

### Gap found: no pagination UI despite a real, large paginated dataset

The backend correctly paginates (`Feedback::query()->paginate(50)`,
confirmed 2934 total / 50 per page), but `feedback-tab.tsx` only ever
renders `data?.data?.map(...)` — no page-number control, "load more"
button, or any UI element reads the pagination metadata (`current_page`,
`last_page`, `total`, etc.) that the backend response already includes.
Practical effect: with 2,934 real pending feedback/crash-report tickets on
this dev backend, a superadmin can only ever see the newest 50 (page 1,
ordered `created_at desc`) — the remaining 2,884 are permanently
inaccessible through this UI. The "All / Pending / Resolved" filter tabs
work correctly (re-query with a `status` param) but don't help, since
essentially all 2,934 tickets are `pending`. Not a wrong-endpoint bug —
the API is doing the right thing and returning everything a client would
need to paginate — but a real, live-confirmed UI gap for a data volume
this large.

## Console/network

No console errors observed on any of the three tabs across create/toggle/
delete/resolve actions. All confirmed network calls (`admin/announcements`
GET/POST/PATCH/DELETE, `admin/feedback` GET/POST) returned 200.
