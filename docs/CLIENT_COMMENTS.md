# client Migrated Comments (outside lib/)

Explanatory comments migrated out of `client/` source (components, app, hooks, e2e, etc. — excludes `client/lib`, which has its own `docs/CLIENT_LIB_COMMENTS.md`), per the anti-multiline-comment rule in `.agents/AGENTS.md` §3.

## block-__tests__-action-center-alert-derivation-test-tsx-L72

`client/__tests__/action-center-alert-derivation.test.tsx:72`

useActionCenterAlerts decides what the dashboard tells an owner to act on
and in what order. It had 0% coverage, so nothing checked that a
non-admin is shown nothing, that the licence day-count and its <7-day
threshold are right, that the profile-completeness percentage counts the
pharmacy-only PCN field, or that alerts come back sorted by priority.

## block-__tests__-action-center-card-opaque-background-test-tsx-L24

`client/__tests__/action-center-card-opaque-background.test.tsx:24`

A-158: ActionCenterCard passed its priority tint (e.g. `bg-destructive/10`)
straight into <Card>'s className, which replaced (rather than layered on
top of) Card's own opaque `bg-card` background via Tailwind class-merging
— leaving the card with no solid base, just a translucent tint over
whatever's behind it. Reported live as "doesn't have a white background,
feels transparent."

## block-__tests__-action-center-queue-count-not-polled-test-tsx-L7

`client/__tests__/action-center-queue-count-not-polled.test.tsx:7`

A-18 (docs/KNOWN_BUGS.md): useActionCenterAlerts polled
queryKeys.sync.queueCount() every 5 seconds. Because SyncIndicator shares
that exact query key, the shorter interval won app-wide while the
dashboard was mounted, running a COUNT(*) against main-thread sql.js —
behind the connection-wide lock — every 5 s forever.

The count must instead be driven by core.ts's sync-queue change events,
with only the same slow 30 s safety net SyncIndicator already uses.

## block-__tests__-active-currency-default-test-ts-L5

`client/__tests__/active-currency-default.test.ts:5`

77 of the app's formatCurrency() call sites omit a currency code. While
the default was hardcoded "NGN", every one of them rendered naira
regardless of the store's setting - which is how a Cameroonian (XAF)
store was shown "N40,000" in a procurement confirmation. The default now
follows the active store.

## block-__tests__-activity-log-store-scoping-test-ts-L9

`client/__tests__/activity-log-store-scoping.test.ts:9`

Regression coverage: audit_logs had no store_id column and was never
filtered by store, unlike every other data table (see
lib/db/core.ts's STORE_SCOPED_TABLES) — an owner/admin with access to
multiple stores could see every other store's activity log entries
(product edits, stock adjustments, user names) when viewing "their"
store's Activity Log page.

## block-__tests__-admin-till-code-mode-test-ts-L17

`client/__tests__/admin-till-code-mode.test.ts:17`

If this never flips, the admin cannot submit at all: the form's submit stays
gated on a 4-digit PIN length. If it flips too eagerly, a store owner typing
their own email loses their offline PIN login.

## block-__tests__-admin-till-login-discriminator-test-ts-L8

`client/__tests__/admin-till-login-discriminator.test.ts:8`

The discriminator decides, locally and with no secret in the bundle, whether
a login attempt is an admin one. Getting it wrong in either direction is
severe: too eager and a store owner cannot sign in to their own till
offline; too shy and an admin can never get in at all.

## line-__tests__-admin-till-login-discriminator-test-ts-L40

`client/__tests__/admin-till-login-discriminator.test.ts:40`

An owner typing their own address pauses constantly. Firing on a bare
"@" swapped the 4-slot PIN for the 12-digit code field and back again,
remounting the input under their fingers.

## line-__tests__-admin-till-login-discriminator-test-ts-L49

`client/__tests__/admin-till-login-discriminator.test.ts:49`

getUsersByUsernameOrEmail filters `is_active = 1 AND _deleted = 0`, so a
deactivated owner matches nothing locally and reaches the admin path,
failing with the uniform message. Pinned so it is deliberate.

## block-__tests__-analytics-financial-permission-test-tsx-L4

`client/__tests__/analytics-financial-permission.test.tsx:4`

The Analytics dashboard's margin surfaces under "view_financial_reports":
the Profit & Loss sub-tab, the Net Profit key metric above it (the same
figure, condensed) and the "Export Reports" button, which downloads the
profit-loss CSV and nothing else. The other four sub-tabs are operational
and stay under view_reports alone.

## block-__tests__-assistant-launcher-plan-gate-test-tsx-L23

`client/__tests__/assistant-launcher-plan-gate.test.tsx:23`

The launcher stays visible on a plan without the assistant and upsells on
click (the withRestriction toast pattern) rather than disappearing — it is
an existing, visible feature being restricted, not a new one.

## line-__tests__-assistant-launcher-plan-gate-test-tsx-L57

`client/__tests__/assistant-launcher-plan-gate.test.tsx:57`

A-158: the header wraps this button in a `rounded-full` ring
(dashboard-header.tsx) with only 2px of padding, so a button that kept
the Button component's default `rounded-md` corners visibly clashed
with that circular ring ("a circle on top of a square").

## block-__tests__-audit-count-row-baseline-test-ts-L24

`client/__tests__/audit-count-row-baseline.test.ts:24`

A-263. The two state transitions behind countRow(), tested directly
rather than through a copy of them: a spec that re-implements the
callback cannot fail when the real one drifts.

## block-__tests__-audit-count-row-baseline-test-ts-L72

`client/__tests__/audit-count-row-baseline.test.ts:72`

The guard that makes counting last-TYPED-wins rather than last-READ-wins.
Typing "12" is two counts (EditableNumberCell commits per keystroke) and
their live reads can resolve out of order, because a read issued while a
sync transaction is reserved queues behind it while a later one bypasses
the queue.

## block-__tests__-audit-derivations-test-ts-L35

`client/__tests__/audit-derivations.test.ts:35`

P1/U4: the cycle-count screen derived its category groupings with an
O(categories x items) filter-per-category pass, unmemoized, on every
render; and it had no way to tell whether a count had unsaved work in it.
Both now live in pure helpers the screen memoizes.

## line-__tests__-audit-derivations-test-ts-L145

`client/__tests__/audit-derivations.test.ts:145`

The row's own systemQty was frozen when the sheet was built. Coalescing
to it here would post a day's sales back as found stock; submitStockAudit
re-reads the real quantity inside its transaction instead.

## line-__tests__-audit-derivations-test-ts-L165

`client/__tests__/audit-derivations.test.ts:165`

A draft resumed from a build before A-263 has a typed countedQty
beside a systemQty frozen at sheet-build. Passing that frozen figure
off as a baseline would reverse the day's sales: built at 10, 5 sold,
counter finds 5 -> 5 - 10 = -5 and the product is zeroed. Only a row
countRow() has re-read may claim a baseline.

## block-__tests__-audit-ledger-blank-counted-qty-test-tsx-L29

`client/__tests__/audit-ledger-blank-counted-qty.test.tsx:29`

Counted Qty opens EMPTY, not pre-filled with the system quantity. A
pre-filled count sheet cannot say which rows anyone has actually walked
to, and prefilling 0 instead would make every untouched row an adjustment
to zero stock. The field itself is the record of the count; the tick is a
shortcut for "counted, and it matched".

## line-__tests__-audit-ledger-blank-counted-qty-test-tsx-L111

`client/__tests__/audit-ledger-blank-counted-qty.test.tsx:111`

"Counted, and it matched" has to mean it matched what the system says
right now - the row's own systemQty may be hours stale (A-263), so the
ledger hands the decision to countRow, which re-reads.

## block-__tests__-audit-ledger-step-price-permissions-test-tsx-L6

`client/__tests__/audit-ledger-step-price-permissions.test.tsx:6`

The cycle count is the app's only surface where a product's cost price
and selling price can each be corrected as master data, so it is where
"edit_product_cost" and "edit_product_price" split apart from the coarse
manage_products right. Performing the count itself stays
"perform_stock_audit": a counter without the price keys still enters
counted quantities, and still SEES both counted figures - they just fall
back to a read-only value instead of an input.

## line-__tests__-audit-ledger-step-virtualized-test-tsx-L6

`client/__tests__/audit-ledger-step-virtualized.test.tsx:6`

jsdom reports zero size for everything, so the real useVirtualizer would
compute an empty visible range. Stubbed to hand back every row, same shape
react-virtual returns — matching pos-product-list-memoization.test.tsx.

## block-__tests__-audit-ledger-step-virtualized-test-tsx-L51

`client/__tests__/audit-ledger-step-virtualized.test.tsx:51`

P1: the ledger's rows are now virtualized and absolutely positioned inside
their rowgroup. This guards the restructure — every row still renders with
its editable cells, the totals footer still sums the visible rows, and the
empty state still appears when nothing matches.

## block-__tests__-audit-log-dedup-test-ts-L9

`client/__tests__/audit-log-dedup.test.ts:9`

Coverage for logAction()'s occurrence-count coalescing (core.ts): a
repeating DEDUPABLE action (LOGIN_FAILED) for the same (action, table,
record_id, store) should fold into one still-unsynced audit_logs row
with a growing occurrence_count, and its still-pending _sync_queue
INSERT entry should be rewritten in place - not multiplied - so a bug
that keeps re-firing doesn't produce one row (and one queued push) per
occurrence. A non-dedupable action must still get a fresh row every
time, and once a dedupable row has actually synced (_synced = 1), the
next repeat must start a NEW row rather than continuing to rewrite the
already-sent one.

## block-__tests__-audit-log-local-retention-test-ts-L5

`client/__tests__/audit-log-local-retention.test.ts:5`

Regression coverage for A-20 (docs/KNOWN_BUGS.md): `audit_logs` had no
local retention anywhere — it grew by 10–15 rows per sale forever, was
pulled to every device, and on the web build every single write
re-serialises the whole database through `db.export()`. `resetDatabase()`
was the only path that ever cleared the table.

## line-__tests__-audit-log-local-retention-test-ts-L115

`client/__tests__/audit-log-local-retention.test.ts:115`

A-247's fast clock, exaggerated: the cutoff is derived from the newest
server-issued sync stamp rather than from `Date.now()`, so a wrong clock
cannot push it past the retention window and take the whole local trail.
The rows here are 1 and 800 days behind REAL time; only the second is
outside the 730-day window.

## line-__tests__-audit-log-local-retention-test-ts-L133

`client/__tests__/audit-log-local-retention.test.ts:133`

`_sync_state` empty, so boundedNow() has nothing to take the lower of and
must use the device clock rather than refusing or landing on epoch 0 —
either of which would silently stop pruning for ever. A synced row is
seeded deliberately: an unsynced one is never touched, so it would make
this pass whatever the fallback did.

## line-__tests__-auth-context-permission-booleans-test-ts-L6

`client/__tests__/auth-context-permission-booleans.test.ts:6`

Same mock set as auth-impersonation-storage-leak.test.tsx: mounting the
real AuthProvider otherwise pulls in Sentry/apiClient/sync-engine/the
shared queryClient singleton/native widget bridge, none of which this
file needs to exercise - and, without mocking the queryClient singleton
specifically, a still-running effect from a prior test in this file
(see the afterEach cleanup below for why that shouldn't happen either,
belt-and-braces) could call the real invalidateQueries during another
test file's run.

## block-__tests__-auth-context-permission-booleans-test-ts-L42

`client/__tests__/auth-context-permission-booleans.test.ts:42`

Confirms the migration is behavior-preserving: an auditor (who is denied
process_sales by DEFAULT_GROUP_PERMISSIONS.auditor, same as
checkCanProcessSales denied them before) still sees canProcessSales as
false once assigned their seeded default group, and a manager (granted
it) sees it as true - i.e. the new data-driven path agrees with the old
hardcoded arrays for the default groups.

## line-__tests__-auth-context-permission-booleans-test-ts-L81

`client/__tests__/auth-context-permission-booleans.test.ts:81`

Without this, each test's AuthProvider (and its live useEffects, e.g.
the async getUserPermissionGroup() lookup) stays mounted after the
test's own assertions run, free to fire a state update - or a real DB
query against whatever `db` a LATER test file has since installed via
core.__setDatabaseForTesting() - well outside this test's own act()
boundary. Confirmed to cause exactly that: an unrelated test file
failed only when run in the same suite as this one, never in
isolation, until this cleanup was added.

## line-__tests__-auth-context-permission-booleans-test-ts-L135

`client/__tests__/auth-context-permission-booleans.test.ts:135`

The two cases above happen to agree with the OLD hardcoded
checkCanProcessSales(role) array too, so on their own they can't prove
the new logic actually reads the assigned GROUP rather than just the
role string. This case uses a role checkCanProcessSales would have
denied (auditor), but grants it via the group instead - only
group-driven logic can pass this.

## block-__tests__-auth-context-permission-booleans-test-ts-L141

`client/__tests__/auth-context-permission-booleans.test.ts:141`

Pins a DELIBERATE, spec-sanctioned behavior change: the old hardcoded
helpers (checkIsAdmin/checkCanManageStockBatch/checkCanViewAllActivity)
never listed super_admin in their role arrays, so they returned false
for that role. hasPermission() now short-circuits to "everything
granted" for store_owner/super_admin ("can never lock themselves out",
per the design spec), so a super_admin - i.e. an impersonation session -
now sees admin-tier UI in these three places. Intentional, not a
regression: if this test starts failing, the bypass rule was changed,
not "fixed".

## line-__tests__-auth-context-permission-booleans-test-ts-L153

`client/__tests__/auth-context-permission-booleans.test.ts:153`

An EMPTY group, not no group at all: with no group the role-string
fallback would grant these anyway, so only an assigned group that
grants nothing can prove the store_owner/super_admin bypass itself.

## block-__tests__-auth-context-value-identity-test-tsx-L6

`client/__tests__/auth-context-value-identity.test.tsx:6`

AuthContext has ~70 useAuth() consumers app-wide. A fresh value object per
provider render invalidates every one of them, so the provider's value (and
the callbacks inside it) must keep a stable identity while nothing it
exposes has actually changed.

## block-__tests__-auth-default-admin-bootstrap-test-tsx-L6

`client/__tests__/auth-default-admin-bootstrap.test.tsx:6`

Regression coverage for the "no users exist" login fallback (SECURITY,
docs/KNOWN_BUGS.md): it used to fire for ANY typed PIN whenever the typed
identifier was "admin" and simply didn't match a local row - not "zero
users exist locally". A device mid-sync (hasn't pulled its real "admin"
user down yet) or one whose real admin account was later
renamed/deleted could hit it with real users already present, granting a
full admin session for an arbitrary PIN. Exercises the real login()
against a real in-memory sql.js instance (not a reimplementation).

## block-__tests__-auth-impersonation-storage-leak-test-tsx-L6

`client/__tests__/auth-impersonation-storage-leak.test.tsx:6`

Regression coverage for a High-severity bug (docs/KNOWN_BUGS.md):
loginFromHandoff() deliberately avoids calling setDbUser() for an
impersonated profile (moving the local DB's "current user" pointer to a
foreign-store user would corrupt audit-log/performed_by attribution), but
it persisted the profile under the SAME "dumos_user" localStorage key the
normal mount effect reads - so the very next reload restored it through
the ordinary path anyway, calling setDbUser() and defeating the intended
separation.

## line-__tests__-auth-impersonation-storage-leak-test-tsx-L105

`client/__tests__/auth-impersonation-storage-leak.test.tsx:105`

setDbUser (core.setCurrentUser) must never have been called with the
impersonated profile - moving the local DB's "current user" pointer
to a foreign-store user is exactly what this separation prevents.

## block-__tests__-auth-login-pos-cart-clear-test-tsx-L6

`client/__tests__/auth-login-pos-cart-clear.test.tsx:6`

Regression coverage for a MEDIUM data-loss bug found in an Opus review of
a prior fix round: that round added clearPOSCartStorage() inside login()
intending to clear the cart only when switching to a DIFFERENT cashier or
logging out. But login() is ALSO how the lock-screen's ordinary "same
user unlocks with their own PIN after auto-lock/idle timeout" flow
re-authenticates (see lock-screen.tsx / dashboard-layout.tsx's
onUnlockSuccess wiring) — so a cashier who stepped away with an
in-progress cart came back to an empty one.

The fix captures the previously-logged-in user's id before login()
overwrites it, and only clears the cart when the incoming user is
genuinely different.

## line-__tests__-auth-login-pos-cart-clear-test-tsx-L183

`client/__tests__/auth-login-pos-cart-clear.test.tsx:183`

No previous user was logged in, so there is nothing "carried over"
from a different cashier — but this still exercises the guard's
`previousUserId` branch (undefined) without throwing.

## block-__tests__-auth-login-sets-active-store-test-tsx-L6

`client/__tests__/auth-login-sets-active-store.test.tsx:6`

Regression coverage for a Critical bug (docs/KNOWN_BUGS.md):
getUserByUsernameOrEmail() has no store scoping, so on a multi-store
device a login isn't tied to the currently-selected store. The chosen fix
is not to filter the lookup (that would lock a cashier out of a device
whose switcher points at a sibling store) but to follow the authenticated
account: a store-pinned user's own store_id becomes the active store the
moment they log in.

store-context.tsx already gives `user.store_id` precedence in its DERIVED
activeStoreId/targetId, but it never persists it. Two consumers read the
persisted value directly and so were left on the previous store:
lib/api/client.ts's sync push/pull (X-Store-Id) and store-context.tsx's
own lazy initializer on the next mount. These tests pin down both the
persisted key and the module-scope query resolver in lib/db/core.ts.

## line-__tests__-auth-login-sets-active-store-test-tsx-L157

`client/__tests__/auth-login-sets-active-store.test.tsx:157`

Nothing but AuthProvider is mounted here - no StoreProvider at all -
so if the active store is correct it can only have been login() that
set it, closing the window before the provider's targetId effect runs.

## line-__tests__-auth-login-sets-active-store-test-tsx-L201

`client/__tests__/auth-login-sets-active-store.test.tsx:201`

An owner has access to every store on the device; their active store
is whatever they last switched to, which store-context.tsx persists
on their behalf. login() must not clobber or clear it.

## block-__tests__-auto-lock-cross-tab-sync-test-ts-L3

`client/__tests__/auto-lock-cross-tab-sync.test.ts:3`

Regression coverage for a real reported bug: disabling Auto-Lock in
Settings would sometimes silently revert to 5 minutes and resume locking.
Root cause: zustand's persist middleware writes this tab's *entire*
in-memory state back to localStorage on every set() call. A second
tab/window left open from before the change (still holding the old
`duration` in memory) would clobber the new value back on its very next
updateActivity() call (any mousemove/keydown/etc in that stale tab).

Fixed by listening for the storage event and rehydrating from whatever
was last written, so a stale tab picks up the change before it can write
its own outdated state back over it.

## block-__tests__-auto-lock-duration-self-heal-test-ts-L20

`client/__tests__/auto-lock-duration-self-heal.test.ts:20`

Regression coverage for a real reported bug (see issue.png): the
Auto-Lock Screen dropdown rendered completely blank — not even its own
"Select duration" placeholder — for a real account. Root cause: the
persisted duration in this account's localStorage (dumos_autolock) was
999, which doesn't match any of the five SelectItem options
(0/1/5/15/30). Radix's Select has nothing to match and shows nothing at
all, with no way for the user to tell why or fix it themselves short of
already knowing to pick a new value.

However this particular value got there (an older app version, manual
localStorage editing, a since-removed option), the underlying gap is
real: nothing ever validated the persisted duration against the actual
set of supported options. Fixed by self-healing to the store's own
documented default (5) on mount whenever the persisted value doesn't
match a real option.

## line-__tests__-auto-lock-duration-self-heal-test-ts-L103

`client/__tests__/auto-lock-duration-self-heal.test.ts:103`

The self-heal effect corrects the store, not just the display —
otherwise the same blank dropdown would come right back on the next
page load.

## block-__tests__-auto-updater-install-permission-test-tsx-L4

`client/__tests__/auto-updater-install-permission.test.tsx:4`

install_app_updates gates the updater's USER-FACING half: the floating
"Check for updates" pill and the consent/restart prompts it can open.
The startup check and the silent patch download behind it are deliberately
left running for every session - they are not a user action, and stopping
them would strand a till on an old build rather than restrict anyone.

A session with no signed-in user (login screen, first run) is ungated:
there is no group to check, and the updater is the device's own.

## block-__tests__-barcode-label-sheet-test-ts-L8

`client/__tests__/barcode-label-sheet.test.ts:8`

The barcode dialog used to live-mount one <ReactBarcode> per copy off-screen
- each doing synchronous SVG generation, all of them re-rendering on every
quantity increment, with no upper bound on quantity. Every copy is identical,
so only the COUNT varies: one barcode is rendered and its markup repeated.

## block-__tests__-base-client-401-refresh-test-ts-L5

`client/__tests__/base-client-401-refresh.test.ts:5`

Regression coverage for base-client.ts's 401 handler clearing the auth
token on a network blip during the refresh-and-retry attempt, undoing
token-manager.ts's own hardening (which deliberately leaves the token
untouched unless the server gives a definitive 401/403). See
docs/FIXED_BUGS.md.

## block-__tests__-base-client-html-response-test-ts-L5

`client/__tests__/base-client-html-response.test.ts:5`

A-171. `SyntaxError: Unexpected token '<'` — 260 events across 4 stores,
marked fatal, with no stacktrace and no `area` tag, so the call site could
not be identified from Sentry at all.

The cause is an asymmetry in base-client.ts: the error path parses with
`.json().catch(() => ({}))`, but the success path called `.json()`
unguarded. A 2xx carrying HTML — a shared-host error page, a maintenance
interstitial, a proxy login wall — therefore threw a bare SyntaxError that
named nothing about where it came from.

The fix is not just "don't throw": it is to throw something that identifies
itself, so the next occurrence is diagnosable from the report alone.

## block-__tests__-base-client-html-response-test-ts-L94

`client/__tests__/base-client-html-response.test.ts:94`

A-206. The error named the endpoint, status and content-type, and stopped
there — which could not separate the three causes that produce this on
shared hosting. The live events carried `content-type: application/json`,
ruling out an HTML page and leaving two indistinguishable. Reading the
body as text once and parsing that gives the length and the ends, and the
failure's own `name` separates a transport abort (`TypeError`, the body
stream cut after the headers) from a real parse failure (`SyntaxError`).

## block-__tests__-batch-deficits-test-ts-L9

`client/__tests__/batch-deficits.test.ts:9`

Stage 1 of docs/superpowers/specs/2026-10-14-oversell-compensating-movement-design.md:
a batch whose movement log sums below zero is carrying an oversell deficit,
and the next inbound movement pays it off before it adds anything (A-265).
The deficit is read from the log itself, which is also A-212's fix — the
alert it replaces matched the word "oversold" in a free-text reason inside a
30-day window, so it announced past events and never a current shortfall.

## block-__tests__-batch-quantity-recompute-test-ts-L9

`client/__tests__/batch-quantity-recompute.test.ts:9`

Stage 1 of docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md:
`stock_batches.quantity` is a cache of MAX(0, Σ its non-deleted movements),
rebuilt whenever that log changes, instead of a running total maintained by
per-movement deltas. The properties below are the ones the incremental model
could not state.

## line-__tests__-batch-quantity-recompute-test-ts-L195

`client/__tests__/batch-quantity-recompute.test.ts:195`

The classification must read the log as it was BEFORE this movement.
Reading it afterwards let `inbound` grow past a `stored` that sales had
worn down, which flipped a legacy batch into "rebuild" and wrote the
unlogged opening stock off: 100 sold down to 5, then 10 found, gave 0
where the shelf holds 15.

## line-__tests__-batch-quantity-recompute-test-ts-L229

`client/__tests__/batch-quantity-recompute.test.ts:229`

The residue and the movement being equal is the one case a value-based
"already correct, nothing to write" guess gets wrong: it reads exactly
like a batch created holding its own first movement. Provenance, not
arithmetic, is what tells them apart — hence batches are created at 0.

## line-__tests__-batch-quantity-recompute-test-ts-L251

`client/__tests__/batch-quantity-recompute.test.ts:251`

The boundary is `unlogged residue > cumulative outbound`, not "stored
has reached 0": stored is U + Σlog and the test is stored > inbound, so
the inbound cancels and only U against outbound is left. A legacy batch
that has since had a logged delivery therefore crosses while the shelf
is still full, and the rebuild writes off the units nobody logged.
Nothing on the device can tell those from drift — that is A-264, and
`opening_quantity` is the only fix. Pinned so the day it changes is
visible.

## line-__tests__-batch-quantity-recompute-test-ts-L308

`client/__tests__/batch-quantity-recompute.test.ts:308`

A receipt, an import row and a transfer destination all create the batch
at 0 and let the movement supply the figure. Creating it with the
quantity already in place is indistinguishable from a legacy batch
receiving an equal-sized adjustment, and one of the two has to be wrong.

## line-__tests__-batch-quantity-recompute-test-ts-L337

`client/__tests__/batch-quantity-recompute.test.ts:337`

Four suites stub @/lib/db/local-database and model this rule by hand in
__tests__/helpers/fake-batch-quantity.ts. Nothing else notices when the
two part company, and a fake that is wrong in the same direction as a
bug is how the carve-out regression passed its own tests.

## line-__tests__-bi-stock-value-matches-dashboard-formula-test-ts-L59

`client/__tests__/bi-stock-value-matches-dashboard-formula.test.ts:59`

Raw soft-delete rather than products.deleteProduct(), which refuses
to delete a product that still has stock on hand - irrelevant to
what's under test here (the query's own _deleted handling).

## block-__tests__-bi-tab-query-gating-test-tsx-L6

`client/__tests__/bi-tab-query-gating.test.tsx:6`

useStockBatchAlerts (3 reads) and usePurchasePatterns feed only the
Analytics dashboard's stock_batches and customers tabs, but both used to run
on mount of the whole dashboard - i.e. on the default Sales tab, which never
displays either of them. They now take an `enabled` flag driven by the
active tab.

## line-__tests__-billing-pricing-test-ts-L79

`client/__tests__/billing-pricing.test.ts:79`

This is the double-counting regression: use_credits already tells the
server to apply credits, so the sent amount must reflect only the
coupon portion regardless of how much credit the user has.

## block-__tests__-catalog-context-menu-delete-closes-panel-test-tsx-L5

`client/__tests__/catalog-context-menu-delete-closes-panel.test.tsx:5`

Regression coverage for FIXED_BUGS.md A-46: deleting a product through the
row context menu left its detail panel open and editable against a row
that no longer exists. The panel's own Delete action always called
onClose(); the context-menu path only refetched the list.

## block-__tests__-catalog-detail-panel-label-permission-test-tsx-L87

`client/__tests__/catalog-detail-panel-label-permission.test.tsx:87`

barcode-print-dialog.tsx has always been real and tested, but its only
mount was keyed off a stock-overview.tsx state whose setter was never
called — the feature existed with no way to open it. The catalog detail
panel's overflow menu is the trigger, and print_product_labels gates it.

## block-__tests__-catalog-list-inventory-permissions-test-tsx-L7

`client/__tests__/catalog-list-inventory-permissions.test.tsx:7`

The product catalog is where three Inventory & Stock keys land:
"view_cost_fields" decides whether the Avg Cost column exists at all
(it was visible to every role, cashiers included, before this),
"edit_product_price" fronts the selling-price quick edit and
"adjust_stock_counts" fronts the stock-quantity quick edit - both split
out of the coarse manage_products/canManageStockBatch check that still
gates category and reorder level. Without a key the figure stays on
screen read-only; only the pencil goes.

## block-__tests__-catalog-list-row-callback-identity-test-tsx-L7

`client/__tests__/catalog-list-row-callback-identity.test.tsx:7`

CatalogRow is React.memo'd, but every save handler CatalogList passed it was
a fresh function on every render, so the memo never bailed out and all ~20
visible rows (each with four stateful editable cells) re-rendered on any
parent render. Two causes:

 - the useCallbacks depended on the whole `useMutation` result, which
   react-query rebuilds as a new object literal on every render
   (`return { ...result, mutate, mutateAsync: result.mutate }`); only
   `.mutateAsync` is stable, being bound once per observer.
 - `onProductUpdated` arrived from product-database as an inline
   `() => void refetch()`.

Render-count assertions are brittle (see pos-product-list-memoization), so
this pins the actual mechanism instead: the handler props CatalogRow receives
must keep their identity across a parent rerender that changes nothing
relevant.

## line-__tests__-catalog-list-row-callback-identity-test-tsx-L50

`client/__tests__/catalog-list-row-callback-identity.test.tsx:50`

Mirrors react-query's real contract: a brand-new result object per render,
with a stable mutateAsync. A fix that depends on the whole object therefore
still breaks here, exactly as it does in the app.

## block-__tests__-catalog-quick-edit-commit-test-tsx-L6

`client/__tests__/catalog-quick-edit-commit.test.tsx:6`

U5: the catalog's inline stock-quantity quick-edit committed a real
inventory adjustment (and a permanent movement-ledger row) ON BLUR, so
tapping away from a half-typed number on a tablet wrote a wrong stock
level. That cell must commit only on an explicit confirm.
U10: none of these number inputs set inputMode, so Android WebView showed
a full keyboard instead of a numeric keypad.

## block-__tests__-catalog-row-quick-edit-permissions-test-tsx-L7

`client/__tests__/catalog-row-quick-edit-permissions.test.tsx:7`

The row half of the catalog gates: a withheld key must leave the figure
on screen read-only rather than render a disabled control, and the Avg
Cost cell must disappear entirely (its grid column goes with it) rather
than render blank.

## block-__tests__-catalog-row-single-branch-test-tsx-L7

`client/__tests__/catalog-row-single-branch.test.tsx:7`

catalog-list used to mount BOTH the mobile card and the desktop grid row for
every visible row inside the virtualizer, hiding one with CSS. With ~20 rows
on screen that meant ~80 stateful editable cells mounted where ~20 should be
visible. Each row now renders only the branch that is actually on screen, so
these pin that exactly one of the two is in the DOM at a time.

## block-__tests__-category-combobox-source-test-tsx-L33

`client/__tests__/category-combobox-source.test.tsx:33`

Item 4: the Add Product category dropdown used to read from the static
FORM_SUGGESTIONS list and never from the real `categories` table, so a
construction-materials store was offered pharmacy categories only.

## block-__tests__-category-icon-fuzzy-match-test-ts-L16

`client/__tests__/category-icon-fuzzy-match.test.ts:16`

Regression test for a real bug Cynthia hit: "Site Safety & Accessories",
"Sanitary Ware", and "Plumbing & Pipe Fittings" all rendered the Wine
icon. fuzzyKeywordMatch()'s threshold (ceil(keyword.length / 3)) was too
loose for exactly-4-letter keywords like "wine": a distance of 2 out of 4
characters — half the word — was accepted, which is exactly the edit
distance between "wine" and each of "site", "ware" (from "sanitary
WARE"), and "pipe" (from "PIPE fittings"). Ordinary short English words
kept coincidentally landing within 2 edits of a 4-letter keyword.

## block-__tests__-category-icon-fuzzy-match-test-ts-L53

`client/__tests__/category-icon-fuzzy-match.test.ts:53`

Cynthia's own construction-materials store categories, previously
uncovered by the pharmacy/grocery keyword sets and landing on either an
arbitrary FALLBACK_ICONS rotation or a wrong fuzzy match (see above).

## line-__tests__-category-icon-fuzzy-match-test-ts-L60

`client/__tests__/category-icon-fuzzy-match.test.ts:60`

"electrical" wins over "lighting" as the earlier KEYWORD_ICONS entry
when a name contains both - still a purpose-built icon, just the
broader of the two matched keywords.

## block-__tests__-category-list-product-counts-test-ts-L9

`client/__tests__/category-list-product-counts.test.ts:9`

Cynthia asked to see how many products are in each category right on the
Manage Categories tiles, so she can tell at a glance which ones are safe
to edit or delete. getCategoryList() previously returned just {id, name};
the dialog only ever found out a category's product count lazily, one
query per click, the moment you tried to delete it. This covers the new
`productCount` field added to the list query itself.

## block-__tests__-check-can-factory-reset-test-ts-L4

`client/__tests__/check-can-factory-reset.test.ts:4`

checkCanFactoryReset gates the Factory Reset button/dialog in
Settings > Data (components/settings/data-settings.tsx). Deliberately
narrower than checkIsAdmin, which also passes "manager" - wiping every
local table and disconnecting cloud sync shouldn't be something a
manager can trigger unilaterally.

## block-__tests__-check-can-request-stock-transfer-test-ts-L4

`client/__tests__/check-can-request-stock-transfer.test.ts:4`

checkCanRequestStockTransfer (auth-context.tsx) was removed in favor of
pos-layout-header.tsx composing two useHasPermission() checks directly
(base eligibility "process_sales", narrowed to admin-tier "manage_staff"
or the store's own staff_can_request_transfers toggle) - this exercises
that exact composition via the underlying pure hasPermission(), using
`group: null` so each role falls back to its DEFAULT_GROUP_PERMISSIONS
set, reproducing the original function's role-string test cases.

## block-__tests__-check-is-admin-test-ts-L4

`client/__tests__/check-is-admin.test.ts:4`

Regression coverage: checkIsAdmin used to test `normalizedRole.includes(...)`
(a substring match) instead of exact array membership like every sibling
check (checkCanManageStockBatch, checkCanProcessSales,
checkCanViewAllActivity, checkCanFactoryReset) — a future role whose name
merely CONTAINS "admin"/"manager"/"storeowner" would have silently
inherited full admin UI privileges.

## line-__tests__-check-is-admin-test-ts-L17

`client/__tests__/check-is-admin.test.ts:17`

super_admin must stay included — a prior fix (pos-transaction-history)
switched to checkIsAdmin specifically because the platform's top role
needs to pass this check; losing it here would silently revert that.

## block-__tests__-chunk-error-detection-test-ts-L4

`client/__tests__/chunk-error-detection.test.ts:4`

Regression coverage: a stale-chunk failure on this app's static export
(`output: export`) doesn't fail to fetch at all - the host falls back to
serving index.html (200 OK, HTML) for a missing chunk path, so the
browser throws a plain "Unexpected token '<'" SyntaxError trying to
execute that HTML as the JS module it requested. That shape wasn't
recognized by CHUNK_ERROR_PATTERN, so the auto-reload in
global-error-listener.tsx / error-boundary.tsx never fired for it -
confirmed live in production as a blank /dashboard or /settings/:tab the
person had to manually refresh out of.

## line-__tests__-chunk-error-detection-test-ts-L34

`client/__tests__/chunk-error-detection.test.ts:34`

V8's own wording when response.json() (base-client.ts) hits a proxy/
gateway HTML error page instead of JSON - same leading text as the
real chunk-load SyntaxError, but a genuine backend problem, not a
stale build. Must not trigger the auto-reload: the reload guard
clears on every successful boot, so misclassifying this would reload
forever instead of once.

## block-__tests__-chunk-reload-is-bounded-per-build-test-ts-L3

`client/__tests__/chunk-reload-is-bounded-per-build.test.ts:3`

A stale chunk reloads once, which is right - the reload fetches the new
shell. But the guard lived in sessionStorage and was cleared on every
successful mount, so a shell that stays stale reloaded forever: boot clears
the guard, navigate, chunk fails, reload, boot clears the guard. Observed in
production on 2026-10-12 after a deploy: one device reloading /inventory
every ~3 seconds, indefinitely.

The cap is per BUILD, not per tab: one reload is the whole remedy, and if
the same build fails again, reloading it cannot help.

## block-__tests__-clear-database-clears-account-scoped-keys-test-ts-L9

`client/__tests__/clear-database-clears-account-scoped-keys.test.ts:9`

A-153. `clearDatabaseForNewStore()` wipes every table but left a set of
localStorage caches behind, so the old account's state leaked into the new
one — most visibly the old store's product-name autocomplete.

The question each key has to answer is whether it describes **this device**
(survives) or **this device's relationship with the account/store being
replaced** (must go).

## block-__tests__-clear-database-for-new-store-clears-recent-users-test-ts-L5

`client/__tests__/clear-database-for-new-store-clears-recent-users.test.ts:5`

A-152 (docs/FIXED_BUGS.md): the login picker's tiles come from a
localStorage cache `clearDatabaseForNewStore()` never touched, so a
disassociated account's tile survived the exact wipe meant to erase it.

## block-__tests__-clear-database-for-new-store-clears-store-scoped-tables-test-ts-L6

`client/__tests__/clear-database-for-new-store-clears-store-scoped-tables.test.ts:6`

A-163 (docs/FIXED_BUGS.md): a store-scoped table left behind by
clearDatabaseForNewStore() keeps the previous store's rows at
`_synced = 0` with no queue entry - precisely what requeueOrphanedRows()
re-queues - so they are pushed under the new account's identity and
refused as cross-tenant forever.

## block-__tests__-clear-local-drafts-test-ts-L13

`client/__tests__/clear-local-drafts.test.ts:13`

Three device-local drafts (POS cart, cycle count, stock adjustment) each
live under their own single global localStorage key with no store or user
in it, so every path that tears down one store/account's context has to
drop all three. Two of the five - linking a new cloud store and the
factory reset - were clearing only the cart, so a count started against
the outgoing store's product ids survived into the new one and could be
submitted against foreign ids. They now all call one function; this pins
that it really empties all three.

## block-__tests__-conflict-ledger-bounded-test-ts-L9

`client/__tests__/conflict-ledger-bounded.test.ts:9`

The ledger was allowlisted to `purchase_order_items`, so a terminal drop on
any other table left no local trace: once the push finished the queue was
empty and the conflict count was zero. That is why the repeated "changes
could not be saved" loops were never diagnosable. Widening it means it has
to be bounded instead.

## block-__tests__-console-noise-filter-test-ts-L8

`client/__tests__/console-noise-filter.test.ts:8`

Vitest's worker forwards every console call to the reporter over an rpc,
and the worker closes as soon as the last test finishes. Fire-and-forget
async work — `void logCrash(...)`, a sync-engine catch, a DB retry — can
write a line after that point, leaving a flush in flight when the rpc
closes: `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog"
was pending`. The suite is green and the job still exits non-zero.

No vitest setting prevents the send (`silent` and `onConsoleLog` are both
reporter-side), so the only fix is for those lines not to be written. This
predicate decides which are pure noise.

## block-__tests__-console-noise-filter-test-ts-L32

`client/__tests__/console-noise-filter.test.ts:32`

The straggler actually caught in CI: a mock missing an export makes the
crash path throw, and the caught error is logged with a full stack - a
big payload, so the slowest thing to flush.

## block-__tests__-count-freshness-warning-deficit-test-tsx-L6

`client/__tests__/count-freshness-warning-deficit.test.tsx:6`

Stage 1 of docs/superpowers/specs/2026-10-14-oversell-compensating-movement-design.md:
a counter standing in front of a shelf has no way to know the ledger owes
units, so their count pays the shortfall off and the figure does not move
(A-265). Until the compensating write lands, saying so is the fix.

## block-__tests__-crash-report-dedup-test-ts-L23

`client/__tests__/crash-report-dedup.test.ts:23`

Coverage for logCrash()'s crash-report coalescing (error-logger.ts): a
bug that keeps re-throwing the SAME error should fold into one
still-unsynced `feedback` row with a growing occurrence_count, instead
of a fresh row (and a fresh sync-queue push) per throw - and the direct
reportClientError HTTP call should be throttled the same way, since it
fires independently of the local sync queue entirely.

## line-__tests__-crash-report-dedup-test-ts-L71

`client/__tests__/crash-report-dedup.test.ts:71`

Every queued push targets the SAME single row (one insert() the first
time, then update()s for each repeat) - unlike audit_logs, feedback
genuinely supports server-side UPDATE by id, so these coalesce into
one final row server-side rather than needing the append-only
workaround logAction() uses. The point being tested is "one row,"
not "one queue entry."

## block-__tests__-create-prescription-product-atomicity-test-ts-L9

`client/__tests__/create-prescription-product-atomicity.test.ts:9`

A-16. createPrescription() inserted the prescription header and then
looped its items through separate insert() calls, and createProduct()
created a missing category as its own committed write before inserting
the product. Each insert() opens and commits its own transaction, so an
interruption between two of them (iOS backgrounding a PWA is called out
elsewhere in this codebase as aggressive about killing mid-write) left a
prescription with no medications — already queued for sync, so the gap
propagated to every other device — or an orphan category with no product.

Both are now one transaction(), like createSale/receivePurchaseOrder.
A failing insert stands in for the interruption here: the observable
requirement is the same either way — nothing of a half-finished
multi-row write may survive.

## block-__tests__-create-product-accepts-server-uuid-v7-test-ts-L12

`client/__tests__/create-product-accepts-server-uuid-v7.test.ts:12`

createProduct() uses a UUID test to decide whether `category_id` holds an
id or a free-text category NAME. Its pattern accepted only UUID v1-v5,
while Laravel's HasUuids emits v7 — so a server-created category id fell
down the name branch and the function created a brand new category
*literally named after the UUID*, filing the product under it.

Reachable in production the moment A-189's repair created a category
server-side for store 571582a9. Same root cause as A-192's push guard;
both now share lib/utils/uuid.ts.

## block-__tests__-create-sale-test-ts-L9

`client/__tests__/create-sale.test.ts:9`

Regression test for the bug where createSale()'s stock_movements insert
never set `performed_by`. Harmless locally (that column is nullable in
SCHEMA_SQL), but the cloud MySQL column is a required FK with no default,
so every sale's movement silently failed to sync in production. Real
in-memory SQLite against the app's actual SCHEMA_SQL, not a mocked
execute(): asserting only "insert was called" would never have caught a
missing column the way asserting on the persisted row's actual value does.

## block-__tests__-customer-add-overlay-permission-test-tsx-L47

`client/__tests__/customer-add-overlay-permission.test.tsx:47`

"/customers?action=add" is typeable and is also what the dashboard
header's "Add Customer" navigates to, so hiding the header action alone
would not be a gate - the modal's own opener has to require
manage_customers.

## block-__tests__-customer-directory-permissions-test-tsx-L63

`client/__tests__/customer-directory-permissions.test.tsx:63`

The Customers & Loyalty read/write split: manage_customers fronts the
add/edit triggers, delete_customers the trash control, and
view_customer_balances every place a customer's outstanding debt is
shown - the directory's Balance column and debt summary, and the detail
panel's outstanding-balance block (which is where Record Payment lives).

## line-__tests__-customer-engagement-metric-labels-test-ts-L6

`client/__tests__/customer-engagement-metric-labels.test.ts:6`

Audit follow-up to the dashboard "Customer Retention" -> "Repeat Purchase
Rate" relabel (lib/hooks/use-bi-data.ts): the Customers page's
"Retention & Engagement" card used the exact same construction —
getCustomerRetentionMetrics() in lib/db/queries/customers.ts counts
customers with >1 sale *inside a single trailing 30-day window* over
customers with >=1 sale in that window. That is a repeat-purchase rate, not
retention of a prior cohort or of the store's customer base. There is no
unambiguous cohort/baseline definition available in this app, so the
calculation is intentionally unchanged and only the labels were corrected.

"Avg Visits/Mo" had a second, independent problem: the average is taken over
the customers who *bought in the window*, not over all registered customers
and not store-wide, so it is now "Avg Visits/Customer" under a card titled
"Engagement (Last 30 Days)".

These tests pin both the corrected labels (source inspection — no component
render harness exists in this repo, see
profit-loss-tab-currency-formatting.test.ts for the same pattern) and the
numerator/denominator the labels now promise.

## block-__tests__-customer-payments-test-ts-L9

`client/__tests__/customer-payments.test.ts:9`

Coverage gap: recordCustomerPayment (lib/db/queries/customers.ts) is the
single source of truth for logging a customer debt payment from both the
Customer Directory and a sale's transaction details, but had zero test
coverage (grep for "customer_payment" across __tests__/ and e2e/ turned up
nothing) despite touching three tables (customer_payments, customers,
sales) and doing money-accumulation-style FIFO allocation across a
customer's pending sales - the same category of arithmetic that produced
a real bug in three other modules (POS checkout, online-order
fulfillment) during this smoke-test pass.

## block-__tests__-customer-report-store-scoping-test-ts-L9

`client/__tests__/customer-report-store-scoping.test.ts:9`

Regression test: fetchCustomerReportData's join to sales had no
store_id filter (customers.ts's getCustomers has the identical join WITH
one, so this was the outlier), so "Total Purchases"/"Total Spent" could
absorb another store's sales for any shared customer id on a multi-store
device.

## block-__tests__-customers-total-spent-test-ts-L9

`client/__tests__/customers-total-spent.test.ts:9`

Regression coverage for KNOWN_BUGS.md #7: getCustomers()'s total_spent
summed sales.total_amount only, never subtracting returns.total_refunded
— sales.total_amount is deliberately never mutated on return (net figures
are meant to be derived as total_amount - total_refunded elsewhere in the
app), so a customer's displayed total spent overstated by the sum of
their refunds.

## block-__tests__-daily-close-cash-expenses-test-ts-L9

`client/__tests__/daily-close-cash-expenses.test.ts:9`

Daily Close's "Net Cash Expected" is the figure an owner reconciles the
drawer against, so it must count exactly the cash that left it that day:
no transfer/card expenses, no amortised slice of a prepaid one, and
nothing from another store.

## block-__tests__-daily-close-mixed-refund-attribution-test-ts-L16

`client/__tests__/daily-close-mixed-refund-attribution.test.ts:16`

Regression: a refund of a mixed-payment sale unconditionally deducted the
full refunded amount from daily close's cash total, regardless of what
the original sale was actually paid with. A sale split card 7000 / cash
3000, refunded in full, previously understated expected cash by 7000
that was never in the drawer to begin with (it came off a card), and
didn't touch the card total at all. The original sale's own
payment_details.splits (already joined onto each return row by
getDailyCloseData) now prorates the refund across the non-credit splits
it actually reflects - a credit split is excluded entirely, since
refunding it writes off a receivable rather than moving drawer cash.

## line-__tests__-daily-close-mixed-refund-attribution-test-ts-L119

`client/__tests__/daily-close-mixed-refund-attribution.test.ts:119`

The full 10000 refund reverses the original 3000 cash / 7000 credit
split exactly, the same as a pure-credit sale's refund already
reduces `credit` - forgiving the 7000 credit debt shows up there,
not as a phantom cash movement.

## block-__tests__-daily-close-reseller-profit-test-ts-L102

`client/__tests__/daily-close-reseller-profit.test.ts:102`

The commission is a RATE multiplication - the A-261 class, not float dust
- and it is both stored and paid out to a reseller, so it has to be
rounded where it is computed. The A-260 scan cannot see it: the write is
`reseller_commission_amount: resellerCommissionAmount`, a bare variable.

## block-__tests__-daily-close-run-permission-test-tsx-L18

`client/__tests__/daily-close-run-permission.test.tsx:18`

"Run Daily Close (End of Day)" is not a ledger-locking write in this app —
the close IS securing the day's data: a full local backup of the SQLite
file plus a forced cloud sync, both offered from the Daily Close banner.
Those two buttons are the only things on the whole screen that DO
anything, and they were reachable by every role, cashiers included, while
the identical operations in Settings sit behind backup_restore_data.

## line-__tests__-dashboard-action-center-routes-test-ts-L5

`client/__tests__/dashboard-action-center-routes.test.ts:5`

Regression test for a broken-link bug found while smoke-testing the
Dashboard's Action Center: clicking the "N Items Low Stock" alert
navigated to `/inventory/products?status=low_stock`, but the inventory
section's dynamic route (app/(dashboard)/inventory/[tab]/page.tsx) only
pre-renders a fixed set of tabs via generateStaticParams(). "products"
isn't one of them, so under `output: export` Next.js throws a full-page
runtime error ("missing param ... in generateStaticParams()") instead of
navigating.

This test parses both source files (no component rendering / router
mocking needed) and asserts every `/inventory/<tab>` actionRoute the
Action Center can produce resolves to a tab that actually exists.

## line-__tests__-dashboard-action-center-routes-test-ts-L82

`client/__tests__/dashboard-action-center-routes.test.ts:82`

Bug #9: a product floored to quantity=0 by bug #4's oversell fix produced
zero signal on the Dashboard's Action Center (it fell into
`getStockBatchStats()`'s dead `critical_stock_count` field, since
`low_stock_count` requires `total_qty > 0`). Fix adds a dedicated
"Oversold" card, following the exact same threaded-prop + conditional
pattern as the existing "Low Stock" card, sourced from
`getOversoldAlerts()` instead of `getStockBatchStats()`.

## line-__tests__-dashboard-action-center-routes-test-ts-L111

`client/__tests__/dashboard-action-center-routes.test.ts:111`

Distinct card id + a real, working actionRoute (out_of_stock is a
genuine status filter chip on the catalog tab, unlike the low-stock
card's own status param this merely mirrors).

## block-__tests__-dashboard-header-action-permission-test-tsx-L4

`client/__tests__/dashboard-header-action-permission.test.tsx:4`

Regression coverage for FIXED_BUGS.md A-45: DashboardHeader passes
resolveHeaderAction a permission-check closure, and that closure used to
recognise only three hardcoded keys and return true for anything else.
Every other route's `actionPermission` - adjust_stock_counts on Adjust
Stock, manage_customers, record_expenses - was therefore declared but
never enforced. The closure now delegates to the same hasPermission()
every other call site uses, so it enforces whatever key a route declares.

## line-__tests__-dashboard-header-action-permission-test-tsx-L36

`client/__tests__/dashboard-header-action-permission.test.tsx:36`

canManageStockBatch is auth-context's own hasPermission("manage_products")
call, so the mock derives it the same way rather than hardcoding true -
the "has adjust_stock_counts but not manage_products" case below depends
on the two coming apart.

## block-__tests__-dashboard-lock-overlay-test-tsx-L9

`client/__tests__/dashboard-lock-overlay.test.tsx:9`

Two reported bugs, both reachable only through the dashboard's own lock
overlay (not /login's copy of the same LockScreen):

1. Lock-screen bypass. Locking the app, backing out of PIN entry to the
   account picker and choosing "Set Up as New Device" used to unlock the
   session *before* navigating to the setup flow. Backing out of setup
   lands back on /dashboard, which then rendered fully unlocked with no
   re-authentication at all.
2. The per-account remove ("x") affordance was missing here, because this
   caller never passed an onRemoveUser callback, unlike /login's.

## block-__tests__-dashboard-product-activity-click-test-ts-L5

`client/__tests__/dashboard-product-activity-click.test.ts:5`

Regression coverage for: Dashboard "Product added" activity rows were
dead clicks (_findings-log.md). dashboard-overview.tsx had dialogs wired
for sale/expense/purchase_order/prescription/stock_movement/return
activity types but no case for `type === "product"`, so clicking one set
`selectedActivity` and nothing opened.

Fix: route a "product" activity click to Inventory > Catalog with that
product's id via `?productId=`, mirroring product-database.tsx's existing
`?action=add` deep-link/cleanup mechanism, so it opens the real, current
product record instead of a stale rawActivity snapshot.

dashboard-overview.tsx pulls in useDashboardOverview() (many DB-backed
queries) and product-database.tsx pulls in useQuery/react-query, so this
follows dashboard-action-center-routes.test.ts's source-inspection
convention (no render harness) rather than mounting either component.

## block-__tests__-dashboard-ratio-denominators-test-ts-L9

`client/__tests__/dashboard-ratio-denominators.test.ts:9`

Numerator/denominator population coverage for the dashboard's ratio-style
tiles (the docs/KNOWN_BUGS.md "Dashboard ratio metrics haven't had a
numerator/denominator definition review" methodology item). Each case pins
the population a ratio's *denominator* draws from, so a future query change
can't silently put two different populations on the two sides of a
percentage again:

1. Dashboard "x% vs yesterday": today's side has always been net of
   refunds, but yesterday's was gross, so any refund at all reported a fake
   drop. refundsYesterday makes both sides net.
2. BI "Net Sales +x% vs last period" / "Avg. Transaction +x%": the current
   period is Net Sales (total_amount - tax - refunds); the previous period
   was raw, tax-inclusive total_amount.
3. BI "Total Customers +x% vs last period": the value is the all-time
   customer count, but the baseline counted only customers created *during*
   the previous window.
4. Stock "Total stock value, +x% from last month": the card's value counts
   every non-deleted batch (getStockBatchStats), while the percentage's
   baseline counted only is_active = 1 batches.

## line-__tests__-dashboard-ratio-denominators-test-ts-L97

`client/__tests__/dashboard-ratio-denominators.test.ts:97`

Denominator (yesterday): same definition - gross 1000 less the 400
refund *issued yesterday*. Neither today's nor an older day's refund
may leak into it.

## line-__tests__-dashboard-ratio-denominators-test-ts-L139

`client/__tests__/dashboard-ratio-denominators.test.ts:139`

Refunds come back netted to their EX-VAT share (total_refunded is
VAT-inclusive, revenue-minus-tax is not - see totalRefundsData in
reports.ts): r-prev 200 * (1000 - 100)/1000 = 180, r-curr
500 * (2000 - 200)/2000 = 450.
Previous-period Net Sales = 1000 - 100 tax - 180 refunds = 720; the
current period's own figure is 2000 - 200 - 450 = 1350. Both sides of
revenueChange/avgTransactionChange now come from the same definition.

## line-__tests__-dashboard-ratio-denominators-test-ts-L171

`client/__tests__/dashboard-ratio-denominators.test.ts:171`

The card's value is the all-time count (3 live customers), so its
baseline must be the all-time count as of the window start: c-old +
c-prev = 2. Counting only the previous window's signups (1) turned
"+x%" into total-over-one-window's-signups nonsense.

## line-__tests__-dashboard-ratio-denominators-test-ts-L197

`client/__tests__/dashboard-ratio-denominators.test.ts:197`

10*100 + 5*100 + 2*100 = 1700; the soft-deleted batch is excluded from
both. The percentage's baseline is derived from currentValue, so it has
to start from the very number the card displays.

## block-__tests__-dashboard-stat-card-navigation-test-tsx-L11

`client/__tests__/dashboard-stat-card-navigation.test.tsx:11`

A dashboard figure is a question — "which sales?", "which products?" — and
the answer is a screen that already exists. A card with no `href` is a card
whose figure is itemised nowhere, and it must keep looking inert.

## block-__tests__-data-settings-dev-server-selector-test-tsx-L47

`client/__tests__/data-settings-dev-server-selector.test.tsx:47`

Settings > Data is the only place to repoint the API server once signed
in: ServerSelector also renders on the pre-login landing page
(app/page.tsx), but a device that's logged in before skips straight to
/dashboard and never sees that page again.

## line-__tests__-date-picker-input-test-ts-L10

`client/__tests__/date-picker-input.test.ts:10`

"11/2027" -> raw digits "112027" -> day "11" is fine, but the next
digit ("2") would make the month segment start with 2, which is
impossible (no month > 12), so it gets dropped there.

## block-__tests__-date-range-local-time-test-ts-L3

`client/__tests__/date-range-local-time.test.ts:3`

Regression test: toQueryRange() anchored a date-only picker value to
literal UTC midnight (`${date}T00:00:00.000Z`), but every store-local
timestamp it's compared against (sales.transaction_date,
returns.created_at, etc.) is a real UTC instant of a LOCAL calendar day -
the dashboard/daily-close bucket by local time via SQLite's 'localtime'
modifier. Anchoring to UTC midnight instead shifted every report's
day/month boundaries by the store's UTC offset relative to the
dashboard.

Runs with TZ=Africa/Lagos (UTC+1) so local and UTC genuinely differ,
proving the fix rather than coincidentally passing in a UTC test env.

## line-__tests__-date-range-local-time-test-ts-L45

`client/__tests__/date-range-local-time.test.ts:45`

2026-09-20T23:30:00.000Z is local 2026-09-21T00:30 (Lagos) - genuinely
"on" 2026-09-21 locally. The old UTC-midnight bound
(2026-09-21T00:00:00.000Z) would have excluded it.

## line-__tests__-date-utils-test-ts-L45

`client/__tests__/date-utils.test.ts:45`

Medium bug fix: right at the local-midnight/UTC-midnight boundary
(this suite runs in Africa/Lagos, UTC+1), the old UTC-parsed version
of this exact expiry date hadn't started counting as "expired" yet;
local-midnight parsing correctly flips it.

## line-__tests__-date-utils-test-ts-L66

`client/__tests__/date-utils.test.ts:66`

Medium bug fix: a bare date-only string (stock_batches.expiry_date's
actual shape) used to be parsed as UTC midnight via new Date(), not
local midnight - in a positive-UTC-offset timezone (this suite runs
in Africa/Lagos, UTC+1) that's 1 hour LATER than the store's actual
local midnight for that date, which can push the truncated day count
up by one right at a day-boundary edge.

## line-__tests__-date-utils-test-ts-L74

`client/__tests__/date-utils.test.ts:74`

Old (UTC-midnight) parsing of '2024-01-11' landed exactly on a day
boundary relative to this "now" and rounded up to 10; local-midnight
parsing correctly gives 9.

## line-__tests__-db-backup-restore-test-ts-L9

`client/__tests__/db-backup-restore.test.ts:9`

A real (minimal) SQLite file header - restoreDatabaseFromFile() rejects
anything that doesn't start with these exact 16 bytes before it ever
touches the live db/file.

## block-__tests__-db-backup-restore-test-ts-L32

`client/__tests__/db-backup-restore.test.ts:32`

These tests exercise the real orchestration logic in
backupDatabaseToFile()/restoreDatabaseFromFile() (lib/db/core.ts) against
a fake `db` connection and mocked Tauri plugins. They can't prove the
native dialogs or VACUUM INTO actually work inside a real Tauri runtime
(that needs a live desktop/mobile build), but they do prove the JS-side
control flow is correct: the right calls happen in the right order with
the right arguments, and cancelling a dialog doesn't touch the database.

## line-__tests__-db-backup-restore-test-ts-L127

`client/__tests__/db-backup-restore.test.ts:127`

The close() call must happen before the FINAL (restore) copy, not
after: copying over a file that's still open/locked by the old
connection is exactly the kind of bug that would only surface on a
real desktop run, not in a mock that doesn't enforce ordering by
default.

## line-__tests__-db-backup-restore-test-ts-L146

`client/__tests__/db-backup-restore.test.ts:146`

Without this, a raw copy of the live db file can miss committed
transactions still sitting in the -wal sidecar (WAL journaling is
enabled), making the pre-restore safety net silently incomplete.

## line-__tests__-db-backup-restore-test-ts-L186

`client/__tests__/db-backup-restore.test.ts:186`

The pre-restore snapshot copy is fine (it ran before close()), but
the actual restore copy (source -> live db) must NOT have happened -
proceeding past a failed close risks stale -wal/-shm sidecars
replaying old data over the freshly-copied file.

## block-__tests__-db-error-screen-reset-dialog-test-tsx-L4

`client/__tests__/db-error-screen-reset-dialog.test.tsx:4`

Regression coverage for A-14 (docs/KNOWN_BUGS.md), UI half: the recovery
button used the native `window.confirm`, which `.agents/AGENTS.md` §9
forbids, and its handler never touched the IndexedDB database.

## block-__tests__-db-reset-clears-indexeddb-test-ts-L3

`client/__tests__/db-reset-clears-indexeddb.test.ts:3`

Regression coverage for A-14 (docs/KNOWN_BUGS.md): the "Reset App Data"
button on the database-init error screen cleared `localStorage` and
reloaded, but the database itself lives in IndexedDB under `dumosrx_db` —
so the corrupt blob survived the "reset", the same error screen came back,
and the user had lost their session for nothing.

## line-__tests__-db-transaction-test-ts-L4

`client/__tests__/db-transaction.test.ts:4`

transaction() persists via idb-keyval when not running in Tauri; stub it
out since jsdom has no real IndexedDB and we only care about the SQL
transaction semantics here, not persistence.

## block-__tests__-db-transaction-test-ts-L12

`client/__tests__/db-transaction.test.ts:12`

Exercises the real transaction()/query()/execute() implementation in
lib/db/core.ts against a genuine in-memory SQLite engine (sql.js), not a
mock, so these tests actually prove BEGIN/COMMIT/ROLLBACK behave
correctly, which is exactly what mocking query()/execute() elsewhere in
the suite can't tell us.

## line-__tests__-db-transaction-test-ts-L80

`client/__tests__/db-transaction.test.ts:80`

Nesting (calling transaction() from inside another transaction()'s `fn`)
used to run the inner call inline against the outer's already-open
transaction. That capability is retired — see transaction()'s own
comment in core.ts — because the same `inTransaction` flag that made
nesting work couldn't tell it apart from two unrelated top-level calls
that merely overlap in time, which was the actual bug this file's other
tests cover. Composed writes that need to run inside an already-open
transaction (e.g. requeueOrphanedRows() in reconcile-identity.ts) now
call query()/execute() directly instead of transaction() again.

## block-__tests__-db-transaction-test-ts-L110

`client/__tests__/db-transaction.test.ts:110`

Regression test for a real bug found via code review: `inTransaction`
used to be the only guard against nested BEGINs, but it's a plain
module-level boolean, not scoped to one call chain. Two *unrelated*
top-level transaction() calls that merely overlap in wall-clock time
(e.g. a background sync mid-flight when the cashier records a sale)
both saw the same flag: the second call would see it already true and
run inline against the first's still-open transaction, so the first's
rollback silently took the second's already-"successful" writes down
with it. transaction() now queues unrelated top-level calls so their
BEGIN/COMMIT pairs can never interleave.

## block-__tests__-deferred-stock-delta-chronic-reporting-test-ts-L9

`client/__tests__/deferred-stock-delta-chronic-reporting.test.ts:9`

A-173. The open question was whether an unresolved deferred delta is
retried or dropped. It is **retried and never dropped** — the row stays in
`_pending_stock_deltas` until its batch arrives, so on-hand stock is
incomplete, never silently wrong.

The real defect is the reporting. `attempts === REPORT_AFTER_ATTEMPTS` is a
strict equality, so a delta reports exactly once, on its tenth attempt, and
is then silent forever. A permanently unresolvable delta — a batch older
than the pull cursor never arrives again — therefore looks like a
transient blip that resolved itself, which is the opposite of the truth.

## line-__tests__-deferred-stock-delta-chronic-reporting-test-ts-L113

`client/__tests__/deferred-stock-delta-chronic-reporting.test.ts:113`

Quantity 0, the way the pull writes an arriving batch: `pull.ts` strips
the server's figure, and the drain rebuilds from the log rather than
adding the stored delta back on top of it.

## block-__tests__-deleted-entity-procurement-history-test-ts-L9

`client/__tests__/deleted-entity-procurement-history.test.ts:9`

Pins the load-bearing ABSENCE of a `_deleted = 0` filter on the `products`
and `suppliers` joins in procurement.ts, local-database.ts and
stock-transfers.ts, documented in client/AGENTS.md ("The
deactivate-vs-delete design"). Purchase orders, stock movements and stock
transfers must still name the product and the vendor they were placed
against after either is deleted; filtering those joins blanks the name
(vendor_name falls back to "Self / Walk-in Purchase") or drops the row, and
every test here goes red when that filter is added.

## block-__tests__-deleted-product-report-history-test-ts-L9

`client/__tests__/deleted-product-report-history.test.ts:9`

Pins the load-bearing ABSENCE of a `_deleted = 0` filter on reports.ts's
`products` joins, documented in client/AGENTS.md ("The deactivate-vs-delete
design"). deleteProduct() is a non-cascading soft delete, so a sold product
that is later deleted must still resolve its name and category on every
sale it already appears in. Adding a deleted filter to any of the joins
below silently blanks or drops those historical rows, and every test here
goes red when it is added.

## block-__tests__-deleted-product-sales-history-test-ts-L9

`client/__tests__/deleted-product-sales-history.test.ts:9`

Pins the load-bearing ABSENCE of a `_deleted = 0` filter on the `products`
joins in sales.ts and customers.ts, documented in client/AGENTS.md ("The
deactivate-vs-delete design"). A receipt, a transaction list or a customer's
purchase history must still name a product that has since been deleted;
filtering the join blanks the name or drops the line entirely, and every
test here goes red when that filter is added.

## block-__tests__-device-diagnostics-queries-test-ts-L9

`client/__tests__/device-diagnostics-queries.test.ts:9`

The diagnostics console exists because none of this was reachable from
inside the app during the 2026-10-08 incident: the sync queue, how far each
table had synced, unapplied stock deltas and unresolvable categories all had
to be relayed by hand or guessed at. See
docs/superpowers/specs/2026-10-08-device-diagnostics-console-design.md.

Everything it runs must be a SELECT.

## block-__tests__-device-report-command-test-ts-L31

`client/__tests__/device-report-command.test.ts:31`

The ordinary telemetry channel fails exactly when it is needed: crash rows
live in `feedback`, which rides the sync queue, so a till whose push is
jammed stops reporting at the moment it has most to say.

## block-__tests__-devtools-hooks-binding-test-ts-L4

`client/__tests__/devtools-hooks-binding.test.ts:4`

devtools-hooks.ts imports from ./index, and index.ts imports it for its side
effect — a deliberate cycle, taken so index.ts stays under the 350-line
limit. It is safe only because the imported exports are function
DECLARATIONS and therefore hoisted: converting either to
`const fn = () => {}` would make these hooks silently undefined. This test
is the guard for that.

## block-__tests__-diagnose-legacy-schema-test-ts-L10

`client/__tests__/diagnose-legacy-schema.test.ts:10`

Sanity check for diagnoseLegacySchema(): a device already fully on the
current schema reports clean, and a device carrying real legacy artifacts
(old table name, unmigrated stock_quantity, NOT NULL supplier_id) reports
every one of them by name. Run before trusting the tool's output against
real production/dev devices.

## line-__tests__-diagnose-legacy-schema-test-ts-L71

`client/__tests__/diagnose-legacy-schema.test.ts:71`

SCHEMA_SQL alone doesn't carry store_id on products — that column is
added by runSyncColumnMigrations at init. Add it the same way, then
leave a row with a NULL store_id, i.e. exactly what
backfillStoreIdOnLegacyRows exists to repair.

## line-__tests__-diagnostics-detail-test-ts-L60

`client/__tests__/diagnostics-detail.test.ts:60`

A sync last_error's first 300 chars can be the SQL head with bound
values — a password hash, a customer's details. The class is safe to
put on screen and in a pasted ticket; the raw string is not.

## block-__tests__-diagnostics-report-truncation-test-ts-L8

`client/__tests__/diagnostics-report-truncation.test.ts:8`

`feedback.content` is a MySQL TEXT column (65,535 bytes) and `/support`
caps `message` at MAX_REPORT_CHARS, so an over-long report used to be lost
whole — on exactly the till with the most to say. Rationale in
laravel-server/AGENTS.md, "Remote device report".

## block-__tests__-duplicate-name-reconciliation-test-ts-L15

`client/__tests__/duplicate-name-reconciliation.test.ts:15`

Regression test for a real incident: SyncController::push silently skips
inserting a category/supplier whose name collides with one the server
already has for the same owner (see its "duplicate name" handling),
remapping the id only in that single request's in-memory $idMap. A local
row created before this reconciliation runs was otherwise permanently
unresolvable: every retry re-attempted the same insert, got skipped
again, and anything referencing it by the old local id kept failing its
foreign key check forever. This proves pull.ts detects the same
collision (by name) and remaps every local reference to the server's id.

## line-__tests__-duplicate-name-reconciliation-test-ts-L45

`client/__tests__/duplicate-name-reconciliation.test.ts:45`

store_id arrives by runtime migration, not SCHEMA_SQL. Added here, before
any pull warms getValidColumns()'s per-table cache, so a pulled row
actually lands with its store_id.

## block-__tests__-editable-number-cell-leading-zero-test-tsx-L5

`client/__tests__/editable-number-cell-leading-zero.test.tsx:5`

Regression coverage: the `[value]` resync effect fires whenever the
`value` PROP changes while the field is idle — by design, so an external
update (another row's edit recalculating this one, or a value arriving
from elsewhere while this cell happens to still be mounted) is picked up.
Before the fix, that resync ran even while the field was focused and
mid-edit: if `value` changes to something new WHILE the user is still
typing (e.g. this cell's `onCommit` round-tripping a parsed number back
into a parent's state, or truly external data landing mid-entry), the
effect immediately overwrote the in-progress text with `String(value)` —
clobbering a leading-zero decimal like "0.05" the moment the numeric
value changed underneath the still-being-typed text. See
docs/KNOWN_BUGS.md.

Note: a plain sequential keystroke test (typing "0", "0.", "0.0", "0.05"
one onChange at a time) does NOT reproduce this even against the unfixed
component — verified directly by reverting the `isFocused` guard and
re-running such a test, which still passed. That's because React bails
out of re-rendering (and therefore re-running the `[value]` effect) when
a state setter is called with a value equal to the current one, and every
intermediate keystroke in that specific sequence either doesn't change
the parsed number or changes it to exactly what `String()` of the new
value already matches. The real trigger is an ordinary React re-render
that hands the input a genuinely different `value` prop while it's
focused — reproduced directly below via `rerender`, which is exactly
what the `[value]` effect's own dependency is watching.

## line-__tests__-editable-number-cell-leading-zero-test-tsx-L35

`client/__tests__/editable-number-cell-leading-zero.test.tsx:35`

Starts at a nonzero committed value (e.g. an existing selling price)
so that a later rerender to a genuinely different `value` actually
changes the effect's dependency — a rerender back to the SAME value
wouldn't exercise the guard at all (React skips an unchanged effect
dependency regardless of the fix).

## line-__tests__-editable-number-cell-leading-zero-test-tsx-L54

`client/__tests__/editable-number-cell-leading-zero.test.tsx:54`

...but before blur, something else legitimately changes `value` to a
DIFFERENT number (a sibling row's recalculation, a sync pull, or this
component's own onCommit round-tripping through a parent whose state
update lands on a later render pass) — here simulated as the value
resetting to 0. The OLD behavior resynced the displayed text to this
new value immediately, clobbering "0.05" back down to "0" mid-entry
even though the field is still focused and the user isn't done typing.

## block-__tests__-editable-number-cell-leading-zero-test-tsx-L89

`client/__tests__/editable-number-cell-leading-zero.test.tsx:89`

A cycle-count row nobody has reached yet has no counted quantity at all,
which is not the same as a count of zero - so the cell has to be able to
render and report "empty". Callers that pass no `onClear` keep the
original behaviour: blurring an emptied field reverts to the last
committed number.

## block-__tests__-elapsed-interval-guard-test-ts-L4

`client/__tests__/elapsed-interval-guard.test.ts:4`

A-247/A-234: a device whose clock is ahead writes that future time into
localStorage, and a `now - stored < interval` guard then reads it as "just
ran" and skips. The daily health check is one of those guards, and since
2026-10-14 it carries the stock-drift repair, so a fast clock on one till
silently switches off the cure for that till.

## block-__tests__-eod-summary-and-pos-suggestion-queries-test-ts-L9

`client/__tests__/eod-summary-and-pos-suggestion-queries.test.ts:9`

The end-of-day summary reads (payment-method totals, transaction count,
top staff) and the POS's two product-suggestion rankings were all
uncovered. The summary reads are what a pharmacy reconciles its cash
drawer against, and all three bound the day on the STORE's local wall
clock while transaction_date holds a UTC instant — the exact boundary bug
already fixed in getRecentSales.

## block-__tests__-error-boundary-reset-is-not-the-obvious-click-test-tsx-L13

`client/__tests__/error-boundary-reset-is-not-the-obvious-click.test.tsx:13`

A-223's real hazard: the crash screen's remedy wiped unsynced sales. Reload
must stay the primary action and the destructive one must state its cost
before it can be reached.

## block-__tests__-expenses-pagination-test-ts-L9

`client/__tests__/expenses-pagination.test.ts:9`

getAllExpenses() read the whole expenses table - a table that grows every
day for the life of the store - and the Expenses page then filtered and
reduced all of it client-side. The list is now read a page at a time, and the
lifetime total it displays comes from a SQL SUM so it stays correct no matter
how much of the list has been loaded.

## block-__tests__-expenses-record-permission-test-tsx-L69

`client/__tests__/expenses-record-permission.test.tsx:69`

"/expenses?action=add" is typeable and is also where the dashboard
header's "Add Expense" navigates, so hiding the header action alone would
not be a gate - the dialog's own opener has to require record_expenses.

## block-__tests__-expenses-view-all-scope-test-tsx-L42

`client/__tests__/expenses-view-all-scope.test.tsx:42`

The Expenses page has always had an own-vs-all scope; until this pass it
hung off view_activity_log (the sales-side key), so the only role that
saw the whole ledger was the one holding it. view_all_expenses is the
catalog's own key for exactly this distinction.

## block-__tests__-export-filename-test-ts-L4

`client/__tests__/export-filename.test.ts:4`

A date-only export name silently overwrote the earlier file when two
exports happened on the same day, and gave no way to tell two stores'
exports apart in a Downloads folder. Hit for real on 2026-10-08.

## line-__tests__-export-staff-csv-test-ts-L41

`client/__tests__/export-staff-csv.test.ts:41`

Medium bug fix: embedded quotes/newlines weren't escaped at all (only a
comma triggered quoting), and username/email/role bypassed the quoting
function entirely - a name containing either corrupted every following
row when the CSV was opened.

## line-__tests__-export-staff-csv-test-ts-L74

`client/__tests__/export-staff-csv.test.ts:74`

A correct CSV parser treats a newline inside a quoted field as part of
the field's value, not a row separator - unquoted, it would have
corrupted every following row.

## line-__tests__-factory-reset-disconnects-cloud-test-ts-L5

`client/__tests__/factory-reset-disconnects-cloud.test.ts:5`

React 19's `act` warns unless the environment explicitly opts in.
See __tests__/onboarding-local-restore-reload.test.ts for the same harness
pattern (no @testing-library/react is installed in this repo).

## block-__tests__-factory-reset-disconnects-cloud-test-ts-L10

`client/__tests__/factory-reset-disconnects-cloud.test.ts:10`

Regression test: handleResetDatabase() ("Factory Reset" in Settings > Data)
used to only wipe local tables, leaving the device's auth_token intact. On
a cloud-linked device, resetDatabase()'s own window.location.reload()
immediately re-triggered store-context.tsx's mount-time auto-sync effect,
which did a full pull and silently re-downloaded every just-cleared table
(products, sales, stock_movements, etc.) straight back from the server -
so "Reset All Data" looked like it had barely done anything.

Fix: clear the auth token (same as a normal sign-out) before wiping local
tables, so the post-reload auto-sync effect finds no token and skips,
exactly like any other signed-out device would.

Also covers the follow-up hardening: resetDatabase() wipes audit_logs
itself, so logAction() + an immediate sync() push (while the token is
still valid) is this action's only chance to leave any trace anywhere.

## line-__tests__-factory-reset-disconnects-cloud-test-ts-L100

`client/__tests__/factory-reset-disconnects-cloud.test.ts:100`

Order matters: the token must be gone *before* resetDatabase() runs
(and reloads the page), not after - otherwise the mount-time auto-sync
effect on the reloaded page still finds a valid token and undoes the
reset by pulling everything back down.

## line-__tests__-factory-reset-disconnects-cloud-test-ts-L125

`client/__tests__/factory-reset-disconnects-cloud.test.ts:125`

The audit log must actually reach the server before the token that
would let it get there is cleared - logging it locally right before
wiping local tables (and disconnecting) would be no trace at all.

## block-__tests__-finance-reports-test-ts-L9

`client/__tests__/finance-reports.test.ts:9`

Exercises the revenue/COGS/expense aggregation queries against a genuine
in-memory SQLite engine (sql.js), not a mocked query(). These are the
numbers that feed the P&L report and dashboard, so a silent aggregation
bug here (wrong join, wrong sign, wrong date filter) is exactly the class
of bug that showed 0s in the suppliers table without ever throwing.

## line-__tests__-finance-reports-test-ts-L68

`client/__tests__/finance-reports.test.ts:68`

getCurrentMonthRevenue/getCurrentMonthCOGS take an explicit local-timezone
window rather than relying on SQLite's UTC-based strftime('now'), matching
how use-finance-data.ts derives it.

## line-__tests__-finance-reports-test-ts-L77

`client/__tests__/finance-reports.test.ts:77`

The window's `from`/`to` are UTC instants representing LOCAL midnight/
month-start (see currentMonthWindow above) - slicing the ISO string's
first 10 characters gives the UTC calendar date of that instant, which
in a positive-UTC-offset timezone (this suite runs under Africa/Lagos,
UTC+1) is the PREVIOUS day, not the local date the window actually
starts on. expenses.date is compared against these bounds via
date(?, 'localtime') (see finance.ts), so a fixture inserting an
expense must use the real local calendar date, not this UTC slice.

## block-__tests__-force-full-resync-restores-baseline-test-ts-L9

`client/__tests__/force-full-resync-restores-baseline.test.ts:9`

A-243. `forceFullResync()` deleted `_sync_state` and then pulled. The pull
only persists progress inside a committed page transaction, so a resync
whose first page never lands (A-206 throws on the fetch) left the device
with no window and no cursor at all — every later sync then a full pull
failing the same way. One till was stranded exactly that way in production
on 2026-10-12, and this function is the health check's only recovery action.

The stash lives in pull-window.ts because that module already owns every
write to `_sync_state` outside pull.ts's own progress upserts.

## block-__tests__-get-oversold-alerts-test-ts-L9

`client/__tests__/get-oversold-alerts.test.ts:9`

Regression coverage for bug #4's "floor + alert" fix
(docs/features/_known-bugs.md #4): recordSaleItemStock floors an oversold
batch's stock_batches.quantity at 0 instead of going negative, and
getOversoldAlerts() surfaces the product so staff can reconcile it.

Rewritten 2026-10-14 (A-212, and stage 1 of
docs/superpowers/specs/2026-10-14-oversell-compensating-movement-design.md):
the alert is derived from the movement log's own shortfall rather than from
the word "oversold" in a reason string inside a 30-day window. It therefore
reports what is still owed rather than that something once happened, and it
goes quiet when the shortfall is cleared rather than when a month passes.

## line-__tests__-get-oversold-alerts-test-ts-L55

`client/__tests__/get-oversold-alerts.test.ts:55`

The alert is withheld until this device's movement window is drained, so
the fixture has to say it is: mid-catch-up, a sale can arrive pages
before the receipt that covers it.

## line-__tests__-get-oversold-alerts-test-ts-L117

`client/__tests__/get-oversold-alerts.test.ts:117`

Backdated well outside the window the old alert used. The two units the
ledger owes have not gone anywhere, and the next delivery against this
batch will still pay them off before it adds anything (A-265), so going
quiet after a month was the defect, not the feature.

## line-__tests__-get-oversold-alerts-test-ts-L145

`client/__tests__/get-oversold-alerts.test.ts:145`

+3, not +2: this batch's own single unit was never logged as inbound
either, so the log is short by the whole three it recorded going out.
That is also exactly what an inbound movement has to cover before the
figure on screen moves, which is what the alert is reporting.

## line-__tests__-get-oversold-alerts-test-ts-L158

`client/__tests__/get-oversold-alerts.test.ts:158`

Seeded with stock and no movement at all, the pre-a36b00e7 import shape:
its sales sum below zero but the units were on the shelf, so nothing is
owed and a count against it is not absorbed.

## block-__tests__-get-recent-sales-date-range-test-ts-L4

`client/__tests__/get-recent-sales-date-range.test.ts:4`

getRecentSales's undated form caps at LIMIT 100 - fine for a general
"recent sales" list, but wrong for use-my-today-sales.ts's "my sales
today" total, which used to call it undated and filter for "today"
client-side afterward: a cashier who personally rang more than 100
sales today would have the earliest ones silently dropped before the
"is today" filter even ran. Passing a dateRange raises the cap to 500
and does the filtering in SQL instead - this covers that the higher cap
actually applies and every same-day row comes back.

## block-__tests__-get-store-permission-groups-malformed-row-test-ts-L9

`client/__tests__/get-store-permission-groups-malformed-row.test.ts:9`

Regression coverage (final review, Important I8): getUserPermissionGroup
already guards its JSON.parse with try/catch, but getStorePermissionGroups
didn't - one malformed/legacy `permissions` value (see also Critical C1,
a real way such a value could arrive via sync before that fix) took out
the ENTIRE Roles & Permissions matrix and the staff form's Group
dropdown, instead of degrading to just that one row.

## block-__tests__-get-user-permission-group-malformed-row-test-ts-L9

`client/__tests__/get-user-permission-group-malformed-row.test.ts:9`

getUserPermissionGroup returned null for BOTH "no group assigned" and
"malformed JSON in permissions", and hasPermission's fallback
(`group?.permissions ?? fallbackPermissions(role)`) then granted the full
ROLE-TIER defaults for a corrupt row - a silent privilege reversion to
pre-feature behavior where a safe deny was wanted.

The two cases are distinguishable, so conflating them was never necessary:
fallbackPermissions exists for the offline/pre-sync gap, where NO row exists
yet (see its own doc comment). A malformed row is the opposite situation - the
row did sync, it is just corrupt - so it now denies instead, matching what
getStorePermissionGroups already did for the same corruption.

A store_owner/super_admin still can't be locked out: hasPermission
short-circuits to "everything granted" for those roles before any group is
consulted.

## block-__tests__-has-multi-store-access-test-ts-L4

`client/__tests__/has-multi-store-access.test.ts:4`

multi_store used to be a separately admin-configured boolean, independent
of the `stores` numeric limit — which let them disagree (Pro sold 3
stores while multi_store stayed false). Deriving it from the limit
instead removes that whole class of drift: a store limit of 1 can never
mean "multi-store," and anything above 1 always does.

## block-__tests__-has-permission-group-user-mismatch-test-ts-L3

`client/__tests__/has-permission-group-user-mismatch.test.ts:3`

A-55: on a lock-screen "switch account" (user -> user, no logout in
between) AuthContext still holds the OUTGOING user's permission group
until the async read for the incoming user resolves. hasPermission() must
therefore refuse to evaluate a group that belongs to someone else and
fall back to the incoming user's role tier instead.

## block-__tests__-header-action-permission-test-ts-L7

`client/__tests__/header-action-permission.test.ts:7`

PAGE_ROUTES' `actionPermission` is how a route's header action moves off
the coarse actionAdminOnly/canManageStockBatch baseline onto a specific
key. Procurement's "Create Order" is manage_purchase_orders and Vendors'
"Add Supplier" is manage_suppliers; the callback defaults to granting
everything so untouched routes and existing callers behave exactly as
they did.

## line-__tests__-header-store-switcher-tooltip-test-tsx-L22

`client/__tests__/header-store-switcher-tooltip.test.tsx:22`

Tooltip content only mounts on real hover via Radix's own timers; mocked
here (matching the established pattern in assistant-launcher-plan-gate.
test.tsx) so the test can assert on its content directly without
simulating pointer events.

## block-__tests__-header-store-switcher-tooltip-test-tsx-L38

`client/__tests__/header-store-switcher-tooltip.test.tsx:38`

A-158 follow-up: the store name in the header is truncated
(`truncate max-w-[...]`) for both the plain non-admin label and the admin
switcher button, with nothing to reveal the full name once it's cut off.
Reported live by the user.

## line-__tests__-header-store-switcher-tooltip-test-tsx-L72

`client/__tests__/header-store-switcher-tooltip.test.tsx:72`

Without a tooltip, the truncated label itself already renders the
full text node (CSS-only truncation) - the real assertion is that a
second copy exists inside the mocked TooltipContent.

## block-__tests__-health-sync-control-retired-test-tsx-L9

`client/__tests__/health-sync-control-retired.test.tsx:9`

A-213: the endpoint refuses with 410 and is not coming back until the
`opening_quantity` work lands, so the UI must stop advertising it. The code
path itself stays — only the invitation goes.

## block-__tests__-heavy-dependency-laziness-test-ts-L5

`client/__tests__/heavy-dependency-laziness.test.ts:5`

exceljs and @react-pdf/renderer are the two heaviest dependencies in the
client, and both used to be pulled into ordinary route chunks by modules
that are imported for other reasons:

- exceljs reached Inventory > Catalog through
  product-database-filters -> import-export-toolbar ->
  product-import-export -> spreadsheet-io.
- @react-pdf/renderer reached the catalog, daily-close and
  purchase-order-details chunks because report-pdf.tsx also happened to
  hold downloadBlob, a ten-line dependency-free helper.

Both are now behind `await import(...)` inside the functions that actually
need them, so they only ship when a user exports or prints something. These
guards fail if a static value import is reintroduced - an easy accident,
since the static version type-checks and works fine.

## line-__tests__-heavy-dependency-laziness-test-ts-L61

`client/__tests__/heavy-dependency-laziness.test.ts:61`

The transitive route matters as much as the direct one: purchase-order-pdf
statically imports @react-pdf/renderer, so a static value import of the
wrapper puts the heavy dependency back in the Orders chunk and makes the
`await import("@react-pdf/renderer")` above buy nothing.

## block-__tests__-held-transactions-recall-permission-test-tsx-L64

`client/__tests__/held-transactions-recall-permission.test.tsx:64`

Resuming a parked sale is the other half of "hold_sales". The held list
itself stays visible without the permission (seeing that a colleague's
sale is parked on this till is ordinary awareness, matching the
apply_discounts rule that already-applied state still renders); only the
Recall trigger is gated.

## block-__tests__-helpers-fake-batch-quantity-ts-L11

`client/__tests__/helpers/fake-batch-quantity.ts:11`

What `insert("stock_movements", …)` now does to the batch it names, for the
in-memory fakes that stub out `@/lib/db/local-database` — see
`resolveBatchQuantity()` in `lib/db/batch-quantity.ts`, which this mirrors.
Call it after the movement has been pushed onto `movements`, the way the
real hook runs after the row is written. `applied: false` mirrors
`movementChange(q, false)`, i.e. a soft-delete: pass the movement's own
quantity and mark it `_deleted` in `movements` first.

## block-__tests__-helpers-input-otp-timers-ts-L9

`client/__tests__/helpers/input-otp-timers.ts:9`

Call from any test file that mounts an OTP input (`components/ui/input-otp`,
or anything embedding it: PinEntry, StaffFormFields, ConfirmDialog's PIN
step, LockScreen, the register step).

`input-otp` schedules three `setTimeout`s on mount and clears none of them
on unmount; each one ends in a React `setState`. A test file that finishes
while one is still pending has it delivered AFTER Vitest has torn that
file's jsdom environment down, at which point React's
`resolveUpdatePriority` reads `window` and throws `ReferenceError: window
is not defined` as a process-level uncaught exception. Every test still
passes and the run still exits 1 — see client/AGENTS.md, "All tests passed
but the run still exited 1". Draining the timers here, while `window` is
still alive, keeps them entirely inside the test file that created them.

## block-__tests__-htaccess-no-cache-html-test-ts-L5

`client/__tests__/htaccess-no-cache-html.test.ts:5`

A-158 follow-up: nothing in .htaccess told the browser (or any
intermediate proxy/CDN) that an HTML document shouldn't be cached
long-term, leaving index.html/page documents subject to the browser's own
heuristic HTTP caching with no explicit freshness rule. Combined with
sw.js's navigate handler not forcing `cache: "no-store"` either (see
sw-navigate-no-store.test.ts), a device could get served a stale page
document even on what the app believes is a fresh "network first"
fetch - reproducible live as Sentry DUMOSRX-CLIENT-F (one device stuck
replaying the same stale release 178 times, unable to reach /inventory's
catalog tab).

## block-__tests__-impersonation-banner-stale-flag-test-ts-L7

`client/__tests__/impersonation-banner-stale-flag.test.ts:7`

Regression coverage for two issues in this banner's "End Session" button:

1. (Original bug this file covered) A real user report: "Logged in
   normally but I'm seeing impersonation mode at the top." Root cause:
   the banner's only signal is a localStorage flag
   (impersonator_handoff_return_code) written once by
   app/auth/callback/page.tsx when a superadmin's impersonation handoff
   lands. A normal logout, a crash, or just closing the impersonated tab
   left it behind forever; any later ordinary PIN login on that same
   device/browser then showed a permanent "Impersonation Mode" banner.
   The corresponding auth-context.tsx fix (clearing the same flag on
   every ordinary login/logout path) isn't covered here since those
   paths require mocking most of the local-database layer; this covers
   the fully self-contained half (dismissing when no flag is present).

2. (docs/KNOWN_BUGS.md M4) The stored return code is a one-time,
   60-SECOND-lived handoff code minted back when impersonation *started*
   — every admin who spent more than a minute impersonating (the normal
   case, not an edge case) previously hit a "session expired" dead end on
   click, because "End Session" tried to redeem that stale code. Fixed
   to rely on the admin's own independent, long-lived HttpOnly refresh
   cookie instead: clicking "End Session" now navigates straight to
   /admin with no code redemption at all, regardless of how long
   impersonation lasted.

## line-__tests__-impersonation-banner-stale-flag-test-ts-L58

`client/__tests__/impersonation-banner-stale-flag.test.ts:58`

jsdom throws "Not implemented: navigation" on a real
`window.location.href` assignment - replace it with a plain object
so the assignment can be observed instead.

## block-__tests__-import-export-toolbar-export-permission-test-tsx-L4

`client/__tests__/import-export-toolbar-export-permission.test.tsx:4`

"export_product_list" fronts the catalog's Export dropdown - taking a
copy of the whole product list (cost columns included) off the device.
Import is a different right and stays under manage_products, so the
toolbar keeps a working control rather than emptying out.

## block-__tests__-init-database-concurrency-test-ts-L11

`client/__tests__/init-database-concurrency.test.ts:11`

initDatabase() has no guard against being called again before the first
call finishes: query()/execute()/transaction()/etc. each independently do
`if (!db) await initDatabase()`, and `db` stays null for the whole async
duration of the first call (WASM load + IndexedDB read + schema run). At
real app startup several of those fire around the same time (dashboard
widgets, license check, etc.), so multiple callers race past the null
check and each run the full body - including registering their own Web
Lock request via initWriterLock(). Observed live in the browser: a single
tab ended up with 14+ duplicate pending lock requests for itself, which
broke the writer-handoff feature (a tab dropping the lock to hand off
could immediately re-grant itself the lock from one of its own leftover
duplicate requests).

## line-__tests__-init-database-concurrency-test-ts-L42

`client/__tests__/init-database-concurrency.test.ts:42`

core.ts's own initSqlJs({locateFile: f => `/${f}`}) can't resolve the
wasm binary under Node - warm the package's internal wasm cache first
with a real resolvable path (same trick init-database-migrations.test.ts
uses), so core.ts's later call reuses it instead of failing outright.

## block-__tests__-init-database-migrations-test-ts-L11

`client/__tests__/init-database-migrations.test.ts:11`

Exercises the real initDatabase() web/sql.js migration path end-to-end.
The bulk of initDatabase()'s legacy-repair migrations (medicines/vendors/
store_profile/stock_batch renames, owner->store_owner, stock_quantity
data migration, purchase_orders.vendor_id drop, sale_items.inventory_id
rename, users username-uniqueness rebuild) have all been removed: every
real account was confirmed (via diagnoseLegacySchema(), run against the
account that predated each one) to already be clear of the artifact each
step existed to repair. What remains — relaxPurchaseOrdersSupplierIdNullable
and backfillStoreIdOnLegacyRows — shipped 2026-08-14/08-29, comfortably
after any real account, and is still active. Existing suites all bypass
initDatabase() via __setDatabaseForTesting, so this is the only test that
would catch a regression in this path.

## line-__tests__-init-database-migrations-test-ts-L29

`client/__tests__/init-database-migrations.test.ts:29`

clearLegacyTransactionsOnce wipes sales/purchase_orders/etc the first
time it ever runs on a device (see core.ts); a real production device
crossed that one-off flag long ago, so simulate that here too — this
test cares about the schema migrations, not that unrelated cleanup.

## line-__tests__-init-database-migrations-test-ts-L76

`client/__tests__/init-database-migrations.test.ts:76`

Table was rebuilt to relax NOT NULL; verify a null supplier_id insert
(an Immediate Purchase / walk-in) is now actually accepted, and the
pre-existing row's supplier_id was carried over.

## line-__tests__-init-database-migrations-test-ts-L118

`client/__tests__/init-database-migrations.test.ts:118`

A Pro/Enterprise store already using the loyalty program before this
migration must see zero behavior change: the new column must default
existing rows to 1 (ON), never 0 — 0 would silently pause the feature
for every store currently using it.

## block-__tests__-init-database-migrations-test-ts-L162

`client/__tests__/init-database-migrations.test.ts:162`

A-305: `_sync_state` was keyed by `table_name` alone, so one watermark
served every store. SQLite cannot alter a primary key, so the fix rebuilds
the table — and that rebuild must carry a real device's existing
watermarks over, stamped with its store, or every table re-pulls from
scratch on the next sync.

## block-__tests__-init-database-migrations-test-ts-L208

`client/__tests__/init-database-migrations.test.ts:208`

A watermark on a device holding two stores cannot be attributed to either
of them — attributing it wrongly is the whole of A-305 — so it is parked
under '' and each store's first pull starts fresh.

## block-__tests__-init-database-migrations-test-ts-L240

`client/__tests__/init-database-migrations.test.ts:240`

The rebuild is CREATE / copy / DROP / RENAME with no transaction, so a
process death between the copy and the DROP leaves a populated
`_sync_state_scoped` behind. Without dropping it first, the retry's copy
hits the composite primary key on every later boot, is swallowed by the
catch, and the device's pulls fail on a missing column for ever — silently.

## block-__tests__-inventory-batches-dead-route-test-tsx-L4

`client/__tests__/inventory-batches-dead-route.test.tsx:4`

/inventory/batches is in generateStaticParams but
stock-batch-management.tsx renders no <TabsContent> for it, so the route
resolved to a blank panel. Three things pointed at it — the Stock
Inventory header action ("Add Batch", ?action=add, which nothing handles),
the Needs Attention card and an action-centre alert — so the fix belongs
on the route, not on any one caller: it redirects to the Catalog tab, the
all-products view those callers actually meant.

## block-__tests__-inventory-stock-alerts-test-ts-L13

`client/__tests__/inventory-stock-alerts.test.ts:13`

getLowStockAlerts, getExpiryAlerts and getExpiringBatches were uncovered
despite carrying the subtlest rule in the stock layer: what counts as
on-hand. Low stock deliberately ignores expired and deactivated batches
(stock the sale path can't dispense), the expiry alert covers only the
next 30 days and deliberately drops already-expired batches, while the
expiring-batches list deliberately keeps them.

## block-__tests__-launch-not-gated-on-sync-test-tsx-L7

`client/__tests__/launch-not-gated-on-sync.test.tsx:7`

A-7 (docs/KNOWN_BUGS.md): every online launch was gated behind a full
push+pull round. LicenseGuard's performCheck() awaited
`Promise.race([sync(true), 5 s timeout])` while rendering <SplashScreen/>,
so first paint cost up to five seconds on a slow or captive-portal
network — and the effect's storeProfile dependencies re-fired it as the
profile settled, firing a second sync(true). StoreProvider fired a third
sync() of its own on mount.

The app must paint from local state immediately, and the launch sync must
have exactly one owner.

## block-__tests__-license-blocked-card-admin-entry-test-tsx-L59

`client/__tests__/license-blocked-card-admin-entry.test.tsx:59`

This card replaces the WHOLE app — LicenseGuard returns it instead of its
children — so without an admin entry here a clock-tampered till could never
be unlocked by an admin standing in front of it. It is the one path in this
feature with no fallback.

## block-__tests__-license-blocked-card-clock-cause-test-tsx-L25

`client/__tests__/license-blocked-card-clock-cause.test.tsx:25`

A-266: a customer desktop keeps losing its date, which locks the till on
every power cut until the clock is corrected and verified online. The lock
is right, but a screen that only says "Clock Discrepancy" gets blamed on the
software; one that names the coin cell gets the ₦500 part replaced once.

## block-__tests__-license-clock-reconciliation-test-ts-L3

`client/__tests__/license-clock-reconciliation.test.ts:3`

Covers the only route out of a clock-discrepancy lock (docs/KNOWN_BUGS.md
A-191). A device whose wall clock ran fast poisons
stores.last_monotonic_time with a future value; correcting the clock then
reads as a rollback and locks the till out permanently, because the pull
strips that column and a factory reset preserves it.

The recovery is deliberately ONLINE-ONLY: the store owner is the party a
backdating check exists to stop, so there is no offline override.
See docs/superpowers/specs/2026-10-08-license-clock-recovery-design.md.

## block-__tests__-license-guard-check-failure-test-tsx-L4

`client/__tests__/license-guard-check-failure.test.tsx:4`

LicenseGuard's performCheck() had no try/catch around
`await checkLicenseStatus()` (components/auth/license-guard.tsx) - only
the cloud-sync call above it was guarded. If checkLicenseStatus() throws
for any reason, the async function rejects before reaching
setLoading(false), so `loading` stays true forever and SplashScreen (a
`fixed inset-0 z-[100]` overlay) renders permanently, covering the whole
app - including DatabaseProvider's read-only-tab banner underneath it at
z-50, making its "Use this window instead" handoff button invisible and
unclickable.

Observed live: on a read-only tab, checkLicenseStatus() itself calls
updateStoreMonotonicTime() (a write), which throws because the tab is
read-only - exactly this scenario.

## line-__tests__-license-guard-check-failure-test-tsx-L65

`client/__tests__/license-guard-check-failure.test.tsx:65`

Must resolve out of the splash screen rather than hang forever -
fails open (renders children) since a failed check is treated as
"unknown", never as grounds to hard-lock the account.

## block-__tests__-license-guard-lock-screen-title-test-tsx-L4

`client/__tests__/license-guard-lock-screen-title.test.tsx:4`

The lock screen rendered its title through three independent `&&`
expressions rather than one mutually exclusive chain. The third read
`!(!clockTampered && isSuspended)`, which negates only the SECOND branch,
so with isClockTampered = true it evaluated to `!(false && …)` → true and
rendered alongside the first — producing the literal string
"Clock DiscrepancySubscription Expired" on a store owner's till.

Reported from production after a laptop's system clock ran ~12 hours fast.
See docs/KNOWN_BUGS.md.

## block-__tests__-local-wipe-leaves-no-orphans-test-ts-L5

`client/__tests__/local-wipe-leaves-no-orphans.test.ts:5`

A-274. `resetDatabase()` clears `_sync_queue` but only `LOCAL_WIPE_TABLES`,
so any store-scoped table missing from that list keeps its rows at
`_synced = 0` with no queue entry — the exact shape `requeueOrphanedRows()`
exists to repair. Three tables were in that gap, and covering it at the
source is what lets the boot-time orphan scan stop running on a crash
marker. See client/AGENTS.md, "The boot-time orphan scan".

## block-__tests__-loyalty-redemption-fallback-test-ts-L5

`client/__tests__/loyalty-redemption-fallback.test.ts:5`

Regression coverage for: "Points Redemption Options section is empty
until Loyalty Settings is opened once" (docs/features/_findings-log.md).

Root cause: ensureLoyaltyDefaultsSeeded() (lib/db/queries/loyalty.ts) only
runs as a side effect of the Loyalty Settings dialog's `open` useEffect,
so a store that never opened that dialog saw "No redemption options
configured yet." on the main Loyalty tab even though tiers never had this
problem — use-customer-management.ts's buildFallbackTiers() already
covers that gap for tiers. This adds the equivalent
buildFallbackRedemptionOptions() and asserts the same real-data-wins
precedence rule tiers already follow.

## block-__tests__-loyalty-redemption-revalidation-test-ts-L10

`client/__tests__/loyalty-redemption-revalidation.test.ts:10`

Regression test for the High-severity bug: a redemption picked earlier in
checkout (e.g. from a stale cached customer.loyalty_points, or another
terminal having already spent the points) was applied against the
customer's real balance by clamping the result at 0 instead of rejecting
- the customer effectively got the reward's discount for free. Runs
against a real in-memory SQLite engine, not a mocked update(), since the
bug is specifically about what applyLoyaltyPointsForSale does with the
freshly re-read balance.

## line-__tests__-loyalty-redemption-revalidation-test-ts-L51

`client/__tests__/loyalty-redemption-revalidation.test.ts:51`

selectedCustomer is stale here on purpose - the cart picked a
redemption when the cache said 200 points, but the real row (just
seeded above) only has 50.

## line-__tests__-loyalty-redemption-revalidation-test-ts-L75

`client/__tests__/loyalty-redemption-revalidation.test.ts:75`

Balance raised above LOYALTY_RULES.MIN_REDEMPTION_POINTS (100), which
is now a hard floor on a reward's cost - a 30-point redemption would be
rejected by that rule rather than by the balance check under test here.

## block-__tests__-loyalty-rules-enforcement-test-ts-L10

`client/__tests__/loyalty-rules-enforcement.test.ts:10`

Covers the two LOYALTY_RULES constants that used to be declared and never
used: MIN_REDEMPTION_POINTS and POINTS_EXPIRY_MONTHS. Runs against a real
in-memory SQLite engine because the point of the fix is what
applyLoyaltyPointsForSale does with the customer row and the dated
loyalty_transactions ledger, not the pure math (covered in
loyalty-calculator.test.ts).

## block-__tests__-loyalty-settings-permission-test-tsx-L40

`client/__tests__/loyalty-settings-permission.test.tsx:40`

"manage_loyalty" is about configuring the PROGRAM - tiers, earn rate and
redemption options - which is a different act from a cashier spending a
customer's earned points at the till (pos-redeem-reward.tsx, deliberately
independent of any staff-concession key).

## block-__tests__-loyalty-store-scoping-test-ts-L9

`client/__tests__/loyalty-store-scoping.test.ts:9`

Regression coverage: loyalty_tiers/loyalty_redemption_options had zero
store scoping on read (no store_id column existed at all, rows were only
ever keyed by user_id) — in a multi-store account, every store shared the
exact same tiers/rewards catalog, and ensureLoyaltyDefaultsSeeded()'s
"has this store already been seeded" check (tiers.length === 0) was
evaluated globally, so only the very first store ever created got
defaults; every other store saw store A's live config with no boundary.

## block-__tests__-metric-card-keyboard-test-tsx-L5

`client/__tests__/metric-card-keyboard.test.tsx:5`

Clickable metric cards are shortcuts into the screen behind the figure
(Daily Close's payment totals open the sales list, Net Cash Expected
opens the expense ledger). A div with an onClick is invisible to the
keyboard, so they carry button semantics; a card with no onClick stays a
plain card and must not be focusable.

## block-__tests__-mixed-payment-credit-over-allocation-test-ts-L3

`client/__tests__/mixed-payment-credit-over-allocation.test.ts:3`

A-56: a mixed payment of cash 400 + credit 800 on a 1,000 total passes the
coverage check (splits sum to 1,200) while the customer only owes 600 —
the extra 200 was written straight onto outstanding_balance with no sale to
settle it against. The credit split can never exceed
total - sum(non-credit splits).

## block-__tests__-monotonic-clock-bound-test-ts-L9

`client/__tests__/monotonic-clock-bound.test.ts:9`

§2 of docs/superpowers/specs/2026-10-08-license-clock-recovery-design.md.

A-191: a laptop's wall clock ran ~12 hours fast, every checkLicenseStatus()
wrote that future time into stores.last_monotonic_time, and correcting the
clock then locked the till out permanently. Bounding the write against a
monotonic reference stops the watermark being poisoned in the first place.

## block-__tests__-multi-store-scoping-test-ts-L9

`client/__tests__/multi-store-scoping.test.ts:9`

Regression coverage for the multi-store query-scoping mechanism itself:
the module-scope getActiveStoreId()/setActiveStoreId() resolver in
lib/db/core.ts, and the read/write scoping pattern built on it
(products.ts as the reference implementation, insert()'s auto-injection).
Real in-memory SQLite (sql.js), not a mocked query(). A wrong ternary or
a forgotten `AND store_id = ?` would silently leak one store's data into
another's view, which only shows up by asserting on actual returned rows.

## line-__tests__-multi-store-scoping-test-ts-L44

`client/__tests__/multi-store-scoping.test.ts:44`

store_id is added via core.ts's runtime ALTER TABLE migration, not the
base CREATE TABLE statements in SCHEMA_SQL. Replicate it here since
__setDatabaseForTesting bypasses initDatabase()'s migration loop.

## line-__tests__-multi-store-scoping-test-ts-L163

`client/__tests__/multi-store-scoping.test.ts:163`

A store OWNER's own users.store_id is deliberately always null, so
callers forwarding `user.store_id` handed insert() a null rather than
undefined. The guard was a strict `=== undefined`, so the row was written
NULL-scoped and every store-scoped report filtered it out — the online
order fulfilment path did exactly this (SF-P2-6).

## block-__tests__-no-system-sentinel-user-id-test-ts-L17

`client/__tests__/no-system-sentinel-user-id.test.ts:17`

A-21. `returns.user_id` and `stock_audits.user_id` both fell back to the
literal string "system" when the caller passed no user. Both columns are
`foreignUuid('user_id')->constrained('users')` server-side, so the row
writes locally, pushes, fails the FK, retries through backoff, and is
finally reported to superadmins as a permanently stuck sync item after 5
attempts — the same failure shape already fixed once for `feedback`.

Every real call site sources the id from `useAuth().user?.id` on a
route-guarded screen (the return dialog, the cycle-count screen, the
catalog quick edit, the CSV import dialog), so a missing id is a caller
bug, not a legitimate state. Fail loudly and locally at the call, before
anything is written, instead of writing a row that can only fail later,
elsewhere, and silently.

## block-__tests__-notification-bell-broadcast-detail-test-tsx-L5

`client/__tests__/notification-bell-broadcast-detail.test.tsx:5`

A broadcast's message is line-clamped in the bell's list, which is right for
a compact list but left the full text unreachable. Clicking the row now
opens the shared ResponsiveModal detail view (the house
"row -> <Entity>DetailModal" pattern), and the list stays clamped.

## block-__tests__-onboarding-cloud-setup-failed-pull-test-ts-L8

`client/__tests__/onboarding-cloud-setup-failed-pull.test.ts:8`

Regression test: a cloud setup whose sync pull FAILED must show the real
error and return to the cloud step - never the "no staff accounts were
found" empty state, and never a bounce into registration.

pullChanges() fires onCriticalTablesReady from a `finally`, so the
callback also runs when the pull threw and nothing at all was written
(the page-1 transaction, which carries stores AND users, rolls back as a
unit). Onboarding used to treat that signal as "identity is ready",
count zero local users and report a genuinely-failed sync as an empty
store. The callback now carries whether the pull succeeded.

## line-__tests__-onboarding-local-restore-reload-test-ts-L5

`client/__tests__/onboarding-local-restore-reload.test.ts:5`

React 19's `act` warns unless the environment explicitly opts in.
See __tests__/use-pos-payment-loyalty-gate.test.ts for the same harness
pattern (no @testing-library/react is installed in this repo).

## block-__tests__-onboarding-local-restore-reload-test-ts-L10

`client/__tests__/onboarding-local-restore-reload.test.ts:10`

Regression test for known bug #10, Part A (docs/features/_known-bugs.md):
handleLocalRestore() used to call restoreDatabase() then a client-side
router.push("/login"), which resolves before /login's account-detection
(useDeviceAuthStatus) re-runs against the newly-restored database - a real
walkthrough saw the stale pre-restore "No Local Accounts Found" screen
flash right after the "Database restored successfully!" toast.

The fix matches the pattern already used by the other restore paths in
this codebase (hooks/use-settings-sync.ts's handleRestoreBackup /
handleRestoreBackupTauri): force a full browser navigation instead of a
client-side one, so no stale React state can be observed after a restore.

## line-__tests__-onboarding-local-restore-reload-test-ts-L86

`client/__tests__/onboarding-local-restore-reload.test.ts:86`

jsdom's real window.location throws "not implemented" on assignment;
replace it with a plain object whose href setter we can assert on,
the same way a full browser navigation would be observed from here.

## block-__tests__-onboarding-refetches-device-auth-status-test-ts-L7

`client/__tests__/onboarding-refetches-device-auth-status.test.ts:7`

Regression test (A-154, docs/FIXED_BUGS.md): /login's setup/login tabs
share one mounted page instance across the whole register -> confirm-wipe
-> new-account flow (no remount). useDeviceAuthStatus() used to read
userCount/recentUsers only once, on that instance's first mount - before
clearDatabaseForNewStore() ever ran - so a later bounce back to /login
(e.g. dashboard-layout's `!user` guard) rendered the stale pre-wipe
account instead of the new one. Fixed by having useOnboarding() call an
injected refetch callback right after the wipe and right after login.

## line-__tests__-onboarding-refetches-device-auth-status-test-ts-L137

`client/__tests__/onboarding-refetches-device-auth-status.test.ts:137`

Refetches straddle both staleness windows: right after the wipe (so a
bounce-to-/login before login() resolves sees userCount=0, not the old
account) and right after login() (so it sees the new account).

## block-__tests__-onboarding-register-clears-stale-local-data-test-ts-L7

`client/__tests__/onboarding-register-clears-stale-local-data.test.ts:7`

Regression test (A-150): a device that previously linked a different
account/store leaves its local data behind - `_sync_queue`, `feedback`,
`audit_logs`, etc. A brand-new signup used to insert the new store/user
rows straight on top of that leftover data without clearing it first, so
the new account's very first sync pushed the old store's stale queued
writes under the new account's token, rejected server-side as belonging
to a store it doesn't own.

The fix must NOT wipe unconditionally: `?tab=setup&step=register` is a
documented safe entry point for an already-set-up device (`userCount >
0`, see `app/login/use-login-page.tsx`), reachable from the traditional
login screen's "Create account" link - a logged-out owner with real
unsynced local work could land here. So a leftover local store routes
through the SAME confirm dialog the existing-account store-switch flow
already uses (`showConfirmSwitch`/`confirmCloudRestoreSwitch`), rather
than wiping silently.

## block-__tests__-onboarding-register-email-taken-recovers-test-ts-L7

`client/__tests__/onboarding-register-email-taken-recovers.test.ts:7`

Regression test: if `apiClient.register()` 422s "email already taken"
during brand-new account creation, that almost always means an earlier
attempt from this same flow already succeeded server-side and only the
response was lost (a dropped connection, a retry that gave up) - not
that the user is trying to steal someone else's account. Dead-ending on
the raw server error here would strand the account (every further
attempt re-422s, and the existing cloud-restore path also dead-ends with
"no stores found" until a store exists locally). handleRegister() now
falls back to logging in with the same credentials and continuing the
normal flow against whatever store the cloud account actually has.

## block-__tests__-onboarding-seeds-subscription-status-test-ts-L7

`client/__tests__/onboarding-seeds-subscription-status.test.ts:7`

Regression test (A-156, docs/FIXED_BUGS.md): a brand-new signup's trial
subscription is created server-side in the same request as the account,
but the local `stores` row's `subscription_tier` column has no value in
finishNewAccountSetup()'s INSERT, so it sat at the schema default 'free'
until the fire-and-forget `sync(false, true)` call eventually pulled the
real value - landing the user on the dashboard with "Free" shown even
though the server already granted a Pro trial in the same request.

## line-__tests__-online-payments-section-test-tsx-L6

`client/__tests__/online-payments-section.test.tsx:6`

jsdom doesn't implement ResizeObserver or the pointer-capture APIs Radix's
Select uses under the hood - same workaround as
pin-entry-lockout-ui.test.tsx uses for input-otp's ResizeObserver need.

## block-__tests__-online-store-permission-test-tsx-L4

`client/__tests__/online-store-permission.test.tsx:4`

manage_online_store is the storefront slice of the Store & Settings
category, and it deliberately cuts ACROSS two tabs rather than owning one:
the Store Profile block (public URL slug + the Enable Online Store switch)
lives inside Business Info, which is manage_store_settings, and the
Paystack payout onboarding lives inside Payment Methods, which is
manage_payment_accounts. Both only exist to make the public storefront
work, so they carry the storefront key on top of their tab's own.

products.show_online stays under manage_products - see AGENTS.md.

## block-__tests__-orphan-requeue-runs-once-per-install-test-ts-L9

`client/__tests__/orphan-requeue-runs-once-per-install.test.ts:9`

A-8 (docs/KNOWN_BUGS.md), boot-scan half: DatabaseProvider ran
`requeueOrphanedRows(STORE_SCOPED_TABLES)` on EVERY boot — one
`SELECT * FROM <table> WHERE (_synced = 0 OR _synced IS NULL) AND id NOT IN
(SELECT record_id FROM _sync_queue …)` per store-scoped table. `_synced`
is unindexed, so that is a full scan of all 26 tables at every launch, to
repair a state that is created only by a write interrupted between its row
INSERT and its queue INSERT.

It runs once per install, full stop. A-274 removed the second trigger — a
`force` passed when `localStorage` held crashes queued by a previous
session — because its premise does not hold and its cost is a full re-push
of the device's history. See client/AGENTS.md, "The boot-time orphan scan".

## block-__tests__-orphan-requeue-runs-once-per-install-test-ts-L79

`client/__tests__/orphan-requeue-runs-once-per-install.test.ts:79`

A-274. This case previously asserted the opposite — that a recorded crash
re-triggers the scan — and that is the mechanism behind the 20,000-row
requeue storms. A crash reaching `localStorage` means the SQLite write
FAILED, so no row was committed and no orphan can exist; an orphan needs a
*partial* write, which `insert()` already makes impossible by wrapping the
row, its queue entry and its audit entry in one transaction. The real
orphan producer was a wipe that cleared `_sync_queue` while leaving three
store-scoped tables behind, and that is now closed at the source
(`local-wipe-leaves-no-orphans.test.ts`).

## line-__tests__-permission-catalog-backfill-test-ts-L15

`client/__tests__/permission-catalog-backfill.test.ts:15`

The exact lists the permission-groups feature shipped with on 2026-09-27
(a5f40463) - what an already-seeded store like the live production one is
still carrying, and what the Laravel seeder went on seeding new stores
with for two more days.

## line-__tests__-permission-groups-seeding-test-ts-L61

`client/__tests__/permission-groups-seeding.test.ts:61`

Final review, Critical C4: the spec promises existing staff get
backfilled to the default group matching their current role in the
SAME seeding pass - without it, toggling a checkbox on an existing
store's Manager group changes nothing for any pre-existing manager.

## line-__tests__-permission-groups-seeding-test-ts-L100

`client/__tests__/permission-groups-seeding.test.ts:100`

Final review, Important I3: two devices seeding the same store's
defaults before either has synced must not create permanently
divergent groups per role - deterministic ids (derived from
store_id + role, not random) mean a later sync push's "INSERT
against an already-existing id becomes an UPDATE" handling collapses
the race into one row per role, instead of leaving duplicates.

## line-__tests__-permission-groups-seeding-test-ts-L112

`client/__tests__/permission-groups-seeding.test.ts:112`

Simulate a second device: fresh local rows for the same store, as if
this were a different device's never-before-seeded local DB that
happens to derive the same ids this store's groups already have
server-side.

## line-__tests__-permission-matrix-category-keys-test-tsx-L33

`client/__tests__/permission-matrix-category-keys.test.tsx:33`

Lives in its own file on purpose: React only logs a missing-key warning
once per offending component, so a second render of PermissionMatrix
anywhere in the same file would make this assertion vacuous.

## block-__tests__-pin-entry-lockout-ui-test-tsx-L19

`client/__tests__/pin-entry-lockout-ui.test.tsx:19`

Regression coverage for a follow-up to the PIN-lockout fix: a lockout
was originally surfaced only via a toast (auto-dismisses in a few
seconds, easy to miss, no visible reason the Unlock button stopped
working). PinEntry must show a persistent, visible countdown and
disable PIN input for as long as the lockout is active.

## block-__tests__-pin-hashing-lazy-migration-test-tsx-L6

`client/__tests__/pin-hashing-lazy-migration.test.tsx:6`

POS PINs used to be stored in plaintext in `users.pin` (and serialized
out by the API). They're bcrypt-hashed now. Because PIN login is fully
offline - it never contacts the server - the migration of PINs that are
ALREADY plaintext on a device has to happen here, on the next successful
login, and then propagate outward through the ordinary sync queue.

These tests pin down that whole path: a legacy plaintext PIN still logs
in, and afterwards the stored value is a bcrypt hash of it (queued for
push like any other local write), with no user-visible reset anywhere.

## line-__tests__-pin-hashing-lazy-migration-test-tsx-L135

`client/__tests__/pin-hashing-lazy-migration.test.tsx:135`

The whole design rests on a server-produced hash verifying correctly
on-device. Every other test in this file hashes and verifies on the
SAME side (bcryptjs both ways), which can't catch a real
implementation mismatch - a wrong prefix expectation, a cost-factor
incompatibility, a subtly different salt encoding. This literal is a
real hash PHP's password_hash(PASSWORD_BCRYPT, ['cost' => 12])
produced for the PIN "4321" (Laravel 11's actual bcrypt default is
cost 12, not the 10 bcryptjs uses on this side - see the comment on
PIN_HASH_ROUNDS in pin-hash.ts for why that doesn't need to match).

## line-__tests__-pin-hashing-lazy-migration-test-tsx-L232

`client/__tests__/pin-hashing-lazy-migration.test.tsx:232`

Queued for sync push like any other local write, which is what
carries the hash to the server and on to this account's other
devices - no forced reset anywhere in the fleet.

## block-__tests__-po-amount-paid-cap-test-tsx-L18

`client/__tests__/po-amount-paid-cap.test.tsx:18`

Amount Paid is a bare number field whose value getValidatedAmountPaid
silently caps at the order total on submit. Nothing said what that cap
was, or that anything had been changed by it.

## block-__tests__-po-dropped-receipt-signal-test-ts-L9

`client/__tests__/po-dropped-receipt-signal.test.ts:9`

A-26: the A-9 fix deliberately keys a receipt's rows on the PO line plus its
already-received balance, so a stale second device's legitimate second
partial receipt collapses into the first one and its `quantity_received`
UPDATE is dropped server-side as a terminal `version_conflict`. The keying
stays; what is fixed is the silence. `_sync_conflicts` records the drop and
`getDroppedReceiptSignal()` reports it against the order so the receiving
screen can tell the store to re-check the received figure.

## line-__tests__-po-dropped-receipt-signal-test-ts-L149

`client/__tests__/po-dropped-receipt-signal.test.ts:149`

The ledger used to be allowlisted to purchase_order_items so it stayed
small; it now logs every table (a terminal drop elsewhere left no trace
at all) and is bounded by a row cap instead — see
__tests__/conflict-ledger-bounded.test.ts. What must not change is that
this reader only ever sees its own table's rows.

## line-__tests__-po-line-item-math-test-ts-L21

`client/__tests__/po-line-item-math.test.ts:21`

A-261 rounds the per-unit cost to 333.33 for the batch's valuation.
Billing the order from that figure made a ₦1,000 invoice read
₦999.99 on screen, in the PO, in its PDF and in supplier debt.

## line-__tests__-po-line-item-math-test-ts-L69

`client/__tests__/po-line-item-math.test.ts:69`

A ₦1,000 carton of 3. SQLite's REAL would keep
333.3333333333333; MySQL's decimal(10,2) stores 333.33, so the
receiving device disagreed with the cloud and with every other
device until the next pull overwrote it.

## line-__tests__-po-line-item-math-test-ts-L93

`client/__tests__/po-line-item-math.test.ts:93`

Regression: the review-price popover previously showed the raw
per-carton unit_cost (37,200) as "Cost", right next to a sell price
meant to be entered per tablet — this is the value that must match
the catalog's per-tablet cost (620) instead.

## line-__tests__-po-line-item-math-test-ts-L119

`client/__tests__/po-line-item-math.test.ts:119`

Regression: entering a new per-tablet cost (650) previously produced
a total of bulk_quantity * 650 = 650, silently dropping the
60-tablets-per-carton factor and understating the order by 60x.

## line-__tests__-po-line-item-math-test-ts-L132

`client/__tests__/po-line-item-math.test.ts:132`

Medium bug fix: `Number(amountPaid) || 0` alone silently recorded ₦0
paid for a blank/non-numeric amount, and accepted any value above the
order total as-is with no cap or rounding.

## block-__tests__-po-line-item-math-test-ts-L188

`client/__tests__/po-line-item-math.test.ts:188`

A line is one product, not one unit. The Immediate Purchase confirmation
counted lines ("1 item worth 40,000") and a store owner who had just
entered a quantity of 2 read that as the quantity - so the dialog now
reports the units that actually reach stock.

## block-__tests__-po-receive-cost-price-scale-test-ts-L9

`client/__tests__/po-receive-cost-price-scale.test.ts:9`

Item 6A (Cynthia's feedback, 2026-09-28). The Receive panel's "Cost Price"
input is consumed as a PER BASE UNIT figure by receivePurchaseOrder(), but
its placeholder showed the line's per-bulk `unit_cost` and the copy around
it ("Ordered: 10 Carton(s) @ 12,000/Carton", "Qty Received (in Cartons)")
reinforced that reading, so a per-carton figure typed into it was stored
as the per-tablet cost - inflated by units_per_bulk.

The scale contract itself is now shared with the Immediate Purchase flow
via resolveBaseUnitCost(); this pins it end to end so a future refactor
can't quietly reintroduce a division (or drop one).

## block-__tests__-po-receive-no-double-booking-test-ts-L9

`client/__tests__/po-receive-no-double-booking.test.ts:9`

A-9. Receiving the same purchase order from two devices booked the
delivery twice. The single-device double-click is guarded by the UI, but
`receivePurchaseOrder()` read the PO — including each line's
`quantity_received` — *outside* its transaction, so two receipts racing
each other both computed the full outstanding balance from the same stale
snapshot. Both then created a stock batch and a purchase movement with
fresh random ids, which the server has no way to recognise as the same
delivery: both were accepted (stock doubled) while one of the two
`quantity_received` updates lost the version check, so the PO showed a
single receipt.

Two changes close it, and this file covers both halves:
 - the line's `quantity_received` is re-read inside the transaction (the
   pattern `submitStockAudit` already uses for system quantity), which
   settles any race within one device;
 - the batch and its movement are keyed on a deterministic id derived
   from the PO line and its already-received balance, so a second
   device's copy of the same receipt carries the same ids and collapses
   onto the first server-side rather than doubling it. The server half is
   covered by `laravel-server/tests/Feature/SyncPushPurchaseOrderReceiptTest.php`.

## block-__tests__-po-review-price-prefill-test-tsx-L13

`client/__tests__/po-review-price-prefill.test.tsx:13`

The "Review price" popover previously always showed a blank Sell Price
input (placeholder "0.00") regardless of the product's actual current
selling price, forcing the user to look it up elsewhere before deciding
whether to change it. It should be prefilled with the product's current
selling price so the user can see - and edit from - what's already on
file, without that prefill silently becoming a "change" if left untouched
(an untouched field must not override the product's price on submit).

## line-__tests__-po-review-price-prefill-test-tsx-L45

`client/__tests__/po-review-price-prefill.test.tsx:45`

Radix Popover portals its content directly onto document.body,
separate from the test's own container - clear anything left behind
so a later test's querySelectorAll('input[type="number"]') can't
accidentally pick up a stray node from a previous test.

## block-__tests__-po-review-price-prefill-test-tsx-L70

`client/__tests__/po-review-price-prefill.test.tsx:70`

The trigger reads "Review price" until the line is repriced, and shows
the new price itself afterwards - match on its accessible name, which
stays stable either way.

## block-__tests__-po-review-price-state-test-tsx-L6

`client/__tests__/po-review-price-state.test.tsx:6`

The trigger always read a neutral "Review price", so once the popover
closed there was no way to tell which lines had actually been repriced.
And a sell price at or below cost rendered its margin in the same muted
grey as a healthy one, with nothing saying it was a loss.

## line-__tests__-pos-calculations-test-ts-L225

`client/__tests__/pos-calculations.test.ts:225`

Regression: a ₦1000 sale split cash ₦600 / credit ₦400 previously
recorded amount_paid as 1000 (the full split sum), making the sale
look fully paid when ₦400 was never actually collected.

## line-__tests__-pos-calculations-test-ts-L281

`client/__tests__/pos-calculations.test.ts:281`

Regression: a ₦10,000 sale with ₦5,000 cash entered, then a credit
split auto-filled to the full ₦10,000 remaining before the cashier
corrected it, previously computed change from the raw split total
(5000 + 10000 = 15000 -&gt; "change: 5000"), handing out cash that was
never actually tendered. Only the ₦5,000 cash was real money; it
doesn't cover the ₦10,000 total, so no change is due.

## block-__tests__-pos-calculations-test-ts-L312

`client/__tests__/pos-calculations.test.ts:312`

A-260's convention test is a static scan: it only sees arithmetic written
literally inside a `column: expr` write, so a money value produced by a
helper or held in a variable is invisible to it. These are the cases that
blind spot was hiding - found by grepping for `Math.` rather than by the
test going red.

## block-__tests__-pos-cart-discount-permission-test-tsx-L64

`client/__tests__/pos-cart-discount-permission.test.tsx:64`

Item 3 (Cynthia's feedback): "apply_discounts" already existed in the
permission catalog with the right role defaults, but nothing in the app
ever checked it, so every cashier could discount freely. Seeing a
discount that is already on the cart (a resumed held sale, a loyalty
redemption) is deliberately NOT gated - only creating or editing one is.

## block-__tests__-pos-cart-hold-permission-test-tsx-L67

`client/__tests__/pos-cart-hold-permission.test.tsx:67`

"hold_sales" gates parking a sale, the same way "apply_discounts" gates
creating a discount. Seeing that holds exist is deliberately NOT gated -
the amber "N on hold" banner stays, so a cashier without the right can
still tell a colleague's sale is parked on this till.

## block-__tests__-pos-cart-item-price-override-permission-test-tsx-L56

`client/__tests__/pos-cart-item-price-override-permission.test.tsx:56`

The reseller / store-markup unit-price field is the app's only
"override the price of this line at checkout" surface, so it is what
"override_price" gates. An override already on the line (a resumed held
sale, a marked-up reseller cart) still renders - read-only - for someone
without the permission; only retyping it is gated.

## block-__tests__-pos-cart-remove-undo-test-ts-L40

`client/__tests__/pos-cart-remove-undo.test.ts:40`

U12: an accidental swipe on a cart line silently dropped it — no toast, no
undo. Removal now toasts with an Undo action that puts the line back at
the quantity it had.

## block-__tests__-pos-cart-reprices-from-catalog-test-ts-L38

`client/__tests__/pos-cart-reprices-from-catalog.test.ts:38`

A-17. The POS cart is a zustand `persist` store: a line snapshots the
product's selling price and average cost when it is added and keeps them
forever. A cart held overnight, or one held across a price change synced
from the owner's device, was charged at the old price and booked COGS at
the old average cost. Cart lines are now re-priced from the catalog the
cart hook is already given, and the cashier is warned when a line's price
moved under them.

## block-__tests__-pos-customer-selector-permission-test-tsx-L40

`client/__tests__/pos-customer-selector-permission.test.tsx:40`

The till's own "Add new customer" inline form writes a customers row, so
it is the same manage_customers right as the Customers page's Add
Customer - not a separate "at the till" concession. sales_staff holds the
key by default, so gating it changes nothing for a cashier.

## block-__tests__-pos-data-history-gating-test-tsx-L6

`client/__tests__/pos-data-history-gating.test.tsx:6`

getRecentSales() reads 100 sales with three correlated subqueries per row and
is consumed only by the POS History tab, but it used to run on every POS
mount - i.e. for every cashier who only ever rings up sales. use-pos-system
already knows the active tab from the URL before it calls usePOSData, so the
read is gated on that.

## block-__tests__-pos-dispense-rx-permission-test-tsx-L47

`client/__tests__/pos-dispense-rx-permission.test.tsx:47`

"/pos?dispense_rx=<id>" is the real dispense action - it is what pulls
the prescription's items onto the till - and it is typeable, so hiding
the Dispense button alone would not gate it.

## block-__tests__-pos-enabled-payment-methods-null-fallback-test-tsx-L12

`client/__tests__/pos-enabled-payment-methods-null-fallback.test.tsx:12`

Regression coverage for FIXED_BUGS.md A-42: a store row whose
enabled_payment_methods column was never written must read back as NULL
after a sync pull, not as an empty list. NULL means "the store never chose",
and the POS shows every method; an empty list would render a payment step
with no payment buttons at all.

## block-__tests__-pos-history-tab-permission-test-tsx-L21

`client/__tests__/pos-history-tab-permission.test.tsx:21`

"view_sales_history" answers "does the Recent Sales tab exist for this
role at all", which is a different question from "whose sales show up in
it" - that one is already answered by "view_activity_log"
(pos-transaction-history.tsx scopes getRecentSales to the acting user
without it). The two compose: no history key means no tab; the tab plus
no activity-log key means own sales only.

## block-__tests__-pos-layout-header-rules-of-hooks-test-tsx-L25

`client/__tests__/pos-layout-header-rules-of-hooks.test.tsx:25`

Regression coverage for a real rules-of-hooks crash (final review,
Critical C2): pos-layout-header.tsx computed canRequestTransfer as

  useHasPermission("process_sales") &&
  (useHasPermission("manage_staff") || toggle === 1) && ...

`&&` short-circuits, so the second useHasPermission() call only
happens on renders where the first one returns true. useHasPermission
resolves its group ASYNCHRONOUSLY (starts from the role's fallback
permissions, then updates once the real group loads) - for a role whose
FALLBACK denies "process_sales" but whose assigned GROUP grants it (a
custom group more permissive than the role tier, exactly the feature's
own reason to exist), the first render skips the second hook call
entirely and a later render - once the group resolves - calls it. That
is a hook COUNT that differs between renders of the same component
instance, which React's dev-mode invariant throws on
("Rendered more hooks than during the previous render").

This test reproduces the exact pattern with the REAL hasPermission/
useHasPermission implementation and a REAL async group-load race
(not mocked), against a component matching pos-layout-header.tsx's
conditional-vs-fixed shape, to prove the crash is real and that
hoisting both calls to unconditional consts (the applied fix) closes it.

## line-__tests__-pos-layout-header-rules-of-hooks-test-tsx-L81

`client/__tests__/pos-layout-header-rules-of-hooks.test.tsx:81`

Role fallback for "auditor" denies process_sales (DEFAULT_GROUP_PERMISSIONS.auditor
has no process_sales) - but this user's actual assigned group DOES grant it,
exactly the "custom group more permissive than the role tier" case.

## block-__tests__-pos-payment-stale-customer-balance-test-ts-L13

`client/__tests__/pos-payment-stale-customer-balance.test.ts:13`

Regression: handlePayment() wrote outstanding_balance/loyalty_points as
`(selectedCustomer.outstanding_balance || 0) + delta` — a read-modify-write
against the in-memory Customer object captured when the cashier picked the
customer, not the DB row at write time. Every sibling write path
(recordCustomerPayment, computeEarnedPoints) deliberately re-reads current
state first for exactly this reason; checkout was the one outlier. If the
customer's real balance/points changed after selection (another terminal's
sale/payment landed via sync, or just time passing in a long POS session)
before this checkout completed, that change was silently clobbered — no
error, no conflict signal, since only the JS object was stale, not the
DB row's _version.

Fix: both writes now re-read the current value from the DB immediately
before computing the new one, exactly like recordCustomerPayment.

## block-__tests__-pos-payment-transaction-atomicity-test-ts-L13

`client/__tests__/pos-payment-transaction-atomicity.test.ts:13`

Regression: handlePayment() used to write the sale row, then deduct stock
for each cart line, then update the customer balance and loyalty points,
as a sequence of independent, individually-committed statements - no
transaction(). An interruption partway through (app closed, a transient
lock error, a thrown exception on any line item past the first) left a
real `sales` row committed with only some of its `sale_items`/stock
deductions done and no visible error beyond a generic toast. A cashier
retrying the sale would then double-book revenue and double-decrement
whatever stock did get deducted the first time.

Fix: the whole write sequence (sale row, per-item stock deduction,
customer balance, loyalty) now runs inside transaction() (lib/db/core.ts),
so a failure on e.g. the second of three cart lines rolls back the sale
row and the first line's stock deduction too, instead of leaving a
half-committed sale behind.

## block-__tests__-pos-product-list-load-error-test-tsx-L29

`client/__tests__/pos-product-list-load-error.test.tsx:29`

U1: a failed catalog read used to be indistinguishable from an empty
catalog — usePOSData coerced every query result with `|| []` and exposed
no isError, so the grid rendered "No products found - try a different
search term" for a read that never completed. The list must render a
distinct, retryable failure state instead.

## line-__tests__-pos-product-list-memoization-test-tsx-L6

`client/__tests__/pos-product-list-memoization.test.tsx:6`

These tests exercise grouping/sorting/cart-quantity logic, not
virtualization mechanics (that belongs in e2e/browser tests, where real
layout exists) - jsdom reports zero size for every element, so the real
useVirtualizer would compute an empty visible range here and every
assertion below would find nothing. Stubbed to render every row
unconditionally, same shape real react-virtual returns.

## block-__tests__-pos-product-list-memoization-test-tsx-L25

`client/__tests__/pos-product-list-memoization.test.tsx:25`

Regression coverage for the KNOWN_BUGS.md "Unmemoized POS product grid"
finding: pos-product-list.tsx rebuilt cartQuantityMap/grouped arrays with
new references on every render and POSProductCard wasn't memoized, so
every visible card re-rendered on any cart mutation regardless of catalog
size. Fixed via useMemo (keyed on the real inputs) + React.memo. This
test isn't about render counts (brittle) - it proves the memoized path
still produces correct output: grouping, sorting, and cart-quantity
badges all stay in sync across rerenders with different props.

## block-__tests__-post-restore-cloud-link-notice-hook-test-ts-L7

`client/__tests__/post-restore-cloud-link-notice-hook.test.ts:7`

Regression tests for known bug #10, Part B's React wiring
(lib/hooks/use-post-restore-cloud-link-notice.ts): the pure gating logic
lives in lib/utils/post-restore-notice.ts (see
__tests__/post-restore-notice.test.ts) - this covers the hook that
actually surfaces the one-time toast on mount, wired into both
post-restore landing spots (/login and the dashboard shell).

## block-__tests__-post-restore-notice-test-ts-L7

`client/__tests__/post-restore-notice.test.ts:7`

Regression tests for known bug #10, Part B (docs/features/_known-bugs.md):
restoreDatabase() never touches the cloud auth token, so a device
recovered from a local backup silently loses its cloud link. The fix is a
one-time, restore-specific notice (not a persistent nag - the dashboard
header's SyncIndicator already covers "always unlinked") gated on a
short-lived sessionStorage marker set right before the post-restore
reload.

## block-__tests__-prescription-detail-panel-permissions-test-tsx-L50

`client/__tests__/prescription-detail-panel-permissions.test.tsx:50`

The detail panel's action row is the app's only prescription-fulfilment
surface. "manage_prescriptions" owns the record's own data (Edit);
"dispense_prescriptions" owns the whole fulfilment pipeline that ends in
medicine leaving the shelf - Process, Mark Ready, Dispense and Dispense
Refill. Process Return is neither and stays ungated.

## block-__tests__-prescription-items-scoping-test-ts-L9

`client/__tests__/prescription-items-scoping.test.ts:9`

getAllPrescriptionItems() used to select the ENTIRE prescription_items table
- a table that grows by a row per dispensed medication line for the life of
the store - on every mount of the Prescriptions page, then threw away
everything that didn't belong to a loaded prescription. It now reads only
the ids actually loaded.

## block-__tests__-prescription-new-overlay-permission-test-tsx-L37

`client/__tests__/prescription-new-overlay-permission.test.tsx:37`

"?action=add" and "?edit_rx=<id>" are typeable, so hiding the "New
Prescription" header action alone is not a gate - the overlay itself has
to require manage_prescriptions.

## block-__tests__-prescription-refill-queries-test-ts-L11

`client/__tests__/prescription-refill-queries.test.ts:11`

The refill side of lib/db/queries/prescriptions.ts was untested: whether a
refill dispense actually consumes an authorization and pushes the next due
date out by the item's own interval, which items count as "due", and which
statuses stamp dispensed_at. All of it decides whether a patient can
collect medication they aren't entitled to, or is turned away from one
they are.

## line-__tests__-prescription-strength-fallback-test-ts-L5

`client/__tests__/prescription-strength-fallback.test.ts:5`

PrescriptionMedications only reads storeProfile.currency from useStore()
(for the money-formatted cost hint); it doesn't need a real StoreProvider
or its underlying DB-backed queries.

## block-__tests__-prescription-strength-fallback-test-ts-L22

`client/__tests__/prescription-strength-fallback.test.ts:22`

Regression coverage for: "Strength selector is unusable (but harmless)
for any product with a blank `strength` column" (_findings-log.md).

The New Prescription form's "Strength *" combobox was populated only from
a chosen product's non-empty `strength` values, so a product with a blank
`products.strength` (common on this store's imported catalog) rendered a
required-looking dropdown with zero options. Fix: fall back to a free-text
Input when the selected product has no non-empty strength options.

No @testing-library/react is installed in this repo (see
use-pos-payment-loyalty-gate.test.ts), so this uses the same manual
react-dom/client + `act` harness, asserting on plain DOM nodes.

## block-__tests__-process-return-credit-and-loyalty-test-ts-L17

`client/__tests__/process-return-credit-and-loyalty.test.ts:17`

useProcessReturnMutation carries the money and points consequences of a
customer return: how much of a credit sale's debt is forgiven, how the
sale's payment_status flips, whether a prescription re-enters the dispense
queue, and how many loyalty points are clawed back or refunded. None of
that had test coverage.

## block-__tests__-procurement-immediate-test-ts-L9

`client/__tests__/procurement-immediate.test.ts:9`

Exercises createAndReceivePurchaseOrder() against a genuine in-memory
SQLite engine, proving the Immediate Purchase path actually creates a
received PO plus real stock_batches/stock_movements rows in one
transaction, matching the batch/cost/expiry semantics receivePurchaseOrder
already uses for Standard POs.

## block-__tests__-procurement-products-test-ts-L9

`client/__tests__/procurement-products.test.ts:9`

Exercises getActiveProductsForPO() against a genuine in-memory SQLite
engine. Regression coverage for two fixes: "cost_price" meaning "the
most recently created batch's cost" instead of a real average across
batches; and that average being a plain AVG(cost_price) instead of a
quantity-weighted average, which skews the result toward small/odd-cost
batches (see KNOWN_BUGS.md #5/#8 — this exact query was part of that bug).

## block-__tests__-procurement-tab-nav-view-suppliers-test-tsx-L5

`client/__tests__/procurement-tab-nav-view-suppliers.test.tsx:5`

"view_suppliers" is the read third of the supplier split: it decides
whether the Vendors tab exists at all. Hiding the trigger alone is not a
gate here - /procurement/vendors is directly reachable - so the route
itself carries the same key via RequireRole's `permission` prop (see
require-role-permission.test.tsx).

## block-__tests__-procurement-test-ts-L9

`client/__tests__/procurement.test.ts:9`

Exercises getSuppliers()/getPurchaseOrders() against a genuine in-memory
SQLite engine (sql.js) built from the app's real schema, not a mocked
query(), so these tests actually prove the SQL's join/aggregation math is
correct. This is a regression test for the bug where the Vendors &
Suppliers table showed "0" for every supplier's Orders/Total Value: those
fields were hardcoded client-side rather than derived from any query, so a
test that only asserted "query() was called" would never have caught it;
only asserting on the actual returned numbers does.

## line-__tests__-procurement-test-ts-L306

`client/__tests__/procurement.test.ts:306`

The order page prices an immediate line via immediateLineAmount, so
3 cartons of 10 at a typed override of ₦90/unit reads ₦2,700 on
screen and sets amount_paid to 2,700 - while this function used to
store an override-blind 3 x ₦1,000 = ₦3,000, overstating the PO on
its own detail screen and PDF and inflating supplier debt on a
partial payment.

## line-__tests__-procurement-test-ts-L365

`client/__tests__/procurement.test.ts:365`

Regression: item.subtotal is only ever set once when a row is first
added in the UI and is never kept in sync with later quantity
edits, so a stale value here (500, from an earlier 1-carton state)
must not leak into what's actually persisted.

## line-__tests__-procurement-test-ts-L407

`client/__tests__/procurement.test.ts:407`

Simulates editing the quantity in the UI without touching cost: the
stale subtotal (500, from the original 1-carton row) must not carry
through the edit.

## line-__tests__-procurement-test-ts-L493

`client/__tests__/procurement.test.ts:493`

Regression: the UI's "New Cost" override is typed per base unit
(per tablet, matching the catalog's current-cost display), but the
total was previously computed as bulk_quantity * override with no
units_per_bulk factor — silently understating the order by 60x here.

## block-__tests__-product-batch-history-fefo-label-test-tsx-L6

`client/__tests__/product-batch-history-fefo-label.test.tsx:6`

Regression coverage: every batch in this panel used to show a hardcoded
"Sell first (FEFO)" label, rather than only the one batch FEFO would
actually dispense from first (earliest expiry among active, in-stock,
not-yet-expired batches - matching the real sale-deduction order).

## block-__tests__-product-batch-history-no-expiry-status-test-tsx-L6

`client/__tests__/product-batch-history-no-expiry-status.test.tsx:6`

Regression coverage: a batch with no expiry_date fell back to
`new Date(0)` (the Unix epoch), which is always in the past, so every
non-perishable batch showed "Expired" instead of a neutral "No expiry".

## block-__tests__-product-delete-test-ts-L9

`client/__tests__/product-delete.test.ts:9`

deleteProduct() is the catalog's first destructive action. The design it
encodes is documented in client/AGENTS.md ("Deleting a product"): a soft
delete, blocked while anything in the store still depends on the product.
Stock on hand and an open purchase order are the two dependencies that a
delete would orphan; sale history is deliberately not one, because every
report joins `products` without a `_deleted = 0` filter and so still
resolves a deleted product's name.

## block-__tests__-product-export-import-round-trip-test-ts-L8

`client/__tests__/product-export-import-round-trip.test.ts:8`

The app's own export must be re-importable. It wasn't: the exporter writes
"Stock Quantity" and HEADER_ALIASES knew "quantity", "qty" and "stock" but
not that phrase — so re-importing a DumosRx export silently mapped the
column to "ignore" and every product landed at 0 stock, taking cost price
with it (cost lives on stock_batches, which is only created when a
quantity is present). Hit for real on 2026-10-08.

This pins the whole round trip rather than the one label, so adding an
export column without an alias fails here instead of in a store.

## block-__tests__-product-import-export-read-test-ts-L9

`client/__tests__/product-import-export-read.test.ts:9`

Regression coverage for the xlsx -> exceljs migration (docs/KNOWN_BUGS.md
H1 - xlsx had unpatched prototype-pollution/ReDoS CVEs with no upstream
fix). exceljs doesn't support the legacy .xls binary format at all, so
that specific case needed a deliberate, user-facing rejection rather than
a confusing parse failure - and the custom CSV parser/writer written to
replace xlsx's (exceljs's own CSV support is Node-stream-oriented, not a
good fit for a browser File) needed its own round-trip coverage, since
none existed for the read path before this migration at all.

## line-__tests__-product-import-export-read-test-ts-L99

`client/__tests__/product-import-export-read.test.ts:99`

Two independent single-sheet exports simulate a multi-sheet file by
reading the second one's worksheet and renaming it onto the first
workbook - simplest way to get a real multi-sheet .xlsx without a
second production code path just for this test.

## block-__tests__-product-import-show-online-test-ts-L15

`client/__tests__/product-import-show-online.test.ts:15`

`products.show_online` defaults off and the importer handled the column not
at all, so a store that imported hundreds of products and enabled its online
store got an empty storefront with no bulk way out (docs/STOREFRONT_REVIEW.md,
feature #7).

## line-__tests__-product-import-upsert-test-ts-L137

`client/__tests__/product-import-upsert.test.ts:137`

COLLATE NOCASE rather than asserting a specific case: the pre-existing
row was inserted via raw SQL above (bypassing the app's own
lowercase-on-write normalization), while the imported row goes through
it — this only cares that both count as "PARACETAMOL" regardless.

## line-__tests__-product-import-upsert-test-ts-L215

`client/__tests__/product-import-upsert.test.ts:215`

A-21: the matched-stock branch reconciles through submitStockAudit(),
whose stock_audits.user_id is a constrained FK server-side. The check
has to happen before the main transaction, or an import commits its
products and only then discovers it can't record the stock audit.

## block-__tests__-product-name-test-tsx-L32

`client/__tests__/product-name.test.tsx:32`

Product names are stored lowercase and ledger columns clamp them, so a
store with long names could not tell two rows apart - reported from
Favour's store, where the cycle count was the worst case.

## block-__tests__-product-pricing-info-cost-permission-test-tsx-L4

`client/__tests__/product-pricing-info-cost-permission.test.tsx:4`

Product Detail's Pricing card was the other half of the cost leak: the
profit block was gated by a direct `user?.role !== "sales_staff"` check
but the Avg Cost Price and Last Bought Price above it were shown to
everyone. "view_cost_fields" now fronts all three, and its default
grants (admin/manager/specialist/auditor, never sales_staff) reproduce
the old role check exactly for the profit block.

## block-__tests__-products-cost-price-test-ts-L9

`client/__tests__/products-cost-price.test.ts:9`

Regression coverage for KNOWN_BUGS.md #5/#8: getProductsWithStock() feeds
the live POS cart, and its cost_price is permanently persisted into
sale_items.cost_price at checkout — so if this query's average isn't
quantity-weighted, the wrong COGS gets baked into real sale records
forever, corrupting every downstream P&L/margin report. A plain
AVG(cost_price) across batches would report a cost skewed toward small,
odd-priced batches instead of reflecting what's actually on the shelf.

## line-__tests__-products-cost-price-test-ts-L54

`client/__tests__/products-cost-price.test.ts:54`

Batch A: 500 units @ ₦10 (the bulk of stock). Batch B: 5 units @ ₦1000
(one emergency spot-price restock). True weighted cost = (500*10 +
5*1000) / 505 ≈ ₦19.80/unit; a plain AVG(10, 1000) would report
₦505 — 25x too high.

## line-__tests__-profit-loss-tab-currency-formatting-test-ts-L5

`client/__tests__/profit-loss-tab-currency-formatting.test.ts:5`

Regression test for a formatting inconsistency found while smoke-testing
Reports > Analytics & Insights > Profit & Loss: the BIKeyMetrics cards at
the top of the page (components/analytics/bi-key-metrics.tsx) render "Net
Profit" via formatMetricCurrency() (rounded to a whole NGN unit, e.g.
"₦1,420"), but the "Financial Performance Statement" panel just below it
(components/analytics/profit-loss-tab.tsx) rendered the *same* aggregate
figures — Gross Sales, Net Sales, COGS, Gross Profit, Total Operational
Expenses, and Final Net Income (== the same netProfit value) — via
formatCurrency(), which keeps kobo-level decimals (e.g. "₦1,420.25").
Live-verified: on the same page, in the same render, "Net Profit" showed
"₦1,420" in one card and "₦1,420.25" a few rows below it for the literal
same number.

This test parses the component source (no component-rendering harness
exists in this repo yet — see dashboard-action-center-routes.test.ts for
the same source-inspection pattern) and asserts every aggregate-total
currency render in the P&L statement uses formatMetricCurrency, matching
the BIKeyMetrics cards it duplicates.

## line-__tests__-profit-loss-tab-currency-formatting-test-ts-L35

`client/__tests__/profit-loss-tab-currency-formatting.test.ts:35`

The fix: formatMetricCurrency is imported and used for each of the
six aggregate lines in the Financial Performance Statement +
Final Net Income figure.

## block-__tests__-pull-applies-reconciliation-movement-delta-test-ts-L15

`client/__tests__/pull-applies-reconciliation-movement-delta.test.ts:15`

A-148: a 'sync_reconciliation' movement is applied like any other
movement on pull - there is no movement_type special-case in pull.ts.
What actually prevents the reporting device from double-applying its own
correction is that reconcile-quantities.ts inserts that device's copy of
the row locally, as already-synced, before the server's echo is ever
pulled - so that device's pull hits the UPDATE branch (which never
replays a delta for any movement type), while every other device of the
same store - which never had the row - hits the INSERT branch and
correctly applies the delta. See client/AGENTS.md, "Stock quantity
reconciliation": the earlier design that skipped the delta by
movement_type for every device left every device except the reporter
uncorrected, which this test guards against regressing to.

## block-__tests__-pull-deferred-delta-order-across-pages-test-ts-L15

`client/__tests__/pull-deferred-delta-order-across-pages.test.ts:15`

A-197: a delta deferred because its batch hadn't arrived yet was applied
only after the whole page loop, so a later page's movements for the same
batch ran first and were clamped away by the per-movement MAX(0, …) floor.
Stage 1 of the derived-quantity design takes the order dependence out: the
oracle is MAX(0, Σ log), which no page split can change. The server still
floors per movement until stage 2, so the two replicas still part company
on an oversold history.

## block-__tests__-pull-deferred-stock-delta-survives-failed-round-test-ts-L15

`client/__tests__/pull-deferred-stock-delta-survives-failed-round.test.ts:15`

Regression test for docs/FIXED_BUGS.md A-54: a pulled stock_movements row
whose stock_batches row hadn't arrived yet had its delta parked in an
in-memory array, while the movement row itself committed with its own
page's transaction. A later page failing in the same round discarded the
array, and the next pull took the UPDATE branch (the movement now exists
locally), which applies no delta at all — so the batch's on-hand quantity
was permanently understated. The deferral is now persisted in the same
transaction as the movement row and drained on every later pull.

## block-__tests__-pull-deferred-stock-delta-survives-failed-round-test-ts-L170

`client/__tests__/pull-deferred-stock-delta-survives-failed-round.test.ts:170`

A-176: a batch whose `updated_at` predates the device's pull cursor is
never re-sent, so its deferred delta can never resolve. Rewinding the
`stock_batches` window makes the server re-offer it, which is the same
machinery the operator's manual "Force full resync" relies on, scoped to
the one table that can settle the delta.

## block-__tests__-pull-full-fetches-categories-suppliers-test-ts-L15

`client/__tests__/pull-full-fetches-categories-suppliers.test.ts:15`

Regression test for a real report: the server silently skips inserting a
category/supplier whose name collides with one it already has, remapping
the id only in that one push request's memory (see SyncController::push).
The client's only repair mechanism, DUPLICATE_NAME_TABLES reconciliation
below, can only fix a collision if the pre-existing row it collided with
appears in THIS pull's response — but a normal delta pull only asks the
server for rows changed since last_synced_at, and a long-unchanged
category like "DRUGS" never will. The server's pull() treats a table
missing from last_synced as "return everything" (no filter applied at
all), so categories/suppliers must never be given a last_synced cursor —
they're small collections (tens, rarely hundreds), so a full fetch every
time costs nothing and closes the gap for good.

## block-__tests__-pull-overwrites-a-stale-accepted-resend-test-ts-L15

`client/__tests__/pull-overwrites-a-stale-accepted-resend.test.ts:15`

A-279, the client half of the contract. A behind re-sent INSERT is accepted
without the server writing anything, so the device keeps the losing snapshot
at the server's version with its queue row gone. The server re-opens that
row's pull window; these two cases pin that the pull then actually applies
it, and that it still steps aside for a genuine pending local edit.

## block-__tests__-pull-paginates-past-500-rows-test-ts-L15

`client/__tests__/pull-paginates-past-500-rows.test.ts:15`

Regression test: SyncController::pull() caps each table at 500 rows/table
and now reports has_more per table (see docs/KNOWN_BUGS.md — previously
the client fetched exactly one page and stamped its cursor to now()
regardless, permanently losing every row past the 500th changed row).
pullChanges() must keep requesting pages (bumping page_offset) until the
server reports has_more: false for a table before advancing that table's
_sync_state cursor.

## block-__tests__-pull-preserves-device-local-columns-test-ts-L15

`client/__tests__/pull-preserves-device-local-columns.test.ts:15`

A-12. `stores.last_monotonic_time` anchors the offline clock-tamper guard
(licensing-manager.ts refuses a local time earlier than the last recorded
action). It is written by a raw local `execute` (queries/setup.ts's
updateStoreMonotonicTime) and never pushed, so the server's copy of the
column is permanently NULL — and the pull, which writes back every column
the server returns, wrote that NULL over the local anchor on every single
sync round, re-arming the guard from whatever the clock currently says.

## block-__tests__-pull-resumes-across-rounds-test-ts-L20

`client/__tests__/pull-resumes-across-rounds.test.ts:20`

Regression test for docs/KNOWN_BUGS.md A-1: a pull round that did not drain
a table's whole backlog threw away every page of progress it had made, so
the next sync() restarted from the same window forever. Per-table progress
is now persisted into `_sync_state.server_cursor` after each committed
page, and the next round resumes from it.

## block-__tests__-pull-skip-report-summarized-test-ts-L7

`client/__tests__/pull-skip-report-summarized.test.ts:7`

A pull page can skip up to the server's 500-row cap per table, and each
skip used to be its own crash report — so its own Sentry issue, since the
record id is part of the fingerprint. One run reports once.

## block-__tests__-pull-stamps-the-rounds-first-page-timestamp-test-ts-L20

`client/__tests__/pull-stamps-the-rounds-first-page-timestamp.test.ts:20`

A-282, the multi-page half. A table's window is stamped on the page that
drains it, so a round spanning several pages stamped the LAST page's
`server_timestamp` — covering time the earlier pages never queried. A row
that entered the window mid-round with an older `updated_at` than the
keyset cursor already passed sorts behind it, is never seen in that round,
and the watermark moves past it anyway.

## block-__tests__-pull-stock-batches-quantity-not-trusted-test-ts-L15

`client/__tests__/pull-stock-batches-quantity-not-trusted.test.ts:15`

Regression test for a real, at-scale reproduction: a pull landing between
a stock_batches row's creation push and its corresponding opening-stock
stock_movements push saw the server's not-yet-derived quantity (always 0
on creation — see SyncController::push's documented design) and blindly
overwrote the local, already-correct quantity with it. Once zeroed, the
batch became invisible to submitStockAudit's "does a batch already exist"
check (which filters quantity > 0), so every subsequent restock forked a
duplicate batch instead of correcting the real one — 504 of ~509 products
ended up split across two batch rows in the session that found this (see
docs/KNOWN_BUGS.md).

The fix: stock_batches.quantity is never written from a pulled snapshot
at all (mirroring the server's own rule for pushed payloads); instead a
newly-pulled stock_movements row applies its own delta to the batch it
references, exactly like the server's `increment('quantity', delta)`.

## line-__tests__-pull-stock-batches-quantity-not-trusted-test-ts-L165

`client/__tests__/pull-stock-batches-quantity-not-trusted.test.ts:165`

Another device sold 5 from a batch that only had 2 left there — its
own local write floors at 0 (see deductFromBatch() in
lib/db/queries/inventory.ts), but the movement it pushed still
carries the full, unfloored -5 delta. This device's own local batch
must floor identically when applying that same delta, or the two
devices permanently disagree about this batch's on-hand quantity.

## block-__tests__-pull-stringifies-json-columns-test-ts-L15

`client/__tests__/pull-stringifies-json-columns.test.ts:15`

Regression test (final review, Critical C1): the server pulls
permission_groups.permissions as a real JSON array (Eloquent's `array`
cast), but pull.ts's value-normalization only special-cased booleans -
an array/object bound straight into sql.js's statement.bind() is
silently mis-serialized as an object of numeric keys (e.g.
`{"0":0,"1":0}`), not the JSON string every reader downstream
(getStorePermissionGroups, getUserPermissionGroup) expects to
JSON.parse(). This defeats the feature on every device that RECEIVES a
group via sync rather than creating it locally.

## line-__tests__-pull-stringifies-json-columns-test-ts-L65

`client/__tests__/pull-stringifies-json-columns.test.ts:65`

The real shape a Laravel `array`-cast attribute serializes
to in the pull JSON response - a genuine array, not a
pre-stringified value.

## block-__tests__-pull-unique-skip-and-cross-page-ordering-test-ts-L15

`client/__tests__/pull-unique-skip-and-cross-page-ordering.test.ts:15`

Regression tests for two confirmed-live gaps documented in
docs/KNOWN_BUGS.md under "sync-engine/pull.ts stock-quantity correctness
gaps":

1. A UNIQUE-constraint-skipped INSERT was still marked "seen" for cursor
   purposes, so it was never retried.
2. Cross-page "batches before movements" ordering wasn't guaranteed — a
   movement could be pulled on an earlier page than the batch it
   references, silently losing the delta.

## line-__tests__-pull-unique-skip-and-cross-page-ordering-test-ts-L146

`client/__tests__/pull-unique-skip-and-cross-page-ordering.test.ts:146`

The stock_movements cursor is held back until the deferred delta is
applied, then stamped in that same transaction — so by the end of a
successful pull it must be stamped, not left behind.

## block-__tests__-pull-unique-skip-and-cross-page-ordering-test-ts-L155

`client/__tests__/pull-unique-skip-and-cross-page-ordering.test.ts:155`

Residual gap from the same KNOWN_BUGS entry: the deferred delta used to
be applied in a SEPARATE transaction committed AFTER the page loop had
already committed stock_movements' cursor. A crash in that window lost
the delta permanently (a movement's insert branch only ever runs once,
so a re-pull past the advanced cursor never re-derives it).

Here the deferred delta's UPDATE is forced to fail (via a RAISE(ABORT)
trigger) to stand in for that crash. With the old two-transaction
structure the cursor stamp from page 1 would already be committed and
would survive; now the stamp lives in the same transaction as the
deltas, so the failure must roll BOTH back, leaving the cursor unset and
the movements eligible for a clean re-pull.

## block-__tests__-pull-watermark-is-per-store-test-ts-L16

`client/__tests__/pull-watermark-is-per-store.test.ts:16`

A-305. `_sync_state` was keyed by `table_name` alone, so one watermark
served every store a device held, and nothing reset it on a switch. A device
that spent a week on store A advanced every table's watermark to "now"; on
switching to B the pull asked for B's rows changed since *now*, and
everything B changed that week was never delivered — while every watermark
read perfectly current, which is why nothing looked wrong.

Measured on production 2026-10-19: 17 undelivered `sales`, 518
`sale_items`, 520 `sale_item_batches`, 520 `stock_movements` on one
two-store device, unchanged across nine syncs over three hours.

## line-__tests__-pull-watermark-is-per-store-test-ts-L71

`client/__tests__/pull-watermark-is-per-store.test.ts:71`

Store B has never synced `sales`, so it must ask for everything. With a
shared watermark it would have asked for changes since 11:00 and never
received anything store A's week of syncing had already advanced past.

## block-__tests__-pull-window-rewind-budget-test-ts-L15

`client/__tests__/pull-window-rewind-budget.test.ts:15`

A-218: both rewind call sites used to wipe the table's `_sync_state` row,
which pullChanges reads as "pull this table from timestamp zero". A table
held in `skippedTables` by a parked `_sync_queue` row can never re-stamp
the window, so the baseline was gone and every later round re-requested
the whole catalogue, for ever.

## block-__tests__-pull-window-rewind-budget-test-ts-L122

`client/__tests__/pull-window-rewind-budget.test.ts:122`

A-256. `feedback` is the crash log: never sent by pull(), so its window
can never drain clean and `completeWindow` can never refresh its budget.
Restoring and reporting it every round is therefore permanent - and each
report is itself a crash log, the row that caused the exhaustion. The
row is dropped instead, which also heals a device already stuck.

## block-__tests__-pull-window-rewind-budget-test-ts-L143

`client/__tests__/pull-window-rewind-budget.test.ts:143`

A-273. The report was fired unawaited, so one push round's worth of
concurrent calls raced past logCrash's own SELECT-then-INSERT dedup and
each wrote its own byte-identical `feedback` row (~30 observed from one
iPhone). Awaiting it is what lets that dedup see the previous row.

## block-__tests__-pull-window-rewind-budget-test-ts-L170

`client/__tests__/pull-window-rewind-budget.test.ts:170`

A-273. The old wording ("this device cannot converge on its own") was
false: the budget is per round, `completeWindow` refreshes it, and the
incremental pull keeps running throughout.

## block-__tests__-purchase-order-details-permissions-test-tsx-L4

`client/__tests__/purchase-order-details-permissions.test.tsx:4`

Procurement used to be one coarse RequireRole gate (isAdmin ||
canManageStockBatch) covering creating, editing, sending, deleting AND
receiving a purchase order. "manage_purchase_orders" now fronts the
write-the-order actions and "receive_purchase_orders" fronts booking the
goods in, which is a genuinely different job: a stockroom account can be
allowed to receive a delivery without being allowed to raise or amend
the order it arrived against. The order itself, and Download PDF, stay
visible to anyone who can reach the panel.

## block-__tests__-push-accepts-server-generated-uuid-v7-test-ts-L15

`client/__tests__/push-accepts-server-generated-uuid-v7.test.ts:15`

push.ts guards products against a non-UUID category_id/supplier_id so one
bad row cannot block the whole queue. Its version nibble was [1-5], which
only admits UUID v1-v5 — but Laravel's HasUuids emits **v7**, so any row
the SERVER created and a product then referenced was rejected by the
client's own guard and parked in _sync_queue indefinitely.

Hit in production: sync:repair-cross-tenant-categories created one
category server-side for store 571582a9, and products repointed onto it
could never push ("Invalid category_id (not a UUID)", DUMOSRX-CLIENT-22).
A real v7 id from that server is used below.

## block-__tests__-push-background-backs-off-failing-item-test-ts-L19

`client/__tests__/push-background-backs-off-failing-item.test.ts:19`

A queue item the server rejects for a permanent, non-conflict reason
(unknown column, FK violation) must back off exponentially across
repeated BACKGROUND sync cycles rather than being re-sent on every one.
It used to be re-sent every cycle because the auto-sync daemon called
sync(true) — and `isManual` also means "ignore per-item backoff" (see
docs/FIXED_BUGS.md, A-5).

## line-__tests__-push-background-backs-off-failing-item-test-ts-L85

`client/__tests__/push-background-backs-off-failing-item.test.ts:85`

Second background cycle, immediately after: the item is still inside
its backoff window, so it must not be re-sent. A report-only request
(changes: []) may still go out so the queue can attract an operator
command — see push-delivers-command-results-when-queue-is-empty.

## block-__tests__-push-batches-db-export-test-ts-L15

`client/__tests__/push-batches-db-export.test.ts:15`

Regression test for a real crash: once a manual sync started retrying a
large (~2488 item) backlog in one run (see the backoff-bypass fix), each
synced/failed item in a batch called recordSyncFailure/markSynced, which
each call execute() outside of transaction() — and execute() triggers a
full db.export() (the whole database re-serialized into a fresh
ArrayBuffer) after every single statement when not inside a transaction
(see transaction()'s own doc comment in core.ts). Dozens of exports per
batch, times ~50 batches, exhausted memory ("Array buffer allocation
failed") and left the WASM heap in a state where subsequent prepare()
calls threw "bad parameter or other API misuse". Wrapping each batch's
local writes in a single transaction() defers that export to once per
batch instead of once per item.

## block-__tests__-push-categories-sort-order-test-ts-L4

`client/__tests__/push-categories-sort-order.test.ts:4`

Regression: the previous comparator
`(a, b) => (a.table_name === "categories" ? -1 : b.table_name === "categories" ? 1 : 0)`
returned -1 for BOTH `compare(a, b)` and `compare(b, a)` whenever a and b
were both categories - an inconsistent comparator, which V8's sort doesn't
guarantee any particular result for beyond "some order", and in practice
reversed the created_at order of every category-vs-category pair. A
create-then-rename pair queued as [INSERT, UPDATE] was pushed to the
server as [UPDATE, INSERT], so the server applied the stale INSERT last
and the rename was silently lost on the next pull.

## block-__tests__-push-coalesces-same-record-updates-test-ts-L22

`client/__tests__/push-coalesces-same-record-updates.test.ts:22`

Regression coverage for a Critical review finding on the _known-bugs.md
#11 fix: update() no longer bumps `_version` locally (correct for the
two-device case), but `addToSyncQueue` still appends one new
`_sync_queue` row per update() call with NO coalescing. Two ordinary
SEQUENTIAL edits to the SAME row before the next sync therefore queue two
separate rows that both freeze the identical base `_version`. Pushed
together, the server accepts the first (bumping its version) and rejects
the second as a false "version_conflict" — a single-device edit silently
lost, with a misleading "conflict" signal, even though there was never
any other device involved.

This reproduces the REAL trigger, not an abstract two-field case:
use-pos-payment.ts's mixed/credit checkout does
`update("customers", id, {outstanding_balance})` immediately followed by
`update("customers", id, {loyalty_points})` on the SAME customer row, with
no sync in between (see push.ts's coalescePendingUpdates() doc comment).

## line-__tests__-push-coalesces-same-record-updates-test-ts-L71

`client/__tests__/push-coalesces-same-record-updates.test.ts:71`

update()/insert() also queue an audit_logs INSERT into _sync_queue on
every call (see logAction() in core.ts) — real, correct behavior, but
orthogonal to what this file tests (customers-row UPDATE coalescing).
Stripped out after each write so assertions here can stay focused on
the customers rows specifically, without asserting on audit-log
bookkeeping this fix doesn't touch.

## block-__tests__-push-coalesces-same-record-updates-test-ts-L81

`client/__tests__/push-coalesces-same-record-updates.test.ts:81`

A second pending UPDATE for the same record. Seeded directly because
write-time collapsing (A-203) now keeps one pending UPDATE per record, so
a multi-row backlog only exists on a device that queued it before that
shipped — which is exactly the state push-time coalescing is still for.

## line-__tests__-push-coalesces-same-record-updates-test-ts-L128

`client/__tests__/push-coalesces-same-record-updates.test.ts:128`

Carries the EARLIEST entry's base version (1 — insert()'s starting
value; unchanged by either update() per the _version fix), not the
second edit's snapshot.

## line-__tests__-push-coalesces-same-record-updates-test-ts-L178

`client/__tests__/push-coalesces-same-record-updates.test.ts:178`

The server only ever sees ONE change for this record (asserted in the
test above), so it can only ever report ONE failed entry for it — the
mock above reflects that real constraint.

## line-__tests__-push-coalesces-same-record-updates-test-ts-L184

`client/__tests__/push-coalesces-same-record-updates.test.ts:184`

Every underlying queue row for this record is gone — not just the
representative one, which would silently strand the other half of
the merged edit forever.

## block-__tests__-push-delivers-command-results-when-queue-is-empty-test-ts-L15

`client/__tests__/push-delivers-command-results-when-queue-is-empty.test.ts:15`

Command outcomes rode along with queued changes, so a push happened only
when there was something queued. But the commonest successful outcome
EMPTIES the queue — abandoning or retrying the last stuck row — which left
the outcome with nothing to travel on and the operator looking at a command
that is forever "queued". An idle device could not pick a command up at
all, for the same reason.

## block-__tests__-push-delivers-command-results-when-queue-is-empty-test-ts-L110

`client/__tests__/push-delivers-command-results-when-queue-is-empty.test.ts:110`

The case the whole command channel exists for. A stuck row is by
definition one whose retries have backed off, and getPendingSyncItems()
excludes a backed-off row from an auto-sync - so the device would never
send anything, and the `retry` command issued FOR that row could never
reach it. The queue is not empty; it is just not due.

## block-__tests__-push-fixes-stale-null-batch-number-test-ts-L15

`client/__tests__/push-fixes-stale-null-batch-number.test.ts:15`

Regression test for a real report: fixing importProductRows() to stop
writing batch_number: null (see product-import.ts) only prevents NEW
stock_batches inserts from having the bug — any row already sitting in
_sync_queue keeps its frozen JSON snapshot from before the fix, still
carrying the literal null. Those kept failing the server's NOT NULL
constraint on every retry, indefinitely, since a client code fix alone
can't rewrite data already queued. Confirmed via a real failure log: a
still-queued stock_batches INSERT from before the fix, retried after the
backoff-bypass change, failing with the exact same "Column batch_number
cannot be null" error. push.ts must patch it defensively at push time.

## block-__tests__-push-fixes-stale-null-batch-number-test-ts-L71

`client/__tests__/push-fixes-stale-null-batch-number.test.ts:71`

Regression coverage for a review finding on the round-2 stock_batches
version-conflict exemption (_known-bugs.md #11): this same fallback
used to run unconditionally for EVERY stock_batches change, including
ordinary UPDATEs. A real quantity-only sale UPDATE (see
updateStockBatchQuantity()/deductFromBatch() in
lib/db/queries/inventory.ts, restoreBatchQuantity() in
lib/db/queries/returns.ts) queues a payload of just
{quantity, updated_at, _version, _synced} — no batch_number at all — so
this line was silently injecting the placeholder into it. The server's
narrowed exemption (SyncController::push) only fires when the payload
is provably quantity-only after stripping bookkeeping fields; with
batch_number always present, it was never actually empty, so the
exemption never fired — reintroducing the exact false version_conflict
on ordinary multi-terminal sales the exemption was built to prevent.
Gating the fallback to INSERT-only (matching its actual, stated
rationale: a NOT NULL column on legacy queued INSERTs) fixes this.

## line-__tests__-push-fixes-stale-null-batch-number-test-ts-L104

`client/__tests__/push-fixes-stale-null-batch-number.test.ts:104`

The real batch_number was never touched by this fallback at all —
still exactly what the local row already had, not overwritten with
a placeholder and not sent back to the server to clobber anything.

## block-__tests__-push-holds-back-record-with-backed-off-sibling-test-ts-L19

`client/__tests__/push-holds-back-record-with-backed-off-sibling.test.ts:19`

Regression coverage for a second review finding on _known-bugs.md #11's
coalescing fix (push-coalesces-same-record-updates.test.ts): coalescing
alone isn't enough, because getPendingSyncItems() (via a background,
non-manual sync) only returns queue rows that are currently due per
`next_retry_at`. Sequence this closes:

  1. Edit A on a record fails for a retryable reason and enters backoff
     (recordSyncFailure sets next_retry_at in the future).
  2. Edit B is queued for the SAME record before A comes due.
  3. The next background sync sees only B (A is still backed off) —
     without this fix, it would coalesce/push B alone, the server would
     accept it and bump the version, and when A later comes due on its
     own it would collide against that bump with a stale base version:
     a false version_conflict silently dropping A's fields.

This is a narrower variant of the original Critical bug (needs a specific
retry-timing sequence, not just two ordinary sequential edits), closed by
withheldRecordsWithBackedOffSiblingsRemoved() in push.ts: a background
sync now holds back EVERY currently-due row for a record that has any
sibling row still backed off, rather than letting the due one race ahead.

## line-__tests__-push-holds-back-record-with-backed-off-sibling-test-ts-L72

`client/__tests__/push-holds-back-record-with-backed-off-sibling.test.ts:72`

See push-coalesces-same-record-updates.test.ts's identical helper:
update()/insert() also queue an unrelated audit_logs INSERT on every
call, orthogonal to what this file tests.

## block-__tests__-push-holds-back-record-with-backed-off-sibling-test-ts-L78

`client/__tests__/push-holds-back-record-with-backed-off-sibling.test.ts:78`

A second pending UPDATE for the same record. Seeded directly because
write-time collapsing (A-203) now keeps one pending UPDATE per record, so
a multi-row backlog only exists on a device that queued it before that
shipped — which is exactly the state push-time coalescing is still for.

## block-__tests__-push-id-map-reconciliation-test-ts-L18

`client/__tests__/push-id-map-reconciliation.test.ts:18`

Regression test for the sync bug reported after a bulk import: the server
silently skips an INSERT (and remaps the id) when a category/supplier name
collides with one it already has, but that remap only lived in the memory
of that single push request server-side (see SyncController::push). A
future delta pull only ever reconciles a collision if the pre-existing row
it collided with happens to also appear in that pull's response — a
long-unchanged row like "DRUGS" or "COSMETICS" never will, so any product
referencing the old local id failed its foreign key check forever. This
proves push.ts now applies the server's id_map immediately instead of
waiting on a pull that may never come.

## line-__tests__-push-id-map-reconciliation-test-ts-L99

`client/__tests__/push-id-map-reconciliation.test.ts:99`

A second, still-pending edit to the SAME (now duplicate) category —
e.g. a rename queued locally before this push ran, currently backed
off (next_retry_at in the future) so it's NOT part of this push's own
batch, the same as a row that simply hadn't come due yet. Without
remapping its own record_id, the server would look this up by the
vanished LOCAL_CAT id and reject it forever.

## block-__tests__-push-limits-conflict-toasts-test-ts-L22

`client/__tests__/push-limits-conflict-toasts.test.ts:22`

Regression test for a real crash: one toast.warning() call per conflicted
record was fine when conflicts were rare (the assumption baked into the
comment above this loop), but a single push batch can report up to
SYNC_BATCH_SIZE (50) failures at once - exactly what happens draining a
large backlog (e.g. the mass-requeue-on-boot bug fixed alongside this).
Sonner's Toaster does a flushSync-driven state update per toast call, and
~25-30 of those fired synchronously in the same tick trips React's
"Maximum update depth exceeded" guard, crashing the whole page - reported
live via the crash logger, with `pushChanges` at the bottom of the stack.

## block-__tests__-push-manual-bypasses-backoff-test-ts-L15

`client/__tests__/push-manual-bypasses-backoff.test.ts:15`

Regression test for a real report: after a large import produced many
repeated sync failures, the resulting exponential backoff (capped at 1
hour — see recordSyncFailure in base-helpers.ts) left every queued item's
next_retry_at in the future. getPendingSyncItems() correctly excludes
those from a background auto-sync, but pushChanges() applied that same
filter even for an explicit, user-clicked "Sync Now" — so a manual sync
silently pushed nothing (no network request at all) and still reported
"success", with no way for the user to force a retry before the backoff
window passed. A manual sync should always attempt the full queue.

## block-__tests__-push-manual-bypasses-backoff-test-ts-L63

`client/__tests__/push-manual-bypasses-backoff.test.ts:63`

The request that does go out carries no changes: a non-empty queue still
has to be able to attract an operator command, and a stuck row is by
definition one that has backed off out of reach (see
push-delivers-command-results-when-queue-is-empty.test.ts). What must
never happen is the backed-off row itself being sent.

## block-__tests__-push-marks-source-row-synced-test-ts-L22

`client/__tests__/push-marks-source-row-synced.test.ts:22`

Regression coverage for a real, reproduced bug: markSynced() only ever
DELETEd the processed _sync_queue row — it never set the SOURCE table
row's own `_synced` flag back to 1. Every write already sets `_synced = 0`
at insert()/update() time (base-helpers.ts), so once its queue row is
deleted after a successful push, the row is left permanently looking
"unsynced with no queue entry" — exactly the condition
requeueOrphanedRows() (reconcile-identity.ts, run every app boot from
DatabaseProvider.tsx) treats as needing a fresh queue entry. That
mass-requeues a device's entire already-synced history on every boot,
producing (for insert-only tables like audit_logs, which the server
treats a resubmitted INSERT as a stale-timestamp conflict) a runaway
"could not be saved" toast loop and a growing _sync_queue backlog.

## block-__tests__-push-never-rewinds-for-telemetry-test-ts-L12

`client/__tests__/push-never-rewinds-for-telemetry.test.ts:12`

A crash log that conflicts used to rewind the `feedback` pull window like
any other table. Two things make that catastrophic rather than merely
useless: the client never needs to re-pull its own crash logs, and
`restoreBaseline()` reports the exhausted budget by calling `logCrash()` -
which writes ANOTHER `feedback` row, which conflicts, which rewinds, which
logs. Observed in production on 2026-10-12: 1,228 events from one device,
escalating, with crash reporting generating the crash it reported.

## block-__tests__-push-paces-large-backlogs-test-ts-L15

`client/__tests__/push-paces-large-backlogs.test.ts:15`

Regression test for a real report: the backoff-bypass fix means a manual
sync can now fire dozens of batch requests back-to-back with no spacing,
which the API's throttle:60,1 middleware (60 requests/minute, see
routes/api.php) rejects with "Too Many Attempts" once a large backlog
(e.g. ~2488 items / 50 per batch = ~50 requests) is retried in one run.
A short pause between batches keeps a large backlog under that budget.

## block-__tests__-push-reports-batch-exceptions-test-ts-L15

`client/__tests__/push-reports-batch-exceptions.test.ts:15`

Regression test found via a critical review of sync-engine/: a batch that
throws before/during the network call (corrupted queue JSON, a network
error, an unexpected response shape) is caught, recorded as a per-item
backoff failure, and the loop moves on to the next batch — correct, so one
bad batch can't block the rest. But pushChanges() then resolved with
{pushed: 0} and no way to tell the caller anything actually went wrong:
sync() returned {success: true}, and sync-indicator.tsx showed a green
"Sync completed successfully" toast even though nothing was pushed. This
proves pushChanges() now reports how many batches hit that exception path.

## line-__tests__-push-reports-batch-exceptions-test-ts-L79

`client/__tests__/push-reports-batch-exceptions.test.ts:79`

Regression: a batch-level `{ success: false }` response (the request
completed - no exception - but the server rejected the whole batch, e.g.
auth/validation/rate-limit) previously had no handling at all: no
markSynced, no recordSyncFailure, no backoff, no retry counter, no crash
report. The item was silently retried forever on every sync tick with
zero visibility, and pushChanges() reported it identically to a clean
success (failedBatches stayed 0).

## block-__tests__-push-rewinds-once-per-table-per-batch-test-ts-L25

`client/__tests__/push-rewinds-once-per-table-per-batch.test.ts:25`

A-273. A rewind re-opens the whole table's window, so a second one in the
same batch asks for something the first already asked for while spending
another unit of a budget of three. Fifty refusals therefore exhausted the
budget inside one batch and `restoreBaseline()` put the watermark back —
cancelling the re-pull the first rewind had correctly requested, so the row
that genuinely lost its conflict was never re-offered (the A-205 case
failing silently). Rationale: client/AGENTS.md, "Pull window rewinds".

## block-__tests__-push-settles-conflicted-audit-logs-test-ts-L21

`client/__tests__/push-settles-conflicted-audit-logs.test.ts:21`

A terminal conflict (version_conflict/stale_timestamp) deletes the
_sync_queue row, but markSynced() only ever runs for changes the server
ACCEPTED - so the source row kept `_synced = 0` forever. requeueOrphanedRows()
runs on every app boot over STORE_SCOPED_TABLES (audit_logs included) and
re-queues any `_synced = 0` row with no queue entry, so the same handful of
audit_logs rows were resurrected, re-pushed and re-conflicted on every launch,
keeping the user-facing "N unsynced changes" count permanently non-zero.

Other tables self-heal because a later pull brings down the server's
authoritative row matched by the SAME id. audit_logs can never self-heal that
way: the server stores the client's UUID only inside properties->client_id and
keeps its own auto-increment bigint as the row id, so no pull will ever match.

## block-__tests__-push-settles-permission-denied-rows-test-ts-L21

`client/__tests__/push-settles-permission-denied-rows.test.ts:21`

A `permission_denied` rejection means the caller has no access to the row's
store at all, so - unlike a version_conflict - no future pull can ever bring
the server's version down to settle it. Dropping only the _sync_queue row
leaves the source row at `_synced = 0` with no queue entry, which
requeueOrphanedRows() (DatabaseProvider, forced on any crash-flagged launch)
re-queues into the same refusal forever. See docs/FIXED_BUGS.md A-161.

`forbidden` is the deliberate counter-case and is covered here so the two
classifications stay pinned side by side - see docs/KNOWN_BUGS.md A-165.

## block-__tests__-push-silences-audit-log-conflicts-test-ts-L22

`client/__tests__/push-silences-audit-log-conflicts.test.ts:22`

audit_logs is push-only telemetry the user never edits locally, same as
feedback (which push.ts already silences the same way, just below). It
has no `_version` field in its queued payload at all (logAction() never
sets one), so a resubmitted INSERT the server already has falls to the
legacy stale_timestamp fallback and is rejected as a "conflict" - a sync
plumbing detail, not a real edit collision the user made anything happen
to. Surfacing it as "A change to Activity Log could not be saved..." is
misleading (the user never edited anything) and, combined with the
mass-requeue-on-boot bug markSynced() now fixes, was producing a toast
loop on every app launch.

## block-__tests__-push-version-conflict-handling-test-ts-L22

`client/__tests__/push-version-conflict-handling.test.ts:22`

Regression coverage for _known-bugs.md #11's client-side conflict
handling: a `version_conflict` (or legacy `stale_timestamp`) entry in
response.failed means this exact edit's base version is permanently
stale — retrying it through recordSyncFailure's exponential-backoff path
can never succeed, since the base version doesn't change no matter how
many times it's resent. push.ts must instead drop the item from
`_sync_queue` outright and surface a visible, "loud not silent" signal
(a toast), rather than the old silent-retry-forever (or silent-accept)
behavior.

## line-__tests__-push-version-conflict-handling-test-ts-L56

`client/__tests__/push-version-conflict-handling.test.ts:56`

Cases below do not all set up a pull window; a budget left exhausted by
an earlier one makes restoreBaseline() log a crash, which queues its own
`feedback` row (A-273 made that report awaited, so it lands in time to
be counted).

## line-__tests__-push-version-conflict-handling-test-ts-L90

`client/__tests__/push-version-conflict-handling.test.ts:90`

The title's other half, previously unasserted. `_synced = 0` with no
queue row is the only local marker that this row's content differs from
the cloud: the device report reads it, and the stock fold shields a
batch because of it. The pull is what settles a version_conflict, so
nothing here may flip it.

## line-__tests__-push-version-conflict-handling-test-ts-L127

`client/__tests__/push-version-conflict-handling.test.ts:127`

Deliberately does not assert (or claim) "another device" — the client
can't actually verify who/what changed the record server-side, only
that this edit no longer matches what it was based on. See push.ts's
toast wording comment.

## line-__tests__-push-version-conflict-handling-test-ts-L136

`client/__tests__/push-version-conflict-handling.test.ts:136`

Simulates a lost-response scenario: this queue row's first send
already timed out once (recordSyncFailure bumped retry_count to 1
before this, the retried, send). The version_conflict this retry now
hits is very likely this device colliding with its own earlier,
actually-successful write, not a genuinely conflicting edit.

## line-__tests__-push-version-conflict-handling-test-ts-L174

`client/__tests__/push-version-conflict-handling.test.ts:174`

Item B: an ordinary, otherwise-valid change in the SAME batch, so
`changes` isn't empty and the network call (which then throws) is
actually attempted, landing both items in the catch block's full
`batch` iteration.

## line-__tests__-push-version-conflict-handling-test-ts-L220

`client/__tests__/push-version-conflict-handling.test.ts:220`

Reproduces the mid-flight-edit race: an earlier push for this record
already completed and bumped the local row's _version to 2 (e.g. via
the `versions` handling exercised in the test below), but THIS queue
row was created by an update() call that ran before that bump landed,
so its frozen payload still carries the old _version: 1. Without
re-reading the current version at send time, this payload would be
sent as-is, collide against the server's already-bumped version, and
get dropped as a false "version_conflict" - silently losing a
completely ordinary, non-conflicting edit.

## line-__tests__-push-version-conflict-handling-test-ts-L251

`client/__tests__/push-version-conflict-handling.test.ts:251`

A queue row naming a table that doesn't exist locally (e.g. a stale
row from a schema this device hasn't migrated) makes the re-read
query throw. That must not reject the whole batch's Promise.all and
take every other item in it down too - it should fall back to the
frozen value for just this one item.

## line-__tests__-push-version-conflict-handling-test-ts-L306

`client/__tests__/push-version-conflict-handling.test.ts:306`

`permission_denied` is the server's stable reason for a payload
sanitizePermissionGroupSyncPayload refuses on privilege grounds. The
payload is frozen and the caller's own grants don't change by resending
it, so retrying can never succeed - the realistic producer is an
upgrading device's catalog-backfill push arriving after the server's own
backfill already applied the same superset. See client/AGENTS.md's
"Catalog versioning and the default-group backfill".

## block-__tests__-push-version-conflict-handling-test-ts-L356

`client/__tests__/push-version-conflict-handling.test.ts:356`

A-205: dropping the queue row changes nothing server-side, so nothing
bumps that row's `updated_at`. Once the pull watermark passes it the
incremental pull never offers it again and the device keeps the value
that LOST the conflict, permanently. The drop has to rewind the
watermark for that table so the server re-offers the row.

## block-__tests__-query-key-scoping-test-ts-L8

`client/__tests__/query-key-scoping.test.ts:8`

Regression coverage for the query-key scoping fix in lib/query-keys.ts's
`resource()`. Every key is suffixed with the active store id and current
user id (lib/db/core.ts) precisely so a switch of store/user can never
resolve to a cache slot the previous store/user's queries already own.
This is the structural guarantee behind the "cross-account data spill"
fix: even a caller that forgets to clear the query cache on switch can't
leak, because the switch itself changes which key is read/written.

## line-__tests__-query-key-scoping-test-ts-L52

`client/__tests__/query-key-scoping.test.ts:52`

A dashboard fetch is issued under store A / user 1. This is the key
React Query would use to cache whatever that in-flight request
eventually resolves with, even if it resolves after the switch below.

## line-__tests__-query-keys-test-ts-L16

`client/__tests__/query-keys.test.ts:16`

insert()/update()/etc. in base-helpers.ts now wrap their writes in
transaction() for atomicity (see docs/FIXED_BUGS.md's 2026-09-24
entry). The real transaction() calls initDatabase() when `db` is unset
- true in this test environment - which tries to load the real sql.js
wasm binary and fails. Mocked to just invoke its callback directly,
matching this suite's intent of exercising the predicate-building
logic, not real transaction/DB semantics.

## line-__tests__-query-keys-test-ts-L67

`client/__tests__/query-keys.test.ts:67`

Medium bug fix: reseller-commission-panel.tsx and
transaction-details-dialog.tsx wrote their queryKey by hand
(["resellerCommission", ...] / ["customerById", ...]) instead of going
through this factory, so they carried no store/user suffix even though
their query functions resolve the active store at call time - served
from the wrong store's (or wrong user's) cached data after a switch.

## line-__tests__-query-keys-test-ts-L90

`client/__tests__/query-keys.test.ts:90`

--- Predicate-based invalidation ---

Both base-helpers.ts (invalidateQueriesForTable) and the sync-engine pull
handler build a `predicate` function and hand it to
queryClient.invalidateQueries({ predicate }). We can't easily observe a
real QueryClient's cache here, so instead we capture the predicate that
was passed and exercise it directly against fake `Query`-shaped objects,
the same way the real QueryClient would when walking its cache.

## block-__tests__-query-retries-on-statement-closed-test-ts-L8

`client/__tests__/query-retries-on-statement-closed.test.ts:8`

Regression test for a real, reproduced-in-production-testing bug: a
concurrent write operation could invalidate a query()'s in-flight
prepared statement mid-read-loop (see docs/KNOWN_BUGS.md's sync-engine
"Statement closed" entry), and every subsequent `.step()` call on that
statement threw "Statement closed" forever after — permanently wedging
whatever was running the query (the sync engine, in the reproduction).

A SELECT has no side effects, so the fix retries once against a freshly
`prepare()`d statement instead of surfacing the error as terminal. This
test drives that retry path directly with a fake `db` whose first
`.prepare()` returns a statement that throws "Statement closed" on
`.step()`, and whose second `.prepare()` returns a working one — without
needing to actually reproduce the underlying concurrency race.

## block-__tests__-query-torn-read-retry-test-ts-L9

`client/__tests__/query-torn-read-retry.test.ts:9`

Regression coverage for the Product Catalog's "No products found" flash
during a large sync (see docs/KNOWN_BUGS.md).

query() yields a tick back to the browser every QUERY_YIELD_INTERVAL rows
so a big result set doesn't block painting. sql.js has one shared
connection with no reader isolation, so a write landing during one of
those yields modifies the very table the live statement is stepping
through — SQLite's behavior there is undefined, and the observed outcome
was a silently short (in the worst case empty) result with no error
raised. query() now re-runs the read instead of returning it.

Only queries big enough to reach a yield point are exposed to this, which
is why the ~1900-row catalog query flashed empty while the single-row
"Total Products" aggregates stayed correct in the same window.

## block-__tests__-read-only-tab-blocks-writes-test-ts-L9

`client/__tests__/read-only-tab-blocks-writes.test.ts:9`

Proves core.ts's write path actually enforces the single-writer-tab
election from tab-lock.ts (docs/KNOWN_BUGS.md C1): a tab that lost (or
never won) the election must never touch the shared sql.js database, since
doing so is exactly the silent last-write-wins data loss C1 was about.
tab-lock.test.ts already covers the election logic itself in isolation;
this covers core.ts's execute()/transaction() actually consulting it.

## block-__tests__-read-only-tab-skips-migration-persistence-test-ts-L12

`client/__tests__/read-only-tab-skips-migration-persistence.test.ts:12`

Regression coverage for a gap an independent review caught in the C1
(single-writer-tab) fix: initDatabase() used to run schema migrations
BEFORE electing this tab's writer/read-only role, and one of those
migrations (clearLegacyTransactionsOnce, still live for any device that
hasn't crossed its one-off flag yet) persists a destructive cleanup
straight to the shared IndexedDB snapshot via the callback passed into
runSchemaMigrations - a tab that turns out to be read-only could still
have won that race and overwritten the real writer's snapshot before
ever learning it lost the election. Fixed by electing first, then only
wiring that persistence callback in for the writer tab.

## line-__tests__-read-only-tab-skips-migration-persistence-test-ts-L29

`client/__tests__/read-only-tab-skips-migration-persistence.test.ts:29`

Deliberately NOT set - this test wants clearLegacyTransactionsOnce to
actually run (see init-database-migrations.test.ts, which sets this
to bypass it for tests that don't care about this specific path).

## block-__tests__-receipt-preview-follows-paper-size-test-tsx-L33

`client/__tests__/receipt-preview-follows-paper-size.test.tsx:33`

The preview used to be a second, hand-drawn receipt that knew nothing about
paper size, so the selector beside it appeared to do nothing — and it drifted
from what actually prints. It renders the real ReceiptView now.

## line-__tests__-receive-item-card-price-fields-test-tsx-L21

`client/__tests__/receive-item-card-price-fields.test.tsx:21`

The panel's A-26 dropped-receipt banner reads the local database; this file
is about the price fields, so the signal is stubbed away rather than
initialising sql.js (which has no /sql-wasm.wasm under vitest).

## block-__tests__-receive-item-card-price-fields-test-tsx-L51

`client/__tests__/receive-item-card-price-fields.test.tsx:51`

The phone-width receiving cards only ever exposed Qty/Lot/Expiry, while
the desktop ledger for the same step also takes a Cost Price and a New
Selling Price. A vendor price change recorded on a phone was therefore
silently dropped, and the receive-path price-change toast could never
fire there.

## block-__tests__-receive-item-category-editor-permission-test-tsx-L59

`client/__tests__/receive-item-category-editor-permission.test.tsx:59`

Item 5: a delivery is when a wrongly-filed product gets noticed, but the
receive ledger has no room for a category column - so it gets a pencil
beside the product name instead, gated on manage_products the same way
stock-batch/transfer-stock-dialog.tsx gates its own product writes.

## block-__tests__-receive-po-dropped-receipt-banner-test-tsx-L47

`client/__tests__/receive-po-dropped-receipt-banner.test.tsx:47`

A-26: the receiving screen used to show a collapsed second receipt as an
ordinary outstanding balance, with nothing saying a receipt had been
dropped. This is the surface half of the fix.

## block-__tests__-reconcile-identity-test-ts-L10

`client/__tests__/reconcile-identity.test.ts:10`

Regression test for the real incident this session: a device used
offline before ever linking to a cloud account generated local-only
ids for its store and user, which were never reconciled to the
server's real ids once the device linked. Every row referencing those
local-only ids as a foreign key became permanently unsyncable (see
push.ts / SyncController::push FK failures). reconcile-identity.ts is
the one-time repair tool built to fix an affected device; this test
proves it against a genuine in-memory SQLite engine.

## block-__tests__-reconcile-identity-test-ts-L152

`client/__tests__/reconcile-identity.test.ts:152`

Regression test: called at plain app-boot (DatabaseProvider, not nested
inside any transaction()), this used to INSERT each orphaned row's queue
entry as its own top-level execute() call — each one now reserving the
shared connection lock (core.ts's reserveDbSlot()) and triggering its own
full saveDatabase()/db.export() round trip. On a device with many
orphaned rows across many tables, that serialized N separate lock+export
cycles back-to-back, holding up anything else waiting on the same lock
(e.g. a fast login's own user-lookup query) for far longer than the work
itself needed. Batching a table's requeue INSERTs into one transaction()
(when not already nested in a caller's own transaction) cuts that to one
lock+export cycle per table regardless of row count.

## block-__tests__-reconcile-proceeds-with-pending-deltas-test-ts-L21

`client/__tests__/reconcile-proceeds-with-pending-deltas.test.ts:21`

A-173, corrected in review. An earlier version of this file asserted that
"Health Sync" must REFUSE while deferred deltas are pending, on the theory
that the device would otherwise assert understated quantities over the
server's correct ones.

That theory was wrong, and the guard it justified was removed. A delta is
pending only while its `stock_batches` row is ABSENT locally — that is the
condition that defers it. An absent batch is not in the payload this
function sends, and the server only touches batches that are in the
payload. So the understated write cannot happen, and the guard refused
repairs while protecting nothing — permanently, for any device whose pull
scoping means the batch never arrives.

These tests pin the real safety property instead: a batch with an unapplied
delta is excluded from the payload by construction.

## line-__tests__-reconcile-stock-quantities-test-ts-L131

`client/__tests__/reconcile-stock-quantities.test.ts:131`

Not calls[0]: reconcile now checks _pending_stock_deltas first, so a
device holding unapplied deltas cannot assert its quantities as
authoritative (A-173).

## block-__tests__-record-customer-payment-atomicity-test-ts-L8

`client/__tests__/record-customer-payment-atomicity.test.ts:8`

Regression: recordCustomerPayment() wrote the customer_payments receipt,
reduced customers.outstanding_balance, and settled individual sales via
applyCreditPaymentFIFO() as three independent, individually-committed
steps - no transaction(). A throw partway through (e.g. inside the FIFO
loop's per-sale update) left a real payment receipt and an already-reduced
balance behind while the underlying sales stayed pending/partial: the
debtor ledger and the per-sale settlement permanently disagree, and the
next payment would re-settle sales that were already paid for.

## block-__tests__-record-sale-item-stock-atomicity-test-ts-L22

`client/__tests__/record-sale-item-stock-atomicity.test.ts:22`

A-219: `recordSaleItemStock()` decremented `stock_batches.quantity` per
batch and inserted the matching `stock_movements` row only afterwards, in
a separate loop — each write taking its own slot on core.ts's FIFO queue.
In the window between them the batch reads as diverged by exactly the sale
quantity, so a concurrent stock fold writes the pre-sale number back and
the sale's deduction is lost until the next day's heal.

## block-__tests__-record-sale-item-stock-depleted-batch-test-ts-L9

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:9`

Regression test for a silent-oversell bug found while smoke-testing POS
(docs/features/pos.md): once a product's only stock_batches row hit 0 (or
went negative), getBatchesForProduct's `quantity > 0` filter correctly
excluded it for FEFO picking, but the payment loop then had *no* batch to
attribute the sale to at all. The sale and its sale_items row still
completed and were recorded as revenue, while the stock_batches quantity
and stock_movements ledger were left completely untouched for that unit —
an untracked, unauditable inventory loss with no error or warning
anywhere. Confirmed against the real app data (a live sale with no
matching stock_movements row) before this fix.

recordSaleItemStock (lib/db/queries/inventory.ts) now falls back to the
product's most-recently-touched active batch when none has positive
stock, so the deduction/movement is still recorded (batch going further
negative) instead of vanishing.

## line-__tests__-record-sale-item-stock-depleted-batch-test-ts-L26

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:26`

Relative to "now" (not hardcoded dates) so these stay valid, unexpired
expiry dates as real time passes - getBatchesForProduct excludes
already-expired batches from FEFO picking.

## line-__tests__-record-sale-item-stock-depleted-batch-test-ts-L63

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:63`

The one batch this product has is already at 0 — e.g. it was sold
down to nothing in an earlier transaction — so getBatchesForProduct's
`quantity > 0` filter would find nothing for it.

## line-__tests__-record-sale-item-stock-depleted-batch-test-ts-L88

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:88`

Floored at 0 (bug #4 fix), not left arbitrarily negative — the sale
(a legitimate oversell, since the batch had 0 to give) still records
the true -1 deduction in stock_movements above.

## line-__tests__-record-sale-item-stock-depleted-batch-test-ts-L106

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:106`

A-57: this used to write a sale_item row with a null stock_batch_id and
NO stock_movements row at all — revenue with zero ledger trace and zero
COGS. Unreachable from the POS (the catalog query hides such a product),
but the online-order fulfilment path has no equivalent guard, so every
sale line must now produce exactly one stock_movements row.

## line-__tests__-record-sale-item-stock-depleted-batch-test-ts-L174

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:174`

Reproduces the narrower variant of the same bug: getBatchesForProduct
returns a non-empty list (one batch with 1 unit left), so the
zero-batches fallback never triggers, but the cart line oversells
beyond what that batch has. The normal deduction loop deducts the 1
unit it can and stops — the leftover 2 units must still be picked up
by the fallback instead of vanishing untracked.

## line-__tests__-record-sale-item-stock-depleted-batch-test-ts-L222

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:222`

Same setup as the partial-shortfall test above (1 unit in stock, sale
of 3): the main loop deducts 1 from batch1 and bumps its updated_at,
leaving remainingToDeduct = 2. getAnyActiveBatchForProduct then finds
batch1 again (it's the only/most-recently-touched active batch), so
deductFromBatch runs on it a second time. Before the fix this produced
a SECOND sale_item_batches row and a SECOND stock_movements row for
the same (sale_item, batch) pair instead of merging into the first.

## line-__tests__-record-sale-item-stock-depleted-batch-test-ts-L262

`client/__tests__/record-sale-item-stock-depleted-batch.test.ts:262`

Two distinct batches, both with positive stock, sale quantity exceeds
the first (FEFO-earliest) batch alone. The fix must not collapse
legitimately different batches into a single row.

## block-__tests__-remap-requeues-only-remapped-rows-test-ts-L9

`client/__tests__/remap-requeues-only-remapped-rows.test.ts:9`

A-295's driver. `remapForeignKey()` flips the FK of the rows it remaps and
then has to backfill their queue entries, because `_synced = 0` alone never
reaches push(). It did that by calling `requeueOrphanedRows()` on the whole
referenced table, so ONE category-name collision re-queued every unsynced
product on the device. Measured on production: 9,181 `products`
`version_conflict` INSERT refusals in six days on store `571582a9`, with a
2,735-product catalogue and not one of them a row the cloud was missing —
roughly 3.4 whole-table sweeps' worth. Each sweep's rows go up as INSERTs
carrying the local `_version`, the server treats an INSERT for a row it
holds as a version-checked UPDATE, and a device that cannot converge on
`products` has stale versions, so they are all refused. A terminal conflict
drops the queue row and leaves `_synced = 0`, so the next collision sweeps
them again.

## block-__tests__-report-card-layout-test-tsx-L7

`client/__tests__/report-card-layout.test.tsx:7`

A-158: the report icon sat in its own flex column spanning the full
height of the card, alongside title/description/buttons together - so the
button row (View/Export/Print) only had the card's width minus the
icon's column to work with, and Print wrapped to a second line on a
narrower screen. Reported live from a real store's older/smaller laptop
screen. Moving the icon into the title row instead (icon-title-tag as one
row, with description and the button row spanning the card's full width
beneath it) gives the button row the extra ~52px it needs.

## line-__tests__-report-center-export-permission-test-tsx-L10

`client/__tests__/report-center-export-permission.test.tsx:10`

One frozen object for every render: ReportCenter's refreshRecent
useCallback depends on getRecentDownloads, so a fresh identity per render
would re-fire its useEffect -> setState -> render loop until the heap dies.

## block-__tests__-report-center-financial-permission-test-tsx-L4

`client/__tests__/report-center-financial-permission.test.tsx:4`

"view_financial_reports" is the margin-revealing slice of the Report
Center: the Profit & Loss Summary card, which is the only report here
that puts revenue against cost. It is the reports-side extension of
view_cost_fields - a cashier who may not see a product's cost may not
pull the store's P&L either - and it composes with view_reports, which
decides whether the Report Center exists at all.

## block-__tests__-report-fanout-parallelism-test-ts-L3

`client/__tests__/report-fanout-parallelism.test.ts:3`

getDashboardOverviewData and getBIMetrics each fan out to a dozen-plus
independent reads. Awaiting them one at a time serialises the whole
dashboard behind the slowest possible ordering, so these pin that the
independent reads are actually issued together: every statement must be in
flight before the first one is allowed to resolve.

## line-__tests__-report-fanout-parallelism-test-ts-L21

`client/__tests__/report-fanout-parallelism.test.ts:21`

Two of getDashboardOverviewData's/getBIMetrics's reads go through
lib/db/queries/finance.ts (getSmoothedExpensesTotal/getSmoothedAmountInWindow),
which imports `query` from "@/lib/db/local-database" directly, not from
"@/lib/db" - mocking only the latter leaves that path pointed at the real
query(), which lazily boots a genuine sql.js instance with core.ts's
browser-only locateFile default. Whether that surfaces as a failure
depends only on whether some earlier, unrelated test already "warmed" the
wasm loader's own module-level cache in this worker - i.e. a real bug in
this file's own mock coverage that only *looked* like unrelated ambient
flakiness. Both specifiers resolve to the exact same underlying function
(local-database.ts re-exports core.ts's query verbatim), so both need
mocking here.

## block-__tests__-report-fanout-parallelism-test-ts-L54

`client/__tests__/report-fanout-parallelism.test.ts:54`

Resolves every pending query, including ones a resolved query's own
continuation issues afterward (getSmoothedExpensesTotal awaits its
per-installment getSmoothedAmountInWindow query and only then issues the
next one, rather than firing every installment up front) - a single
resolve-everything-once pass would leave that second wave hanging
forever. Bounded so a genuine bug here fails fast instead of hanging the
suite.

## block-__tests__-report-filter-capabilities-test-ts-L13

`client/__tests__/report-filter-capabilities.test.ts:13`

The in-modal filter bar renders only the controls a report's query can
actually act on, so these two flags are read by the dialog rather than
re-derived from a second list that could drift from REPORT_CONFIG.

## block-__tests__-report-pdf-all-time-subtitle-test-ts-L29

`client/__tests__/report-pdf-all-time-subtitle.test.ts:29`

Regression test: buildReportPdfBlob stamped a period subtitle onto every
PDF whenever dateFrom/dateTo were passed, even for reports configured
takesDateRange: false (stock_batches, customers) that are always all-time
and never actually filter by that range - mislabeling all-time data as
scoped to a period it was never filtered by.

## line-__tests__-report-reconciliation-test-ts-L9

`client/__tests__/report-reconciliation.test.ts:9`

Set before sql.js is instantiated: the wasm build resolves SQLite's
'localtime' modifier through the host timezone, so it has to be in place
before the module/wasm is initialised. Africa/Lagos (UTC+1, no DST) makes
the UTC and local calendar dates genuinely differ near midnight, so a
UTC-vs-local bucketing mistake shows up as a real mismatch instead of
coincidentally passing in a UTC CI environment.

## block-__tests__-report-reconciliation-test-ts-L18

`client/__tests__/report-reconciliation.test.ts:18`

Integration-level RECONCILIATION coverage for the rolled-up financial
figures (docs/KNOWN_BUGS.md, "Process / methodology gaps"): every existing
test asserts one query's output against hand-written expected numbers, so
nothing cross-checks a report's aggregate against an independently computed
sum over the same underlying rows.

The bugs in this class (date-range boundary off-by-one, UTC-vs-local
bucketing, cross-store leakage, join fan-out double counting) all come from
combining rows ACROSS date/store boundaries, which a single-function unit
test can't see. So each test here:
  (a) calls the real report/dashboard function for a date range + store, and
  (b) recomputes the same figure from the raw tables through a deliberately
      DIFFERENT aggregation path - rows pulled out with SELECT * and summed
      in JS, bucketed with JS Date arithmetic (epoch-ms comparisons and
      local getFullYear()/getMonth()) rather than SQLite string comparisons
      and strftime(..., 'localtime').
and asserts the two agree.

The fixture is deliberately adversarial: multi-day, two stores, sales
placed on both sides of the local-midnight range boundaries, a sale whose
UTC month differs from its local month, multi-line sales (join fan-out),
soft-deleted rows, and a stock batch attributed to another store.

## block-__tests__-report-row-sale-drilldown-test-tsx-L22

`client/__tests__/report-row-sale-drilldown.test.tsx:22`

The Detailed Sales Report drills a row down to its line items the way
Daily Close does: the row carries only the transaction number the report
already shows, resolved to the sale TransactionDetailsDialog takes.

## block-__tests__-report-table-view-sorting-test-tsx-L19

`client/__tests__/report-table-view-sorting.test.tsx:19`

Items 1+2: every Report Center report returns the same generic
Record<string, unknown> row shape, so one column-driven table renders all
six on screen. The only real logic here is the comparator - a numeric
column must not sort as text ("1200" before "80").

## block-__tests__-reports-store-scoping-and-window-cap-test-ts-L9

`client/__tests__/reports-store-scoping-and-window-cap.test.ts:9`

Regression coverage for two Low-severity docs/KNOWN_BUGS.md findings in
reports.ts:

1. fetchStockBatchReportData filtered products.store_id but never
   stock_batches.store_id on the join, so a legacy store_id-less batch (or
   one attributed to another store) could still be summed into the active
   store's valuation.
2. getBIMetrics's current-period revenue/COGS/transaction queries used
   `transaction_date >= ?` with no upper bound, while the expense side
   (getSmoothedExpensesTotal) was already capped at "now" - a future-dated
   or clock-skewed sale counted toward revenue in a window the matching
   expenses were excluded from, skewing the reported margin.

## block-__tests__-reports-tab-permission-test-tsx-L4

`client/__tests__/reports-tab-permission.test.tsx:4`

"view_reports" answers "does the Report Center / Analytics half of the
Reports page exist for this role at all". It replaces the isAdmin gate
those two tabs carried, which widens them to a read-only auditor - the
reports-focused role that has held view_reports by default since the
catalog was written and could not reach a single report.

Daily Close is deliberately NOT under this key: every role, cashiers
included, reaches it by design.

## block-__tests__-reports-timezone-test-ts-L9

`client/__tests__/reports-timezone.test.ts:9`

Regression coverage for KNOWN_BUGS.md #9: "Sales Today" filtered with
date(transaction_date) = <local today>, comparing a UTC calendar date
against a locally-computed "today" string — for any store not in UTC+0,
a sale near local midnight fell on the wrong side of that comparison and
silently vanished from the dashboard. Fixed by adding the 'localtime'
modifier so the comparison is apples-to-apples.

Runs with TZ=Africa/Lagos (UTC+1) so the two calendar dates genuinely
differ near midnight, proving the fix rather than coincidentally passing
in a UTC test environment.

## line-__tests__-reports-timezone-test-ts-L88

`client/__tests__/reports-timezone.test.ts:88`

Sale at 2025-12-31T23:30:00Z: UTC calendar date is Dec 31, but Lagos
local (+1h) is 2026-01-01T00:30 -> local calendar date is Jan 1, i.e.
"today". The old date(transaction_date) = 'today' comparison used the
raw UTC date (Dec 31) and would exclude this sale entirely.

## block-__tests__-request-item-dialog-query-gating-test-tsx-L6

`client/__tests__/request-item-dialog-query-gating.test.tsx:6`

RequestItemDialog is permanently mounted at five call sites (the inventory
catalog, the POS cart, the POS product list and two procurement screens),
so an ungated query in it meant opening Inventory or POS always paid for a
full customer list + product list read for a dialog that is almost never
opened. Both reads must wait until the dialog is actually open.

## block-__tests__-request-stock-transfer-permission-test-ts-L4

`client/__tests__/request-stock-transfer-permission.test.ts:4`

"request_stock_transfers" now sits IN pos-layout-header.tsx's
composition rather than beside it. Reconciling the two mechanisms that
already existed:

 - the per-group key is the acting user's own right,
 - `staff_can_request_transfers` stays the store-wide opt-in that lets a
   non-admin-tier account use it at all.

They compose with AND, so unticking the key actually withholds the
button (it previously did nothing), while every role keeps exactly the
access it had - which is why sales_staff was granted the key by default
when enforcement landed: the toggle exists precisely so cashiers can
pull stock in, and an AND with a key they lacked would have silently
disabled that feature for every store using it.

## block-__tests__-requested-products-test-ts-L9

`client/__tests__/requested-products.test.ts:9`

Exercises logRequestedProduct()/getRequestedProducts() against a genuine
in-memory SQLite engine (sql.js), not a mocked query(). The dedup/merge
logic in logRequestedProduct (case-insensitive name match, incrementing
request_count, merging customer names and notes without duplicating them)
is exactly the kind of business logic a mock can't verify.

## block-__tests__-requeue-strips-null-columns-test-ts-L9

`client/__tests__/requeue-strips-null-columns.test.ts:9`

A whole-row requeue rebuilds its payload from `SELECT *`, so a column that
is nullable locally but NOT NULL (with a server-side DEFAULT) in MySQL
went up as an explicit `null` and was rejected by the write — the
stock_batches.cost_price failure in docs/FIXED_BUGS.md A-128. Null-valued
keys are stripped so the server applies its own default instead.

## block-__tests__-require-role-permission-test-tsx-L4

`client/__tests__/require-role-permission.test.tsx:4`

RequireRole is the ONLY enforcement point for the procurement routes in
this local-first app - hiding a tab or a header button is not a gate
when the URL is typeable. Its new `permission` prop narrows the coarse
(isAdmin || canManageStockBatch) baseline to a specific key, so
/procurement/new and /procurement/edit now require
"manage_purchase_orders" and /procurement/vendors requires
"view_suppliers", without widening the baseline for anyone.

## block-__tests__-resolve-staff-store-id-test-ts-L4

`client/__tests__/resolve-staff-store-id.test.ts:4`

Regression coverage: staff-form-dialog.tsx used to write
`store_id: activeStoreId || ""` — an empty string, not null, when no
store was active. That matches neither `store_id = ?` nor the
`store_id IS NULL` fallback getUsers() checks for, making the account
invisible in every staff list while still able to log in.

## block-__tests__-return-stock-batch-attribution-test-ts-L9

`client/__tests__/return-stock-batch-attribution.test.ts:9`

Regression: a sale line split across multiple batches at sale time (FEFO)
restored ALL of a second partial return to the FIRST batch in the
original split, instead of continuing from where the first return left
off. restoreReturnedStock() always restarted allocation from
consumedBatches[0] with no memory of what an earlier return of the same
sale line already restored.

Concretely: a 10-unit line split 6 units from batch A (expires March) +
4 units from batch B (expires August). Returning 6 units, then later the
remaining 4, previously put all 10 restored units into batch A and left
batch B permanently 4 short - correct product-level total stock, but
batch A now holds units it never held (wrong expiry date attached to
them) and batch B's quantity/cost valuation is silently wrong forever.

Fix: restoreReturnedStock() now nets out, per batch, how much a *prior*
return (scoped to the same sale + product) already restored before
allocating the current return's quantity.

## line-__tests__-return-stock-batch-attribution-test-ts-L113

`client/__tests__/return-stock-batch-attribution.test.ts:113`

A second sale of the same product, also drawing from batch A, whose
own return must not be counted against sale1's remaining-restorable
amount (and vice versa).

## line-__tests__-return-stock-batch-attribution-test-ts-L156

`client/__tests__/return-stock-batch-attribution.test.ts:156`

A sale line with no sale_item_batches rows and no legacyStockBatchId -
e.g. a pre-batch-attribution sale, or one where the batch write was
otherwise skipped at sale time.

## line-__tests__-returns-calculations-test-ts-L21

`client/__tests__/returns-calculations.test.ts:21`

Regression: sale of 5 units, this is the first return of 3 — the sale
isn't fully returned yet, and the remaining 2 must still be returnable
later (not double-returnable up to the original 5 again).

## line-__tests__-returns-calculations-test-ts-L29

`client/__tests__/returns-calculations.test.ts:29`

Regression: 5 sold, 3 already returned in a prior return, this return
covers the remaining 2 — should now count as fully returned, unlike
the old buggy check which compared against the original quantity (5)
and would never flip to true across split returns.

## block-__tests__-sales-report-cashier-column-test-ts-L9

`client/__tests__/sales-report-cashier-column.test.ts:9`

Items 1+2 (Cynthia's feedback): the Detailed Sales report could already be
FILTERED by cashier but never showed who rang a sale, so a filtered export
was indistinguishable from an unfiltered one and an on-screen view could
not be sorted or scanned by staff member.

## block-__tests__-sales-returned-quantity-test-ts-L9

`client/__tests__/sales-returned-quantity.test.ts:9`

Regression coverage for KNOWN_BUGS.md #1: the Return dialog used to source
its "how much can still be returned" data from getSaleItems(), which only
knows the original sold quantity — with no way to see that some of it was
already returned. That let the same items be returned (and refunded, and
restocked) more than once. The dialog now uses getTransactionDetails(),
exercised here directly against a real SQLite engine.

## line-__tests__-sales-returned-quantity-test-ts-L76

`client/__tests__/sales-returned-quantity.test.ts:76`

The exact repro from KNOWN_BUGS.md #1: without this accumulation, a
second return dialog session would see the item as fully un-returned
again and allow refunding it a second time.

## line-__tests__-sales-returned-quantity-test-ts-L103

`client/__tests__/sales-returned-quantity.test.ts:103`

return_items has no sale_item_id column, so the raw SQL gives every
sale_item row for a product the SAME combined returned_quantity. Two
sale_items of the same product (5 + 3 = 8 total), 4 units returned:
without redistribution both rows would independently show
returned_quantity=4, making getMaxReturnable report 1 + 0 = 1 unit
still returnable instead of the true (5+3)-4 = 4.

## block-__tests__-save-database-serialization-test-ts-L3

`client/__tests__/save-database-serialization.test.ts:3`

Regression coverage for A-22 (docs/KNOWN_BUGS.md, carried from
docs/DATABASE_CONCURRENCY.md §2.4): `execute()` fires `void saveDatabase()`
without awaiting it and nothing serialised those calls, so two back-to-back
writes each took their own `db.export()` and raced their IndexedDB `set()`s
— an older image could land on top of a newer one, silently, with no
version stamp to notice it by. There was also no `pagehide` flush, so a
closing tab never got a chance to persist its last write.

## block-__tests__-save-product-no-category-test-ts-L9

`client/__tests__/save-product-no-category.test.ts:9`

Regression test for a bug found while smoke-testing POS/Inventory
(docs/features/pos.md): Add Product's Category field has no "*" in the
dialog - it's documented as optional - but saving a product without one
always failed with a "Failed to save Product." toast and no row created.

Root cause: useSaveProductMutation's mutationFn set
`localPayload.category_id = undefined` when no category was given.
base-helpers.ts's insert()/update() bind every payload value straight into
a sql.js prepared statement with no null-coalescing, and sql.js's bind()
throws ("Wrong API use: tried to bind a value of an unknown type
(undefined)") on a JS `undefined` - it only accepts `null` for an absent
column. This is a real in-memory SQLite run against the app's actual
SCHEMA_SQL (not a mocked insert), so it reproduces the exact throw the
live app hit, confirmed live in Chrome before this fix.

## line-__tests__-save-product-no-category-test-ts-L58

`client/__tests__/save-product-no-category.test.ts:58`

Product names are normalized to lowercase on write (see
withNormalizedName in base-helpers.ts) — match on that, not the
original mixed-case input.

## block-__tests__-schema-indexes-test-ts-L11

`client/__tests__/schema-indexes.test.ts:11`

Guards the local read-path indexes added for audit finding A-6. Two
populations have to end up with the same set: a fresh install (SCHEMA_SQL)
and a device whose database predates the indexes (runSchemaMigrations).
The store_id-scoped ones can only live in the migration step, because
store_id is itself migration-added and absent from SCHEMA_SQL's CREATE
TABLE bodies — so a fresh install picks those up from the migration pass
that runs immediately after the schema, not from the schema itself.

## line-__tests__-schema-indexes-test-ts-L55

`client/__tests__/schema-indexes.test.ts:55`

core.ts asks sql.js for `/sql-wasm.wasm` (the browser's public path),
which doesn't resolve under vitest; loading it once from node_modules
first primes the emscripten module so initDatabase() can reuse it, the
same way init-database-migrations.test.ts does.

## block-__tests__-search-bounded-distance-test-ts-L9

`client/__tests__/search-bounded-distance.test.ts:9`

The fuzzy fallback ran a full Levenshtein matrix against every catalog
entry for every search key - which is exactly the state while someone is
mid-word typing a product name. Levenshtein distance can never be smaller
than the difference in the two lengths, so any candidate whose length is
further from the term than the allowed distance can be rejected before the
matrix is built, without changing a single result.

## block-__tests__-search-lowercase-index-cache-test-ts-L4

`client/__tests__/search-lowercase-index-cache.test.ts:4`

searchProducts() re-lowercased every product's name, generic name and barcode
on every call, so a catalog of ~800 products allocated ~2400 strings per
keystroke - and the Levenshtein fallback tier did it a second time. The
lowercased index is now cached against the products array reference.

## block-__tests__-search-punctuation-variants-test-ts-L4

`client/__tests__/search-punctuation-variants.test.ts:4`

Reported by staff at the till: "M&B and M B may not really match M & B".
Confirmed — before this fix, searching "M&B" or "MB" found only the exact
spelling, so a product stored as "m & b" was invisible to the spellings a
cashier actually types at speed.

## line-__tests__-search-punctuation-variants-test-ts-L57

`client/__tests__/search-punctuation-variants.test.ts:57`

"paracetamol ta|b 12|s" squashes to a string containing "b12". A flat
score once put it first, so a cashier typing b12 at speed rang up
paracetamol.

## line-__tests__-search-punctuation-variants-test-ts-L71

`client/__tests__/search-punctuation-variants.test.ts:71`

"vitamin c" only contains "nc" once the space is squashed away, so the
punctuation tier must not surface it. "zinc tablet" still matches, but
through the pre-existing token substring tier, not this one.

## line-__tests__-search-punctuation-variants-test-ts-L86

`client/__tests__/search-punctuation-variants.test.ts:86`

The b12 case above is also saved by the minimum-length gate, so it
cannot prove the grading. This term is long enough to clear that gate,
leaving only the 18/14/12/6 bands to decide the order.

## block-__tests__-search-surfaces-debounced-test-ts-L5

`client/__tests__/search-surfaces-debounced.test.ts:5`

Every search surface in the app drives its expensive downstream work off
useDebouncedValue, binding the input itself to raw state so typing stays
instant. The product catalog was the last one still running
genericFuzzySearch straight off the raw term - the most expensive of the set
(the whole catalog, with the Levenshtein Tier-4 fallback firing exactly while
a user is mid-word), on the main thread alongside synchronous sql.js.

A static guard because the alternative is a fake-timer render test per
surface, which buys less and breaks more.

## line-__tests__-search-test-ts-L71

`client/__tests__/search.test.ts:71`

Regression: a 3-character term used to fall into the fuzzy fallback
and could return arbitrary unrelated products as "suggestions" - the
minimum length was raised to 4 specifically because Levenshtein
distance isn't a meaningful similarity signal at 3 characters.

## line-__tests__-search-test-ts-L81

`client/__tests__/search.test.ts:81`

Regression: searchProducts' fuzzy fallback previously never scored
barcode at all, so a scanned barcode with a misread digit fell
through to matching against unrelated product NAMES instead.

## block-__tests__-searchable-input-scroll-coalescing-test-tsx-L9

`client/__tests__/searchable-input-scroll-coalescing.test.tsx:9`

searchable-input registers its `scroll` listener in the capture phase (it
has to - see the doc comment on the effect), so it fires for scrolling on
every scrollable element on the page while its dropdown is open, and each
event used to do a getBoundingClientRect() (a forced layout) plus a state
update. Scrolling a long list with a dropdown open is the common case, so
the work has to be coalesced to one measurement per frame, and a
measurement that produced the same rect must not re-render at all.

## block-__tests__-sentry-non-errors-not-reported-test-ts-L25

`client/__tests__/sentry-non-errors-not-reported.test.ts:25`

The owner's Sentry quota was being spent on events that are not faults: a
loop-shaped crash reported every occurrence as its own billable event, and
success/measurement reports opened issues of their own. Every assertion
here is about what is NOT sent.

## line-__tests__-settings-cloud-link-dialog-loop-test-ts-L5

`client/__tests__/settings-cloud-link-dialog-loop.test.ts:5`

Regression test for a bug found while smoke-testing Settings > Data/Cloud
(docs/features/settings.md's "Data" section, cross-referenced against
Task 0's sync-queue fix): on a store that isn't cloud-linked,
/settings/cloud (the URL alias for the Data tab, see TAB_ALIASES in
hooks/use-settings.ts) opens the "Link DumosRx Cloud" dialog, but the
dialog could never actually be dismissed — closing it (Escape or the
Close button) immediately reopened it on the very next render.

Root cause: the effect that resolves tabParam -> internalTab and opens
the dialog depends on the whole `syncState` object returned by
useSettingsSync(isCloudLinked, refetchStore) - a plain object literal
recreated on every render, so it never has a stable identity. With
`syncState` in the dependency array, the effect reruns on every render of
useSettings(), and unconditionally calls syncState.setIsCloudLinkOpen(true)
whenever internalTab === "cloud" && !isCloudLinked - which stays true for
as long as the user remains on that route, regardless of whether they
just manually closed the dialog. Live-reproduced: navigating to
/settings/cloud on a non-cloud-linked store, the dialog reappeared
immediately after every dismissal attempt.

The effect now lives in hooks/use-settings-tab-resolution.ts, extracted when
use-settings.ts hit the 350-line limit. The guarantee is unchanged and is
now checked on both sides of the boundary: the extracted effect must depend
on its stable `openCloudLink` prop, and use-settings.ts must pass the stable
setter rather than the whole syncState object.

This test parses the hook's source (no component-rendering harness exists
in this repo yet - see dashboard-action-center-routes.test.ts /
profit-loss-tab-currency-formatting.test.ts for the same source-inspection
pattern) and asserts the effect depends on the specific, referentially
stable setter (syncState.setIsCloudLinkOpen, which useState guarantees is
stable across renders) rather than the whole unstable syncState object.

## line-__tests__-settings-cloud-link-dialog-loop-test-ts-L61

`client/__tests__/settings-cloud-link-dialog-loop.test.ts:61`

`hasKey` feeds canAccessTab, which the effect depends on. Passing an
inline closure recreates it every render and reinstates the loop by a
different route — which is exactly what happened when the effect was
extracted into use-settings-tab-resolution.ts.

## line-__tests__-settings-cloud-link-dialog-loop-test-ts-L70

`client/__tests__/settings-cloud-link-dialog-loop.test.ts:70`

The bug: a bare `syncState` dependency - a fresh object every render -
makes this effect (and its unconditional dialog-open call) rerun on
every render for as long as the route stays on the cloud alias.

## line-__tests__-settings-cloud-link-dialog-loop-test-ts-L75

`client/__tests__/settings-cloud-link-dialog-loop.test.ts:75`

The fix: depend on the specific stable setter this effect actually
calls, so it only reruns when tabParam/isCloudLinked/isAdmin/activeTab
genuinely change.

## block-__tests__-settings-diagnostics-tab-gate-test-ts-L7

`client/__tests__/settings-diagnostics-tab-gate.test.ts:7`

A-198: the diagnostics tab was absent from ALL_SETTINGS_TABS (so a
client-side navigation rendered Appearance instead) and gated by nothing.

Two support sessions can see it and they differ: an on-till inspection is
read-only and must be denied every other tab, while the impersonation
handoff — the only path that ever reached this console — keeps the access
it always had.

## block-__tests__-settings-mobile-menu-nav-items-test-tsx-L10

`client/__tests__/settings-mobile-menu-nav-items.test.tsx:10`

settings-client renders this menu as the ONLY settings navigation below the
md breakpoint (the desktop sidebar is `hidden md:flex`), so an entry left
`disabled: true, badge: "Soon"` here is unreachable on phones even after the
desktop tab nav has shipped it. Roles & Permissions was exactly that: live on
desktop, permanently "Soon" on mobile.

## block-__tests__-settings-store-key-surfaces-test-tsx-L4

`client/__tests__/settings-store-key-surfaces.test.tsx:4`

Two surfaces inside tabs whose own gate is a DIFFERENT key, which is why
they can't just ride the tab-level check in settings-tabs.ts:

- Regional Settings (currency, VAT, reseller commission) is store-wide
  config sitting on the General tab, which every role can open. It was
  isAdmin-gated; it is now manage_store_settings, the same population.
- The System tab's "Manage Billing" card is only a shortcut into the
  Billing tab, so it takes manage_billing rather than the System tab's own
  manage_device_settings — otherwise a specialist (who holds the device
  key but not the billing one) gets a link into a screen that bounces them.

## block-__tests__-settings-tab-permissions-test-tsx-L17

`client/__tests__/settings-tab-permissions.test.tsx:17`

The Settings tabs were all behind one coarse isAdmin check. This pass
converts the Store & Settings ones to the keys the catalog already names,
in ONE map that the desktop rail, the mobile list and use-settings' URL
resolution all read - so hiding a trigger and blocking /settings/<tab>
can never drift apart.

## block-__tests__-settings-tabs-have-nav-entries-test-ts-L7

`client/__tests__/settings-tabs-have-nav-entries.test.ts:7`

A tab with a <TabsContent> but no trigger in either list is unreachable by
clicking, in every session that is allowed to see it. That is how the
diagnostics console shipped invisible: the gate was right, the door was
never built, and `/settings/diagnostics` was the only way in (A-251).

The two lists are deliberately separate (desktop rail vs mobile menu, with
different copy), so nothing stops one gaining an entry the other lacks.
This is the check that does.

## block-__tests__-staff-list-has-pin-test-ts-L9

`client/__tests__/staff-list-has-pin.test.ts:9`

U9: the staff list rendered a green "PIN set" pill unconditionally, because
StaffListItem structurally omits `pin` — so a staff member with no PIN at
all still showed as having one. The query now derives a boolean has_pin
(never the hash itself) so the list can tell the truth.

## block-__tests__-staff-list-ui-test-tsx-L56

`client/__tests__/staff-list-ui.test.tsx:56`

U8: "delete staff" is really a reversible deactivation (the confirm dialog
says so), but the row used a red trash icon and a "Delete X" label, which
made admins avoid a safe action.
U9: the "PIN set" pill was rendered unconditionally.

## block-__tests__-stale-chunk-not-reported-as-crash-test-tsx-L10

`client/__tests__/stale-chunk-not-reported-as-crash.test.tsx:10`

A-171's real cause, found in review. `DUMOSRX-CLIENT-F` — 260 fatal events,
no stacktrace, no `area` — is the stale-chunk SyntaxError that
`chunk-error.ts` already recognises: a static-export host serves
`index.html` for a missing chunk and the browser executes HTML as script.

The app already self-heals it with a one-time reload. The defect was
ordering: `logCrash(..., true)` ran BEFORE `reloadOnChunkError`, so every
recoverable stale chunk was first reported as a fatal crash.

A chunk error that survives the reload is a different matter and must
still be reported — that is what the reload guard distinguishes.

## block-__tests__-stock-adjustment-draft-context-clear-test-tsx-L7

`client/__tests__/stock-adjustment-draft-context-clear.test.tsx:7`

Regression coverage for FIXED_BUGS.md A-44: the Adjust Stock draft is
persisted under one global key, exactly like the POS cart and the
cycle-count draft, so it must be cleared on a store switch and on logout.
Without that, a half-entered adjustment staged against store A's product
ids reappears under store B, or under whichever cashier signs in next on
a shared terminal.

## block-__tests__-stock-adjustment-submit-test-ts-L20

`client/__tests__/stock-adjustment-submit.test.ts:20`

Same in-memory fake as stock-audit.test.ts: submitStockAdjustment shares
the audit's FEFO deduction / restock-target logic, so the quick-adjust
flow has to be exercised against real stateful quantity maths rather than
mock call args.

## line-__tests__-stock-adjustments-ledger-test-tsx-L43

`client/__tests__/stock-adjustments-ledger.test.tsx:43`

One stable router object, not a fresh one per render: the ledger's
?action=create effect depends on it, and a new identity every render would
re-fire that effect and re-open the flow the moment it is dismissed.

## line-__tests__-stock-adjustments-ledger-test-tsx-L61

`client/__tests__/stock-adjustments-ledger.test.tsx:61`

The ledger picks a virtualized desktop grid or a date-grouped mobile card
list off this hook, exactly as stock-movements.tsx does, so the row
assertions below run against both branches.

## block-__tests__-stock-adjustments-tab-test-tsx-L9

`client/__tests__/stock-adjustments-tab.test.tsx:9`

The Adjustments tab reuses the Inventory tab conventions wholesale: read
access is the existing view_stock_adjustment_history key (same key the
Movements tab uses), the write action is adjust_stock_counts, and the
header's "Adjust Stock" button just navigates to ?action=create for the
page's own effect to pick up.

## block-__tests__-stock-audit-baseline-test-ts-L9

`client/__tests__/stock-audit-baseline.test.ts:9`

A-263. A count is an observation: "at instant t, this product physically
had C units." The discrepancy is C minus what the system believed AT THAT
INSTANT, and it stays true however much stock moves afterwards.

Comparing against the figure the sheet was built with drops real
discrepancies (count 10 against a stale 10 while live is 0 → nothing
recorded), and comparing against live-at-submit posts the day's
legitimate sales back as found stock (count a shortage at 09:05, sell 5,
submit at 17:00). Only a per-row baseline captured when the figure was
entered gets both right.

## line-__tests__-stock-audit-baseline-test-ts-L153

`client/__tests__/stock-audit-baseline.test.ts:153`

A draft started on an older bundle has a countedQty beside a
systemQty frozen at sheet-build. Sending that frozen figure as the
baseline would reverse the day's sales: built at 10, 5 sold, the
counter finds 5 and enters 5 -> 5 - 10 = -5, zeroing the product.
Such a row must carry NO baseline and take the re-read path.

## block-__tests__-stock-audit-concurrent-sale-race-test-ts-L9

`client/__tests__/stock-audit-concurrent-sale-race.test.ts:9`

Regression coverage for a High-severity bug (docs/KNOWN_BUGS.md):
submitStockAudit used the caller-supplied `systemQty` as-is to compute the
shrinkage/surplus diff, instead of re-reading the product's actual current
quantity inside the transaction. A sale landing between the audit list
being rendered and the audit being submitted made the caller's systemQty
stale, so the resulting adjustment was silently off by exactly the
concurrent sale's quantity. Exercised against a real in-memory SQLite
instance (sql.js), not a reimplementation.

## line-__tests__-stock-audit-concurrent-sale-race-test-ts-L61

`client/__tests__/stock-audit-concurrent-sale-race.test.ts:61`

Correct behavior: countedQty (15) matches the re-read current
quantity (15), so there's NO discrepancy - diff is 0, batch
untouched, no adjustment movement written.

## line-__tests__-stock-audit-concurrent-sale-race-test-ts-L79

`client/__tests__/stock-audit-concurrent-sale-race.test.ts:79`

Caller's stale systemQty (20) differs from the real current quantity
(15), and the actual physical count (12) differs from BOTH - the real
shrinkage is 15 - 12 = 3, not 20 - 12 = 8.

## block-__tests__-stock-audit-draft-migration-test-ts-L17

`client/__tests__/stock-audit-draft-migration.test.ts:17`

Reported live by the store owner the moment the blank-field build was
opened on a device with an older draft: "why did all the rows become
ticked all of a sudden?" A v0 draft pre-filled every countedQty with the
system quantity, and an entered quantity is now what marks a row counted,
so the whole sheet rehydrated as counted.

## block-__tests__-stock-audit-shrinkage-fallback-test-ts-L20

`client/__tests__/stock-audit-shrinkage-fallback.test.ts:20`

Regression: submitStockAudit's shrinkage branch deducted FEFO across
active (quantity > 0) batches until the counted shortfall was covered -
but if the product's system quantity was spread thinner across batches
than the recorded shortfall (e.g. every batch shows less stock than the
audit says is missing, a real scenario when batches were previously
miscounted), the loop simply ran out of batches and silently dropped the
remainder: no stock_movements record, and the batches' summed quantity
afterward doesn't match what the audit itself just reconciled to.
recordSaleItemStock already guards against the equivalent situation for a
sale (getAnyActiveBatchForProduct fallback); the audit path had no
equivalent until this fix.

## block-__tests__-stock-audit-test-ts-L27

`client/__tests__/stock-audit.test.ts:27`

In-memory fake for stock_batches / stock_movements / stock_audits so
submitStockAudit's real reconciliation logic (FEFO deduction, new-batch
creation, quantity math) runs against something stateful, instead of
asserting on mock call args alone. This is what would have caught the
double-delta bug in the old updateStockBatchQuantity.

## line-__tests__-stock-audit-test-ts-L50

`client/__tests__/stock-audit.test.ts:50`

Whitespace-normalized so this stays robust to multi-line SQL
formatting in the real queries (getBatchesForProduct /
getAllActiveBatchesForProduct both wrap across lines).

## line-__tests__-stock-audit-test-ts-L59

`client/__tests__/stock-audit.test.ts:59`

getProductStockQuantity: the product's live quantity, summed over
active, non-deleted batches. Modelled properly rather than returned
empty - submitStockAudit measures against it whenever a submission
carries no baseline of its own (A-263), so a fake that skips it
silently turns every count into "found everything".

## line-__tests__-stock-audit-test-ts-L77

`client/__tests__/stock-audit.test.ts:77`

getAllActiveBatchesForProduct: every ACTIVE, non-expired batch
regardless of quantity - the surplus/restock path needs to find a
zero-quantity batch to top back up rather than treating it as
nonexistent, but must never land found stock in an
expired/deactivated batch (KNOWN_BUGS.md - stock audit restock
into expired/deactivated batch).

## block-__tests__-stock-batch-alert-oversold-wording-test-tsx-L12

`client/__tests__/stock-batch-alert-oversold-wording.test.tsx:12`

An oversold alert's `quantity` is a deficit, not a stock level, and it has
no reorder threshold — rendering it through the low-stock sentence printed
"4 unit(s) in stock (min: undefined unit(s))" for an item that is in fact
four units short.

## block-__tests__-stock-batch-management-permissions-test-tsx-L4

`client/__tests__/stock-batch-management-permissions.test.tsx:4`

Two Inventory keys convert a coarse role check into a specific one on
the Inventory Dashboard: "perform_stock_audit" replaces the isAdmin gate
on Start Audit (so a specialist - the stock-owning role, which already
holds the key by default - can run a cycle count), and
"view_stock_adjustment_history" replaces the canManageStockBatch gate on
the Movements tab (so a read-only auditor can read the ledger without
gaining any write right). The ledger route redirect moves with it, since
/inventory/ledger is directly reachable.

## block-__tests__-stock-fingerprint-test-ts-L9

`client/__tests__/stock-fingerprint.test.ts:9`

Phase 1 of the stuck-data work. The server derives stock from movements and
the client derives it locally; neither ever compared the two, so a device
drifting (A-173/A-176) was invisible until a physical count found it.

## line-__tests__-stock-fingerprint-test-ts-L29

`client/__tests__/stock-fingerprint.test.ts:29`

runSchemaMigrations() adds store_id to every STORE_SCOPED_TABLES entry
on a real device; SCHEMA_SQL alone does not, and the query under test
relies on it exactly as health-check.ts already does.

## block-__tests__-stock-integrity-auto-heal-test-ts-L13

`client/__tests__/stock-integrity-auto-heal.test.ts:13`

Auto-heal: the 24-hourly health check folds its own drift back onto the
movement log. See docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md
§"Phase 3".

## block-__tests__-stock-integrity-fold-test-ts-L9

`client/__tests__/stock-integrity-fold.test.ts:9`

Phase 2 of docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md.

A device held 958 products at exactly twice their opening stock while the
server was correct, and nothing in the product could repair it: the pull
strips `quantity`, an existing movement replays no delta, and Health Sync
points the wrong way. The only fix was a factory reset, which works solely
because a fresh database rebuilds quantity from the movement log.

foldStockQuantities() does that rebuild in place — and must refuse any
batch the log cannot account for.

## line-__tests__-stock-integrity-fold-test-ts-L38

`client/__tests__/stock-integrity-fold.test.ts:38`

SCHEMA_SQL predates multi-store; schema-migrations.ts adds store_id at
runtime. Added here so the store-scoped query branch is actually
exercised instead of silently falling through to "every store".

## block-__tests__-stock-integrity-verify-test-ts-L9

`client/__tests__/stock-integrity-verify.test.ts:9`

Phase 1 of docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md.

A production store showed 958 of 2,495 products carrying exactly twice
their opening stock on one device, while the server was correct throughout.
Nothing could repair it: pull.ts strips `quantity` from every pulled batch
and an existing movement replays no delta, so the drift was permanent. The
movement log is the authority — this verifies a batch against it.

verifyStockIntegrity() must never write.

## line-__tests__-stock-integrity-verify-test-ts-L37

`client/__tests__/stock-integrity-verify.test.ts:37`

SCHEMA_SQL predates multi-store; schema-migrations.ts adds store_id at
runtime. Added here so the store-scoped query branch is actually
exercised instead of silently falling through to "every store".

## block-__tests__-stock-movement-import-type-test-ts-L4

`client/__tests__/stock-movement-import-type.test.ts:4`

A bulk-import stock correction for an existing product is written with
movement_type "adjustment" (same audit machinery as a manual cycle count),
so the general Stock Movements table - which reads movement_type directly -
showed it as an ordinary "Adjustment" with no way to tell the two apart.
The Adjustments Ledger already solves this via reference_type/reason (see
groupAdjustmentMovements); resolveMovementDisplayType does the same for
this table.

## line-__tests__-stock-transfers-test-ts-L393

`client/__tests__/stock-transfers.test.ts:393`

total_cost is a separate multiplication (rounded average * quantity),
which can itself reintroduce a long float (127.77 * 3 === 383.30999999999995)
if not rounded again before being written to the movement row.

## block-__tests__-store-context-hydration-race-test-tsx-L7

`client/__tests__/store-context-hydration-race.test.tsx:7`

Regression coverage for a High-severity bug (docs/KNOWN_BUGS.md):
store-context.tsx's `targetId = user?.store_id || activeStoreId` ran (and
mirrored into the module-scope resolver) before AuthProvider's own
localStorage read had completed - on the very first render `user` is
still null, so a staff member pinned to store B on a device whose
`dumos_active_store_id` says store A would have every query in that
window resolve/scope against store A instead of their real store B.

Fixed by gating both the resolver-mirroring effect and the storeProfile
query on AuthProvider's new `isHydrated` flag. This test spies on the
resolver setter (core.setActiveStoreId) and asserts it is NEVER called
with the wrong (localStorage) store id at any point - not just checking
the final settled state, which wouldn't catch a transient wrong value.

## line-__tests__-store-context-hydration-race-test-tsx-L102

`client/__tests__/store-context-hydration-race.test.tsx:102`

Fresh QueryClient per render (i.e. per test, since each `it` calls
renderHook exactly once) so query cache state can't leak between
tests. Real QueryClient/QueryClientProvider, distinct from the
module-singleton `@/lib/query-client` mocked above (that mock only
stands in for the imperative cancelQueries()/clear() calls
switchStore() makes - useQuery() itself needs a real provider).

## line-__tests__-store-context-hydration-race-test-tsx-L124

`client/__tests__/store-context-hydration-race.test.tsx:124`

The device's last-active store (e.g. from an owner's prior session)
is store A, but the logged-in user (about to hydrate from
localStorage["dumos_user"]) is fixed to store B.

## line-__tests__-store-context-hydration-race-test-tsx-L157

`client/__tests__/store-context-hydration-race.test.tsx:157`

Whatever the very first synchronous render observes, it must not be
"confirmed not loading with no store" - that's the state a premature
isLoading:false (see the loading-flag comment in store-context.tsx)
could produce.

## block-__tests__-store-context-set-theme-error-toast-test-tsx-L7

`client/__tests__/store-context-set-theme-error-toast.test.tsx:7`

Regression coverage (Low-severity, docs/KNOWN_BUGS.md): setTheme() fired
updateStoreProfile() fire-and-forget with no error handling at all — a
failed persist left the UI's optimistically-applied theme silently
diverged from what's actually stored/synced, with zero signal to the
user. Fixed by catching the rejection and surfacing a toast.

## block-__tests__-store-context-stale-store-clear-test-tsx-L7

`client/__tests__/store-context-stale-store-clear.test.tsx:7`

Regression coverage for a Medium-severity bug (docs/KNOWN_BUGS.md):
storeProfile's queryFn used to clear the stale active-store id
(localStorage.removeItem + setActiveStoreId(null)) as a side effect
INSIDE itself, on the fallback branch taken when the active store no
longer exists locally. A React Query retry re-fires that side effect,
and the resulting activeStoreId state change flips `targetId` mid-fetch
(a new queryKey), triggering a second fetch on every miss.

Fixed by moving the clearing logic out into its own effect, gated on a
settled query result (storeProfile.id !== targetId), so it fires at most
once per genuine staleness rather than on every internal retry/re-render.
This test spies on getStoreById (the underlying DB call inside queryFn)
to assert it's invoked a bounded number of times for the stale id, not
repeatedly.

## line-__tests__-store-context-stale-store-clear-test-tsx-L112

`client/__tests__/store-context-stale-store-clear.test.tsx:112`

The device's last-active store id points at a store that no longer
exists locally (e.g. pruned by sync reconciliation) - only "store-b"
is real.

## line-__tests__-store-context-stale-store-clear-test-tsx-L129

`client/__tests__/store-context-stale-store-clear.test.tsx:129`

The old version cleared the stale id to null (localStorage.removeItem
+ setActiveStoreId(null)) as a side effect inside queryFn itself, then
relied on a second effect pass to notice `!targetId` and sync forward
to the real store - a two-step cascade through an intermediate null
state. The fix resolves storeProfile.id !== targetId directly, in one
effect, without ever routing through null - so dumos_active_store_id
is never removed at any point, only ever set straight to the correct
value.

## block-__tests__-store-context-switch-clears-cache-test-tsx-L7

`client/__tests__/store-context-switch-clears-cache.test.tsx:7`

Regression coverage for the Critical bug in docs/KNOWN_BUGS.md /
FIXED_BUGS.md: "Account/store switch shows the previous store's stale
dashboard data". switchStore() used to await queryClient.invalidateQueries()
to make screens re-fetch under the new store, but it set
isSwitchingStore(true) synchronously first - which unmounts `children`
(and every query observer inside it) in the same tick, before the
awaited invalidate call even runs. With zero active observers, React
Query v5's default refetchType: 'active' only marks queries stale and
does nothing else, so the "round trip" resolved almost instantly without
refetching anything, and the remount after the splash cleared read the
previous store's data straight out of cache.

The fix swaps invalidateQueries() for queryClient.clear() - the same
mechanism the working multi-staff PIN "Switch Account" path already uses
via auth-context.tsx's login()/logout() - so there is no cached entry
left for the remount to serve, regardless of whether anything was
mounted to observe the invalidation.

This test spies directly on the mocked query-client module (the same
mocking approach used by the other store-context tests in this file's
neighborhood) to assert switchStore() actually calls clear() - not
invalidateQueries() - and that it does so even when cancelQueries() never
settles (the SWITCH_STORE_MAX_WAIT_MS safety net path), so the cache is
never left un-cleared.

## line-__tests__-store-context-switch-clears-cache-test-tsx-L151

`client/__tests__/store-context-switch-clears-cache.test.tsx:151`

The cache must be cleared outright - not merely invalidated, which
(with zero mounted observers at the moment it runs) would silently
no-op and leave the previous store's data cached for the remount to
serve.

## line-__tests__-store-context-switch-clears-cache-test-tsx-L158

`client/__tests__/store-context-switch-clears-cache.test.tsx:158`

cancelQueries() must run before clear(), so an in-flight request from
the outgoing store can't resolve after the cache has been emptied
and repopulate it with stale data.

## line-__tests__-store-context-switch-clears-cache-test-tsx-L175

`client/__tests__/store-context-switch-clears-cache.test.tsx:175`

Simulates a cancelQueries() that hangs (e.g. a stuck in-flight
fetch) - the SWITCH_STORE_MAX_WAIT_MS safety net should still let
clear() run and isSwitchingStore resolve to false.

## block-__tests__-store-context-value-identity-test-tsx-L7

`client/__tests__/store-context-value-identity.test.tsx:7`

StoreContext has ~77 useStore() consumers, and `t` is handed down as a prop
into list rows in several places. A fresh value object, a fresh `t` and a
fresh `availableStores` array per render invalidate all of them, so all
three must keep a stable identity while nothing behind them has changed.

## block-__tests__-store-id-backfill-two-stores-test-ts-L9

`client/__tests__/store-id-backfill-two-stores.test.ts:9`

A-248. `backfillStoreIdOnLegacyRows()` stamped every NULL `store_id` with
`(SELECT id FROM stores LIMIT 1)` — no ORDER BY. Its comment said "this
device's one pre-migration store", which stopped being true the day an owner
had two. On a two-store device SQLite's pick is arbitrary, so on every boot a
legacy row could be claimed by the wrong store, silently, for every
store-scoped table. Two products reached production stamped that way.

## block-__tests__-store-ownership-test-ts-L9

`client/__tests__/store-ownership.test.ts:9`

Regression coverage for bug #8 (docs/features/_known-bugs.md): update() and
softDelete() in base-helpers.ts used to perform zero store-ownership check,
so any store could rename/delete another store's row (or a still-shared
legacy NULL-store_id row forever, instead of just claiming it once) via the
completely ordinary edit/delete UI. Exercises the three real cases against
a real in-memory SQLite instance (sql.js), on the "categories" table (a
STORE_SCOPED_TABLES member with a simple shape) via the actual update()/
softDelete() exports, not a reimplementation.

## line-__tests__-store-ownership-test-ts-L39

`client/__tests__/store-ownership.test.ts:39`

store_id is added via core.ts's runtime ALTER TABLE migration, not the
base CREATE TABLE statements in SCHEMA_SQL. Replicate it here since
__setDatabaseForTesting bypasses initDatabase()'s migration loop.

## block-__tests__-store-prune-fails-closed-test-ts-L15

`client/__tests__/store-prune-fails-closed.test.ts:15`

The `stores` prune soft-deletes a live local store the pull response's
`stores` list omits, on the premise that the server always answers with a
complete snapshot of every store the ACCOUNT owns. Two situations break
that premise, and both end with a store vanishing from the switcher on a
device that had it:

 - The snapshot is scoped to the authenticated identity, not the account:
   `SyncController::resolvePullTenantScope()` narrows `$ownedStoreIds` to
   `[$user->store_id]` for any user carrying a store_id (every staff
   account). A pull on a staff session therefore legitimately returns one
   store, and pruning against it deletes the owner's other stores.
 - A pruned store with a pending `_sync_queue` row can never come back:
   the pull's own pending-local-edit rule skips re-applying that row, so
   the `_deleted = 1` the prune wrote is never cleared by a later,
   correctly-scoped pull.

The prune must fail closed in both cases — a stale entry lingering in the
switcher is the error direction this code already prefers.

## block-__tests__-store-prune-safety-test-ts-L15

`client/__tests__/store-prune-safety.test.ts:15`

Regression test for a real incident: pull.ts's store-reconciliation step
(which soft-deletes local stores the server no longer recognizes) once
pruned a store that still had every one of a device's real products/sales
attributed to it, silently making all of it invisible. This test proves,
against a genuine in-memory SQLite engine (not a mocked execute() call),
that a store with real business data attached can never be pruned by this
step, regardless of what the server's stores response says.

## line-__tests__-store-prune-safety-test-ts-L43

`client/__tests__/store-prune-safety.test.ts:43`

store_id is added via core.ts's runtime ALTER TABLE migration, not the
base CREATE TABLE statements in SCHEMA_SQL. Replicate it here since
__setDatabaseForTesting bypasses initDatabase()'s migration loop.

## line-__tests__-store-prune-safety-test-ts-L48

`client/__tests__/store-prune-safety.test.ts:48`

expenses already has store_id in the base SCHEMA_SQL (unlike
products/sales, which only get it via core.ts's runtime ALTER TABLE
migration) — used below to prove the prune guard checks every
STORE_SCOPED_TABLES entry that has the column, not just products/sales.

## block-__tests__-store-prune-skipped-when-unchanged-test-ts-L15

`client/__tests__/store-prune-skipped-when-unchanged.test.ts:15`

A-8 (docs/KNOWN_BUGS.md): `stores` is always pulled as a full snapshot, so
the reconciliation prune ran on EVERY pull round — a single UPDATE
carrying one `NOT IN (SELECT DISTINCT store_id FROM <table>)` subquery per
store-scoped table (26 full scans), plus a `PRAGMA table_info` probe per
table, even when the server returned exactly the store list this device
already has and the prune could not possibly match a row.

The prune must only be reached when there is at least one live local store
the server's snapshot no longer lists.

## line-__tests__-store-prune-skipped-when-unchanged-test-ts-L80

`client/__tests__/store-prune-skipped-when-unchanged.test.ts:80`

The prune probes every store-scoped table for a `store_id` column before
building its subquery list; `stores` itself is probed by the row-apply
path regardless, so it isn't evidence of the prune.

## block-__tests__-stuck-sync-crash-log-amplification-test-ts-L23

`client/__tests__/stuck-sync-crash-log-amplification.test.ts:23`

Regression coverage for the production crash-log amplification loop
(Sentry DUMOSRX-CLIENT-1B/17/19/1A/1G/1M, docs/FIXED_BUGS.md SF-CRASH-1).

recordSyncFailure() reported a stuck queue item by embedding the raw push
error into a new crash description; for a DB-level rejection that error is
the whole attempted SQL statement, i.e. a verbatim copy of the row being
pushed. logCrash() stores that description as a `feedback` row, which is
queued for push, fails the same way, and gets reported again — each
generation containing all previous ones until MySQL's column limit is hit,
which then fails forever.

## block-__tests__-stuck-sync-skips-expected-restrictions-test-ts-L15

`client/__tests__/stuck-sync-skips-expected-restrictions.test.ts:15`

A-172. `logCrash()` has filtered expected plan restrictions since
2026-09-17, so the ordinary stuck path was already covered. What was NOT
covered is `reportStuckCrashLog()`, which calls `Sentry.captureException`
directly for `feedback` rows and therefore bypasses that filter — the exact
table the reported issues were about.

These tests assert against the REAL logCrash and the real Sentry boundary;
an earlier version mocked logCrash away, which manufactured its own RED by
discarding the filter it was supposed to be testing.

## block-__tests__-supplier-delete-test-ts-L9

`client/__tests__/supplier-delete.test.ts:9`

deleteSupplier() mirrors deleteCustomer(): a soft delete, blocked only by
money still owed. Order history is deliberately not a blocker — every
purchase-order and stock-batch query LEFT JOINs `suppliers` without a
`_deleted = 0` filter, so a deleted vendor's name still resolves on the
orders it already fulfilled. See client/AGENTS.md ("Deleting a supplier").

## block-__tests__-supplier-detail-pane-manage-permission-test-tsx-L4

`client/__tests__/supplier-detail-pane-manage-permission.test.tsx:4`

"manage_suppliers" is the add/edit third of the supplier three-way split
(view_suppliers reads, delete_suppliers deletes - see
supplier-detail-pane-delete-permission.test.tsx). The detail pane keeps
every supplier figure visible without it and falls back to the actions
the viewer CAN take, spanning the row instead of leaving a disabled
button.

## block-__tests__-sw-cache-retention-test-ts-L5

`client/__tests__/sw-cache-retention.test.ts:5`

P3-2: activate()'s prune used to delete every cache entry missing from the
current build's manifest, so an already-open tab running the previous
build's JS could lazy-load a chunk that both the prune and the deploy had
already removed and get a 404 (or, on this static-export host, an HTML
fallback document it then tried to execute). The prune now keeps the
immediately-previous build's hashed chunks for exactly one more deploy
cycle. This exercises that policy function directly - public/sw.js is a
standalone script, so it is evaluated here against a stub `self` and the
policy read off the internals it exposes for this purpose.

## block-__tests__-sw-navigate-no-store-test-ts-L5

`client/__tests__/sw-navigate-no-store.test.ts:5`

A-158 follow-up: sw.js's navigate handler is documented as "network
first" specifically so a page never goes visibly stale, but its fetch()
call for the navigation request itself carried no cache option - unlike
fetchManifest() a few lines above it, which deliberately passes
`cache: "no-store"` to avoid the browser's own HTTP cache quietly
answering from a stale previous deploy. Without the same guard on the
navigate fetch, a "network first" request could still be satisfied by
the browser's heuristic HTTP cache instead of actually reaching the
server - reproducible live: one real device got stuck replaying a single
stale release 178 times (Sentry DUMOSRX-CLIENT-F) because its own
auto-reload-on-stale-chunk recovery (see chunk-error.ts) kept landing
back on the same cached document instead of a fresh one.

## line-__tests__-sw-navigate-no-store-test-ts-L23

`client/__tests__/sw-navigate-no-store.test.ts:23`

The navigate branch's own request fetch - distinct from the runtime
stale-while-revalidate branch's plain `fetch(request)` further down,
which deliberately has no cache option (those assets are
content-hashed and immutable, so a browser-cache hit is never wrong).

## block-__tests__-sw-navigate-slow-network-timeout-test-ts-L5

`client/__tests__/sw-navigate-slow-network-timeout.test.ts:5`

A-160: the navigate handler's "network first" fetch was bounded by a flat
4000ms abort, chosen only to stop iOS Safari parking a doomed fetch for
tens of seconds. On a congested Nigerian mobile connection that budget
also expired before a perfectly live request could deliver the document's
first byte, so the device fell back to Cache Storage on every single
navigation and never landed a fresh copy - the other half of the stale
deploy loop A-159 fixed in the HTTP-cache layer (Sentry DUMOSRX-CLIENT-F /
DUMOSRX-CLIENT-J). These cases pin the headroom the slow connection needs
and the upper bound that still protects the dead-connection case.

## block-__tests__-sync-blocked-during-impersonation-test-ts-L27

`client/__tests__/sync-blocked-during-impersonation.test.ts:27`

Impersonation (a superadmin handing off into a store's app via
app/auth/callback/page.tsx) is read-only support access. Nothing used to
gate sync during such a session: the sync indicator's auto-sync daemon
looked only at auto_sync_enabled/auto_sync_interval plus "is cloud linked",
and the manual sync button was unguarded too — so a background sync could
push the impersonator's local writes, or pull-overwrite local state, under
ambiguous attribution and bypassing the real store owner's own sync
settings and audit trail.

The gate lives in sync() itself (not in the UI) so no call site can bypass
it: manual button, interval timer, instant on-change listener, store
switcher, license guard, the PIN-recovery sync in auth-context, and
onboarding's post-restore sync all go through this one function.

## line-__tests__-sync-blocked-during-impersonation-test-ts-L81

`client/__tests__/sync-blocked-during-impersonation.test.ts:81`

The admin panel can fail to mint a return code while the impersonation
itself still proceeds, and "End Session" can clear one flag but not the
other — either flag alone still means "impersonated".

## block-__tests__-sync-commands-apply-test-ts-L9

`client/__tests__/sync-commands-apply.test.ts:9`

Phase 4. These commands are the only thing in the system that lets an
operator act on a customer's device, so the guards ARE the feature.

In particular: a business record exists only on the device that made it, so
abandoning a queued sale or stock movement would permanently lose revenue
data or falsify stock. The client refuses independently of the server —
two locks, because a client must never rely on a check it cannot see.

## block-__tests__-sync-delivery-age-test-ts-L9

`client/__tests__/sync-delivery-age.test.ts:9`

"Did the push work" was only ever measured per HTTP attempt, which says
nothing about whether an edit was ever delivered. See
docs/DEVICE_TABLE_AGREEMENT.md, "Delivery timing".

## block-__tests__-sync-engine-store-identity-test-ts-L5

`client/__tests__/sync-engine-store-identity.test.ts:5`

A-304. A sync run used to resolve its store twice — `client.ts` stamped
`X-Store-Id` from localStorage at request time while each report builder
read the module resolver at the start of the run — so a store switch
mid-run could file one store's digest against the other store's cloud. One
device did exactly that on 2026-10-19 and the panel reported -4,129 units
on a device that was in step.

The fix is one identity per run. This test is what keeps it that way: a
future call site that reaches for the ambient store instead of taking it
from the run fails here, which a code review would not reliably catch.

## block-__tests__-sync-engine-store-identity-test-ts-L19

`client/__tests__/sync-engine-store-identity.test.ts:19`

What this guard covers: every file in a RUN's request-and-report path. The
exemptions below are not oversights — each resolves the store and uses it
within the same tick (no `await` between), so neither source can have moved:

- `sync-run.ts` owns the single ambient read, by design.
- `stock-integrity.ts` scopes local writes; no request, no report.
- `health-check.ts` reads the store and calls `getSyncCounts()` immediately;
  a mismatch could at worst trigger one spare resync, never corruption.
- `reconcile-quantities.ts` likewise, and the server scopes that endpoint by
  each batch's product's store rather than by the header.
- `device-report-command.ts` uses it for a prose label in a support report.
- `stock-auto-heal.ts` asks whether THIS store's movement log is caught up,
  from UI hooks and a health check, never inside a run.

The limit, stated so nobody over-trusts this: the allowlist is by FILE, so
adding a genuinely run-scoped ambient read to one of these five would not be
caught here.

## line-__tests__-sync-engine-test-ts-L14

`client/__tests__/sync-engine.test.ts:14`

push.ts wraps its per-batch local writes in transaction() to defer
sql.js's saveDatabase() export to once per batch instead of once per
statement (see push.ts). The real transaction() checks for an
initialized `db` and lazily calls initDatabase() if there isn't one —
this suite never sets up a real db (execute/query are mocked directly
instead), so that lazy init would try to load the real wasm binary and
fail. A passthrough is enough here: execute()/query() are already
fully mocked and don't need real BEGIN/COMMIT semantics.

## line-__tests__-sync-engine-test-ts-L240

`client/__tests__/sync-engine.test.ts:240`

The per-table sync cursor must not advance either, or the server's
copy of this record would never be re-offered once the local edit
is pushed and resolved.

## line-__tests__-sync-engine-test-ts-L264

`client/__tests__/sync-engine.test.ts:264`

The prune's candidate lookup: the live local stores the server's
snapshot didn't list. The expensive per-table prune only runs when
this is non-empty (A-8).

## line-__tests__-sync-engine-test-ts-L380

`client/__tests__/sync-engine.test.ts:380`

Falls back to firing once at the very end regardless (see pull.ts's
doc comment on the fallback) — but only via that fallback, after
BOTH pages were already fetched, never mid-round while stores was
still outstanding.

## line-__tests__-sync-engine-test-ts-L406

`client/__tests__/sync-engine.test.ts:406`

Nothing was written (the page transaction carrying stores AND users
rolls back as a unit), so a caller must not read the callback as
"identity is in place" - see onboarding-cloud-setup-failed-pull.

## line-__tests__-sync-engine-test-ts-L463

`client/__tests__/sync-engine.test.ts:463`

A device whose local SQLite predates the migration that added
permission_groups: PRAGMA table_info returns nothing for it, and
any statement naming it throws "no such table".

## block-__tests__-sync-headers-carry-app-version-test-ts-L5

`client/__tests__/sync-headers-carry-app-version.test.ts:5`

A-213: the server refuses Health Sync from a client that cannot prove its
version, so every sync call must carry one. Dropping this header would
silently disable the endpoint for every device.

## block-__tests__-sync-health-check-test-ts-L3

`client/__tests__/sync-health-check.test.ts:3`

Regression coverage for checkSyncHealth() - the periodic check that a
device's local row counts actually match the server's, independent of
whatever its own pull cursor believes. See health-check.ts's own doc
comment for why this exists: a pull cursor can get stuck with no error
anywhere to notice it by, and this is what catches that automatically
instead of relying on someone manually running SQL against production.

## block-__tests__-sync-indicator-background-sync-is-not-manual-test-ts-L74

`client/__tests__/sync-indicator-background-sync-is-not-manual.test.ts:74`

The background auto-sync daemon used to call the very same handler the
"Sync Now" button does, so every automatic sync went out flagged
`manual` - which on the client means "ignore each queue item's
exponential backoff" and on the server means "skip the plan's
sync-interval throttle" (see docs/FIXED_BUGS.md, A-5). Only a real user
click is manual.

## block-__tests__-sync-indicator-expand-timing-test-ts-L22

`client/__tests__/sync-indicator-expand-timing.test.ts:22`

Regression coverage for a real user report: hovering a collapsed sidebar
open showed the sync indicator "squished then readjusting" instead of
smoothly following the sidebar's own widening animation.

First attempt at a fix delayed swapping from a compact layout to a wide
one by 300ms (matching the sidebar's width transition) to avoid the wide
layout rendering into a still-narrow container. The user correctly
pushed back: that just traded one bad look (squish) for another (an
abrupt pop-in after a dead pause), and pointed out that every OTHER
collapsible bit of sidebar content — nav item labels, the logo wordmark —
doesn't have this problem because it's one persistent element whose
content reveals inline, not two structurally different trees swapped by
a conditional.

The actual fix: SyncIndicator is now that same pattern. One persistent
card is always rendered; the label, refresh button, and "last synced"
line reveal via max-width/max-height + opacity, transitioning on the
same 300ms timeline as the sidebar's own width change — so they grow in
lockstep with the panel starting the instant `collapsed` flips, with no
artificial delay and no separate DOM tree to swap into.

## line-__tests__-sync-indicator-expand-timing-test-ts-L62

`client/__tests__/sync-indicator-expand-timing.test.ts:62`

SyncIndicator reads isImpersonating from the auth context (sync is
disabled wholesale during an impersonated session); this is an ordinary
non-impersonated session.

## line-__tests__-sync-indicator-expand-timing-test-ts-L143

`client/__tests__/sync-indicator-expand-timing.test.ts:143`

No setTimeout/delay involved — the very next render already carries
the expanded (non-zero max-width) classes, which is what lets the
CSS transition animate in lockstep with the sidebar's own width
change instead of waiting for it to finish first.

## line-__tests__-sync-indicator-impersonation-disabled-test-tsx-L7

`client/__tests__/sync-indicator-impersonation-disabled.test.tsx:7`

jsdom doesn't implement matchMedia; components/ui/tooltip.tsx's touch
detection needs it to exist to mount at all. Same stub as
sync-indicator-instant-sync.test.ts.

## block-__tests__-sync-indicator-impersonation-disabled-test-tsx-L74

`client/__tests__/sync-indicator-impersonation-disabled.test.tsx:74`

Companion to sync-blocked-during-impersonation.test.ts: sync() itself is
the real gate, but the indicator must SAY so rather than silently doing
nothing — otherwise a superadmin just sees a frozen "Cloud Active" badge
and an inert refresh button.

## line-__tests__-sync-indicator-impersonation-disabled-test-tsx-L129

`client/__tests__/sync-indicator-impersonation-disabled.test.tsx:129`

The indicator does subscribe to sync-queue changes to keep its pending
COUNT fresh (that replaced a 5s poll against main-thread sql.js), so a
registered listener isn't itself proof of a daemon — firing it, and
every timer the daemon would have used, must still sync nothing.

## line-__tests__-sync-indicator-instant-sync-test-ts-L7

`client/__tests__/sync-indicator-instant-sync.test.ts:7`

jsdom doesn't implement matchMedia; components/ui/tooltip.tsx's touch
detection needs it to exist to mount at all. Same stub as
sync-indicator-expand-timing.test.ts.

## line-__tests__-sync-indicator-instant-sync-test-ts-L68

`client/__tests__/sync-indicator-instant-sync.test.ts:68`

SyncIndicator reads isImpersonating from the auth context (sync is
disabled wholesale during an impersonated session); this is an ordinary
non-impersonated session.

## block-__tests__-sync-indicator-pending-and-concurrent-test-tsx-L66

`client/__tests__/sync-indicator-pending-and-concurrent.test.tsx:66`

U3: the indicator under-reported real backlogs (pending state was gated on
the last sync being 30+ minutes stale, so unsynced sales still showed a
green "Cloud Active") and over-reported failures (two mounted instances
racing produced sync()'s "Sync already in progress", which was rendered as
a red "Sync Error" on a sync that actually succeeded).

## block-__tests__-sync-indicator-surfaces-unreachable-server-test-ts-L75

`client/__tests__/sync-indicator-surfaces-unreachable-server.test.ts:75`

A-273. The expected-noise list widened to cover genuine network failures so
they stop filling Sentry and the `feedback` table, and the first cut had the
indicator reading that same widened list — which made an unreachable server
display "online" on an automatic sync. In a POS a cashier shown "online"
while nothing reaches the server is the silent divergence the whole change
exists to prevent, so the indicator reads `isExpectedPlanRestriction` and a
network failure still surfaces. See client/AGENTS.md, "Expected sync noise".

## block-__tests__-sync-outcome-test-ts-L7

`client/__tests__/sync-outcome.test.ts:7`

`last_sync_time` is stamped only on success, so a device failing every round
for two days read identically to one that had simply never synced — and the
reason lived in the indicator's React state and died on navigation. "Why do
50 changes keep failing" was unanswerable because of that gap.

## line-__tests__-sync-outcome-test-ts-L80

`client/__tests__/sync-outcome.test.ts:80`

canonicaliseReason knows the SERVER's refusal vocabulary, so every
sync-level failure came out as "other" — including the stuck-push case
this exists to diagnose, which made the card useless.

## line-__tests__-sync-outcome-test-ts-L107

`client/__tests__/sync-outcome.test.ts:107`

An inspection session's own mount tick is refused as impersonated, and a
second PWA tab is refused as read-only while sharing this storage key —
so both fire during the very session that reads the outcome.

## line-__tests__-sync-queue-change-listeners-test-ts-L4

`client/__tests__/sync-queue-change-listeners.test.ts:4`

transaction() persists via idb-keyval when not running in Tauri; stub it
out since jsdom has no real IndexedDB and we only care about the
notification-batching semantics here, not persistence. Same stub as
db-transaction.test.ts.

## block-__tests__-sync-queue-collapses-updates-test-ts-L9

`client/__tests__/sync-queue-collapses-updates.test.ts:9`

A-203: every `update()` appended a `_sync_queue` row, so a pass over the
whole catalogue queued one row per product. The queue is FIFO, which
delays every sale rung behind it, and `pull.ts` skips any row with a
queued local edit — so the backlog also blocks incoming server changes to
those same rows. An UPDATE now collapses onto the record's pending UPDATE.

## block-__tests__-sync-queue-count-excludes-crash-reports-test-ts-L9

`client/__tests__/sync-queue-count-excludes-crash-reports.test.ts:9`

Automatic crash reports land in the same `feedback` table as
user-submitted feedback, but they are background telemetry: they must not
be advertised to the user as "X changes unsynced", and they must not earn
an instant sync of their own. They must still ride along with any sync
that happens for another reason.

## block-__tests__-sync-queue-transaction-race-test-ts-L9

`client/__tests__/sync-queue-transaction-race.test.ts:9`

Regression coverage for the orphaned-remote-row bug found while smoke-
testing bulk import: a background auto-sync tick called
getPendingSyncItems() with a bare query(), which — on sql.js's single
ambient connection — sees a still-open transaction()'s uncommitted writes
(same-connection reads-your-own-writes). A sync landing mid-import could
therefore push rows to the server that the import's transaction later
rolled back (or that never persisted locally because the app closed before
COMMIT), leaving the server with products no local device ever kept.
getPendingSyncItems() now awaits awaitSettledTransactions() first so it
only ever reads state from a settled (committed or rolled-back)
transaction.

## block-__tests__-sync-reconciliation-movement-visibility-test-ts-L11

`client/__tests__/sync-reconciliation-movement-visibility.test.ts:11`

A-148: a 'sync_reconciliation' movement is a real, permanent record, but
it is a sync correction rather than a stock event — so it must not appear
in the owner's day-to-day Stock Movements list, nor inflate the
added/removed stock-value figures. See client/AGENTS.md.

## block-__tests__-sync-reconciliation-movement-visibility-test-ts-L124

`client/__tests__/sync-reconciliation-movement-visibility.test.ts:124`

A-221: the A-214 repair writes compensating `sync_reconciliation_reversal`
movements, which are the same kind of row for the same reason and must be
hidden in the same three places.

## block-__tests__-sync-run-store-identity-test-ts-L17

`client/__tests__/sync-run-store-identity.test.ts:17`

A-304. The store a run belongs to is decided once, at the start, and every
request and report of that run carries it. Before this, `client.ts` stamped
`X-Store-Id` from localStorage at request time while the report builders
read the module resolver at the start — so switching store mid-run filed one
store's digest against the other store's cloud. A real device did that and
the panel reported -4,129 units against a device that was in step.

Both cases move BOTH sources, as `switchStore()` does: a test that flips
only the resolver proves nothing, because the header is built from
localStorage and the builders read the resolver.

What these pin precisely: that `pushChanges` hands the run's store to the
API client rather than re-reading ambient state. `apiClient` is mocked, so
`syncHeaders()`'s assembly of that value into `X-Store-Id` is not exercised
here — it is a one-line `runStoreId ?? getStoredActiveStoreId()`, and the
structural guard in `sync-engine-store-identity.test.ts` is what keeps the
callers honest.

## line-__tests__-sync-run-store-identity-test-ts-L85

`client/__tests__/sync-run-store-identity.test.ts:85`

The first push consumed the queue row, so re-seed: it is this SECOND
push — issued entirely after the active store changed — that would
carry store-b if the header were read per request instead of taken
from the run.

## block-__tests__-sync-skips-when-offline-test-ts-L27

`client/__tests__/sync-skips-when-offline.test.ts:27`

Regression coverage for the "stuck sync" false-alarm bug: sync() had no
navigator.onLine check of its own, relying on every call site to check
first — two of them (store-context's store-switch handler, auth-context's
PIN-recovery sync) didn't. An offline device hitting either path attempted
a real fetch, failed with "Failed to fetch" for every queued item, burned
through the sync queue's 5-attempt exponential backoff, and fired a
spurious "stuck sync" crash report — for an app whose entire premise is
working correctly while offline. Centralizing the check in sync() itself
(mirroring what syncSubscriptionStatus already did) protects every call
site at once, present and future.

## block-__tests__-sync-subscription-status-test-ts-L24

`client/__tests__/sync-subscription-status.test.ts:24`

syncSubscriptionStatus() is the one sync path that runs even for stores
with cloud sync switched off, so it is how a plan downgrade, a suspension
or a renewal ever reaches a device. It writes directly into `stores` with
a hand-built UPDATE and had no coverage: nothing checked that it only
touches the five subscription fields (the rest of `stores` is local
settings the server has no business overwriting), that it refuses to
insert a store the device doesn't have, or that it stamps the pull cursor.

## block-__tests__-sync-throttle-not-reported-as-crash-test-ts-L15

`client/__tests__/sync-throttle-not-reported-as-crash.test.ts:15`

Regression coverage for a real Sentry report: a plan's sync-interval
throttle (SyncController::validateSync's SYNC_THROTTLED response, "Sync
limit reached... Please upgrade your plan for faster sync") reached the
user during a completely normal navigation to /inventory, not a bug -
base-client.ts throws it the same way as any other failed request, and
pull.ts/sync-engine's logCrash() shipped it to Sentry as an "error" issue
regardless. base-client.ts now tags the thrown Error with the server's
`code`, and logCrash() skips Sentry (and the own-server/feedback
pipelines) for the known set of expected plan-restriction codes.

## block-__tests__-sync-throttle-not-reported-as-crash-test-ts-L63

`client/__tests__/sync-throttle-not-reported-as-crash.test.ts:63`

A-273. Two more outcomes that are not bugs and were filling Sentry and the
`feedback` table: a tab that lost the single-writer election (core.ts's
assertWritable), and a device that is simply offline or on a flaky link.

## block-__tests__-sync-throttle-not-reported-as-crash-test-ts-L82

`client/__tests__/sync-throttle-not-reported-as-crash.test.ts:82`

A-273. The two lists are read by two different kinds of consumer. A
cashier shown "online" while nothing reaches the server is the silent
divergence this whole batch exists to prevent, so the UI's check must stay
narrow: only the server telling this device to slow down or upgrade may
suppress the error state.

## block-__tests__-tab-lock-test-ts-L3

`client/__tests__/tab-lock.test.ts:3`

Minimal same-process BroadcastChannel fake, scoped to one describe block
via a fresh registry per test (see its beforeEach/afterEach below). The
real BroadcastChannel is a genuine cross-realm primitive keyed by name,
not JS module state - `vi.resetModules()` gives tab-lock.ts a fresh
`handoffChannel` variable each test, but a real channel object it created
in an earlier test is never closed and keeps receiving broadcasts, so
reusing the real one here would leak listeners (with stale/undefined
callbacks) across tests and race with the current test's own listener.

## block-__tests__-tab-lock-test-ts-L44

`client/__tests__/tab-lock.test.ts:44`

Regression coverage for the single-writer-tab election in tab-lock.ts
(docs/KNOWN_BUGS.md C1 - two browser/PWA tabs could silently overwrite
each other's committed sql.js data with no error or warning). jsdom
doesn't implement the Web Locks API at all, so every scenario here stubs
`navigator.locks` directly rather than relying on a real browser lock.

## line-__tests__-tab-lock-test-ts-L132

`client/__tests__/tab-lock.test.ts:132`

"The other tab closes" - the queued lock request is now granted. Not
awaited directly: like the real Web Locks API, the callback holds the
lock (and its returned promise) open indefinitely once granted, so
only a couple of microtask ticks are awaited here, enough for
onPromoted() and the writer-flag flip inside it to run.

## block-__tests__-tab-lock-test-ts-L202

`client/__tests__/tab-lock.test.ts:202`

Graceful handoff (BroadcastChannel handshake): a read-only tab can ask the
current writer tab to force a save and voluntarily release the Web Lock,
rather than waiting for it to close on its own. jsdom/Node both provide a
real BroadcastChannel; tests use a second, independently-constructed
instance with the same channel name to stand in for "the other tab" -
BroadcastChannel deliberately never delivers a message back to the
instance that sent it, so reusing tab-lock's own internal channel for
both sides of a handshake within one test would never see anything.

## line-__tests__-tab-lock-test-ts-L308

`client/__tests__/tab-lock.test.ts:308`

This tab's queued request behind the current (never-modeled)
holder - stays pending, putting this tab in the read-only state
stealWriterLock() is meant to be called from.

## block-__tests__-table-fingerprint-test-ts-L9

`client/__tests__/table-fingerprint.test.ts:9`

Agreement was only ever measured for stock, so every other synced table
could diverge on every till and the panel still read "Agrees". See
docs/DEVICE_TABLE_AGREEMENT.md for the digest and its blind spots.

## block-__tests__-tabs-hover-compat-shim-coverage-test-ts-L5

`client/__tests__/tabs-hover-compat-shim-coverage.test.ts:5`

A-158: app/globals.css has a compat shim (`@supports not (color: color-mix(...))`)
that forces low-opacity utilities on theme-CSS-variable colors (primary,
destructive, etc.) to fully transparent on browsers without color-mix()
support (e.g. Chrome <111 / Windows 7) - without it, those utilities
silently fall back to a SOLID, full-opacity color, which can collide with
same-color foreground text/icons and make them invisible.

The shim's selector list only ever listed bare tokens like
"hover:bg-primary/10". Several components style their inactive/hover tab
or filter-chip state with the *compound* variant
"data-[state=inactive]:hover:bg-primary/10" - a different literal class
string - so they slipped past the shim entirely (found live: a tab's and
a filter chip's label text disappearing on hover, since the un-mitigated
fallback made the "10% tint" solid, full-opacity primary blue behind
equally-blue hover text).

Rather than pinning this to one file, this scans every .tsx file under
components/ and app/ for the pattern, so any current or future file using
this compound variant is covered the same way, not just the ones known
at the time of the fix.

## block-__tests__-tauri-csp-config-test-ts-L5

`client/__tests__/tauri-csp-config.test.ts:5`

A-13. The Tauri webview shipped with `csp: null` and `withGlobalTauri:
true`, so any script injection in the webview would have run with every
granted capability (`sql:allow-*`, `fs:allow-read-file`,
`fs:allow-copy-file`, `dialog:*`, `shell:default`) and `window.__TAURI__`
in scope. This pins the policy so it cannot silently regress to null, and
pins the specific sources the app genuinely needs — each one is there
because something in the client actually loads it.

## line-__tests__-till-inspection-banner-test-tsx-L108

`client/__tests__/till-inspection-banner.test.tsx:108`

Several ticks, not one: the interval keeps firing while the POST is in
flight, and a single tick hid a repeated end() that wrote duplicate
exit rows to the audit log.

## line-__tests__-till-inspection-banner-test-tsx-L180

`client/__tests__/till-inspection-banner.test.tsx:180`

pagehide fires on F5 too, so the beacon closes the row while
sessionStorage survives — leaving a client session the server has
already ended, with writes blocked and the override refused.

## block-__tests__-till-inspection-read-only-test-ts-L9

`client/__tests__/till-inspection-read-only.test.ts:9`

Read-only is enforced at the mutation layer, not by hiding buttons: gating
the UI alone is how a "read-only" mode ends up writing through some path
nobody remembered. See
docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.

## block-__tests__-till-inspection-session-test-ts-L13

`client/__tests__/till-inspection-session.test.ts:13`

An inspection session is an overlay on whatever the till was already doing:
it never moves the local DB's current user, never touches the active store
or the sync token, and dies on restart. See
docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.

## block-__tests__-till-repair-audit-test-ts-L9

`client/__tests__/till-repair-audit.test.ts:9`

The spec requires every repair run from an inspection session to be audited
with the admin, device, store and outcome. logAction attributes user_id to
whoever the local DB still points at — the cashier, or nobody — so without
these explicit details a repair reads as the staff user's doing.

## line-__tests__-till-repair-audit-test-ts-L129

`client/__tests__/till-repair-audit.test.ts:129`

user_id is what the Activity Log and the server's activity_logs show.
SyncController backfills an empty or unknown id from the sync token's
owner, so leaving it unset made the server's record name the STORE
OWNER as having run the clock override.

## line-__tests__-till-repair-audit-test-ts-L155

`client/__tests__/till-repair-audit.test.ts:155`

Asserting null here proved nothing: null is what any implementation
yields when no current user was ever set. Set one, so the fallback is
what the assertion actually measures.

## block-__tests__-transaction-details-reprint-permission-test-tsx-L89

`client/__tests__/transaction-details-reprint-permission.test.tsx:89`

Reprinting a completed sale's receipt (or its tax invoice) is the real
action behind "reprint_receipt". The receipt shown immediately after
checkout is part of process_sales and stays ungated; this is only the
after-the-fact copy pulled from transaction history.

## line-__tests__-transaction-list-virtualization-test-tsx-L6

`client/__tests__/transaction-list-virtualization.test.tsx:6`

jsdom reports zero size for every element, so the real useVirtualizer would
compute an empty visible range and nothing would render. Stubbed to return
every row, same shape react-virtual does - these tests are about the
flattening and ordering, not virtualization mechanics (that needs real
layout, i.e. an e2e browser test).

## block-__tests__-update-preserves-base-version-test-ts-L9

`client/__tests__/update-preserves-base-version.test.ts:9`

Regression coverage for _known-bugs.md #11: update()'s `_version` used to
be a purely local edit counter (`current._version + 1` written to both the
local row AND the queued sync payload), blind to the server's actual
current version. Two devices editing the same row from the same shared,
already-synced ancestor would always compute the identical "next" version
— guaranteed collision arithmetic, not a rare race — which is exactly how
a confirmed, server-committed edit got silently overwritten by a second
device's later push with zero error or signal (see the MACA GUMMIES
reproduction in docs/features/backup-restore.md).

The fix: update() now sends/stores the UNCHANGED current `_version`, never
incrementing it locally. The server (SyncController::push) is the sole
authority for assigning the new version, on acceptance, and returns it to
the client via the push response's `versions` field (see push.ts).

## line-__tests__-update-preserves-base-version-test-ts-L86

`client/__tests__/update-preserves-base-version.test.ts:86`

Reset the local row back to its pre-edit state to simulate "device B"
never having pulled device A's change (its local copy is still the
original ancestor).

## line-__tests__-update-preserves-base-version-test-ts-L98

`client/__tests__/update-preserves-base-version.test.ts:98`

Both edits carry the SAME base version — this is exactly the shape the
server's strict version-equality check (SyncController::push) now
needs to detect as a real conflict on the second push, instead of the
old `<` check silently falling through to an updated_at comparison.

## block-__tests__-use-expense-mutations-validation-test-ts-L13

`client/__tests__/use-expense-mutations-validation.test.ts:13`

Regression coverage for docs/KNOWN_BUGS.md's "Expense amount has no
numeric validation": parseFloat(formData.amount) could store NaN for a
non-numeric input, nothing rejected a negative amount, and nothing rounded
to the cent before writing into expenses.amount (a REAL column).

## block-__tests__-use-feature-gate-ai-assistant-test-ts-L15

`client/__tests__/use-feature-gate-ai-assistant.test.ts:15`

The in-app assistant is a plan-gated feature (Pro/Enterprise), matching
the smart_suggestions tier split. It is client-only — there is no backend
endpoint behind it — so useFeatureGate's canUseAiAssistant is the single
entitlement check both render sites read.

## block-__tests__-use-feature-gate-loyalty-test-ts-L4

`client/__tests__/use-feature-gate-loyalty.test.ts:4`

canUseLoyaltyProgram must require BOTH the plan-tier entitlement (Pro/
Enterprise, expressed as `tierAllows`) AND the store's own on/off toggle
(`stores.loyalty_program_enabled`, DEFAULT 1). The two are ANDed together;
a store on a plan that doesn't include the feature can never flip it on
via the toggle, and a Pro/Enterprise store can pause it independent of
its plan by flipping the toggle off.

Extracted as a pure function (rather than testing the useFeatureGate()
hook directly, which is coupled to StoreContext/useSystemConfigStore
providers) so the actual AND logic is covered without a render harness.

## block-__tests__-use-feature-gate-markup-sales-test-ts-L4

`client/__tests__/use-feature-gate-markup-sales.test.ts:4`

canUseMarkupSales must require BOTH the plan-tier entitlement (Pro/
Enterprise, expressed as `tierAllows`) AND the store's own on/off toggle
(`stores.markup_sales_enabled`, DEFAULT 0). Unlike isLoyaltyProgramEnabled,
this defaults OFF - an owner has to explicitly opt in before any staff
can mark up a sale at all.

## block-__tests__-use-feature-gate-sync-interval-test-ts-L4

`client/__tests__/use-feature-gate-sync-interval.test.ts:4`

Fallback used only when the server's subscription_plans config has no
explicit `limits.sync_interval` for a tier — see getLimit() in
use-feature-gate.ts. Enterprise gets 0 (sync instantly on any change);
Pro and Starter get positive polling intervals; anything else (free)
falls back to the existing 360-minute default.

## block-__tests__-use-feature-gate-tier-resolution-test-ts-L18

`client/__tests__/use-feature-gate-tier-resolution.test.ts:18`

useFeatureGate() resolves a store's subscription tier into every module
gate the app enforces. The pure helpers it delegates to were covered, but
the resolution itself — trial-suffix stripping, the "local" -> "starter"
config aliasing, -1 meaning unlimited, the alt-key feature fallback, the
per-tier fallbacks used when the server config is missing, the upgrade
message's plan hierarchy and withRestriction's mobile block — was not.

## block-__tests__-use-fulfill-online-order-mutation-test-ts-L20

`client/__tests__/use-fulfill-online-order-mutation.test.ts:20`

Runs against a real in-memory SQLite engine (sql.js), not a mocked
insert() - a mocked insert only checks the shape of the object handed to
it and would happily "pass" while writing to columns that don't exist, or
omitting a NOT NULL one (both of which this hook has actually done; see
FIXED_BUGS.md). Only the network call (apiClient.fulfillOnlineOrder) is
mocked.

## block-__tests__-use-has-permission-single-group-read-test-tsx-L42

`client/__tests__/use-has-permission-single-group-read.test.tsx:42`

useHasPermission used to keep its own useState/useEffect, its own
getUserPermissionGroup() query and its own `dumos_sync_completed` listener -
duplicating state AuthContext already maintained. With 26+ call sites that
meant 26+ independent synchronous sql.js reads per sync cycle on the main
thread, and 26+ copies of the same state that could transiently disagree with
each other and with AuthContext's own isAdmin/canManageStockBatch booleans.

AuthContext is now the single owner. These pin that: one read for any number
of call sites, and every call site agreeing with AuthContext.

## block-__tests__-use-permission-groups-mutations-test-ts-L11

`client/__tests__/use-permission-groups-mutations.test.ts:11`

The standalone delete/revert helpers were already covered, but every
mutation the Roles & Permissions matrix actually calls — toggling a single
permission on or off, creating, copying and renaming a group — lived in
usePermissionGroups' callbacks at 0%. These writes decide what staff can
do, so a duplicate-grant bug, a copy that inherits default-group
immutability, or a rename that mutates a default group all matter.

## block-__tests__-use-pos-held-transactions-reseller-recall-test-ts-L37

`client/__tests__/use-pos-held-transactions-reseller-recall.test.ts:37`

A-59: holding a reseller sale dropped `is_reseller_sale`/`markup_type` and
re-quoted every line at the current catalog price, so the markup and the
agent's commission vanished — blamed on a generic "prices have changed"
toast. A-60: the cart was mutated to the recalled state before the held row
was deleted, so a failing delete left a recalled cart, a failure toast, and
the held sale still listed as recallable.

## line-__tests__-use-pos-held-transactions-reseller-test-ts-L41

`client/__tests__/use-pos-held-transactions-reseller.test.ts:41`

Catalog price has since changed to 120, but the held transaction was
saved at 100 (its unit_price at hold time). The recall path always
rebuilds from the current catalog product per its existing design.

## block-__tests__-use-pos-payment-double-submit-test-ts-L14

`client/__tests__/use-pos-payment-double-submit.test.ts:14`

Regression coverage for usePOSPayment.handlePayment() having no
re-entrancy guard: the only protection against a second invocation was
the submit button's `disabled={processingPayment}` prop, which only
takes effect a render tick after the click that caused it. On the
touchscreen POS tablets this app targets, a close-enough double-tap can
dispatch two handlePayment() calls before that render lands - each
generating its own unique transactionNumber, so the UNIQUE constraint
doesn't catch it as a duplicate - producing two sales rows for one
physical transaction. See docs/FIXED_BUGS.md.

Harness mirrors use-pos-payment-loyalty-gate.test.ts's pattern (no
@testing-library/react installed in this repo).

## block-__tests__-use-pos-payment-loyalty-gate-test-ts-L14

`client/__tests__/use-pos-payment-loyalty-gate.test.ts:14`

Defense-in-depth coverage for the Gap 1 backend fix: usePOSPayment must
never write loyalty_transactions (earn OR redeem) when canUseLoyaltyProgram
is false, even with a customer selected and a redemption staged. This is
the real security/business-logic boundary — the POSRedeemReward UI being
hidden is not sufficient on its own, since cart state (redeemedOption) can
survive a plan downgrade or a stale tab.

usePOSPayment is a React hook (useState/useEffect), so it can't be called
directly outside a component. No @testing-library/react is installed in
this repo, so this uses a minimal manual harness: mount a host component
with react-dom/client + React 19's `act`, capture the hook's return value
via a closure, and drive it exactly like customer-payments.test.ts drives
a real sql.js-backed query function.

## block-__tests__-use-pos-payment-loyalty-tier-test-ts-L13

`client/__tests__/use-pos-payment-loyalty-tier.test.ts:13`

Coverage for wiring loyalty_tiers.points_multiplier into actual points
earning at checkout (previously configured/displayed in Settings but never
applied - see getApplicableTierMultiplier in loyalty-calculator.ts).

## block-__tests__-use-purchase-orders-receive-price-toast-test-ts-L33

`client/__tests__/use-purchase-orders-receive-price-toast.test.ts:33`

Regression coverage (final review of the procurement UX branch): receiving
an existing PO writes products.selling_price synchronously, exactly like
an Immediate Purchase's create-and-receive - the same "toast when the
price change takes place immediately" rule the user asked for applies
here too, and previously didn't.

## block-__tests__-use-settings-form-payment-methods-parse-test-tsx-L6

`client/__tests__/use-settings-form-payment-methods-parse.test.tsx:6`

Regression coverage for FIXED_BUGS.md A-31: enabled_payment_methods is
stored as TEXT holding JSON, not a real array column, so a malformed or
double-encoded value (the same shape that crashed the admin panel's Store
Details page - see A-29) must fall back to the default list instead of
throwing during the initial render or the storeProfile sync effect.

## block-__tests__-use-sortable-data-memo-test-ts-L12

`client/__tests__/use-sortable-data-memo.test.ts:12`

P5: every call site passes a fresh `accessors` object literal per render,
and the hook listed that object in its memo's dependency array — so
`[...data].sort()` re-ran on every render of every sortable table in the
app. The accessors must not participate in the memo's identity.

## line-__tests__-use-sortable-data-memo-test-ts-L70

`client/__tests__/use-sortable-data-memo.test.ts:70`

Flipping direction re-runs the comparator: it must use the accessor
from the latest render, not one captured when the hook first ran. (A
new accessor alone does NOT re-sort — deliberate, since accessors are
pure row projections; see the hook's own note.)

## line-__tests__-use-widget-snapshot-sync-test-ts-L18

`client/__tests__/use-widget-snapshot-sync.test.ts:18`

This hook is only meaningful under Tauri (see enabled: isCloudLinked &&
isTauri() in use-widget-snapshot-sync.ts); simulate that environment so
the query actually runs in this jsdom-based test.

## line-__tests__-utils-test-ts-L17

`client/__tests__/utils.test.ts:17`

XAF/XOF (CFA-zone currencies) are zero-minor-unit - maximumFractionDigits
left undefined previously fell back to Intl's decimal-style default of
3, rendering e.g. "1,234.567 F" on cart rows, totals and receipts
(Medium bug fix, directly relevant to the Cameroon client).

## line-__tests__-utils-test-ts-L31

`client/__tests__/utils.test.ts:31`

A lowercase code (e.g. how a store setting might be stored/typed)
previously got wiped to "" by the letters-only filter (which ran
before case normalization), silently falling back to NGN instead of
formatting as the actually-requested currency.

## line-__tests__-utils-test-ts-L41

`client/__tests__/utils.test.ts:41`

A malformed residual code (not exactly 3 letters after sanitizing,
e.g. "u$" -> "U" or "usd-x" -> "USDX") makes Intl.NumberFormat throw
"Invalid currency code" uncaught, crashing the render tree of any
money-displaying screen.

## line-__tests__-utils-test-ts-L53

`client/__tests__/utils.test.ts:53`

Used by the dashboard's "Today's Sales" and "Inventory Value" stat
cards (components/dashboard/dashboard-overview.tsx) so headline figures
read as clean whole numbers instead of exact-to-the-kobo totals.

## line-__tests__-utils-test-ts-L78

`client/__tests__/utils.test.ts:78`

Task 8 (Reports) gap-fill: the pre-existing tests above never covered
negative amounts, zero, or large values, even though this function is
used for headline metric cards across Dashboard/Expenses/POS/Reports/
Analytics that can plausibly see all three (a refund-heavy day's net
total going negative, a fresh store's ₦0 stat card, a large inventory
valuation figure).

## line-__tests__-utils-test-ts-L117

`client/__tests__/utils.test.ts:117`

Regression: several chart/metric components hardcoded "\u20a6" instead of
deriving it from the store's actual configured currency (Settings has
a real Currency selector), so a non-Naira store's analytics dashboard
silently showed the wrong currency symbol on every figure.

## block-__tests__-verify-schema-sync-parsing-test-ts-L3

`client/__tests__/verify-schema-sync-parsing.test.ts:3`

A-58: `npm run test:schema` compared client `audit_logs` against a
vestigial MySQL `audit_logs` table instead of the real sync target
`activity_logs` (SyncController's `'audit_logs' => ActivityLog::class`),
and its column parser lost every column that followed an inline `--`
comment in SCHEMA_SQL (e.g. `loyalty_transactions.transaction_id`).

## block-__tests__-web-db-restore-validation-test-ts-L5

`client/__tests__/web-db-restore-validation.test.ts:5`

Regression coverage for the desktop-DB-restore Critical bug's web-side
twin (docs/KNOWN_BUGS.md): restoreDatabase() used to hand a picked file's
bytes straight to `new SQL.Database(binaryData)` and immediately persist
it, with no validation and no copy of the outgoing database kept - a
wrong or corrupt file destroyed the live database irrecoverably.

## line-app-(dashboard)-layout-tsx-L11

`client/app/(dashboard)/layout.tsx:11`

InventoryAuditProvider must wrap DashboardLayout from the outside, not live
inside it: DashboardLayout keys its page-content wrapper on `pathname` (to
retrigger the route-transition animation on every navigation), which force
-remounts everything below it - including any inventory/[tab] layout - on
every navigation. That's what was silently resetting the audit overlay's
open state right after "Start Audit" set it.

## line-app-(dashboard)-procurement-edit-page-tsx-L50

`client/app/(dashboard)/procurement/edit/page.tsx:50`

Was hardcoded "standard" everywhere below, which hid every
Immediate-Purchase-only field (lot/expiry/New Cost/Review Price) when
resuming an Immediate draft via "Edit Order" (any PO with status
pending/sent gets that button - see purchase-order-details.tsx - not
just Standard ones). The values still round-tripped correctly once
coerceOptionalNumber's null handling was fixed, just weren't visible
or re-editable. The type itself is never changed here (the toggle
stays locked/hidden either way), just read for display; set in the
seeding effect below once poQuery.data loads.

## line-app-(dashboard)-procurement-edit-page-tsx-L89

`client/app/(dashboard)/procurement/edit/page.tsx:89`

Only seed the form once per PO id — a background refetch (e.g. a sync
pull invalidating purchase_orders) must not overwrite in-progress
unsaved edits with the freshly refetched data.

## line-app-(dashboard)-procurement-new-page-tsx-L52

`client/app/(dashboard)/procurement/new/page.tsx:52`

An immediate purchase is money already handed over at the counter, so it
opens on Fully Paid; a standard PO is raised before paying, so it opens
on Unpaid. Switching type re-applies that default only while the field
is still untouched - a deliberate "Partial" must not be silently
rewritten by toggling the type above it.

## line-app-(dashboard)-procurement-new-page-tsx-L66

`client/app/(dashboard)/procurement/new/page.tsx:66`

Order details (type/vendor/notes/payment/due-date) are confirmed first;
item entry only becomes the dominant content of the screen afterward.
Details stay editable via PODetailsDialog once confirmed.

## line-app-(dashboard)-reports-page-tsx-L18

`client/app/(dashboard)/reports/page.tsx:18`

All of recharts rides along with this dashboard, and only one Radix tab's
content renders at a time — so the Analytics tab pays for it when it's
actually opened, not on every visit to Reports.

## line-app-(dashboard)-settings-[tab]-panels-payment-methods-panel-tsx-L10

`client/app/(dashboard)/settings/[tab]/panels/payment-methods-panel.tsx:10`

The tab itself is manage_payment_accounts. This one section is the
storefront's payout onboarding and exists only so the public checkout
works, so it takes manage_online_store on top of the tab's own key.

## line-app-(dashboard)-settings-[tab]-settings-client-tsx-L38

`client/app/(dashboard)/settings/[tab]/settings-client.tsx:38`

Only one settings tab renders at a time, and these four are the heaviest and
least-visited of the eighteen: the billing screen, the full permission
matrix, the multi-store fleet overview and the backup/restore panel. Loaded
on demand so the other fourteen tabs don't ship them.

## line-app-(dashboard)-settings-[tab]-settings-client-tsx-L112

`client/app/(dashboard)/settings/[tab]/settings-client.tsx:112`

With the app sidebar/header hidden on every settings route, this
header (and its back button) is the only way out — shown on desktop
too now, not just mobile. Desktop has no separate menu-list route (the
tab rail below is the nav), so its back button exits straight to the
dashboard; mobile's inner-tab back button returns to the menu list.

The whole page takes a real, explicit height (not page-flow auto) so
the aside and the tab content below the header can each be given their
own bounded box and scroll independently — the aside's nav list no
longer scrolls away with the page, it stays put and scrolls itself
only if its own content overflows.

## block-app-(dashboard)-settings-[tab]-settings-client-tsx-L240

`client/app/(dashboard)/settings/[tab]/settings-client.tsx:240`

Support surface, not a store feature: only rendered during a
superadmin handoff, and re-checked here rather than trusting
that nothing linked to it.

## block-app-(dashboard)-settings-[tab]-settings-header-tsx-L12

`client/app/(dashboard)/settings/[tab]/settings-header.tsx:12`

Shared by the mobile menu-list route and every inner tab — with the app
sidebar/header hidden on all settings routes, this back button is the
only way out.

## block-app-(dashboard)-settings-[tab]-settings-tab-nav-tsx-L27

`client/app/(dashboard)/settings/[tab]/settings-tab-nav.tsx:27`

Per-tab permission resolver from use-settings. Omitted falls back to
the coarse isAdmin check this rail carried before the Store & Settings
keys were wired.

## block-app-(dashboard)-settings-[tab]-settings-tab-nav-tsx-L195

`client/app/(dashboard)/settings/[tab]/settings-tab-nav.tsx:195`

Memoized: its props are a boolean and a stable useCallback, but it renders ~18 triggers and sits
inside a component that re-renders on every keystroke in any settings form
(see use-settings.ts's deliberate prop-bag design).

## block-app-auth-callback-page-tsx-L10

`client/app/auth/callback/page.tsx:10`

The codes arrive in the URL fragment (`#code=...&return_code=...`), not
the query string: a fragment is never sent to this host's server, so the
codes stay out of access logs and out of any Referer header for the 60s
they remain redeemable. `searchParams` is therefore not where to look.

## line-app-auth-callback-page-tsx-L25

`client/app/auth/callback/page.tsx:25`

Starts null rather than probing for the code here: the fragment is only
readable on the client, so deriving initial state from it would render
"Missing handoff code" during prerender and mismatch on hydration. The
effect below sets it instead.

## line-app-auth-callback-page-tsx-L31

`client/app/auth/callback/page.tsx:31`

Guards against React Strict Mode's dev-only double-invoke of mount
effects: without this, a second run reads the code/return_code this
same effect already stripped from the URL on the first run below, and
renders "Missing handoff code" over top of a login that already
succeeded in the background (see the effect's own comment on why
stripping the URL can't just be moved out of here instead).

## line-app-auth-callback-page-tsx-L45

`client/app/auth/callback/page.tsx:45`

Strip the codes from the visible URL/history immediately, before the
exchange network call, so they don't linger in browser history or get
sent as a Referer header to any resource this page happens to load.

## line-app-auth-callback-page-tsx-L61

`client/app/auth/callback/page.tsx:61`

/dashboard is gated on the local auth context's `user` (see
DashboardLayout), which normally only PIN login populates. Without
this the arriving (impersonated) user would be bounced to /login.

## block-app-global-error-tsx-L19

`client/app/global-error.tsx:19`

`NextError` is the default Next.js error page component. Its type
definition requires a `statusCode` prop. However, since the App Router
does not expose status codes for errors, we simply pass 0 to render a
generic error message.

## block-app-inspect-page-tsx-L9

`client/app/inspect/page.tsx:9`

Where a read-only admin inspection session renders. Deliberately outside
the (dashboard) route group: DashboardLayout hard-requires a staff `user`
and redirects to /login without one, so an admin inspecting a till that is
logged out for the night could never get in. See
docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.

## line-app-inspect-page-tsx-L18

`client/app/inspect/page.tsx:18`

Mounted flag: reading sessionStorage during render makes the server/
prerender pass and the first client pass disagree, which React reports as
a hydration mismatch. auth-context avoids the same trap.

## block-app-login-use-login-page-tsx-L12

`client/app/login/use-login-page.tsx:12`

All derived state/orchestration for /login: which tab is active, whether
setup is a safe entry point, back-button rules, and the shared header.
Pulled out of page.tsx so that file is just layout/JSX. Composes the
page's sub-hooks (auth status, login form, onboarding) itself, the same
way those sub-hooks compose their own lower-level pieces.

## line-app-login-use-login-page-tsx-L22

`client/app/login/use-login-page.tsx:22`

"New credentials" mode (from the dashboard lock overlay's "Login as
someone else"), distinct from a plain /login visit, which otherwise
redirects straight to the dashboard's own lock overlay when recent
accounts already exist, to avoid ever showing two separate lock screens.

## line-app-login-use-login-page-tsx-L36

`client/app/login/use-login-page.tsx:36`

Known bug #10, Part B: a device that just restored a local backup keeps
100% of its data but silently loses its cloud link (restoreDatabase()
never touches auth_token). Fires once, only when that just happened -
see lib/hooks/use-post-restore-cloud-link-notice.ts. Reuses the same
pre-login "Link DumosRx Cloud" step the setup wizard already has
(onboarding step "cloud") rather than inventing a new linking flow.

## line-app-login-use-login-page-tsx-L46

`client/app/login/use-login-page.tsx:46`

Login and Setup are tabs on this one page, not separate routes: no
navigation, no remount, no second loading spinner when switching.
Guard: a device that already has accounts can't land on setup's
welcome/select-store steps (that flow assumes a brand-new device and
risks clobbering real local data); only backup/cloud/syncing/register
are safe entry points there. `register` is included because a
leftover local store on that path now routes through the same
confirm-before-wipe dialog as select-store's cloud-switch flow
(see use-onboarding.ts's pendingNewRegistration) rather than
clobbering data outright - it's safe to land on, not wipe-free.
Computed here instead of redirecting after mount, so an unsafe request
never flashes setup content before bouncing back.

## line-app-login-use-login-page-tsx-L73

`client/app/login/use-login-page.tsx:73`

Only bounce to the dashboard's own lock overlay when there's actually a
live (but idle-locked) session to hand off to, i.e. `isAuthenticated`.
Without this check, a real logout (user cleared, recentUsers/userCount
untouched) looked identical to "idle-locked", so /login redirected to
/dashboard, which immediately redirected back to /login (no `user`),
forever: the flicker loop. When there's no live session, this page
renders its own account-tile picker (LockScreen) instead of redirecting.

## line-app-login-use-login-page-tsx-L115

`client/app/login/use-login-page.tsx:115`

Header (Back + Login/Setup switcher) is hidden entirely for ?mode=new:
a lone back arrow with no switcher looked unbalanced, especially on
mobile. The way off this screen instead is a secondary "Cancel" button
in the login form itself (see TraditionalLoginForm's onCancel).

## line-app-login-use-login-page-tsx-L128

`client/app/login/use-login-page.tsx:128`

?mode=new only re-authenticates as a different existing user on an
already-set-up device: registering, cloud setup, and cancelling all
mean something else there (or nothing), so these are only wired up
outside that mode.

## line-app-page-tsx-L22

`client/app/page.tsx:22`

If this device has logged in before, skip straight past the marketing
page to /dashboard, whose own lock overlay is the one canonical place PIN
entry happens. Going via /login here would just add an extra redirect
hop, since /login itself now bounces straight to /dashboard too.

## line-app-setup-page-tsx-L7

`client/app/setup/page.tsx:7`

/setup used to be its own page; it's now the "setup" tab on the merged
/login page (see app/login/page.tsx) so switching between login and
setup never remounts or shows a second loading spinner. This redirect
exists only for old bookmarks/deep links; nothing in the app links here
anymore.

## line-app-setup-use-onboarding-ts-L31

`client/app/setup/use-onboarding.ts:31`

Set only when showConfirmSwitch was triggered by a brand-new signup
(not the existing-account store-switch flow) finding leftover local
data - see handleRegister() and confirmCloudRestoreSwitch() below.

## line-app-setup-use-onboarding-ts-L54

`client/app/setup/use-onboarding.ts:54`

`isCloudLinked` from auth-context is a device-wide flag (true whenever a
cloud auth token is cached in localStorage); it can be stale from an
earlier session on this device. "Set Up New Business" and "Create an
account" always mean "create a brand-new cloud account," regardless of
any leftover token, so they must never be treated as already-linked.
Only the automatic zero-local-users fallback inside startSyncProcess
(reached right after this session's own successful cloud link) is a
genuine already-linked case: it sets this flag itself.

## line-app-setup-use-onboarding-ts-L76

`client/app/setup/use-onboarding.ts:76`

Always land on the setup tab. setStep can now be called from the
login tab (e.g. TraditionalLoginForm's "Create account" / "Restore
Backup" links), which has no `tab=setup` in its URL yet, unlike every
other setStep caller that's already inside the setup tab.

## block-components-activity-log-activity-log-detail-panel-tsx-L43

`client/components/activity-log/activity-log-detail-panel.tsx:43`

Slide-in detail view for a single activity_log row. Surfaces the raw
`details` JSON payload (captured by logAction() for every insert/update/
delete) as a readable field list instead of leaving it invisible. Covers
every table generically (no per-table label map), since Activity Log spans
the whole store rather than one product's history.

## line-components-activity-log-activity-log-page-tsx-L30

`client/components/activity-log/activity-log-page.tsx:30`

When searching, fetch a large unpaginated batch matching the other filters
so fuzzy search has the full set to search across, not just the current
page. Capped rather than truly unbounded so a very old/busy store can't
pull its entire history into memory at once.

## block-components-activity-log-activity-log-page-tsx-L171

`client/components/activity-log/activity-log-page.tsx:171`

Desktop: div-based table (ARIA roles stand in for real <table>
semantics), horizontally scrollable if content ever demands more
than the column widths naturally settle at.

## block-components-activity-log-activity-log-page-tsx-L188

`client/components/activity-log/activity-log-page.tsx:188`

Mobile: rows become stacked, tappable cards instead of a
cramped table, matching the pattern used by the product
catalog list.

## block-components-activity-log-activity-log-rows-tsx-L14

`client/components/activity-log/activity-log-rows.tsx:14`

Collapses consecutive rows sharing a correlation_id (e.g. everything one
sale writes - sales, sale_items, stock_movements, loyalty_transactions...)
into one visual row, so a store owner sees "Sale processed (+12 more)"
instead of 13 separate entries. Only ever merges rows already adjacent in
the current (already paginated/sorted) list - no query, sort, or
pagination change, so a group split across two pages just shows partially
on each rather than being force-merged.

## block-components-activity-log-describe-activity-ts-L3

`client/components/activity-log/describe-activity.ts:3`

Human-readable noun for each syncable table. Turns "table_name"
into something a non-technical reader recognizes instead of a raw SQL
table identifier.

## line-components-activity-log-describe-activity-ts-L59

`client/components/activity-log/describe-activity.ts:59`

Short, friendly verb for the generic CRUD ops (see base-helpers.ts) and
the remaining named actions. Used both standalone (filter labels) and as
the first word of the full per-row sentence.

## block-components-activity-log-describe-activity-ts-L76

`client/components/activity-log/describe-activity.ts:76`

Full human sentence for an activity_log row, e.g. "Added a category",
"Removed a purchase order", "Signed in". This is what a non-technical
reader sees instead of raw "INSERT" / "purchase_orders".

## block-components-activity-log-format-action-label-ts-L1

`client/components/activity-log/format-action-label.ts:1`

audit_logs.action is usually a raw DB op ("INSERT"/"UPDATE"/"DELETE") from
the generic insert()/update()/softDelete() helpers, not a friendly verb.
This just title-cases it either way.

## block-components-analytics-customer-behavior-tab-tsx-L21

`client/components/analytics/customer-behavior-tab.tsx:21`

True only when `change` is a percentage measured against the previous
period - rows like "45% of total" or "Healthy" are not, and must not
get the "vs last period" suffix.

## block-components-analytics-product-performance-table-tsx-L35

`client/components/analytics/product-performance-table.tsx:35`

Full, sortable product performance breakdown for the selected time
range - replaces the old top-5-only "Top Selling Products" list so
underperformers (not just the winners) are visible too.

## block-components-analytics-product-performance-table-tsx-L114

`client/components/analytics/product-performance-table.tsx:114`

Virtualized: this table deliberately lists EVERY product sold in
the period (see the doc comment on getBIMetrics's
productPerformance) - on a busy month that is thousands of rows,
all of which used to be in the DOM at once.

## line-components-assistant-assistant-panel-tsx-L60

`client/components/assistant/assistant-panel.tsx:60`

Radix/vaul focus the content container itself on open by default, not
the first focusable child - preventDefault and focusing explicitly is
the documented escape hatch for landing focus on the composer instead.

## block-components-auth-admin-till-login-tsx-L24

`client/components/auth/admin-till-login.tsx:24`

The on-till admin entry, shared by the lock screen and the blocked licence
card. It deliberately does not navigate: a router push from the licence card
only re-renders the card, because LicenseGuard returns it instead of its
children while the device is blocked.

## block-components-auth-auth-card-shell-tsx-L12

`client/components/auth/auth-card-shell.tsx:12`

"page": /login itself. Mobile gets a separate full-bleed hero logo
elsewhere on the page, so the in-card logo only shows on desktop, and
the card uses the bottom-sheet radius/shadow that matches the rest of
that page's mobile chrome.
"overlay": the dashboard's auto-lock overlay. There's no separate hero,
so the logo always shows, sized larger to read as the primary heading.

## block-components-auth-auth-card-shell-tsx-L21

`client/components/auth/auth-card-shell.tsx:21`

Card-level padding override. The onboarding steps (register/cloud/
backup) manage their own inner CardHeader/CardContent/CardFooter
padding instead, so they pass a tighter value here rather than getting
this default doubled up on top of it. Defaults to the login tab's
spacing. Ignored for variant="overlay", which always uses the default.

## block-components-auth-auth-card-shell-tsx-L27

`client/components/auth/auth-card-shell.tsx:27`

The single desktop-only visual shown above the header (page variant
only; overlay always shows its own mobile-only logo regardless of
this). Defaults to the DumosRx logo; a step can pass its own icon
instead (e.g. a UserPlus/CloudDownload glyph in a tinted box) for
visual variety, or pass `null` to show nothing at all. Either way it's
hidden below `sm` and, unlike a CSS-only hide, never reserves layout
space when hidden, since the wrapper simply isn't rendered.

## line-components-auth-auth-card-shell-tsx-L50

`client/components/auth/auth-card-shell.tsx:50`

Shared by /login's login/setup tabs and the dashboard's auto-lock overlay.
Was previously several hand-copied implementations that drifted (the
overlay never got the max-h/overflow-y-auto short-viewport scroll fix
applied everywhere else this session, silently reintroducing that
clipping bug).

## block-components-auth-auth-card-shell-tsx-L77

`client/components/auth/auth-card-shell.tsx:77`

shrink-0 on these two matters: Card is a column flex container
with overflow-y-auto (not visible), which disables flexbox's
usual "don't shrink below content size" protection. On a step
with enough content to exceed max-h-[85dvh] (register, with its
long form), the flex children get shrunk to fit instead of the
browser leaving them full-size and scrolling the overflow, and
since this wrapper also has overflow-hidden, that shrink
silently clips the icon to invisible rather than scrolling past
it. shrink-0 forces the header/icon to keep their natural size
no matter how tall the rest of the content gets, so only the
step's own scrollable content shrinks/scrolls.

## line-components-auth-auth-tab-header-tsx-L13

`client/components/auth/auth-tab-header.tsx:13`

Always rendered as the first child inside a step's AuthCardShell: every
login/setup step goes through that shell now, so there's no longer a
"floats above a bare Card" case to style differently.

## block-components-auth-license-blocked-card-tsx-L30

`client/components/auth/license-blocked-card.tsx:30`

The full-screen card LicenseGuard renders INSTEAD of its children when a
device is blocked. Extracted because license-guard.tsx was 436 lines, over
the 350-line limit in root AGENTS.md §4.

It carries the on-till admin entry because nothing else can: while this card
is up there is no app, no lock screen and no "someone else" — so an admin
standing at a clock-tampered till would otherwise have no way in, and the
clock override would be unreachable. See
docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.

## line-components-auth-license-guard-tsx-L41

`client/components/auth/license-guard.tsx:41`

Restricted mobile users may browse/navigate freely; only actions that
create, update, or delete data are blocked. Detected by accessible-name
keyword rather than by element type, since blocking every button/input
(the old behavior) also blocked search boxes, filters, sort/pagination
controls, and "view details" buttons — anything read-only.

## line-components-auth-license-guard-tsx-L53

`client/components/auth/license-guard.tsx:53`

Bumped at the start of every performCheck() run so an overlapping
earlier run (e.g. a storeProfile change firing again while a prior
run's sync-timeout race is still resolving) can tell it's stale once it
finally settles, instead of clobbering a newer run's `loading`/`license`
state with its own now-outdated result.

## line-components-auth-license-guard-tsx-L69

`client/components/auth/license-guard.tsx:69`

Only route out of a clock lock, and deliberately online-only: the
watermark is device-local, so neither sync nor a factory reset can
repair it (A-191).

## line-components-auth-license-guard-tsx-L92

`client/components/auth/license-guard.tsx:92`

Re-read the local DB. Guarded: checkLicenseStatus()
does a local write of its own (updateStoreMonotonicTime), which
throws on a read-only tab (see tab-lock.ts / C1 in docs/KNOWN_BUGS.md)
- previously uncaught here, so the whole async function rejected
before reaching setLoading(false), leaving `loading` true forever and
SplashScreen stuck on screen permanently. On failure, `license` is
left as whatever it already was (null on first mount, unchanged on a
"Check Again" retry) rather than reset - a transient failure must
never regress an already-valid session into the locked-out branch
below, and a null license already fails open into isExpiredSub rather
than hard-locking on an unproven failure.

## line-components-auth-license-guard-tsx-L140

`client/components/auth/license-guard.tsx:140`

isSwitchingStore covers the store-switch transition: switchStore()
clears the query cache so the remount below finds nothing stale to
serve, but that clear takes a moment (cancel in-flight fetches, then
clear()). Showing the splash for that window means a switch can never
flash the outgoing store's dashboard. (See switchStore() in
store-context.tsx.)

## line-components-auth-license-guard-tsx-L150

`client/components/auth/license-guard.tsx:150`

Renewing/paying must always be reachable no matter the license state --
otherwise a suspended or clock-tampered lock screen (whose own "Renew
Subscription" button just navigates here) could permanently strand the
user on this exact page. Always let the billing page's own children
through, skipping the lock screen entirely.

## line-components-auth-license-guard-tsx-L159

`client/components/auth/license-guard.tsx:159`

Render children for valid licenses OR expired subscriptions (downgraded to free).
Only hard-block on suspension or clock tampering.
Branching is driven by LicenseInfo.isSuspended (derived from the store's
real status), never by the message text — that's display copy only, so
rewording it must not silently flip a suspended account into the
"Subscription Expired"/"Renew" path.

## line-components-auth-lock-screen-tsx-L39

`client/components/auth/lock-screen.tsx:39`

Absolute timestamp (ms) the current lockout (if any) ends at, for
`selectedUser`. Null means not locked. Kept as a timestamp (not a
ticking "remaining ms" value directly) so the 1s interval below is the
only place recomputing "how much longer" - this alone doesn't need to
change when the interval fires unless the lockout actually clears.

## line-components-auth-lock-screen-tsx-L48

`client/components/auth/lock-screen.tsx:48`

Reflects any lockout already in effect the moment a user tile is
selected (not just after they go on to fail 5 more times right here) -
login-lockout.ts's state persists across screens/reloads, so a user
who was locked out earlier and comes back to this same tile should see
the countdown immediately, before typing anything.

## line-components-auth-lock-screen-tsx-L62

`client/components/auth/lock-screen.tsx:62`

Live countdown: re-checks once a second so the displayed time (and the
disabled state) updates on its own, and clears itself the instant the
lockout genuinely expires rather than requiring another failed attempt
to notice.

## line-components-auth-lock-screen-tsx-L79

`client/components/auth/lock-screen.tsx:79`

Re-checks login-lockout.ts's actual state for selectedUser and applies
it to `lockedUntil` if locked. Called both after a failed PIN attempt
(which might be the exact failure that just triggered a fresh lockout)
and after a thrown lockout error (an attempt that arrived already
locked) - either way, this is the single place `lockedUntil` gets set
from a real check rather than assumed.

## line-components-auth-lock-screen-tsx-L95

`client/components/auth/lock-screen.tsx:95`

Separated from the form's submit handler so it can also be triggered
directly once the 4th digit is entered (auto-submit), not just via the
Unlock button. Takes the pin value explicitly rather than reading `pin`
from closure. PinPad's onSubmit fires synchronously right after its
onChange, before React has applied the state update, so closure `pin`
there would be stale by one digit.

## block-components-auth-mobile-restriction-guard-tsx-L11

`client/components/auth/mobile-restriction-guard.tsx:11`

Read-only enforcement for the native mobile build, extracted from
license-guard.tsx to keep that file under the 350-line limit in root
AGENTS.md §4. Unrelated to licence state — it only happens to have been
mounted alongside it.

## line-components-auth-pin-entry-tsx-L45

`client/components/auth/pin-entry.tsx:45`

Touch capability decides this, not viewport width or user-agent sniffing:
iPadOS masks its UA to look like a Mac by default, and a tablet can easily
have a "desktop-width" viewport in landscape. Real touch devices get the
on-screen PinPad (which never depends on the OS actually deciding to show
a keyboard); everything else gets the native keyboard via inputMode.

## block-components-auth-require-role-tsx-L9

`client/components/auth/require-role.tsx:9`

Route-level guard for pages that are only linked from the sidebar/quick
actions for admin/manager/specialist/store_owner roles (e.g. Procurement).
The sidebar already hides these links for other roles, but the route
itself was still directly reachable (typed URL, stale bookmark, a quick
action's href) with no server-side enforcement in this local-first app -
this is the only enforcement point, so it must actually redirect rather
than just hide a link.

## block-components-auth-require-role-tsx-L22

`client/components/auth/require-role.tsx:22`

Expenses is the one page in this set cashiers are also meant to reach
(e.g. logging a till expense) - everything else here (Procurement)
stays admin/stock-manager only.

## block-components-auth-require-role-tsx-L26

`client/components/auth/require-role.tsx:26`

A specific permission key required on TOP of the coarse role baseline,
for routes whose category has been migrated off role gates - see
client/AGENTS.md's "Enforced permissions".

## line-components-auth-setup-tab-tsx-L18

`client/components/auth/setup-tab.tsx:18`

Every setup step renders through AuthCardShell now, so the header is
always injected inside the step's own Card (see each step's `header`
prop). No per-step special-casing needed here to decide where it goes.

## block-components-auth-traditional-login-form-tsx-L161

`client/components/auth/traditional-login-form.tsx:161`

<div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
System Online • Encrypted Session
</div>

## block-components-auth-traditional-login-form-tsx-L165

`client/components/auth/traditional-login-form.tsx:165`

<div className="flex justify-center w-full mt-2 border-t border-border pt-3">
<span className="text-[10px] text-muted-foreground font-medium">
v{APP_VERSION}
</span>
</div>

## line-components-auth-user-selection-tsx-L17

`client/components/auth/user-selection.tsx:17`

Deterministic per-user accent so avatars aren't all the same flat primary
tint. Cycles through a small curated set rather than hashing to anything
unbounded, so the palette stays on-brand.

## line-components-auth-user-selection-tsx-L63

`client/components/auth/user-selection.tsx:63`

Netflix/Apple-TV-style profile picker: floating avatar + label, no card
chrome, colored glow bloom behind each avatar on hover. Chosen over a
bordered-card grid because the previous design read as "the same" at a
glance. This reads unmistakably different even in a quick screenshot.

## line-components-auth-user-selection-tsx-L75

`client/components/auth/user-selection.tsx:75`

ConfirmDialog keeps rendering through its exit animation after
removingUser is nulled on confirm/close - keep the last real value
around so the description doesn't flash "undefined" mid-fade.

## line-components-auth-user-selection-tsx-L81

`client/components/auth/user-selection.tsx:81`

Determined client-side only (defaults to the Windows/Linux label on
first render) to avoid a hydration mismatch: navigator isn't available
during SSR.

## line-components-auth-user-selection-tsx-L95

`client/components/auth/user-selection.tsx:95`

Tile width must be >= the avatar's own width at every breakpoint. A
narrower fixed tile (there used to be a flat w-24 here regardless of
avatarSize) lets the circle overflow its own slot, silently eating into
whatever gap-x is set and, worse, compounding with the hover scale below
until neighboring tiles visibly overlap.

## line-components-auth-user-selection-tsx-L131

`client/components/auth/user-selection.tsx:131`

Grid, not flex-wrap: flex-wrap re-centers each wrapped row
independently, so a trailing row with just one or two tiles (e.g.
3 users + the "Someone else" tile) ends up visually orphaned with
a big centered gap under it. A fixed-column grid keeps every row
left-aligned to the same columns instead. The single-user case
has only two tiles total (them + "someone else"), so it stays a
simple centered row rather than a mostly-empty 3-column grid.

## block-components-auth-user-selection-tsx-L152

`client/components/auth/user-selection.tsx:152`

A plain button, not motion.button: the remove "x" below
needs to be a sibling (not a nested interactive
descendant, which the button content model disallows and
which real browsers/AT can drop from the a11y tree).

## line-components-customers-activity-tab-tsx-L109

`client/components/customers/activity-tab.tsx:109`

Filtering to one customer or searching must match their entire history, not
just the recent-activity window loaded by default, unless a custom date
range is already active. In that case that's the window the user
explicitly asked for, so search/filter should stay scoped within it
rather than silently discarding the range for full history.

## block-components-customers-customer-list-rows-tsx-L5

`client/components/customers/customer-list-rows.tsx:5`

Literal Tailwind class strings, not interpolated: the desktop row and its
header must stay in lockstep when the Balance column drops out for a role
without view_customer_balances.

## line-components-customers-loyalty-settings-dialog-tsx-L62

`client/components/customers/loyalty-settings-dialog.tsx:62`

Same field, same mutation mechanism as the Business Info tab's "Enable
Loyalty Program" switch — both write stores.loyalty_program_enabled via
updateStoreProfile() (a direct `update("stores", storeId, {...})` under
the hood), so the two toggles can never drift onto separate paths.

## line-components-customers-loyalty-settings-dialog-tsx-L75

`client/components/customers/loyalty-settings-dialog.tsx:75`

Defense-in-depth: the only current entry point (LoyaltyTab's "Edit
Settings" button) is already gated, but this closes the dialog if it's
ever reached another way by a role lacking either right.

## line-components-customers-loyalty-settings-dialog-tsx-L82

`client/components/customers/loyalty-settings-dialog.tsx:82`

Stored as points-per-currency-unit (e.g. 0.01), edited here as
"points per 100 [currency]" since that reads far more naturally than a
fractional per-unit rate (1, not 0.01).

## line-components-customers-loyalty-tab-tsx-L41

`client/components/customers/loyalty-tab.tsx:41`

Real DB data always wins once it exists; the fallback is only a preview
for a store that has never opened Loyalty Settings (which is what
actually seeds `loyalty_redemption_options`) — same precedence rule
`buildFallbackTiers()` already follows for tiers.

## block-components-customers-record-payment-modal-tsx-L30

`client/components/customers/record-payment-modal.tsx:30`

Prefill amount when it should differ from the customer's full
outstanding_balance, e.g. opened from one specific sale's remaining
balance rather than their total debt across every sale.

## block-components-customers-record-payment-modal-tsx-L34

`client/components/customers/record-payment-modal.tsx:34`

Extra note shown under the description, e.g. warning that payments
settle the customer's oldest outstanding sale first (FIFO), which may
not be the sale this modal was opened from.

## line-components-customers-record-payment-modal-tsx-L67

`client/components/customers/record-payment-modal.tsx:67`

The `max` on the amount input is only an HTML hint — enforce it here
too. recordCustomerPayment floors the new balance at 0 but still logs
the full amount, so an overpayment would silently vanish from the books
with no reconciling credit/refund record.

## line-components-dashboard-dashboard-action-center-tsx-L26

`client/components/dashboard/dashboard-action-center.tsx:26`

A larger, more evocative icon per alert type for the card's background
decoration — deliberately distinct from the small corner badge icon
(use-action-center-alerts.ts's `icon`), which stays generic/consistent
across priorities. Falls back to the alert's own icon for any id not
listed here, so a future alert type never renders without a backdrop.

## line-components-dashboard-dashboard-action-center-tsx-L61

`client/components/dashboard/dashboard-action-center.tsx:61`

Split from a single combined string (A-158): a bg-*/10 tint passed into
Card's own className replaced its opaque bg-card background outright via
Tailwind class-merging, rather than layering on top of it, leaving the
card with no solid surface - just a translucent tint over whatever's
behind it (invisible on a browser without color-mix() support, per the
compat shim in app/globals.css). The tint now lives on its own overlay
div, on top of an explicit bg-card base, instead of inside Card's own
background-color slot.

## block-components-dashboard-dashboard-header-tsx-L24

`client/components/dashboard/dashboard-header.tsx:24`

Start Audit's `path` is a signal route (see dashboard-page-routes.ts), not
a real page - it exists purely so useStockBatchManagement's effect can
catch the navigation and open the audit overlay instead. That round trip
requires a working client-side transition. On a static-export deployment
(output: "export", see next.config.mjs) navigating to a not-yet-visited
route can fall back to a full page reload, which wipes all React state
before the overlay ever gets to open - so this button sets the overlay
state directly instead of going through router.push at all.

## block-components-dashboard-dashboard-header-tsx-L45

`client/components/dashboard/dashboard-header.tsx:45`

Delegates to the same pure hasPermission() useHasPermission wraps, so a
route's actionPermission is enforced whatever key it names. Enumerating
keys here instead (the shape this replaced) silently allowed every key
the list had not been updated for.

## line-components-dashboard-dashboard-header-tsx-L53

`client/components/dashboard/dashboard-header.tsx:53`

Plan entitlement AND this device actually having synced 2+ stores —
same combination stock-movements.tsx's canTransferStock uses. Only
actionRequiresMultiStore routes (Transfer Stock) read this.

## block-components-dashboard-dashboard-header-tsx-L138

`client/components/dashboard/dashboard-header.tsx:138`

Mobile Bottom Row. Genuinely not rendered above `sm` rather than
CSS-hidden: its SyncIndicator installs an auto-sync daemon of its
own, and two of those racing made one sync report the other's
"already in progress" refusal as a red Sync Error.

## line-components-dashboard-dashboard-layout-tsx-L66

`client/components/dashboard/dashboard-layout.tsx:66`

One entry per distinct <main> treatment, keyed by the same route
partition used everywhere else in this file (isPosRoute/isSettingsRoute/
isCreatePORoute). Keeping className+style paired per kind (instead of two
separate ternary chains that happen to agree) makes it structurally
impossible for one to get a route's case updated without the other.

## line-components-dashboard-dashboard-layout-tsx-L75

`client/components/dashboard/dashboard-layout.tsx:75`

POS and the mobile full-screen takeovers (create PO, settings inner
tabs) manage their own padding/back-header, so <main> stays unpadded for
them below their own "desktop" breakpoint; everywhere else gets the
standard page gutter. Each takeover's restore breakpoint must match the
breakpoint that page itself uses to switch to its desktop layout:
create-PO uses lg: (see procurement/new/page.tsx), settings inner tabs
use md: (see hooks/use-settings.ts's isDesktop, which flips at 768px).
Using the wrong one here left settings content unpadded between 768-1023px.

## line-components-dashboard-dashboard-layout-tsx-L87

`client/components/dashboard/dashboard-layout.tsx:87`

Below lg: clears MobileBottomNav (h-16 = 4rem tall, plus its own
safe-area inset, plus breathing room) on every route that renders it —
i.e. every kind but the three above, which don't show the bottom nav
at all. Must stay >= 4rem or the last slice of page content ends up
hidden behind the bar. At lg: and up MobileBottomNav is lg:hidden, so
this drops back to the plain page gutter instead of carrying that
extra space with nothing to clear.
px/pt instead of the p-4/sm:p-6 shorthand: the shorthand also sets
padding-bottom, and at sm: it lands in a later cascade layer than our
unprefixed pb-[...] below, so it would silently win and clobber the
bottom-bar clearance from 640px up to lg:.

## line-components-dashboard-dashboard-layout-tsx-L126

`client/components/dashboard/dashboard-layout.tsx:126`

Known bug #10, Part B: the in-app Settings > Data > "Restore Backup"
path reloads straight back into this layout. Fires once, only if that
restore just happened and the device isn't cloud-linked - see
lib/hooks/use-post-restore-cloud-link-notice.ts. Points at the same
Data tab "cloud" alias that already auto-opens CloudLinkDialog (see
hooks/use-settings.ts) rather than a new linking flow.

## line-components-dashboard-dashboard-layout-tsx-L150

`client/components/dashboard/dashboard-layout.tsx:150`

Create Purchase Order gets a POS-style full-screen takeover, but only on
mobile (<lg). Desktop keeps the normal dashboard chrome since the page
already renders as a self-contained bordered panel there.

## line-components-dashboard-dashboard-layout-tsx-L154

`client/components/dashboard/dashboard-layout.tsx:154`

Settings is a full-screen takeover on every breakpoint (like POS/create-PO):
no app sidebar, no bottom nav, no dashboard header — settings-client.tsx
renders its own back-button header instead.

## line-components-dashboard-dashboard-layout-tsx-L161

`client/components/dashboard/dashboard-layout.tsx:161`

Touch devices (tablets/iPads at the lg: breakpoint where the desktop
sidebar shows) don't get real hover intent. A tap can synthesize a
hover-like event, which makes peek stick or flicker. Hard-disabled here
regardless of the peekEnabled preference, since it doesn't make sense on
touch at all: those devices only ever see plain collapsed or expanded.

## line-components-dashboard-dashboard-layout-tsx-L202

`client/components/dashboard/dashboard-layout.tsx:202`

An inspection session belongs at /inspect, which carries the banner, the
End Session button and the idle timer. Reaching the dashboard with one
live showed a full staff UI with no indication anybody else was signed
in, and left every staff write failing with the read-only message for
up to 20 minutes with no way out.

## line-components-dashboard-dashboard-layout-tsx-L237

`client/components/dashboard/dashboard-layout.tsx:237`

Single lookup: avoids indexing DIRECTION_ANIMATION twice (once to check,
once to interpolate) and keeps the `direction === null` case contained
to this one spot instead of repeating `?? ""` at each usage site.

## line-components-dashboard-dashboard-layout-tsx-L245

`client/components/dashboard/dashboard-layout.tsx:245`

h-dvh, not min-h-screen: the actual scroll-containment fix is the
`flex flex-col` added to the scrollRef div below, but min-h-screen is
still the wrong tool for a shell root that should never need to grow
past the viewport in the first place (a min-height is a floor, not a
cap) — h-dvh matches the "Main content" column's own explicit
height: 100dvh a few levels down, and tracks mobile browser chrome
collapsing/expanding, unlike the static h-screen/100vh.

## line-components-dashboard-dashboard-layout-tsx-L304

`client/components/dashboard/dashboard-layout.tsx:304`

On POS/settings routes there's no header to carry the inset, so
keep it here. Elsewhere it moves onto the banner/header block
below so its own background (not this wrapper's, which can be a
different shade) paints all the way up under the status bar,
avoiding a seam.

## block-components-dashboard-dashboard-layout-tsx-L334

`client/components/dashboard/dashboard-layout.tsx:334`

Page content: scrolls internally. Needs `flex flex-col` itself —
not just on <main> below — because flex properties (flex-1,
min-h-0) only do anything on an element sitting inside a flex
parent*; without this, <main>'s flex-1/min-h-0 has no container
to size against, so it (and everything under it, e.g. a page's
own internal-scroll table) grows to its natural content height
instead of being capped to the space actually available here,
and this div's own overflow-y-auto ends up scrolling that whole
oversized block instead of just being the outer fallback it's
meant to be.

## line-components-dashboard-dashboard-quick-actions-tsx-L48

`client/components/dashboard/dashboard-quick-actions.tsx:48`

{
  label: "View Customers",
  icon: Users,
  href: "/customers",
},

## block-components-dashboard-header-action-button-tsx-L8

`client/components/dashboard/header-action-button.tsx:8`

"outline" is for the secondary action shown before the primary one
(desktop only — see DashboardHeader); it skips the "+" icon since a
secondary action isn't necessarily a "create" action (e.g. Start Audit).

## block-components-dashboard-header-store-switcher-tsx-L26

`client/components/dashboard/header-store-switcher.tsx:26`

Only admins/store owners can create a store, so only they get the
dropdown at all — a cashier's plain label is never worth turning into a
menu that has nothing useful in it besides an action they can't take.

## block-components-dashboard-header-store-switcher-tsx-L32

`client/components/dashboard/header-store-switcher.tsx:32`

The store name in the header's top-left corner: a plain label for
non-admin accounts (staff/cashiers - they can never create a store, plan
or no plan), or a switcher dropdown for every admin/owner account, even
one that only has a single store today. The dropdown always offers
"Create new store" so multi-store is discoverable from here rather than
only from Settings > Fleet; the action itself (not the dropdown's
visibility) is what's plan-gated, via useFeatureGate's canManageMultiStore.

## line-components-dashboard-header-store-switcher-tsx-L50

`client/components/dashboard/header-store-switcher.tsx:50`

availableStores is empty for plenty of legitimate single-store admins
(see store-context.tsx's `allStores` query - it only runs at all for a
store_id-less "owner" identity), so it can't be relied on alone to know
what to list. Falling back to the currently-active store keeps a
single-store admin's dropdown non-empty (their own store, checked) which
is what "Create new store" needs a checked list to make sense next to.

## line-components-dashboard-header-store-switcher-tsx-L90

`client/components/dashboard/header-store-switcher.tsx:90`

Prefix-matches every cached variant of these queries regardless of
which store/user args they were fetched with (a plain string literal
would do the same, but derives the prefix from the factory - via a
throwaway call - instead of duplicating it, so a rename in
query-keys.ts can't silently desync from this call site).

## line-components-dashboard-header-store-switcher-tsx-L100

`client/components/dashboard/header-store-switcher.tsx:100`

Fleet writes (FleetFormDialog -> useSaveFleetStoreMutation) go straight
to the cloud API and never touch local SQLite, so this dropdown's own
`availableStores` (backed by a local-DB query) won't show the new store
until a sync pull lands - invalidating alone just re-runs the same
stale local read. Trigger that pull ourselves (same pattern as
switchStore in store-context.tsx) and invalidate once it's actually
landed, so the new store shows up without needing a manual refresh.

## block-components-dashboard-header-store-switcher-tsx-L156

`client/components/dashboard/header-store-switcher.tsx:156`

DropdownMenuItem's base styles force any icon without its own
text-* class to text-muted-foreground permanently (see
dropdown-menu.tsx's `[&_svg:not([class*='text-'])]` rule), so
without an explicit color here the icon would stay muted while
the label text turns accent-foreground on hover/focus. Giving
it group-focus:text-accent-foreground keeps both in sync.

## line-components-dashboard-impersonation-banner-tsx-L24

`client/components/dashboard/impersonation-banner.tsx:24`

Previously redeemed the stored return-hop code (a one-time,
60-SECOND-lived handoff code minted back when impersonation
*started*) via consumeHandoffCode/createHandoffCode. That's the
expected outcome of any normal-length impersonation session, not an
edge case — every admin who spent more than a minute here hit the
catch branch below and got bounced to a fresh /admin/login instead
of back to their own session. No fresh code can be minted at click
time either, since nothing on this side holds a live admin
credential to mint one from.

The actual fix: the admin's own dumosrx.com session was never
disturbed by impersonating in the first place (impersonateStore()
no longer touches drx_admin_session at all — see
docs/FIXED_BUGS.md) and lives entirely in that independent,
HttpOnly, 24h refresh cookie on the web/ origin. Navigating straight
to /admin lets its own layout (see app/admin/layout.tsx's
initSession() effect) silently re-establish the session from that
cookie — no handoff code, no TTL, no redemption round-trip needed.
This only fails if the admin's own cookie has itself expired (a
realistic 24h-plus session), which is a much rarer case than "spent
more than a minute looking around," and lands on the ordinary
/admin/login flow rather than a confusing dead end.

## line-components-dashboard-sync-indicator-tsx-L212

`client/components/dashboard/sync-indicator.tsx:212`

A crash-report-only batch also rides the next real sync rather
than triggering its own; user-submitted feedback still triggers
normally. See docs/SYNC_CRASH_REPORT_POLICY.md.

## block-components-dashboard-till-inspection-banner-tsx-L27

`client/components/dashboard/till-inspection-banner.tsx:27`

Always on screen for the whole inspection session, so staff can never be
unaware that someone else is looking at their till. Also owns the idle
lifecycle, being the one component guaranteed to be mounted throughout.

## line-components-dashboard-till-inspection-banner-tsx-L38

`client/components/dashboard/till-inspection-banner.tsx:38`

Uses the id captured at mount, not a fresh read: on the idle path the
session has already expired, so re-reading storage returns null and the
server would never receive the exit — leaving an audit entry with no exit
and no duration.

## line-components-dashboard-till-inspection-banner-tsx-L44

`client/components/dashboard/till-inspection-banner.tsx:44`

Guarded: the 1s interval keeps firing while the POST is in flight, so
without this the idle path called end repeatedly and wrote duplicate
exit rows to the audit log.

## line-components-dashboard-till-inspection-banner-tsx-L58

`client/components/dashboard/till-inspection-banner.tsx:58`

Read after mount, never during render: a render-time sessionStorage read
disagrees with the prerender pass and React reports a hydration mismatch.

Also reconciles with the server, because `pagehide` fires on a reload too:
the beacon closes the row while sessionStorage survives, leaving a client
session the server has already ended — writes blocked, the override
refused, and the audit log claiming an exit that had not happened. The row
is the authority, so a session it no longer recognises is cleared here.

## line-components-dashboard-till-inspection-banner-tsx-L97

`client/components/dashboard/till-inspection-banner.tsx:97`

pagehide, not unload: an awaited fetch is cancelled with the page, so
closing the app — the commonest exit on a desktop till — otherwise left
the session row open with no exit and no duration.

## line-components-dashboard-user-nav-tsx-L33

`client/components/dashboard/user-nav.tsx:33`

{...props} is spread onto the Button so Radix's `asChild` trigger props
(aria-haspopup, aria-expanded, keyboard handlers, ref) land on the real
<button> instead of being stranded on a non-focusable wrapper <div>.

## line-components-dashboard-user-nav-tsx-L129

`client/components/dashboard/user-nav.tsx:129`

Touch capability decides Drawer vs Dropdown, not viewport width. See the
comment in notification-bell.tsx for why (Radix DropdownMenu's outside-tap
close vs iOS's delayed synthetic click).

## line-components-dashboard-user-nav-tsx-L151

`client/components/dashboard/user-nav.tsx:151`

A broken/incomplete auth state (e.g. a corrupted localStorage write from
a connection drop mid-save) shouldn't leave this spot blank with no way
out, since that traps the user on a dashboard shell they can't act on. Give
them a direct way to get back to a clean login instead of vanishing.

## block-components-dashboard-user-nav-tsx-L249

`client/components/dashboard/user-nav.tsx:249`

Direct settings shortcut disabled on desktop for now, re-enable by
uncommenting once we're happy with where it lands next to the trigger.
{!!showDetails && <SettingsIconButton onClick={() => router.push("/settings")} />}

## block-components-dashboard-user-nav-tsx-L283

`client/components/dashboard/user-nav.tsx:283`

Bottom padding clears the fixed mobile bottom navbar (h-16) plus
the safe-area/Tauri inset it already pads itself with, so the
last action isn't sitting behind/under it.

## block-components-expenses-add-expense-dialog-tsx-L298

`client/components/expenses/add-expense-dialog.tsx:298`

<div className="text-[11.5px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-[10px] px-3.5 py-3 flex gap-2 items-start mt-2">
<Info className="w-[15px] h-[15px] text-primary shrink-0 mt-0.5" />
Attach a receipt later from the expense detail view. File upload
coming soon.
</div>

## line-components-expenses-expense-desktop-row-tsx-L59

`client/components/expenses/expense-desktop-row.tsx:59`

Not a real <button>: the row itself is clickable but also contains
its own inline-edit controls (select, number cell, save/cancel
buttons), and nesting those inside a button is invalid HTML.

## block-components-expenses-expense-list-tsx-L170

`client/components/expenses/expense-list.tsx:170`

Mobile: flat card list, no wrapping table card. Conditionally
rendered, not CSS-hidden: the desktop branch is virtualized and this
one isn't.

## block-components-pos-cart-to-receipt-transaction-ts-L5

`client/components/pos/cart-to-receipt-transaction.ts:5`

Builds a ReceiptTransaction straight from live cart state, for the
proforma quote preview/print - no sale exists yet (no DB row, no stock
deduction), so id/paymentMethod/amountPaid/change are placeholders;
ReceiptView's "quote" documentType hides the fields that don't apply.
Mirrors the shape usePOSPayment.handlePayment builds at real checkout
(lib/hooks/use-pos-payment.ts) and sale-to-receipt-transaction.ts builds
from a completed sale.

## block-components-pos-held-transactions-dialog-tsx-L27

`client/components/pos/held-transactions-dialog.tsx:27`

items_json is read straight from a local DB row, so a corrupted or
truncated value must not throw in the render path — one bad row would
take the whole dialog down instead of just showing 0 items for itself.

## line-components-pos-held-transactions-dialog-tsx-L55

`client/components/pos/held-transactions-dialog.tsx:55`

Unconditional top-level const (see pos-cart.tsx's canApplyDiscounts).
Resuming a parked sale is the other half of what pos-cart.tsx's Hold
Sale button creates; the list itself stays readable without it.

## line-components-pos-held-transactions-dialog-tsx-L60

`client/components/pos/held-transactions-dialog.tsx:60`

Only one delete is ever in flight per dialog instance, so the pending
mutation's own variables (the id it was called with) double as the
"which row is busy" flag — no separate local state needed.

## line-components-pos-online-orders-modal-tsx-L72

`client/components/pos/online-orders-modal.tsx:72`

A store OWNER's own users.store_id is always null by design (they
"have" a store via stores.user_id), so passing it straight through
wrote sales.store_id = NULL and hid the revenue from every
store-scoped report. storeProfile.id is the active store either way.

## line-components-pos-pos-cart-item-tsx-L37

`client/components/pos/pos-cart-item.tsx:37`

The price input is uncontrolled-while-typing: it holds its own local
string state so keystrokes aren't clamped one-at-a-time against
item.unit_price (already-committed, already-clamped state) - clamping
on every keystroke meant typing "150" against a floor of 100 clamped
after the "1" alone, turning the next keystroke into "1005" instead of
"150". The real updateUnitPrice (which still clamps, as the source of
truth) only runs on blur/Enter.

## line-components-pos-pos-cart-item-tsx-L47

`client/components/pos/pos-cart-item.tsx:47`

Re-sync when the external value changes from elsewhere (e.g. reseller
mode toggled off reverts the price) - but don't fight the user's
in-progress typing by resetting on every render when nothing external
actually changed.

## line-components-pos-pos-cart-item-tsx-L62

`client/components/pos/pos-cart-item.tsx:62`

Same uncontrolled-while-typing pattern as priceInput above: typing "50"
directly (e.g. buying 50 tablets) must not go through updateQuantity on
every keystroke - that would re-clamp/re-render against stock on each
digit and mangle multi-digit entry the same way the price input did
before this fix. Commits via the existing updateQuantity (which already
validates against stock and removes the item on <= 0) on blur/Enter.

## block-components-pos-pos-cart-tsx-L24

`client/components/pos/pos-cart.tsx:24`

Literal class strings, not a `grid-cols-${n}` template: Tailwind's
scanner only sees classes that appear whole in the source. Indexed by how
many of the three secondary cart actions are currently rendered, which now
varies with the acting user's "hold_sales" permission as well as the cart
and prescription-lock state.

## line-components-pos-pos-cart-tsx-L105

`client/components/pos/pos-cart.tsx:105`

Unconditional top-level const, never inlined into the JSX conditions
below: useHasPermission's answer changes between renders while the
permission group resolves, and calling it inside a short-circuit is how
the "Rendered more hooks than during the previous render" crash got in
before - see pos-layout-header.tsx.

## line-components-pos-pos-cart-tsx-L113

`client/components/pos/pos-cart.tsx:113`

canUseMarkupSales can flip false mid-session (an admin disables the
markup_sales_enabled toggle on another device, or downgrades plan) -
without this, a cart that already had isResellerSale persisted true
would lose the entire row below (including the only Switch that turns
it back off), leaving validatePaymentReadiness's markup-type-required
guard permanently blocking checkout with no way to clear it short of
discarding the cart.

## line-components-pos-pos-dialogs-tsx-L101

`client/components/pos/pos-dialogs.tsx:101`

Recalling a held sale replaces whatever is in the cart. An empty cart
has nothing to lose, so it recalls straight away; a non-empty one is
parked here until the cashier confirms the discard.

## line-components-pos-pos-layout-header-tsx-L49

`client/components/pos/pos-layout-header.tsx:49`

See AGENTS.md's "Enforced permissions" section for why this is three
checks and not one: the per-group right, the till baseline, and the
store-wide opt-in toggle are all still load-bearing.

All three useHasPermission() calls are hoisted to unconditional consts,
never inlined into the `&&` chain below: useHasPermission's result can
change between renders as its permission-group lookup resolves
asynchronously (starts from a role fallback, then updates once the
real group loads), and short-circuiting the second call inside `&&`
made its hook count differ between renders for exactly the case this
feature exists for - a custom group more permissive than its base
role tier - triggering React's real "Rendered more/fewer hooks than
during the previous render" crash (see
__tests__/pos-layout-header-rules-of-hooks.test.tsx).

## line-components-pos-pos-layout-header-tsx-L77

`client/components/pos/pos-layout-header.tsx:77`

Pulses until the user types something for the first time this visit —
the point's made the moment they engage with it. Tracked separately
from searchTerm itself so clearing a search later in the session
(typed something, cleared it, about to search again) doesn't bring the
pulse back.

## line-components-pos-pos-layout-header-tsx-L94

`client/components/pos/pos-layout-header.tsx:94`

Keeps the store (and therefore the sidebar) in sync when fullscreen is
exited some way other than this button - Esc, the browser's own exit
control, or leaving the POS route entirely.

## block-components-pos-pos-layout-header-tsx-L180

`client/components/pos/pos-layout-header.tsx:180`

Fullscreen toggle (Desktop only): also hides the app sidebar so
the checkout screen actually gets the full viewport, not just
browser chrome-free.

## block-components-pos-pos-layout-header-tsx-L210

`client/components/pos/pos-layout-header.tsx:210`

Request Stock from Another Store: cashiers have no other way to
reach the multi-store transfer flow (the Ledger tab's own entry
point requires stock-management access) - a cashier's request
still moves stock immediately, just flagged "needs_review" for
the owner to check afterward (see stock-transfers.ts).

## line-components-pos-pos-main-tab-nav-tsx-L8

`client/components/pos/pos-main-tab-nav.tsx:8`

Unconditional top-level const (see pos-cart.tsx's canApplyDiscounts).
pos-system.tsx runs the same check for the panel itself and for the
active-tab fallback - hiding the trigger alone would still leave
?tab=history reachable by URL.

## line-components-pos-pos-payment-dialog-tsx-L75

`client/components/pos/pos-payment-dialog.tsx:75`

Re-syncs to `total` whenever it changes (e.g. a reseller markup raises
it after the dialog was first opened) as long as the field still holds
the value we auto-filled last time - i.e. the cashier hasn't typed a
different amount themselves. Tracking the *previous* auto-filled value
in a ref (rather than only checking "is it blank") is what makes this
re-run on a stale-but-non-blank amount instead of leaving it stuck.

## line-components-pos-pos-payment-dialog-tsx-L84

`client/components/pos/pos-payment-dialog.tsx:84`

Reset on close so a value a cashier manually typed in a previous
sale can't be silently overwritten just because a later sale's
total happens to match it.

## block-components-pos-pos-product-list-tsx-L46

`client/components/pos/pos-product-list.tsx:46`

Shared scroll container this list renders inside of — see
VirtualizedProductGrid's own doc comment for why it can't create its
own.

## line-components-pos-pos-product-list-tsx-L104

`client/components/pos/pos-product-list.tsx:104`

Not `disabled`: clicking an out-of-stock tile still surfaces the
"This item is out of stock" toast, and a disabled button would drop it
out of the tab order entirely.

## block-components-pos-pos-redeem-reward-tsx-L22

`client/components/pos/pos-redeem-reward.tsx:22`

Only options staff configured with an actual naira discount value are
redeemable at checkout — non-monetary perks (e.g. "Free Delivery") stay
configurable in Settings but aren't something POS can apply as a discount.

Rewards costing less than LOYALTY_RULES.MIN_REDEMPTION_POINTS are shown but
disabled with the reason, rather than hidden: staff configured them in
Settings and would otherwise have no idea why they never appear. Checkout
re-enforces the same floor server-side (applyLoyaltyPointsForSale), so this
is affordance, not the only gate.

## line-components-pos-pos-redeem-reward-tsx-L45

`client/components/pos/pos-redeem-reward.tsx:45`

Dated points ledger, for FIFO expiry (LOYALTY_RULES.POINTS_EXPIRY_MONTHS)
— the balance on the customer row still includes points that have since
expired until a checkout materializes the deduction, so spendable points
have to be computed, not read.

## line-components-pos-pos-redeem-reward-tsx-L59

`client/components/pos/pos-redeem-reward.tsx:59`

Hidden entirely (not just disabled) when the Loyalty Program is gated
off (plan tier and/or the store's own on/off toggle) — matches how
gated features elsewhere in the app disappear rather than showing a
locked/disabled control, since this is an inline cart-line-item, not a
full-page module that would use LockedModuleOverlay.

## line-components-pos-pos-system-tsx-L109

`client/components/pos/pos-system.tsx:109`

The Recent Sales tab is reachable by URL (?tab=history), so the panel and
the resolved tab are gated here as well as the trigger in POSMainTabNav.
Note this is a different question from "view_activity_log", which scopes
WHOSE sales the panel lists once it is open.

## line-components-pos-pos-transaction-history-tsx-L22

`client/components/pos/pos-transaction-history.tsx:22`

============================================================================
Types
============================================================================

## block-components-pos-pos-transaction-history-tsx-L30

`client/components/pos/pos-transaction-history.tsx:30`

The History tab's own scrolling container, threaded down so the
transaction list can virtualize against it - the list has no scroll
container of its own.

## line-components-pos-pos-transaction-history-tsx-L40

`client/components/pos/pos-transaction-history.tsx:40`

============================================================================
Main Component
============================================================================

## line-components-pos-pos-transaction-history-tsx-L54

`client/components/pos/pos-transaction-history.tsx:54`

The input stays bound to searchQuery so typing is instant; the expensive
work downstream (a fuzzy search over up to 500 sales, then a re-group of
the matches into date buckets) runs off the settled value instead.

## line-components-pos-pos-transaction-history-tsx-L77

`client/components/pos/pos-transaction-history.tsx:77`

The `recentSales` prop is a fixed 100-row snapshot (see usePOSData) -
fine as the default view, but a picked date range can reach further back
than those 100 rows cover. Once a range is picked, fetch it directly
(unbounded by that snapshot) instead of filtering the prop in memory.

## line-components-pos-pos-transaction-history-tsx-L89

`client/components/pos/pos-transaction-history.tsx:89`

Today's metric cards are fetched date-scoped in SQL rather than derived
from the `recentSales` prop: that prop is an undated, LIMIT-100 snapshot
(see usePOSData), so on a busy day - or any day following one with 100+
sales - today's earliest (or all of today's) rows were pushed out of the
snapshot before the client-side "is it today" filter ever ran, and the
cards understated revenue/transactions. Same pattern as
use-my-today-sales.ts, scoped to everyone when the viewer may see all
activity (matching how usePOSData scopes `recentSales`). Today's local
date is part of the query key, so the cards also roll over at midnight.

## line-components-pos-pos-transaction-history-tsx-L135

`client/components/pos/pos-transaction-history.tsx:135`

Filtered sales. Date range filtering happens at the query level (see
salesSource above) - not here - since a picked range can reach past the
`recentSales` prop's fixed 100-row snapshot.
genericFuzzySearch needs plain object keys, not a computed value, so
build small search-only records rather than passing salesSource itself -
the "||" join separator (see getRecentSales) is replaced with a space
first: it isn't whitespace, so leaving it in would glue the item on one
side of it onto the next token during tokenization (Tier 3/4 both split
on /\s+/), corrupting matches right at that boundary.

Keyed on the base data alone, deliberately separate from the search term,
so a keystroke doesn't rebuild all 500 records.

## line-components-pos-pos-transaction-history-tsx-L168

`client/components/pos/pos-transaction-history.tsx:168`

Filter the original array by matched id rather than returning
`results` directly, so relevance scoring doesn't reorder sales out
of their existing chronological order (filteredSales feeds
groupedSales' TODAY/YESTERDAY/THIS WEEK/OLDER buckets next).

## line-components-pos-pos-virtualized-product-grid-tsx-L8

`client/components/pos/pos-virtualized-product-grid.tsx:8`

Mirrors the grid's previous fixed classes (grid-cols-2 sm:grid-cols-3
lg:grid-cols-3 xl:grid-cols-4 — lg is a no-op, already 3 from sm) as
*viewport* breakpoints, matching Tailwind's own defaults: those classes
respond to the browser viewport, not this element's own width, so
columns here must be computed the same way, not via a ResizeObserver on
this container. Mismatching the two would desync how many cards this
component groups into a virtualized row from how many the CSS grid
actually renders per row, breaking the layout.

## block-components-pos-pos-virtualized-product-grid-tsx-L49

`client/components/pos/pos-virtualized-product-grid.tsx:49`

The single scrollable ancestor this grid renders inside of (POS's
products tab shares one scroll container across the category filter,
mobile search, suggestion carousels, and this grid — see
pos-system.tsx). react-virtual needs that real scroll element, not a
new one of its own, or pull-to-refresh and the page's own scrollbar
would both break.

## block-components-pos-pos-virtualized-product-grid-tsx-L59

`client/components/pos/pos-virtualized-product-grid.tsx:59`

Row-virtualized replacement for a plain `products.map(...)` CSS grid —
see docs/KNOWN_BUGS.md's POS perf finding. Every other large list in the
app (catalog, customers, expenses, ...) already virtualizes; POS's
product grid didn't, so a large catalog (thousands of products) rendered
every card as a real DOM node at once, on both the "All products" browse
view and every search-result set — the most expensive screen in the app
to have doing that, since it's also the one re-rendering on every
keystroke while searching.

Chunks the flat product list into rows of `columns` items (computed to
match the grid's own responsive breakpoints, see COLUMN_BREAKPOINTS) and
only mounts the rows currently in or near the viewport.

## line-components-pos-pos-virtualized-product-grid-tsx-L93

`client/components/pos/pos-virtualized-product-grid.tsx:93`

How far this grid sits below the top of the shared scroll container
(category filter, mobile search, any suggestion/recently-sold
carousels above it) — react-virtual's `scrollMargin` needs this to
translate its own row offsets into the scroll container's actual
coordinate space. Content above this grid can change height for
reasons that have nothing to do with this grid's OWN row count — the
Smart Suggestions section switches between a one-liner and a full
card carousel as the cart changes, the category filter/search can
rewrap, the pull-to-refresh indicator animates — so recomputing only
on `rows.length` left `scrollMargin` stale exactly when the cart or
filters changed without also changing how many products matched:
every virtual row then drew at the wrong offset against a scroll
container measuring something else, a mis-rendered grid mid-checkout.
Recomputed after every render instead (any layout-affecting change,
including ones this component has no explicit dependency on) — cheap
(one offsetTop read) and self-limiting: setState is a no-op once the
value stops changing, so this can't loop.

## line-components-pos-pos-virtualized-product-grid-tsx-L126

`client/components/pos/pos-virtualized-product-grid.tsx:126`

A card's height is fairly stable (name is line-clamped to 2 lines),
so a fixed estimate keyed off breakpoint is close enough that
measureElement below only needs to correct it slightly, not
recompute from scratch.

## line-components-pos-pos-virtualized-product-grid-tsx-L135

`client/components/pos/pos-virtualized-product-grid.tsx:135`

Reveal a product the moment its cart quantity goes up, wherever the add
came from — a card tap, a barcode scan, the search box, a suggestion
chip. Keyed off the quantity map rather than addToCart so every route in
is covered, and only scrolls when the card is actually off-screen, since
scrolling under a cashier who can already see the card is worse than
doing nothing.

## line-components-pos-receipt-view-tsx-L46

`client/components/pos/receipt-view.tsx:46`

"tax" reuses the exact same sale data as "receipt" - it's a print-time
choice, not a persisted property of the sale - and adds the store's tax
registration number to the header for buyers who need a formal VAT
document. "quote" is built from the live cart before checkout - no sale
exists yet, so the payment/change/barcode sections don't apply and a
disclaimer replaces them instead.

## line-components-pos-request-item-dialog-tsx-L45

`client/components/pos/request-item-dialog.tsx:45`

Re-seed the name field whenever the dialog is (re)opened, since the
caller's initialProductName (e.g. the POS search term) can change
between opens while the dialog instance itself stays mounted.

## line-components-pos-request-item-dialog-tsx-L57

`client/components/pos/request-item-dialog.tsx:57`

getAllCustomers() (a flat list for POS-style pickers) is a different
shape from getCustomers() (used by useCustomerData, with joined
total_spent/last_visit). This must NOT share a cache key with that
one, or whichever query runs second overwrites the cache with an
incompatible shape for the other's consumers. Reuses the same key as
use-pos-data.ts's identical getAllCustomers() call for consistency.

## line-components-pos-request-item-dialog-tsx-L66

`client/components/pos/request-item-dialog.tsx:66`

This dialog is permanently mounted at five call sites (catalog, POS
cart, POS product list, two procurement screens), so without this gate
every one of those screens paid for a full customer + product list read
on mount for a dialog that is almost never opened.

## line-components-pos-request-item-dialog-tsx-L80

`client/components/pos/request-item-dialog.tsx:80`

Warn (non-blocking) when the typed name looks like something already in
the catalog: staff should double check before logging a duplicate
"missing product" request for stock that's already on hand.
Debounced: the hint is advisory, and re-running a fuzzy search over the
whole catalog on every keystroke of a product name is the expensive half
of typing in this dialog.

## line-components-pos-request-item-dialog-tsx-L159

`client/components/pos/request-item-dialog.tsx:159`

Selecting an option must still set the underlying stored
(lowercase) name as `value` — only `label` gets the
display treatment, so the dropdown looks right without
writing a styled string into requested_products.

## line-components-pos-return-dialog-tsx-L59

`client/components/pos/return-dialog.tsx:59`

Fetch items for this sale, including how much of each has already been
returned in a prior return on this sale — getSaleItems() (the previous
data source here) only returns the original sold quantity, with no way
to know a customer already returned some of it, which let the same
items be returned twice.

## line-components-pos-return-dialog-tsx-L111

`client/components/pos/return-dialog.tsx:111`

Refund proportionally includes the tax and discount the customer actually
paid on these items, not just their raw unit price, otherwise a full
return of a sale refunds less than the customer paid (the tax/discount
share is left behind as phantom "revenue" everywhere downstream: the
dashboard, POS today's-sales tile, and BI reports all derive their
totals from sales.total_amount minus returns.total_refunded).

## line-components-pos-return-dialog-tsx-L133

`client/components/pos/return-dialog.tsx:133`

Passed as ConfirmDialog's onConfirm, which awaits it and only closes
once it settles. Swallows the mutation's own rejection (already
toasted via onError in the hook) so ConfirmDialog closes the same way
on both success and failure, matching this dialog's original contract —
it's returnMutation.isError / the outer ResponsiveModal staying open
that signals failure, not an exception surfacing here.

## line-components-pos-transaction-details-dialog-tsx-L48

`client/components/pos/transaction-details-dialog.tsx:48`

Unconditional top-level const (see pos-cart.tsx's canApplyDiscounts).
Gates taking another copy of a finished sale's receipt off the device;
the receipt shown straight after checkout belongs to process_sales.

## line-components-pos-transaction-details-dialog-tsx-L72

`client/components/pos/transaction-details-dialog.tsx:72`

`sale` is a snapshot the caller captured in its own state (selectedSale
etc.) - it's never refetched after a redeem, so without this the dialog
would keep showing "Not yet redeemed" (and both action buttons enabled)
even though the redeem already succeeded. Reset whenever a different
sale is opened so a stale override never leaks onto the next one.

## line-components-pos-transaction-details-dialog-tsx-L128

`client/components/pos/transaction-details-dialog.tsx:128`

Derives the key from the factory (with a throwaway .slice to drop
the trailing activeStoreId/currentUserId resource() appends) rather
than duplicating the "customerById" literal, so a rename in
query-keys.ts can't silently desync from this call site.

## block-components-pos-transaction-item-tsx-L13

`client/components/pos/transaction-item.tsx:13`

Takes the sale rather than a pre-bound closure, so the parent can pass
one stable handler for every row instead of a fresh arrow per row (which
would defeat the memoization below).

## line-components-pos-transaction-items-view-tsx-L25

`client/components/pos/transaction-items-view.tsx:25`

Conditional, not just CSS-hidden: both branches used to be mounted for
every line item. The sm:/hidden classes stay as the first-frame guard,
since useMediaQuery starts at false and corrects itself after mount.

## block-components-pos-transaction-list-tsx-L32

`client/components/pos/transaction-list.tsx:32`

Flattens the TODAY/YESTERDAY/THIS WEEK/OLDER buckets into one list so a
single virtualizer can cover the whole thing (up to 500 rows once a date
range is picked) instead of one per group. Empty groups drop out entirely,
header included.

## block-components-pos-transaction-list-tsx-L55

`client/components/pos/transaction-list.tsx:55`

The ancestor that actually scrolls (the History tab's TabsContent). The
list has no scroll container of its own, so the virtualizer measures
against this and offsets by the list's position inside it.

## line-components-pos-transaction-list-tsx-L84

`client/components/pos/transaction-list.tsx:84`

Everything above this list inside the same scroll container (the
metrics row, the filter bar) still occupies real space, so the
virtualizer's offsets have to start where the list itself does.

## block-components-pos-use-print-receipt-tsx-L19

`client/components/pos/use-print-receipt.tsx:19`

Renders the receipt off-screen (not display:none, that would carry over
into the printed clone and hide it there too) and prints it in isolation
via printNode, sized for whichever paper the device is set to.

## line-components-prescriptions-new-prescription-prescription-medications-tsx-L63

`client/components/prescriptions/new-prescription/prescription-medications.tsx:63`

Products imported with a blank `strength` column offer zero dropdown
options once selected, leaving a required-looking combobox with nothing
to pick. Fall back to a free-text input in that case so the field stays
usable instead of rendering an unselectable empty dropdown.

## block-components-procurement-po-back-button-tsx-L23

`client/components/procurement/po-back-button.tsx:23`

The builder views' back control. Every one of them used to
router.push("/procurement") outright, silently discarding however many
line items had been typed in.

## block-components-procurement-po-desktop-create-view-tsx-L56

`client/components/procurement/po-desktop-create-view.tsx:56`

Desktop full-screen takeover for creating a purchase order, same as the
Cycle Count session in stock-batch/stock-audits.tsx, so the ledger table
gets the whole viewport instead of being cramped inside the dashboard
shell. Mirrors POMobileCreateView's two-phase flow: order details are
confirmed first, then item entry becomes the dominant content, with
details editable via PODetailsDialog afterward.

## block-components-procurement-po-desktop-edit-view-tsx-L31

`client/components/procurement/po-desktop-edit-view.tsx:31`

Desktop full-screen takeover for editing an existing purchase order, the
counterpart to POMobileEditView. Extracted out of edit/page.tsx so both
views derive their "Estimated total" from the same getOrderTotal call the
rows below them use, and so the page can render only the active one.

## block-components-procurement-po-details-dialog-tsx-L33

`client/components/procurement/po-details-dialog.tsx:33`

Re-opens PODetailsFields after the order-details step has been
confirmed, so vendor/notes/payment/due-date stay editable without
pushing item entry back down the page. Fields are bound directly to the
same live state as the details step, so there's nothing to "save" here
beyond closing the dialog.

## block-components-procurement-po-details-fields-tsx-L30

`client/components/procurement/po-details-fields.tsx:30`

Selecting this represents "no real vendor on file" — maps to a null
supplier_id at submit time (see new/page.tsx, edit/page.tsx), the same
convention sales.customer_id uses for "Walk-in Customer".

## block-components-procurement-po-details-fields-tsx-L50

`client/components/procurement/po-details-fields.tsx:50`

The order's running total, so the Amount Paid field can name the cap
getValidatedAmountPaid applies to it at save time. Zero/absent in the
create flow, where these details are confirmed before any item exists.

## block-components-procurement-po-details-fields-tsx-L55

`client/components/procurement/po-details-fields.tsx:55`

Editing an existing PO is only ever done for Standard POs (Immediate
ones are created already "received" and never enter an editable
state), so the edit page hides the toggle entirely rather than showing
a control whose "Immediate" option would silently do nothing.

## block-components-procurement-po-details-summary-bar-tsx-L11

`client/components/procurement/po-details-summary-bar.tsx:11`

Omitted entirely on the edit page, where every PO is Standard and a
type badge would be redundant with the page's own "Edit Purchase
Order" title.

## block-components-procurement-po-details-summary-bar-tsx-L15

`client/components/procurement/po-details-summary-bar.tsx:15`

Payment terms stay visible here once the details form collapses -
otherwise payment status, due date and amount paid are entered and then
disappear from the screen entirely until the dialog is reopened.

## block-components-procurement-po-details-summary-bar-tsx-L38

`client/components/procurement/po-details-summary-bar.tsx:38`

Compact stand-in for the full details form once it's been confirmed:
shows just enough to orient the user (vendor, type, payment terms) plus a
way back into PODetailsFields via PODetailsDialog, so item entry can be
the dominant content on screen instead of competing with the form above
it.

## block-components-procurement-po-immediate-confirm-dialog-tsx-L31

`client/components/procurement/po-immediate-confirm-dialog.tsx:31`

Last stop before createAndReceivePurchaseOrder, which adds stock AND
rewrites products.selling_price store-wide in the same action with no undo
path. Spells out what is about to change - item count, money, and how many
lines carry a real selling-price change - because the button that opens
this used to read "Save" and the only explanation anywhere was a hover
tooltip no touch user could reach.

## block-components-procurement-po-item-builder-tsx-L26

`client/components/procurement/po-item-builder.tsx:26`

Search-to-add-a-row bulk item entry, replacing the old one-at-a-time
POAddItemForm + separate cart summary. A row is added the moment a
catalog product is picked (or a newly created product comes back); no
separate "Add" click is needed to commit it to the list, since it's
already in the list. showGlobalSuggestions={false} on the combobox keeps
catalog matches and non-catalog name suggestions from ever appearing in
the same dropdown.

## line-components-procurement-po-item-builder-tsx-L48

`client/components/procurement/po-item-builder.tsx:48`

Staff's first instinct on a brand-new order is to start typing an item
name right away, not to click into the search bar first - but this same
component also mounts on the edit page resuming an existing draft,
where the order already has items and grabbing focus (popping the
mobile keyboard) would cover the very rows the user came to edit.
Only mount-focus when there's nothing in the order yet.

## line-components-procurement-po-item-builder-tsx-L68

`client/components/procurement/po-item-builder.tsx:68`

Reading the current items through a ref keeps them out of every
handler's dependency list, so the callbacks handed to the memoised rows
stay identical across renders and editing one line does not re-render
every other line's inputs, date pickers and popovers.

## block-components-procurement-po-item-ledger-table-tsx-L30

`client/components/procurement/po-item-ledger-table.tsx:30`

A line paired with its index in the order's real item array. The lists
render a possibly-filtered subset, so a row cannot infer which line it
edits from its own position on screen.

## block-components-procurement-po-item-ledger-table-tsx-L57

`client/components/procurement/po-item-ledger-table.tsx:57`

Memoised so editing one line's quantity re-renders that line only, not
every other line's inputs, date picker and price popover. Its props are
primitives, the row's own objects, or callbacks POItemBuilder keeps stable
with useCallback.

## block-components-procurement-po-line-item-math-ts-L5

`client/components/procurement/po-line-item-math.ts:5`

Adding a product to the order being built. Picking the same product twice
used to append a second row for it, leaving two lines for one product to
be reconciled by hand (and two competing sets of lot/expiry/price
overrides); the second pick is almost always "one more of these", so it
increments the row that already exists. `merged` lets the caller say which
of the two happened.

## block-components-procurement-po-line-item-math-ts-L47

`client/components/procurement/po-line-item-math.ts:47`

Single source of truth for cost math on BOTH the Immediate Purchase and
the Receive-goods flows. unit_cost is
always per bulk unit (e.g. per carton); cost_price_override, when typed
into "New Cost", is per single base unit (e.g. per tablet) — the same
scale as the catalog's current cost and the sell price entered in
"Review price". Every place that needs a line's cost or total must go
through these two functions instead of re-deriving the conversion
inline: that duplication is exactly how "New Cost", "Total", and
"Review price" drifted out of sync with each other before.

## line-components-procurement-po-line-item-math-ts-L68

`client/components/procurement/po-line-item-math.ts:68`

Loose `!=` (not `!==`) deliberately also catches `null`: a PO reloaded
from the DB hands back SQL NULL for an unset override, not
`undefined` - `Number(null)` is `0`, which would silently read back
as "override to zero cost" instead of "no override".

## block-components-procurement-po-line-item-math-ts-L88

`client/components/procurement/po-line-item-math.ts:88`

Guard for the money override inputs (New Cost / Cost Price / Sell Price)
in the order-building and receiving tables. Their `min={0}` is only an
HTML hint — nothing stops a negative being typed and stored, which then
corrupts stock_batches.cost_price / products.selling_price and every
margin calculation downstream. Only a negative is rewritten (to "0");
anything else is passed through verbatim so half-typed values like
"12." survive until the user finishes the number.

## block-components-procurement-po-line-item-math-ts-L102

`client/components/procurement/po-line-item-math.ts:102`

The quantity still expected on a purchase-order line: what was ordered,
less whatever has already been received against it on an earlier, partial
receipt. Receiving was all-or-nothing before `quantity_received` existed,
so a row written by an older build reads back null/undefined and its
whole ordered quantity is still outstanding.

## block-components-procurement-po-line-item-math-ts-L117

`client/components/procurement/po-line-item-math.ts:117`

Guard for the receiving tables' "Qty Received" inputs. Their min/max are
only HTML hints: a negative would corrupt on-hand stock at the moment of
receipt, and a value above the outstanding balance would book more stock
than was ever ordered.

## block-components-procurement-po-line-item-math-ts-L128

`client/components/procurement/po-line-item-math.ts:128`

The amount a line is invoiced at: the per-bulk cost as typed, times the
quantity. An override is typed per base unit, so that branch multiplies up
from the unit cost instead. Deliberately NOT derived from the rounded
per-base-unit cost in the no-override case - that made a ₦1,000 carton of
3 bill as 3 x ₦333.33 = ₦999.99. The batch's own valuation still uses the
rounded unit cost; see client/AGENTS.md on what "cost" means where.

## block-components-procurement-po-line-item-math-ts-L160

`client/components/procurement/po-line-item-math.ts:160`

The order's total: every screen that shows an "Estimated total" must go
through this rather than reducing over its own formula. The edit page's
header used getLineTotal(item, "standard") while its rows rendered as
"immediate", and the mobile edit view's drawer used a raw
bulk_quantity * unit_cost — three different numbers for the same order
once a "New Cost" override was typed.

## block-components-procurement-po-line-item-math-ts-L177

`client/components/procurement/po-line-item-math.ts:177`

Validates the free-text "Amount Paid" field before it's ever written to
the PO: `Number(amountPaid) || 0` alone silently records ₦0 paid for a
blank/non-numeric input, and accepted any value above the order total
as-is with no cap or rounding. Blank/non-numeric/negative all become 0;
anything above the order's total is clamped down to it.

## block-components-procurement-po-line-item-math-ts-L191

`client/components/procurement/po-line-item-math.ts:191`

The base units an Immediate Purchase will actually add to stock:
bulk_quantity x units_per_bulk per line, the same conversion
getLineTotal() prices. A line is one product, not one unit, so a
confirmation that counts lines ("1 item worth 40,000") reads as a
quantity to whoever just typed a quantity of 2 - see
po-immediate-confirm-dialog.tsx.

## block-components-procurement-po-line-item-math-ts-L207

`client/components/procurement/po-line-item-math.ts:207`

How many lines carry a real Sell Price override that actually differs
from the product's current price - blank/null/undefined all mean "not
overridden" (a PO reloaded via getPurchaseOrderById() hands back SQL
NULL, not undefined, for an unset override - see coerceOptionalNumber in
lib/db/procurement.ts), and retyping the same number the field was
prefilled with is not a real change either. Only meaningful for a submit
that writes products.selling_price synchronously in the same action -
createAndReceivePurchaseOrder does, and so does receivePurchaseOrder;
createPurchaseOrder (a Standard order, or an Immediate order saved as a
draft) never touches the live product row at all, so a caller must not
report a price change from that path even though the same field was
filled in - nothing has actually changed yet.

## block-components-procurement-po-line-item-math-ts-L232

`client/components/procurement/po-line-item-math.ts:232`

The lines on a receipt that carried a real cost override, with the cost
that was typed. Each batch keeps its own singular cost_price, and that is
what margin/COGS and FEFO deduction use; the catalog's averaged cost is a
display figure only. This drives the post-receive confirmation that says
so, because a small new batch barely moves a large displayed average and
therefore reads as "the cost didn't save".

## block-components-procurement-po-mobile-create-view-tsx-L57

`client/components/procurement/po-mobile-create-view.tsx:57`

Mobile full-screen takeover for creating a purchase order. Same
interaction model as POS: fixed header, scrollable form, and a floating
summary/save drawer instead of an always-visible footer. Mirrors the
desktop view's two-phase flow: order details are confirmed first, then
item entry becomes the dominant content, with details editable via
PODetailsDialog afterward.

## block-components-procurement-po-mobile-edit-view-tsx-L31

`client/components/procurement/po-mobile-edit-view.tsx:31`

Mobile full-screen takeover for editing an existing purchase order.
Mirrors POMobileCreateView's layout, minus the two-phase details flow
(an existing PO's details are always already set), so the item builder
is the dominant content from the start.

## block-components-procurement-po-mobile-summary-drawer-tsx-L28

`client/components/procurement/po-mobile-summary-drawer.tsx:28`

Items are edited inline via POItemBuilder in the page body (card mode
on mobile); the header already owns the Save action, so expanding this
drawer is purely a read-only review of what's about to be purchased.

## block-components-procurement-po-review-price-popover-tsx-L19

`client/components/procurement/po-review-price-popover.tsx:19`

The product's live selling price, so the trigger can tell a real
repricing apart from the prefill of the price that is already on file.
Without it a prefilled row is indistinguishable from an edited one.

## block-components-procurement-po-review-price-popover-tsx-L29

`client/components/procurement/po-review-price-popover.tsx:29`

Per-row "review sell price" action for the Immediate Purchase item
table/card list: lets cost and sell price be set in the same pass
instead of a separate trip to the Product Catalog. Only ever writes to
the draft item's local selling_price field — the actual products.selling_price
write happens where createAndReceivePurchaseOrder is called, same as
receivePurchaseOrder's existing selling_price handling.

## line-components-procurement-procurement-management-tsx-L13

`client/components/procurement/procurement-management.tsx:13`

Radix only mounts the active TabsContent's children, so tying registration
to this tab-scoped component (rather than the top of ProcurementManagement)
ensures it's only active while the Orders tab actually is.

## line-components-procurement-purchase-order-details-tsx-L63

`client/components/procurement/purchase-order-details.tsx:63`

Both imported here rather than at module scope: @react-pdf/renderer is
a heavy dependency that every visitor to the Orders tab was paying for,
whether or not they ever downloaded anything. purchase-order-pdf has to
be deferred alongside it, since that module statically imports it.

## block-components-procurement-receive-item-category-editor-tsx-L22

`client/components/procurement/receive-item-category-editor.tsx:22`

Receiving a delivery is when a store owner actually handles the goods and
notices a product is filed under the wrong category, but the receive
ledger is already dense enough that a full category column would not fit.
This is the escape hatch: a pencil beside the product name opening a
category-only edit, using the same real-categories picker as the Add
Product dialog.

## line-components-procurement-receive-item-category-editor-tsx-L38

`client/components/procurement/receive-item-category-editor.tsx:38`

The PO detail query keys off purchase_orders/purchase_order_items, so a
products write doesn't refetch this row's joined category_name - the
saved value is remembered here rather than reading back a stale prop.

## block-components-procurement-receive-ledger-table-tsx-L30

`client/components/procurement/receive-ledger-table.tsx:30`

Dense, single-screen alternative to the per-item receiving cards. Every
line is visible and editable at once (qty, cost price, an optional new
selling price, batch #, expiry). Div-based, ARIA roles standing
in for real <table> semantics; see stock-batch/supplier-table.tsx.

## block-components-procurement-receive-po-panel-tsx-L35

`client/components/procurement/receive-po-panel.tsx:35`

The product's live selling_price when this panel was opened - carried
through unedited so the caller can tell whether a selling_price above
is a real change or a no-op re-submission of the current price.

## block-components-procurement-receive-po-panel-tsx-L50

`client/components/procurement/receive-po-panel.tsx:50`

Embedded, full-height replacement for the old Receive Goods modal. It
takes over the same side panel used for PO details so the ledger table
gets the panel's full width/height instead of being cramped inside a
centered dialog.

## line-components-procurement-receive-po-panel-tsx-L78

`client/components/procurement/receive-po-panel.tsx:78`

Prefill with the outstanding balance, not the full ordered
quantity: on a follow-up receipt against a partially-received PO
the ordered figure is no longer what's still expected.

## block-components-procurement-requested-product-mobile-card-tsx-L12

`client/components/procurement/requested-product-mobile-card.tsx:12`

True while this card's mark-as-ordered/delete action is in flight —
disables both action buttons so a double-tap can't fire the same
mutation twice.

## block-components-procurement-requested-product-row-tsx-L14

`client/components/procurement/requested-product-row.tsx:14`

True while this row's mark-as-ordered/delete action is in flight —
disables both action buttons so a double-click can't fire the same
mutation twice.

## block-components-procurement-supplier-combobox-tsx-L26

`client/components/procurement/supplier-combobox.tsx:26`

Search-to-filter vendor picker, built on the same interaction pattern as
ProductCombobox: type to fuzzy-filter, click/scroll to pick, with
"Create Supplier" pinned at the top so it's never buried by a long
supplier list. Kept to the same column width as the fields around it —
a search input needs typing room, not extra column width.

## line-components-procurement-use-selected-order-ts-L6

`client/components/procurement/use-selected-order.ts:6`

Manages which order is selected, keeps its full details in sync with the
latest row data, and closes the panel if the selected order disappears
from underneath it (e.g. deleted elsewhere).

## line-components-procurement-use-selected-order-ts-L37

`client/components/procurement/use-selected-order.ts:37`

Orders confirmed present in the list at some point, so a later
disappearance can be trusted as a real deletion rather than the list
just not having caught up yet (e.g. right after creating a new PO).

## block-components-products-add-product-dialog-tsx-L33

`client/components/products/add-product-dialog.tsx:33`

Hide "Save & Add Another", for flows (e.g. quick-adding a product from
a purchase order) where the user just wants to create one product and
get back to what they were doing.

## line-components-products-add-product-dialog-tsx-L246

`client/components/products/add-product-dialog.tsx:246`

Only clear the form once the caller reports the save succeeded —
otherwise a failed save would wipe everything the user just typed.
On the normal (non-keepOpen) path the dialog closes anyway and the
reset-on-open effect above handles the next open; this matters for
"Save & Add Another", which keeps the dialog mounted and open.

## block-components-products-bulk-show-online-action-tsx-L28

`client/components/products/bulk-show-online-action.tsx:28`

The catalog table's currently-filtered product ids, so this acts on
"what's on screen" exactly like Export does — undefined (no filter
active) means every product in the store.

## block-components-products-catalog-editable-cells-tsx-L8

`client/components/products/catalog-editable-cells.tsx:8`

Shared hover/touch affordance for a per-cell quick edit: on a mouse/
trackpad device every editable cell's pencil appears together as soon as
the pointer is anywhere over the row (`group-hover`, keyed off the row's
own `group` class) — signalling up front which cells are editable, rather
than only revealing one pencil at a time as the cursor happens to pass
over it. On a touch-capable device it renders statically since :hover
never fires there, so it has to be visible up front to be discoverable at
all.

## block-components-products-catalog-list-states-tsx-L5

`client/components/products/catalog-list-states.tsx:5`

Shown while the products query is still pending and nothing's rendered
yet, instead of falling through to EmptyCatalogList's "No products found"
— that empty state was reused for "still loading" too (no isLoading check
existed before this), which reads as the whole catalog being blank/broken
for a moment on every load, especially the >1000-row stores this table is
built for.

## block-components-products-catalog-list-tsx-L51

`client/components/products/catalog-list.tsx:51`

Lets the catalog close a detail panel that is still showing the product
the row context menu just deleted - the panel's own Delete action closes
itself, and this path has to match it.

## line-components-products-catalog-list-tsx-L89

`client/components/products/catalog-list.tsx:89`

A 2-in-1 laptop's trackpad still lets it hover, but a user tapping its
touchscreen directly never fires :hover — so the edit pencil must stay
visible whenever touch is available at all, not just on touch-primary
devices (see useHasTouchCapability's doc comment for the distinction).

## line-components-products-catalog-list-tsx-L95

`client/components/products/catalog-list.tsx:95`

Matches the sm: breakpoint the two row layouts used to be gated on in
CSS. useMediaQuery starts at `false` and corrects itself right after
mount, which is harmless here: the catalog's rows come from the local
database after mount, so there are none to render on that first pass.

## line-components-products-catalog-list-tsx-L112

`client/components/products/catalog-list.tsx:112`

Destructured to the stable member on purpose: react-query rebuilds its
useMutation result as a new object literal on every render, so depending on
the whole result below made every row handler fresh and defeated
React.memo(CatalogRow). mutateAsync is bound once per observer.

## line-components-products-catalog-list-tsx-L186

`client/components/products/catalog-list.tsx:186`

Row height differs between the stacked mobile layout and the desktop grid
row, so this measures actual rendered height per row instead of assuming
one fixed size.

## line-components-products-catalog-row-tsx-L19

`client/components/products/catalog-row.tsx:19`

The `title` above can never surface on a disabled item - the menu applies
data-[disabled]:pointer-events-none, so it never receives hover. The short
form renders on screen instead; the long one stays as a title for the
pointer-events cases (and for assistive tech reading the attribute).

## block-components-products-catalog-row-tsx-L26

`client/components/products/catalog-row.tsx:26`

Literal class strings, not a template: Tailwind's scanner only sees
classes that appear whole in the source. Indexed by whether the Avg Cost
column is rendered, which now varies with "view_cost_fields".

## block-components-products-catalog-row-tsx-L37

`client/components/products/catalog-row.tsx:37`

Which of the two layouts to mount. Deliberately a real conditional
rather than `sm:hidden`/`hidden sm:grid`: CSS-hiding the inactive branch
still mounted it, so every visible row carried a second copy of itself
including four stateful editable cells that were never on screen.

## block-components-products-product-database-filters-tsx-L21

`client/components/products/product-database-filters.tsx:21`

Currently-filtered product ids, so Export and the bulk online-visibility
action both default to what's on screen — undefined when no filter is
active (search/category/status all at their defaults).

## line-components-products-product-database-tsx-L35

`client/components/products/product-database.tsx:35`

The inputs below stay bound to searchTerm so typing is instant; the
expensive work (genericFuzzySearch over the WHOLE catalog, whose Tier-4
Levenshtein fallback fires exactly while a user is mid-word, on the same
main thread as synchronous sql.js) runs off the settled value instead.

## line-components-products-types-ts-L10

`client/components/products/types.ts:10`

A raw category_id with no matching category_name means the referenced
category row was deleted out from under this product (deleteCategory
never nulls out the products.category_id pointing at it) — falling back
to that id would show a bare UUID as the "category" instead of a
readable label.

## line-components-products-unit-select-tsx-L17

`client/components/products/unit-select.tsx:17`

Dropdown-only unit picker (suggestions.ts's global list + this store's own
custom units) with a one-click "add new" affordance right in the dropdown.
Replaces free-text SearchableInput for units specifically so two products
can't end up with "Tablet" vs "tablet" vs "Tabs" all meaning the same thing.
Typing still filters the list; it just can never commit a value that isn't
either an existing option or explicitly created via the "+ Add" row.

## line-components-pwa-registrar-tsx-L5

`client/components/pwa-registrar.tsx:5`

Side-effect import only: attaches use-install-prompt.ts's module-level
"beforeinstallprompt" listener as early as this always-mounted-at-root
component's own JS, instead of only once AndroidInstallCard happens to
mount (which is too late - see that module's comment).

## line-components-pwa-registrar-tsx-L12

`client/components/pwa-registrar.tsx:12`

sw.js calls skipWaiting()/clients.claim() unconditionally on every
install, so a new deploy's worker takes over an already-open tab without
asking. Without reloading, that tab keeps running the OLD build's already-
loaded JavaScript against the NEW build's cache/manifest - e.g. a
client-side navigation's ".txt" RSC fetch (cache key normalized to
pathname only, see sw.js) would be served the new build's payload under
the old page's still-running code, which Next's own build-ID mismatch
handling usually catches and force-reloads anyway, but not reliably. This
reloads deliberately and visibly instead of leaving that mismatch to
happen implicitly mid-session. The POS cart survives this: it's persisted
to localStorage (zustand persist), not in-memory state.

## line-components-pwa-registrar-tsx-L32

`client/components/pwa-registrar.tsx:32`

On a brand-new install (no prior service worker for this origin at
all) there is no controller yet at page load; clients.claim() in
sw.js's activate() sets one for the first time, firing this exact
same controllerchange event on every fresh device/cleared-storage
tablet/incognito-ish first run - not just on a genuine redeploy. Only
reload when a controller already existed (i.e. this really is an
update replacing a previous version), never on a first-ever install.

## line-components-pwa-registrar-tsx-L45

`client/components/pwa-registrar.tsx:45`

This SPA's routing is entirely client-side once loaded, so a
terminal left open across a shift (or, installed, across days)
may never make another document navigation - the one thing that
makes a browser re-check sw.js against the network. Without an
explicit update() call, such a tab could simply never discover a
new deploy. Checked once now and again whenever the tab becomes
visible, rather than on a timer that keeps firing while the
device is backgrounded/offline.

## line-components-pwa-registrar-tsx-L66

`client/components/pwa-registrar.tsx:66`

On a warm load (e.g. served from the HTTP cache) `window` can fire
"load" before this effect commits, so the listener below would attach
to an event that already happened and the SW would silently never
register on that visit - leaving the browser's own offline page to
take over the next time the device goes offline.

## line-components-pwa-registrar-tsx-L83

`client/components/pwa-registrar.tsx:83`

Reloads immediately rather than after a delay to let the toast be
seen (the original version waited 1200ms): sw.js's activate() prunes
cache entries not in the new build's manifest BEFORE clients.claim()
fires this event, so by the time this handler runs, the old build's
chunks are already gone from both cache and (on a real deploy) the
server. Every millisecond this tab keeps running the old build's
already-loaded JS during that window is a chance for some lazy
import() to request one of those now-gone chunks - confirmed live as
"TypeError: Cannot read properties of undefined (reading 'call')"
(a stale chunk reference webpack's runtime can no longer resolve),
which the 1200ms delay was directly responsible for widening from a
near-zero window into an actually-hit one.

## line-components-reports-daily-close-report-tsx-L29

`client/components/reports/daily-close-report.tsx:29`

Profit is hidden from cashiers specifically, not everyone who isn't
admin - an auditor has read access to every sale/return/expense this
figure is derived from, so there's no reason to hide the derived number.

## line-components-reports-daily-close-daily-close-actions-tsx-L41

`client/components/reports/daily-close/daily-close-actions.tsx:41`

@react-pdf/renderer and the PDF document are both pulled in on demand:
statically imported, they were downloaded and parsed on every visit to
the Reports route just in case someone exported.

## block-components-reports-daily-close-payment-breakdown-card-tsx-L11

`client/components/reports/daily-close/payment-breakdown-card.tsx:11`

Unrecognized/legacy payment_method, or a mixed refund with no split
data to prorate - only shown when non-zero, so Cash + Card + Transfer
+ Credit (+ Other) always reconciles to Total Sales.

## block-components-reports-empty-report-state-tsx-L11

`client/components/reports/empty-report-state.tsx:11`

Shared "nothing for this filter" state for report/analytics cards -
consolidates the ad hoc empty messages each tab used to render on its own
(e.g. sales-analytics-tab.tsx's old NoPeriodSalesData).

## block-components-reports-payment-method-select-tsx-L11

`client/components/reports/payment-method-select.tsx:11`

Filters a report/analytics query down to one payment method - maps to
sales.payment_method. Options mirror daily-close/sales-list-modal.tsx's
payment filter so the same method names/values are used everywhere.

## block-components-reports-report-card-tsx-L52

`client/components/reports/report-card.tsx:52`

Icon-title-tag as one row (A-158): previously the icon sat in its
own full-height column beside title/description/buttons together,
so the button row below only had the card's width minus the
icon's column to work with and Print wrapped to a second line on
a narrower screen. Description and the button row below now span
the card's full width instead.

## block-components-reports-report-card-tsx-L67

`client/components/reports/report-card.tsx:67`

min-h reserves room for a full 2 lines (line-clamp-2's cap) even
when the description only wraps to 1, so the button row below
never shifts between cards.

## line-components-reports-report-center-tsx-L203

`client/components/reports/report-center.tsx:203`

Only set for a report whose figures the active filters change
the meaning of - today, a staff/payment-method-filtered
Profit & Loss, which reports no expenses on purpose. Same
copy the exported CSV/PDF carries.

## block-components-reports-report-center-tsx-L228

`client/components/reports/report-center.tsx:228`

Recent Downloads: min-h-0 stops this card's own content from
growing the shared grid row taller than Report Center's natural
height; the list scrolls internally instead once it overflows
whatever height that row ends up being.

## block-components-reports-report-filters-bar-tsx-L20

`client/components/reports/report-filters-bar.tsx:20`

A report whose query ignores a dimension renders no control for it,
rather than an inert one - see reportSupportsDateRange /
reportSupportsSalesFilters in lib/hooks/use-report-export.ts.

## block-components-reports-report-table-view-tsx-L40

`client/components/reports/report-table-view.tsx:40`

One generic on-screen renderer for every Report Center report: they all
come back from useReportExport's getRows() as pre-labelled
Record<string, unknown> rows, so a single column-driven table covers all
six rather than six bespoke views. Div/grid/ARIA, per the no-raw-<table>
convention in client/AGENTS.md.

## block-components-reports-report-view-dialog-tsx-L52

`client/components/reports/report-view-dialog.tsx:52`

On-screen counterpart to the Report Center's export/print actions: the
same rows getRows() already fetches, rendered sortably, searchable and
re-filterable without closing the modal, with Export and Print still
reachable from inside the view rather than only from the card that opened
it.

## block-components-reports-staff-select-tsx-L12

`client/components/reports/staff-select.tsx:12`

Filters a report/analytics query down to one cashier's sales - maps to
sales.user_id. Reuses the same staff list as Settings > Staff (useUsers),
not a bespoke query, so it always matches who's actually assigned to the
active store.

## line-components-settings-account-sessions-list-tsx-L19

`client/components/settings/account/sessions-list.tsx:19`

Pre-fix registrations named their token literally 'auth_token' (see
RegistersAccounts.php) - treated as absent so those sessions still fall
back to a real, readable name instead of showing that internal string.

## block-components-settings-android-install-card-tsx-L15

`client/components/settings/android-install-card.tsx:15`

Nudges Android/Chrome users to install the PWA even though a native APK
also exists: the PWA install is one tap, doesn't require enabling
"install from unknown sources", and stays current automatically. Only
renders once Chrome has judged the site installable and fired
beforeinstallprompt; hidden entirely in the Tauri-wrapped desktop/native
build, which doesn't need it.

## line-components-settings-appearance-settings-tsx-L36

`client/components/settings/appearance-settings.tsx:36`

Currency, VAT and the reseller commission are store-wide figures that
happen to sit on the everyone-can-open General tab, so they carry their
own key while the theme and sidebar cards above stay open. Converted
from isAdmin, which is the same population by default.

## line-components-settings-billing-subscription-plans-tsx-L42

`client/components/settings/billing/subscription-plans.tsx:42`

The payment gateway opens in a new tab/window (see handleSubscribe), so
the user returns to this tab after paying without any route change to
trigger a refetch. Re-checking status on visibility/focus is the
cheapest way to eventually reflect a completed payment without a
dedicated payment-return route. The same handler also clears
paymentTabOpen, which is what keeps plan buttons disabled while the
payment tab is open in the background -- otherwise they'd re-enable
the instant window.open() returns, reopening the concurrent-payment
window the disabling was meant to close.

## block-components-settings-danger-zone-cloud-danger-zone-tsx-L29

`client/components/settings/danger-zone/cloud-danger-zone.tsx:29`

Deletes data directly on the server - affects every device synced to
this account, immediately, with no confirmation step beyond the password
dialog below. See DeviceDangerZone for the device-local equivalent,
which only affects the device running it.

## block-components-settings-danger-zone-device-danger-zone-tsx-L23

`client/components/settings/danger-zone/device-danger-zone.tsx:23`

Wipes only this device's local SQLite/IndexedDB store and disconnects
cloud sync. Other devices synced to the same account, and any data
already on the server, are untouched — see CloudDangerZone for that.

## line-components-settings-data-settings-tsx-L66

`client/components/settings/data-settings.tsx:66`

Restoring replaces the entire local database, so it gets the same
confirm-before-acting treatment as the other destructive actions in
Settings. The browser path can only ask *after* the file has been picked
(the input's onChange is the first hook we get), so the chosen file is
parked here until the user confirms.

## block-components-settings-demo-data-settings-tsx-L19

`client/components/settings/demo-data-settings.tsx:19`

Only rendered for stores flagged `is_demo` by a superadmin (see the
"Mark as Demo" action in the web admin panel); never shown for a real
customer account.

## block-components-settings-diagnostics-diagnostics-report-ts-L4

`client/components/settings/diagnostics/diagnostics-report.ts:4`

The pasteable support ticket. Privacy is the governing constraint, not
completeness: a sync `last_error`'s first 300 chars can be a driver error
quoting a whole row, so this file emits reason CLASSES, never raw errors,
and never the licence token or an audit row's free-form details.

## block-components-settings-download-apps-card-tsx-L21

`client/components/settings/download-apps-card.tsx:21`

Lets a store owner grab a native build for another device, paired with
the PWA install cards above, which cover this device instead. The Android
APK here is a fallback for devices/browsers where the PWA install prompt
(AndroidInstallCard) isn't available.

## line-components-settings-ios-install-card-tsx-L19

`client/components/settings/ios-install-card.tsx:19`

iPadOS 13+ Safari sends a desktop macOS user agent by default
("Macintosh; Intel Mac OS X..."), so the UA-string check alone misses
essentially every modern iPad - and since iOS never fires
beforeinstallprompt either, an iPad user fell through both install paths
entirely with no guidance at all. maxTouchPoints > 1 is the standard way
to tell a touchscreen "Mac" (real iPad) apart from an actual Mac
(mouse/trackpad, maxTouchPoints === 0).

## block-components-settings-ios-install-card-tsx-L30

`client/components/settings/ios-install-card.tsx:30`

iOS forces every browser to use WebKit, but "Add to Home Screen" only
produces a real standalone-mode install in Safari itself. Chrome/Firefox/
Edge on iOS (CriOS/FxiOS/EdgiOS) expose either no equivalent or a plain
bookmark shortcut that reopens inside their own browser chrome. So this
needs to detect actual Safari, not just "is this an iOS device".

## line-components-settings-ios-install-card-tsx-L40

`client/components/settings/ios-install-card.tsx:40`

In-app WebViews (Facebook, Instagram, LinkedIn, etc.) render on WebKit
and include "Safari" in their UA string just like real Safari does, but
have no Share -> Add to Home Screen action, so the "safari" branch's
instructions don't work there - the "other-browser" fallback below
(correctly telling the user to open in Safari) needs to catch these too.

## block-components-settings-ios-install-card-tsx-L77

`client/components/settings/ios-install-card.tsx:77`

Shown only on iOS Safari when not already running as an installed
PWA/desktop app. iOS has no automatic install prompt (unlike Android
Chrome's beforeinstallprompt), so this is the only way to guide users
to a full-screen, app-like experience.

## block-components-settings-roles-permissions-category-selection-ts-L1

`client/components/settings/roles-permissions/category-selection.ts:1`

Tri-state maths for the Roles & Permissions matrix's category rows.
Pure and framework-free so the "all / none / some" decision is testable
without a render harness - the component only wires it to a checkbox.

## block-components-settings-roles-permissions-category-selection-ts-L15

`client/components/settings/roles-permissions/category-selection.ts:15`

Clicking a fully-checked category clears it; clicking an unchecked OR
partially-checked one fills it in. That is the standard tri-state
behavior and it means one click always resolves the ambiguous middle
state into "everything on".

## block-components-settings-roles-permissions-category-selection-ts-L23

`client/components/settings/roles-permissions/category-selection.ts:23`

The keys a category click should actually write. `lockedKeys` are cells
the matrix renders disabled (today: the acting user's own
manage_roles_permissions) - a category-level clear must not strip a
grant the per-cell UI refuses to strip, or the bulk control becomes a
way around the self-lockout guard.

## block-components-settings-roles-permissions-group-column-actions-tsx-L21

`client/components/settings/roles-permissions/group-column-actions.tsx:21`

Per-group column header actions in the Roles & Permissions matrix -
Revert to Default for a default group (its permissions can be edited
but its name/identity can't, per Global Constraints), Rename/Delete for
a custom group. Never both on the same group.

## block-components-settings-roles-permissions-permission-matrix-tsx-L15

`client/components/settings/roles-permissions/permission-matrix.tsx:15`

A user who isn't store_owner/super_admin has no unconditional bypass in
hasPermission(), so unticking manage_roles_permissions on their own
group would lock them out of this very panel with no way back in from
their own device. The cell stays visible (and ticked) but is not
editable, mirroring the self-edit protection the sync layer already
applies to a user's own role/permission_group_id.

## block-components-settings-roles-permissions-permission-matrix-tsx-L23

`client/components/settings/roles-permissions/permission-matrix.tsx:23`

The server rejects a permission_groups push that would grant a key the
caller doesn't hold, and it checks the WHOLE resulting permissions array -
so a group that already holds such a key can't be edited by that caller at
all. Both refusals are shown here as a disabled cell with the reason,
because the alternative (letting the edit through) is a local write that
looks saved, pushes as `permission_denied`, is dropped silently and is
reverted by the next pull with nothing said.

## line-components-settings-roles-permissions-permission-matrix-tsx-L41

`client/components/settings/roles-permissions/permission-matrix.tsx:41`

Categories start expanded: the matrix's whole job is being scannable at
a glance, so nothing is hidden behind a click until the admin chooses to
fold a section away.

## line-components-settings-security-settings-tsx-L64

`client/components/settings/security-settings.tsx:64`

Local zustand state drives the UI/timer immediately; the DB write is
what makes the choice follow this staff member's ACCOUNT to their next
device instead of staying stuck on this one browser (see
useSyncAutoLockDurationWithAccount, which reads this column back on
login elsewhere/next time).

## line-components-settings-security-settings-tsx-L78

`client/components/settings/security-settings.tsx:78`

Self-heals a persisted duration that doesn't match any current option
(an older app version's value, manual/corrupted localStorage, a future
option removed) — Radix's Select has nothing to match and renders
completely blank in that case, not even its own placeholder, with no
way for the user to tell why or fix it themselves short of picking a
new value. Falls back to the store's own documented default (5).

## line-components-settings-staff-management-tsx-L78

`client/components/settings/staff-management.tsx:78`

Seat-limit cap and the "Total Staff" stat must count every active
account, not just the store-filtered `users` list, so they use this
unfiltered, is_active-only count instead of users.length.

## line-components-settings-staff-staff-activities-tab-tsx-L36

`client/components/settings/staff/staff-activities-tab.tsx:36`

Mirrors ActivityLogPage's approach: when searching, fetch a large
unpaginated batch (matching the other filters) so fuzzy search has the
full set to search across rather than just the current page.

## block-components-settings-staff-staff-form-dialog-tsx-L12

`client/components/settings/staff/staff-form-dialog.tsx:12`

Resolves the store_id to actually persist for a staff row from the
controlled <select>'s value (empty string when unselected/no store
active) plus the currently active store as a fallback. Always returns
`null`, never `""`, for "no store" — an empty string matches neither
`store_id = ?` nor the `store_id IS NULL` fallback
getUsers()/local-database.ts checks for, which made such an account
invisible in every staff list while still able to log in.

## block-components-settings-staff-staff-form-dialog-tsx-L28

`client/components/settings/staff/staff-form-dialog.tsx:28`

Every submit-blocking rule for the staff form, as a pure function so each
one is testable without a rendered dialog (same reason resolveStaffStoreId
above is extracted). Returns the message to show, or null when the form is
good to submit. A Group is required: without it a staff member is saved
with no permission_group_id at all and silently falls back to role-string
permissions, which is never what the person filling the form intended.

## line-components-settings-staff-staff-form-dialog-tsx-L134

`client/components/settings/staff/staff-form-dialog.tsx:134`

Sent alongside role so the two never disagree about which
staff member they describe - see staff-form-fields.tsx's
Group Select, which sets both together.

## line-components-settings-staff-staff-form-dialog-tsx-L139

`client/components/settings/staff/staff-form-dialog.tsx:139`

Only touch store_id when the selector was actually shown to the
user (multi-store accounts). Single-store accounts never render
it, so sending it unconditionally would silently overwrite
main-account rows (store_id === null) with activeStoreId.

## block-components-settings-staff-staff-form-fields-tsx-L45

`client/components/settings/staff/staff-form-fields.tsx:45`

The staff form's actual input fields, split out from StaffFormDialog so
the dialog wrapper (state, submit handling, footer buttons) stays focused
on orchestration rather than markup.

## line-components-settings-store-business-information-card-tsx-L271

`client/components/settings/store/business-information-card.tsx:271`

Dashed border + Upload icon = an actual click target here,
via the "Upload Logo" label right next to it - only shown
in edit mode so it isn't mistaken for one while read-only.

## line-components-settings-store-category-form-dialog-tsx-L44

`client/components/settings/store/category-form-dialog.tsx:44`

Suggestions matching how the product form already picks a category list
by business type, minus names already in use — no point suggesting a
category that already exists (the one being edited stays offered, so
reselecting the current name isn't blocked).

## line-components-settings-store-category-form-dialog-tsx-L58

`client/components/settings/store/category-form-dialog.tsx:58`

Accepts an explicit value for the Enter-key path: SearchableInput's
onCommitKey fires synchronously alongside its own onValueChange call, so
reading the `name` state here instead would see it a render behind.

## block-components-settings-store-contact-specialist-card-tsx-L11

`client/components/settings/store/contact-specialist-card.tsx:11`

WhatsApp deep link needs digits only (no +, spaces, dashes); Nigerian
numbers are commonly entered as 0803... locally, which isn't a valid
international number - swap the leading 0 for the country code so the
link actually opens a chat instead of an invalid-number error.

## line-components-settings-store-multi-store-card-tsx-L54

`client/components/settings/store/multi-store-card.tsx:54`

Fleet writes go straight to the cloud API and never touch local SQLite,
so React Query's own store caches never learn a write happened. This
won't surface the change before the next sync pull lands (Fleet stays
cloud-only), but it ensures mounted components re-fetch fresh local
data as soon as that pull does complete, instead of serving a cache
that never refreshes.

## line-components-settings-store-multi-store-card-tsx-L61

`client/components/settings/store/multi-store-card.tsx:61`

Prefix-matches every cached variant of these queries regardless of
which store/user args they were fetched with (a plain string
literal would do the same, but derives the prefix from the factory
- via a throwaway call - instead of duplicating it, so a rename in
query-keys.ts can't silently desync from this call site).

## block-components-settings-store-online-payments-section-tsx-L29

`client/components/settings/store/online-payments-section.tsx:29`

Paystack's six supported countries (see StorePaymentAccountController's
OA enum); which of them get a bank list or account resolution is the
server's call, reported per request. See client/AGENTS.md.

## line-components-settings-store-payment-settings-card-tsx-L37

`client/components/settings/store/payment-settings-card.tsx:37`

Each row saves immediately on toggle rather than sitting behind an
edit/save mode — matches how the rest of the Payment Methods page reads
(a live list of switches, not a form you commit). Persisting directly
via updateStoreProfile (rather than the parent's handleSaveProfile)
avoids reading enabledPaymentMethods through a stale closure — the
parent's save handler only sees the new value after its own re-render.

## block-components-settings-store-product-units-card-tsx-L20

`client/components/settings/store/product-units-card.tsx:20`

Store-specific selling/pack units, layered on top of the built-in
suggestion list. Kept as a flat string list (custom_units) rather than a
structured {name, abbreviation} model — this store doesn't need per-unit
abbreviations/precision, just a name pickers can select from.

## block-components-settings-store-receipt-customization-card-tsx-L33

`client/components/settings/store/receipt-customization-card.tsx:33`

A simple label/description + switch row, shown as read-only
Enabled/Disabled text outside edit mode. Shared by the receipt toggles
that don't need feature-gating (Show Phone, Show Address) - Show Logo and
Hide Powered By stay inline since they each wrap their switch in
withRestriction()/a tooltip.

## line-components-settings-store-receipt-customization-card-tsx-L185

`client/components/settings/store/receipt-customization-card.tsx:185`

Never a click target on this card (the upload lives on
Business Information) - plain, not dashed, so it doesn't
read as an upload dropzone here.

## line-components-settings-store-register-config-card-tsx-L45

`client/components/settings/store/register-config-card.tsx:45`

Each row saves immediately on toggle — same as Payment Methods — rather
than sitting behind a Save button, so there's nothing to persist directly
via updateStoreProfile (not the (possibly stale) handleSave* closure).

## line-components-settings-store-register-config-card-tsx-L87

`client/components/settings/store/register-config-card.tsx:87`

Plan-tier entitlement, same gate the POS cart's reseller row itself
enforces (canUseMarkupSales) - without this a Free/Starter owner
could flip the toggle on and have it silently persist as a dead
setting, since the POS row would still never appear.

## block-components-settings-store-store-profile-section-tsx-L38

`client/components/settings/store/store-profile-section.tsx:38`

The parts of Business Information that are specific to this store's
storefront presence, kept visually nested since a business may eventually
run more than one store under the same identity above.

## line-components-settings-store-store-profile-section-tsx-L102

`client/components/settings/store/store-profile-section.tsx:102`

Nothing left to show is a real state for a retail store whose group
lacks the storefront key and whose plan has no loyalty program - render
nothing rather than an empty bordered box with only a heading in it.

## line-components-settings-system-settings-tsx-L26

`client/components/settings/system-settings.tsx:26`

The System tab itself is manage_device_settings; this card is only a
shortcut into the Billing tab, so it carries that tab's own key rather
than offering a link into a screen the group cannot open.

## block-components-stock-batch-adjust-stock-flow-tsx-L21

`client/components/stock-batch/adjust-stock-flow.tsx:21`

Full-page creation flow, the same shell the cycle count uses
(`stock-audits.tsx`): a fixed header with a back button, a centered
scrolling body and a pinned footer action. It replaces the tab's content
outright rather than overlaying it, so the two-step entry has the whole
viewport on a phone instead of a dialog's scroll box.

## block-components-stock-batch-adjustment-mobile-group-tsx-L12

`client/components/stock-batch/adjustment-mobile-group.tsx:12`

Phone-width equivalent of the ledger's desktop grid, mirroring
StockMovementMobileGroup: a date heading followed by one card per
adjustment, carrying the same five facts the desktop columns show.

## block-components-stock-batch-audit-derivations-ts-L12

`client/components/stock-batch/audit-derivations.ts:12`

Category options with their item counts, built in ONE pass over `items`.
The previous shape ran `items.filter(...)` once per distinct category
(O(categories x items)) unmemoized, i.e. on every keystroke in any of the
ledger's hundreds of number inputs.

## block-components-stock-batch-audit-derivations-ts-L34

`client/components/stock-batch/audit-derivations.ts:34`

A row differs from the values the count opened with. A row whose
countedQty is undefined has not been entered at all, so it is never a
difference - submitting one would post `undefined` as a quantity.

## block-components-stock-batch-audit-derivations-ts-L47

`client/components/stock-batch/audit-derivations.ts:47`

Whether someone has actually been to the shelf for this row. Counted Qty
opens empty, so an entered quantity IS the record of a count - including
one that happens to equal the system figure. `counted` additionally covers
a row ticked by hand (which fills the quantity for you) and a row where
only a price was corrected.

A row that differs counts regardless of either: that keeps drafts
persisted before this existed (zustand `stock-audit-draft`, which
pre-filled Counted Qty with the system quantity) correct, and both
fallbacks can be retired from this check once no device can still be
carrying such a draft - i.e. one release after 2026-10-13.

## block-components-stock-batch-audit-derivations-ts-L70

`client/components/stock-batch/audit-derivations.ts:70`

Whether the sheet may be rebuilt from a fresh products query. Anything
typed, ticked or corrected makes it unsafe; an empty sheet is always safe.
Guarding on `items.length === 0` instead loses the refetch that a submit
or the pre-count sync invalidates, because the sheet is rebuilt from the
stale cache first and then refuses the fresh data when it lands.

## block-components-stock-batch-audit-derivations-ts-L81

`client/components/stock-batch/audit-derivations.ts:81`

The ledger's count-progress lens: what's left to count, what's been
done, and which rows disagreed with the system badly enough to be worth
a recount.

## block-components-stock-batch-audit-derivations-ts-L118

`client/components/stock-batch/audit-derivations.ts:118`

What submitStockAudit() receives for the rows being posted.

`countedQty` is passed through as-is, `undefined` included: a row where
only a price was corrected has no counted quantity, and submitStockAudit
then resolves it against the quantity it re-reads INSIDE its transaction.
Coalescing it to `systemQty` here would post a phantom adjustment.

`baselineQty` is what the discrepancy is measured against: the live
figure re-read when THIS row was counted (A-263). It is deliberately NOT
`systemQty`, which is only a display figure and is still the sheet-build
one on a draft resumed from an older build - sending that would reverse
the day's sales. A row without a baseline sends none, and the submit
re-reads. See client/AGENTS.md.

## block-components-stock-batch-audit-derivations-ts-L160

`client/components/stock-batch/audit-derivations.ts:160`

The row as it stands once the live read lands: `live` becomes both the
displayed system figure and the baseline the submit measures against. A
tick (no `countedQty`) records the live figure on both sides, which is
what "counted, and it matched" means.

## block-components-stock-batch-audit-derivations-ts-L183

`client/components/stock-batch/audit-derivations.ts:183`

Keeps a row's live re-read from being overtaken by its own history.

`EditableNumberCell` commits on every valid keystroke, so typing "12" is
two counts, and their reads do not necessarily resolve in order: a read
issued while a sync transaction is reserved queues behind it, while one
issued after that transaction starts bypasses the queue (see
lib/db/core.ts). Last-read-wins would then leave the row holding "1".
Each count takes a token; a read whose token is no longer current is
dropped. Cancelling has the same effect, which is how a read is stopped
from landing on a row that has since been cleared, or on a sheet that has
been started over.

## block-components-stock-batch-barcode-label-sheet-ts-L10

`client/components/stock-batch/barcode-label-sheet.ts:10`

Builds the print sheet by repeating ONE rendered label's markup.

Every copy is byte-identical (same product, same barcode value), so the
dialog renders a single <ReactBarcode> and repeats its output, instead of
live-mounting `quantity` React components off-screen and re-rendering all of
them on every increment.

## block-components-stock-batch-barcode-print-dialog-tsx-L24

`client/components/stock-batch/barcode-print-dialog.tsx:24`

Only the four fields a label actually carries, so any product shape can
be printed — POSProduct satisfies it structurally, and the catalog's
camelCase ProductViewModel maps onto it at the call site.

## line-components-stock-batch-barcode-print-dialog-tsx-L34

`client/components/stock-batch/barcode-print-dialog.tsx:34`

printNode() ships this as a page <style> in the popped-out print window, so
it's a plain string, not a Tailwind class — the uppercase-display toggle
has to be baked into the CSS text itself rather than a React className.

## block-components-stock-batch-import-export-toolbar-tsx-L34

`client/components/stock-batch/import-export-toolbar.tsx:34`

The catalog table's currently-filtered product ids (search/category/
status), so Export defaults to "what's on screen" instead of always the
whole store — undefined (no filter active) exports everything.

## block-components-stock-batch-import-export-toolbar-tsx-L61

`client/components/stock-batch/import-export-toolbar.tsx:61`

Updates the overlay and yields a frame so it actually paints before the
next step runs. PDF generation itself runs off the main thread (see
generateReportPdfBlob), so the UI - including this overlay's animations
- stays responsive through that step even though there's no way to
report real percentage progress from inside it; the bar just holds at
its pre-render value and jumps once the worker resolves.

## line-components-stock-batch-import-mapping-dialog-tsx-L104

`client/components/stock-batch/import-mapping-dialog.tsx:104`

readWorkbookFile() throws a user-facing message for the one
expected failure mode (a legacy .xls file - see its own comment);
anything else is an unexpected parse failure.

## block-components-stock-batch-inventory-audit-overlay-tsx-L6

`client/components/stock-batch/inventory-audit-overlay.tsx:6`

Rendered once at the /inventory layout level (see inventory-audit-context.tsx
for why) so the overlay survives the [tab] page remount that "Start Audit"
triggers.

## block-components-stock-batch-stock-audits-tsx-L69

`client/components/stock-batch/stock-audits.tsx:69`

Set once someone has actually been to the shelf for this row - by any
edit, or by ticking the row by hand when the count matched. See
isAuditItemCounted.

## block-components-stock-batch-stock-audits-tsx-L73

`client/components/stock-batch/stock-audits.tsx:73`

Live stock as re-read at the moment this row's count was entered, and
the only figure the submit may measure the count against. Absent on a
row whose count predates that read - a draft resumed from an older
build - which must fall back to re-reading at submit. See A-263.

## block-components-stock-batch-stock-audits-tsx-L78

`client/components/stock-batch/stock-audits.tsx:78`

When this product was last reconciled by a submitted count
(products.last_audited_at), so a counter can see what has gone longest
without one. Read-only; never submitted.

## line-components-stock-batch-stock-audits-tsx-L118

`client/components/stock-batch/stock-audits.tsx:118`

Reconcile against the latest server state as soon as the count screen
opens, otherwise a stale local snapshot could make an already-corrected
discrepancy look like a fresh one, or hide a real one that happened
elsewhere since this device last synced.

## block-components-stock-batch-stock-audits-tsx-L419

`client/components/stock-batch/stock-audits.tsx:419`

Off-screen (not display:none, so it still lays out for printNode's
clone) printable sheet, mounted only while a print/export is actually
running - it used to reconcile every product x every column on every
`items` change, i.e. on every keystroke in the ledger.

## block-components-stock-batch-stock-audits-tsx-L435

`client/components/stock-batch/stock-audits.tsx:435`

Div-based with ARIA roles per the no-raw-<table> rule, but laid
out with `display: table*` rather than grid: printed page-break
header repetition keys off `table-header-group`, and this sheet
routinely runs to several pages.

## block-components-stock-batch-stock-batch-management-tsx-L38

`client/components/stock-batch/stock-batch-management.tsx:38`

Desktop: shown as the header's secondary action (see
dashboard-page-routes.ts's inventory routes). Mobile keeps its
own button here since the header's secondary action is
desktop-only.

## block-components-stock-batch-stock-movement-utils-tsx-L86

`client/components/stock-batch/stock-movement-utils.tsx:86`

Human label for a movement type. CSS `capitalize` (used everywhere
movement.type is rendered) handles every existing single-word type fine
on its own, but underscored types like "transfer_in" need an explicit
mapping ("transfer_in" -> "Transfer In") since `capitalize` only
uppercases the first letter and leaves the underscore in place.

## line-components-stock-batch-stock-movements-tsx-L78

`client/components/stock-batch/stock-movements.tsx:78`

Mirrors dashboard-header.tsx's hasMultiStoreAccess/actionRequiresIsAdmin
gate on the Transfer Stock header action: plan entitlement AND this
device actually having 2+ synced stores — a single-store account, or a
cashier fixed to one store via user.store_id, has nothing to transfer
between. This screen already gates the whole Ledger tab on
canManageStockBatch (see useStockBatchManagement), so isAdmin here just
narrows further to the roles this direct, unapproved store-to-store
move should be limited to.

## line-components-stock-batch-stock-movements-tsx-L88

`client/components/stock-batch/stock-movements.tsx:88`

Triggered from the header's "Transfer Stock" button (see
dashboard-header.tsx), which — like Add Product's ?action=add — just
navigates to this same page with a query param rather than owning any
dialog state itself. Re-checks canTransferStock rather than trusting the
URL: the header already gates the button on it, but this guards against
someone hitting the link directly.

## block-components-stock-batch-transfer-product-picker-tsx-L10

`client/components/stock-batch/transfer-product-picker.tsx:10`

The Transfer Stock dialog's product picker. Deliberately NOT a Radix
Popover (see components/ui/combobox.tsx) — a Radix Popover's cmdk search
input can't be focused/typed into when nested inside that dialog's Radix
Dialog (the Dialog's own focus trap wins the fight over the Popover's), a
known bad combination.

Also deliberately NOT portaled to document.body (unlike
components/ui/searchable-input.tsx) — Radix's Dialog wraps itself in
react-remove-scroll, which intercepts every `wheel`/`touchmove` event at
the document level and only lets it through for elements it can prove are
genuine DOM descendants of the dialog's own content (or an explicit
`shard`); a portaled-to-body menu is neither, so its scroll gets silently
preventDefault()'d — the menu opens and filters but never scrolls. A
plain `absolute`-positioned div that stays a real DOM child of this
field (matching ProductCombobox's approach exactly, proven to work
inside this same ResponsiveModal in AddProductDialog) sidesteps that
entirely, since react-remove-scroll recognizes real descendants as
scrollable and lets their wheel events pass through.

Uses searchProducts — the same function the POS product grid searches
with (use-pos-product-filter.ts) — instead of baking availability into a
fuzzy-matched label string. The caller keys this component by source
store id so its internal search text resets when the source store (and
so the product list) changes.

## line-components-stock-batch-transfer-product-picker-tsx-L56

`client/components/stock-batch/transfer-product-picker.tsx:56`

Product names are always stored lowercase — same display convention as
everywhere else product names render (stock-movement-desktop-row.tsx,
catalog-list.tsx, pos-product-list.tsx, ...).

## line-components-stock-batch-transfer-product-picker-tsx-L63

`client/components/stock-batch/transfer-product-picker.tsx:63`

Shows the selected product's name while closed/not being typed into;
reverts to it (or blank) on close without a pick, same as
SearchableInput's value<->inputValue sync.

## line-components-stock-batch-transfer-stock-dialog-tsx-L43

`client/components/stock-batch/transfer-stock-dialog.tsx:43`

A cashier can only PULL stock into their own active store, not push it
out to an arbitrary store - the button that opens this dialog is
labeled "Request stock from another store" (pos-layout-header.tsx),
and letting a non-admin freely move stock out with only a
needs_review flag after the fact would be a real gap. Admins keep the
full from/to picker via manualDestStoreId.

## line-components-stock-batch-transfer-stock-dialog-tsx-L73

`client/components/stock-batch/transfer-stock-dialog.tsx:73`

Reload the transferable-product list (with live available quantities)
whenever the source store changes, and drop any previously selected
product since it may not exist (or have stock) in the new source store.

## block-components-suppliers-add-supplier-dialog-tsx-L36

`client/components/suppliers/add-supplier-dialog.tsx:36`

True while the caller's own create/update mutation is in flight —
combined with this dialog's own uniqueness-check state so the buttons
stay disabled for the whole round trip, not just the local pre-check.

## line-components-suppliers-add-supplier-dialog-tsx-L62

`client/components/suppliers/add-supplier-dialog.tsx:62`

True only while this dialog's own uniqueness pre-check is running;
combined with the caller's isSubmittingProp (the actual create/update
mutation) below so the buttons stay disabled for the whole round trip.

## line-components-suppliers-add-supplier-dialog-tsx-L93

`client/components/suppliers/add-supplier-dialog.tsx:93`

onAddSupplier is fire-and-forget from here (the parent awaits its own
async create call and closes this dialog on success) — without this
guard, double-clicking Add Supplier before that resolves fires two
separate create calls and creates a duplicate supplier record.

## line-components-suppliers-add-supplier-dialog-tsx-L113

`client/components/suppliers/add-supplier-dialog.tsx:113`

The local pre-check is done; from here only the caller's own mutation
(isSubmittingProp) should gate the buttons. Leaving this true would
strand them disabled with the spinner on if that mutation fails.

## line-components-tauri-global-error-listener-tsx-L9

`client/components/tauri/global-error-listener.tsx:9`

Benign browser-internal notices that show up as window "error" events but
don't indicate anything actually broke, e.g. ResizeObserver's loop-limit
warnings, which commonly fire when a dropdown/popover measures itself on
open. Not real crashes; don't log them as ones.

## line-components-tauri-global-error-listener-tsx-L24

`client/components/tauri/global-error-listener.tsx:24`

Most real stale-chunk failures never reach ErrorBoundary's
componentDidCatch at all: a route-level dynamic import() rejecting
(client-side navigation to code that isn't loaded yet) surfaces here,
as an unhandled promise rejection, not a React render-time throw. See
error-boundary.tsx for the matching React-throw case, and
shouldReloadForChunkError() for why the reload is capped per build.

## line-components-tauri-global-error-listener-tsx-L38

`client/components/tauri/global-error-listener.tsx:38`

Reload first, report only if that didn't handle it. A stale chunk is
recoverable and the reload fixes it, so reporting before reloading
filed a fatal crash for every self-healing navigation (A-171). A chunk
error that survives this build's one reload is a real failure and the
guard makes reloadOnChunkError return false, so it still reports.

## line-components-ui-button-tsx-L19

`client/components/ui/button.tsx:19`

/80 (not /90) composites --secondary's white foreground down to
~3.95:1 on hover, under the 4.5:1 AA floor for this button's
text-sm label - /90 is the alpha the token's own contrast math
(see --secondary in globals.css) was actually verified against.

## block-components-ui-category-combobox-tsx-L21

`client/components/ui/category-combobox.tsx:21`

Category picker backed by the real `categories` table - and by nothing
else. FORM_SUGGESTIONS (lib/constants/suggestions.ts) is for naming a
brand-new category (settings/store/category-form-dialog.tsx), never for
choosing one, so this list stays empty on a fresh install rather than
substituting reference data a store does not actually use. The pinned
"Create ..." row is what keeps it open-ended (the save paths create a
missing category by name - see use-save-product-mutation.ts /
use-product-quick-edit-mutation.ts).

Deliberately an in-DOM absolutely positioned dropdown rather than a
portal to <body> (the shape SearchableInput uses): every caller here sits
inside a Radix dialog, whose scroll-lock blocks wheel/touch scrolling over
a portaled sibling of the dialog content, so the list could not be
scrolled at all. See components/ui/product-combobox.tsx for the same
pattern.

## block-components-ui-chart-tsx-L25

`client/components/ui/chart.tsx:25`

A single recharts tooltip/legend payload entry. Recharts' own `Payload`
type (component/DefaultTooltipContent.d.ts) leaves `.payload` (the
underlying chart datum) as `any` too, since it's genuinely whatever shape
the chart's `data` prop was given; only the fields this file actually
reads are typed here.

## block-components-ui-confirm-dialog-tsx-L29

`client/components/ui/confirm-dialog.tsx:29`

Focus the confirm button (instead of the default first-focusable
element, usually Cancel) when the dialog opens, so pressing Enter
immediately confirms. Use for non-destructive confirmations where
the fast path should be "continue", not "cancel".

## line-components-ui-confirm-dialog-tsx-L53

`client/components/ui/confirm-dialog.tsx:53`

Previously closed the dialog synchronously right after firing
onConfirm, before an async handler (e.g. a delete) had actually
finished — so there was no in-flight feedback, and if the action
failed the dialog had already vanished as if it had succeeded. Now
waits for onConfirm to settle (it may be sync or async) before
closing, and shows a spinner on the confirm button meanwhile.

## block-components-ui-date-picker-input-tsx-L17

`client/components/ui/date-picker-input.tsx:17`

Walks a raw digit string one character at a time and drops the first
digit that would make the day or month segment impossible to complete
validly (day > 31, month > 12, or a "00" segment), rather than accepting
every digit and only checking validity once all 8 are in. This is what
makes typing a month/year-only date (e.g. "11/2027", read as day 11 +
"month" 20) get stopped immediately instead of silently discarding the
whole entry.

## block-components-ui-date-picker-input-tsx-L57

`client/components/ui/date-picker-input.tsx:57`

Extra classes applied to the text input itself, not the wrapper —
needed to strip its border/shadow/ring when it's nested inside another
bordered container (e.g. the Daily Close date filter).

## block-components-ui-date-picker-input-tsx-L62

`client/components/ui/date-picker-input.tsx:62`

Accessible name for the text input, for the dense ledger tables where
the visible column header is not programmatically associated with each
row's field.

## line-components-ui-date-picker-input-tsx-L67

`client/components/ui/date-picker-input.tsx:67`

Bounds for the calendar's quick month/year dropdown jump: pick years
that make sense for what's being entered (e.g. a birthdate needs the
past; a batch expiry needs the future). Defaults span 100 years back to
10 years ahead, wide enough to never block a legitimate date.

## line-components-ui-date-picker-input-tsx-L116

`client/components/ui/date-picker-input.tsx:116`

Work from digits only: a slash can only ever come from the mask
itself, never from what the user types, so there's no way to end up
with a stray or doubled "/" no matter where they type or paste.

## line-components-ui-date-picker-input-tsx-L120

`client/components/ui/date-picker-input.tsx:120`

Reject (don't just clamp) any digit that would make the day or month
segment impossible to complete validly, e.g. typing "9" as the first
day digit, or "2" as the first month digit, is dropped rather than
producing a nonsense date like day 39 or month 20. Anyone trying to
type a month/year-only date (e.g. "11/2027") hits this on the very
first digit of the "month" segment, instead of silently discarding
their whole entry only once they reach 8 digits.

## block-components-ui-date-range-picker-tsx-L99

`client/components/ui/date-range-picker.tsx:99`

Dual-month range calendar + preset sidebar + editable start/end text
inputs in one popover. Uses DD/MM/YYYY to stay consistent with every
other date input already in this app.

## line-components-ui-dialog-tsx-L63

`client/components/ui/dialog.tsx:63`

max-h + overflow-y-auto: without a height cap, a dialog taller
than a short viewport (small laptop, landscape phone) simply
overflows past the screen with no way to reach its own footer/
close button. Capped and scrollable, matching the existing
max-w-[calc(100%-2rem)] margin convention.

## block-components-ui-drawer-tsx-L39

`client/components/ui/drawer.tsx:39`

Skips the default bg-muted grab handle so a caller with its own
full-bleed colored header (which the default handle's white backdrop
would otherwise stack a visible seam above) can render its own handle
inside that header instead.

## block-components-ui-editable-number-cell-tsx-L3

`client/components/ui/editable-number-cell.tsx:3`

A number input that tracks its own text while typing instead of mirroring
the committed number on every keystroke. Without this, clearing the field
to type a fresh value immediately re-renders as "0" (parsing "" forces a
0 commit, which round-trips back into the controlled `value`), so you'd
have to type a digit first then delete the stray 0 rather than just
clearing and typing. Here, an empty/partial field is allowed to sit as-is
until a valid number is typed (which commits immediately) or the field is
blurred still empty (which reverts to the last committed value). Shared
across every quick-edit numeric input in the app (cycle count ledger,
product catalog quick-edit) rather than reimplemented per table.

## block-components-ui-editable-number-cell-tsx-L13

`client/components/ui/editable-number-cell.tsx:13`

`undefined` renders as an empty field (and shows `placeholder`), which is
distinct from 0 - a cycle-count row nobody has reached yet is not a count
of zero.

## block-components-ui-editable-number-cell-tsx-L51

`client/components/ui/editable-number-cell.tsx:51`

Fired after the built-in revert-if-invalid blur logic, and also on
Enter (which just blurs the input) — lets a caller treat blur as
"finalize this edit" without duplicating the invalid-value handling.

## block-components-ui-editable-number-cell-tsx-L55

`client/components/ui/editable-number-cell.tsx:55`

Fired on Escape, instead of blurring: lets a caller close the edit
without treating it as a commit (blurring would run the normal
onBlur/save path, which Escape should explicitly bypass).

## block-components-ui-editable-number-cell-tsx-L59

`client/components/ui/editable-number-cell.tsx:59`

Accessible name for the input. These cells live in dense ledger tables
where the only label is a column header that is not programmatically
associated with each row, leaving the input unnamed for screen readers
and for any test that wants to address one row's field.

## block-components-ui-editable-number-cell-tsx-L64

`client/components/ui/editable-number-cell.tsx:64`

Shown while the field is empty - e.g. the system figure a cycle count
is being compared against, so a blank cell still says what it is
blank against.

## block-components-ui-editable-number-cell-tsx-L68

`client/components/ui/editable-number-cell.tsx:68`

When provided, blurring an empty field reports the value as cleared
instead of reverting to the last committed number. Only a caller whose
`value` is genuinely optional (an uncounted cycle-count row) should pass
this; without it, blur-while-empty keeps its original revert behaviour.

## line-components-ui-editable-number-cell-tsx-L78

`client/components/ui/editable-number-cell.tsx:78`

Skipped while focused: this effect exists to pick up an external
(non-user-typed) change to `value` — e.g. another row's edit
recalculating this one — while the field is idle. While the user is
actively typing, `onChange` below already keeps `value` in lockstep
for every valid intermediate value; re-running this resync mid-entry
clobbered a leading-zero decimal ("0.05") back to "0" the instant the
trailing digits made the parsed number equal 0 again after the "0."
prefix was typed (see docs/KNOWN_BUGS.md).

## block-components-ui-empty-state-tsx-L22

`client/components/ui/empty-state.tsx:22`

Generic "nothing here" state for list/table/card views: icon, message, and
an optional actionable link or button. Callers decide the action (if any) -
this component has no role/permission logic of its own.

## block-components-ui-filter-pill-tsx-L25

`client/components/ui/filter-pill.tsx:25`

Bunched-up "Label: value" dropdown filter. Replaces a row of one-per-value
quick-filter chips with a single pill that opens a picker, so a long list
(categories, inventory conditions, etc.) doesn't have to be laid out flat.

## block-components-ui-loading-overlay-tsx-L6

`client/components/ui/loading-overlay.tsx:6`

0-100. Omit for an indeterminate spinner only - pass this when there
are real stages to report. Steps with no progress hook of their own
(e.g. a PDF worker that only reports back once, at the end) will hold
the bar at its pre-step value and jump when they resolve - that's
expected, not a bug.

## block-components-ui-loading-overlay-tsx-L12

`client/components/ui/loading-overlay.tsx:12`

Shows a Cancel button when provided. Only wire this up for steps that
can actually be aborted cleanly (e.g. terminating a Web Worker) - for a
synchronous main-thread step there's nothing to cancel into.

## block-components-ui-loading-overlay-tsx-L18

`client/components/ui/loading-overlay.tsx:18`

Full-viewport overlay for work that runs long enough to look like the app
hung with no feedback at all - whether that's genuinely blocking the main
thread, or just a slow off-thread/async step with nothing else on screen
to show for it. Mount it, then yield a frame (e.g.
`await new Promise(r => requestAnimationFrame(r))`) before starting a
synchronous step, so the overlay actually gets to paint first.

## block-components-ui-metric-card-tsx-L26

`client/components/ui/metric-card.tsx:26`

Tailwind only generates classes it can find as literal substrings in
source, so a concatenated class like `bg-${color}-500/30` silently
renders nothing — every branch here must spell the full class out.

## line-components-ui-pin-pad-tsx-L28

`client/components/ui/pin-pad.tsx:28`

Passed explicitly rather than relying on the `value` prop: this fires
synchronously right after onChange, before React applies the state
update, so the `value` closure here would still be one digit behind.

## block-components-ui-product-combobox-tsx-L31

`client/components/ui/product-combobox.tsx:31`

Called only when the value is cleared via the explicit clear (X)
button, not when the user backspaces the field to empty. Lets
consumers reset fields that were autofilled from the selection
without wiping them out on incidental retyping.

## block-components-ui-product-combobox-tsx-L39

`client/components/ui/product-combobox.tsx:39`

When false, the dropdown only shows real catalog matches and the
"create new" fallback — never the static reference-list ("Suggested")
names. Used by PO item search, where catalog results and non-catalog
name suggestions must never appear in the same list. Defaults to true
to preserve existing behavior (e.g. the new-product name field, where
suggesting non-catalog names is exactly the point).

## block-components-ui-product-combobox-tsx-L46

`client/components/ui/product-combobox.tsx:46`

Fired only when the user explicitly clicks "Add "X" as new product",
not on every keystroke. Optional — callers that don't pass it keep the
existing onChange({ source: "new" }) behavior for that click.

## block-components-ui-product-combobox-tsx-L50

`client/components/ui/product-combobox.tsx:50`

When false, never renders the pinned "Create ... as new product" row.
Used where this combobox names a product that's already being created
(the Add/Edit Product dialog's own name field) — offering to "create"
the very product you're naming doesn't make sense there. Defaults to
true everywhere else (e.g. PO item search, where it's the only way to
add a product that isn't in the catalog yet).

## block-components-ui-product-combobox-tsx-L57

`client/components/ui/product-combobox.tsx:57`

Shows a leading search icon, matching the shared SearchInput
component's look used on other list pages. Hidden below the `sm`
breakpoint to keep the input's typing area from feeling cramped on
phones. Defaults to false to preserve existing callers' appearance
(e.g. the Add/Edit Product dialog's name field, which isn't a search
bar).

## block-components-ui-product-combobox-tsx-L64

`client/components/ui/product-combobox.tsx:64`

Forwarded straight to the underlying input - lets a caller (e.g. the
PO item search bar) focus it programmatically, on mount or from an
empty-state action button.

## block-components-ui-product-combobox-tsx-L68

`client/components/ui/product-combobox.tsx:68`

Catalog to search, when the caller already holds one. Every instance
otherwise runs its own useProductList query for the same full catalog,
which the PO builder pays for twice over (once here, once through
useProcurementData). Omitted, the internal query is used exactly as
before, so no other caller changes.

## line-components-ui-product-combobox-tsx-L131

`client/components/ui/product-combobox.tsx:131`

The input keeps DOM focus and drives this list via
aria-activedescendant, so options are not themselves tabbable.
onMouseDown (not onClick) + preventDefault so the input never blurs
(a blur would close the list before a click event could fire).

## line-components-ui-product-combobox-tsx-L216

`client/components/ui/product-combobox.tsx:216`

Stable per-instance id prefix so the input's aria-activedescendant can
point at the active option, and so two comboboxes on one page never
collide.

## block-components-ui-product-name-tsx-L13

`client/components/ui/product-name.tsx:13`

One product name, rendered the way the store asked for it and readable
even when its column cannot hold it. Reveals the full name on hover, or
on tap on a touch device, and only when it is actually clamped.

Block-level by default, for the table cell it usually fills; pass
`className="inline-block max-w-full align-bottom"` to sit it inside a
sentence.

Names are stored lowercase (withNormalizedName in base-helpers.ts), so any
render without the store's casing class shows raw storage casing. In a
dense ledger the name is also the only thing identifying the row. See
client/AGENTS.md.

## line-components-ui-product-name-tsx-L42

`client/components/ui/product-name.tsx:42`

Measured into a ref at the moment the tooltip is asked to open, not
into state: whether the name is clamped depends on the rendered column
width, which no prop knows, and a state round-trip would decide one
render too late - i.e. never on the first hover.

## line-components-ui-responsive-modal-tsx-L52

`client/components/ui/responsive-modal.tsx:52`

useMediaQuery starts at `false` on every first render (SSR/static-export
safe) and corrects itself in an effect right after mount. Rendering
Dialog or Drawer off the uncorrected value would mount the wrong one
first when this modal happens to already be `open` at that moment, and
swapping mid-open once the real value lands is what used to leave
`document.body.style.pointerEvents` stuck (two scroll-lock
implementations racing). Rendering nothing until mounted skips that
race: React batches the `mounted` and corrected-`isDesktop` effects
into one re-render, so the first real render already has the right
answer and only ever mounts one of the two.

## line-components-ui-scroll-fade-tsx-L20

`client/components/ui/scroll-fade.tsx:20`

Content grows asynchronously (data loads after mount) without the
scroll container's own box size changing, so we watch the unclipped
content wrapper instead: that's what actually reflects scrollHeight.

## block-components-ui-scroll-fade-tsx-L75

`client/components/ui/scroll-fade.tsx:75`

Left/right counterpart to ScrollFade, for the horizontal metric and card
strips that deliberately hide their scrollbar (`.hide-scrollbar`): without
a scrollbar and without this, a strip cut off at the viewport edge looks
like the full set rather than the start of a longer one.

It owns the scroll element itself (rather than wrapping an existing one)
so the fades can't drift from what actually scrolls.

## block-components-ui-scroll-to-top-button-tsx-L8

`client/components/ui/scroll-to-top-button.tsx:8`

The virtualized list's own scroll container - the same ref its
virtualizer already holds, so the button can never track a different
element than the one that actually scrolls.

## block-components-ui-scroll-to-top-button-tsx-L17

`client/components/ui/scroll-to-top-button.tsx:17`

Long virtualized lists have no way back to the top short of flicking for
several seconds; there is no "scroll to bottom" counterpart because the
end of a list is not a destination anyone asks for here.

Positioned as a portaled fixed element measured off the scroll container's
own bounding rect, rather than an absolutely positioned child: the lists
this drops into sit inside cards and panels with their own overflow and
transform contexts, either of which would clip or re-anchor a plain
absolute/fixed child.

## block-components-ui-search-input-tsx-L10

`client/components/ui/search-input.tsx:10`

Accessible name for the input. A placeholder is not an accessible name
(it disappears as soon as anything is typed, and some screen readers
ignore it entirely), so pass something that says WHAT is being searched,
e.g. "Search products". Falls back to the placeholder text when omitted,
which is a weaker but non-empty name.

## block-components-ui-searchable-input-tsx-L17

`client/components/ui/searchable-input.tsx:17`

Escape closes the suggestion dropdown either way; this additionally
signals "cancel the whole edit", for callers that treat this input as a
commit-on-blur editable cell rather than a plain filter field.

## block-components-ui-searchable-input-tsx-L21

`client/components/ui/searchable-input.tsx:21`

Fired with the definitive final value whenever Enter or a dropdown
click commits one — a caller reading `value`/onValueChange's own state
instead would see it a render behind here, since selecting an option
calls onValueChange and this in the same synchronous handler.

## line-components-ui-searchable-input-tsx-L56

`client/components/ui/searchable-input.tsx:56`

The portaled menu (see below) lives outside containerRef's own DOM
subtree, so the click-outside check below needs its own ref to still
recognize a click on an option as "inside" instead of closing the menu
out from under it before the click can land.

## line-components-ui-searchable-input-tsx-L62

`client/components/ui/searchable-input.tsx:62`

Rendered via a portal (see below) instead of a plain absolutely
positioned child, since every caller so far embeds this inside a
scrollable table/list (catalog-list.tsx's `overflow-y-auto` row
container): a CSS-absolute dropdown positioned relative to an ancestor
inside that container gets clipped by the container's own overflow
the moment it would extend past the visible scroll area, no matter how
high its z-index is — z-index can't override an ancestor's clipping.
Portaling to <body> with `position: fixed` coordinates computed from
the input's own bounding rect escapes every ancestor's overflow/stacking
context, the same way Radix's Popover/DropdownMenu do internally.

## line-components-ui-searchable-input-tsx-L73

`client/components/ui/searchable-input.tsx:73`

Stable per-instance ids: the input keeps DOM focus and points at the
highlighted option through aria-activedescendant, so each option needs
its own id and two of these on one page must not collide.

## line-components-ui-sonner-tsx-L18

`client/components/ui/sonner.tsx:18`

Toasts already support swipe-to-dismiss (sonner's built-in pointer
gesture), but the default for a centered position is "swipe up"
only. Allow left/right too since that's the more familiar mobile
dismiss gesture.

## block-components-ui-sortable-header-cell-tsx-L11

`client/components/ui/sortable-header-cell.tsx:11`

Shared "click to sort, click again to flip direction" header cell -
reused across every sortable table (see lib/hooks/use-sortable-data.ts)
so the interaction and indicator icon stay consistent app-wide.

## block-components-ui-table-pagination-tsx-L21

`client/components/ui/table-pagination.tsx:21`

Standard footer for any paginated table: rows-per-page selector, the
current range being shown, and page A of B with prev/next. Shared so
every paginated table in the app looks and behaves the same way.

## line-components-ui-tabs-tsx-L40

`client/components/ui/tabs.tsx:40`

The container is horizontally scrollable, which makes Chrome put it in
the tab order so keyboard users can scroll a long tab list. Give it a
visible focus ring instead of removing it from the tab order.

## block-components-ui-tooltip-tsx-L25

`client/components/ui/tooltip.tsx:25`

Radix's hover/focus-based trigger doesn't respond to touch, so on
touch devices this manages its own controlled `open` state and lets
TooltipTrigger toggle it on tap instead.

## line-components-ui-tooltip-tsx-L67

`client/components/ui/tooltip.tsx:67`

Toggle the touch-controlled open state alongside whatever this
trigger's own click does (navigate, submit, etc.) — never
preventDefault here: it doesn't stop other composed onClick
handlers (a plain <button>'s onClick fires regardless), but it
does make next/link check event.defaultPrevented and skip its
own router.push(), silently cancelling navigation on the first
tap for any tooltip-wrapped Link (exactly the iPad "first tap
only shows the tooltip, second tap navigates" bug this caused).

## block-e2e-activity-log-spec-ts-L3

`client/e2e/activity-log.spec.ts:3`

Activity Log itself is NOT plan-gated (no <LockedModuleOverlay> wraps
app/(dashboard)/activity-log/page.tsx, unlike Expenses/Procurement/
Prescriptions) — confirmed by reading the page and
components/dashboard/locked-module-overlay.tsx's featureKey union, which
has no "activity_log" entry ("audit" there maps to `canUseAuditMode`,
a separate stock cycle-count feature, not this page).

The *traceable action* used to generate an entry (adding an Expense) IS
gated behind the paid tier, though, so this spec still needs the same
`loginAsPaidTier` dev-only escape hatch (fixtures.ts) expenses.spec.ts
uses against its own isolated per-test copy of the local DB (the shared
free-tier fixture, e2e/.auth/test-db.bin, is intentionally left free-tier
for other specs that test LockedModuleOverlay itself).

## line-e2e-auth-spec-ts-L11

`client/e2e/auth.spec.ts:11`

Since the database is seeded by global.setup.ts, we should see the
traditional login form (components/auth/traditional-login-form.tsx).
This test's whole point is checking the login page's actual fields, so
it asserts against them directly rather than going through the shared
login() helper. The username field is still a placeholder-based text
input ("admin"), but the PIN field switched to an InputOTP (4 slots,
no '••••' placeholder) - confirmed both by reading the component and
live in Chrome.

## line-e2e-auth-spec-ts-L37

`client/e2e/auth.spec.ts:37`

This test only needs to get logged in and check the result - it
doesn't need to inspect the login form's own fields (that's covered
above), so it can use the shared login() helper directly instead of
duplicating the fill-in steps.

## block-e2e-expenses-spec-ts-L3

`client/e2e/expenses.spec.ts:3`

Expenses is gated behind a paid tier (`!isFree` fallback in
lib/hooks/use-feature-gate.ts, and explicitly `"expenses": false` for the
free tier in both the local and remote subscription_plans config), same as
Procurement. The shared e2e fixture (e2e/.auth/test-db.bin) is a free-tier
store on purpose — other specs (prescriptions.spec.ts,
pos-held-transaction.spec.ts) rely on that to test LockedModuleOverlay
itself — so this spec elevates its own isolated per-test copy of the local
DB instead of touching the shared fixture (via the shared `loginAsPaidTier`
helper in fixtures.ts). Without this, these tests were unknowingly racing
LockedModuleOverlay's mount: the overlay took ~1s to actually paint after
navigation, so a fast single "Add Expense" (the original test) usually
beat it, but the slower edit-then-delete flow (create, edit, re-open,
delete) reliably lost the race and got its row click intercepted by the
overlay's "Upgrade Plan" backdrop once it finally mounted, still correctly
locked.

## block-e2e-fixtures-ts-L5

`client/e2e/fixtures.ts:5`

Logs into the seeded test store (username "admin", PIN "1234") and waits
for the dashboard to render. Centralized here so every spec uses the same
selectors as the real login form (components/auth/traditional-login-form.tsx)
instead of each spec guessing its own copy that can drift out of sync.

## line-e2e-fixtures-ts-L11

`client/e2e/fixtures.ts:11`

Skip the first-login onboarding tour (components/dashboard/dashboard-tour.tsx):
its react-joyride overlay otherwise intercepts pointer events on the
sidebar/header for every fresh test-store session and blocks clicks.

## line-e2e-fixtures-ts-L18

`client/e2e/fixtures.ts:18`

PIN field is an InputOTP (components/auth/traditional-login-form.tsx), not a
placeholder-based text input - '••••' hasn't matched anything since that
component switched to InputOTP. Same selector global.setup.ts already uses
for the analogous OTP field on /setup.

## block-e2e-fixtures-ts-L27

`client/e2e/fixtures.ts:27`

Logs in, then elevates the current per-test copy of the local DB to a
paid tier via the dev-only `window.__e2eSetSubscriptionTier` hook
(`lib/db/core.ts`), reloading so every tier-gated component (feature-gate
hooks, LockedModuleOverlay, etc.) mounts fresh already reading the
elevated tier. Use this instead of a bare `login()` for any spec that
exercises a paid-tier-gated module (Expenses, Procurement, Activity Log
fixtures that route through Expenses, Settings' Staff/Security/Data
tabs, ...) — the shared fixture DB (`e2e/.auth/test-db.bin`) is
deliberately left free-tier for other specs that test the lock overlay
itself, so tier elevation happens per-test, in-browser, never by mutating
the checked-in fixture file. Call this any time after login, before the
tier-gated content is needed — there's no requirement to call it before
navigating past /login.

Fails loudly (via the thrown Error inside `page.evaluate`) if the dev
hook is ever missing, instead of silently no-oping and producing a
confusing downstream LockedModuleOverlay-interception timeout.

## line-e2e-global-setup-ts-L18

`client/e2e/global.setup.ts:18`

Registration now always creates a real cloud account first (see
use-onboarding.ts's handleRegister: a local-only id can never be
reconciled with a server id later), and the server enforces BOTH email
and username uniqueness (`unique:users`) globally across every account
on the shared dev backend - not just within this store. A fixed
"admin"/fixed-email pair would collide with the very first successful
run and fail every run after with a 422 ("has already been taken"),
which used to get masked by too-loose a waitForURL match below (it
matched "/login?tab=setup&step=register" - the failure page - just as
happily as "/dashboard"). Both are timestamp-suffixed to stay unique per
run against that persistent backend.

## block-e2e-pos-held-transaction-spec-ts-L3

`client/e2e/pos-held-transaction.spec.ts:3`

Regression coverage for POS's hold/recall ("park sale") flow.

Found uncovered while smoke-testing POS (docs/features/pos.md): grepping
__tests__/, e2e/, and components/pos/ for "held_transaction"/"hold" turned
up zero test files touching the feature, despite held_transactions being a
real, user-facing table (lib/db/schema.ts) wired into pos-system.tsx via
usePOSHeldTransactions (lib/hooks/use-pos-held-transactions.ts).

The riskiest failure mode is silent: handleRecallTransaction rebuilds cart
lines from the held row's items_json by looking each item back up in the
live products list (`products.find(m => m.id === item.product_id)`), and
`.filter((item): item is CartItem => item !== null)` drops a miss with no
error. A product renamed, deactivated, or simply not yet loaded in that
list would silently shrink the cart on recall - the cashier would see a
shorter total, not a warning. This test asserts a multi-item cart, with a
discount applied, survives a hold + recall byte-for-byte (quantities,
item count, and the charged total after checkout).

Note: the Cycle Count screen here (Physical Inventory: search + inline
"Counted Qty" cell + "Review & submit" + "Submit audit") is the *current*
UI, verified live against the running app. It differs from the
select-a-category-then-"Start count" flow older specs
(sales-lifecycle.spec.ts) still assert - that flow no longer exists and
those assertions are stale, a pre-existing/unrelated breakage, not
something this test should route around.

## block-e2e-prescriptions-spec-ts-L3

`client/e2e/prescriptions.spec.ts:3`

Baseline flow coverage for Prescriptions (docs/features/prescriptions.md):
zero e2e coverage existed for this module before this test.

The New Prescription form's medication picker only offers products with a
real positive-quantity stock batch (getAvailableStockBatches() in
lib/db/queries/inventory.ts, used by use-new-prescription.ts), and the seeded
test store starts with zero products. The quick-add product dialog has no
initial-stock field by design (see e2e/sales.spec.ts) — Cycle Count is the
only stock-granting path a fresh free-tier store can reach (Procurement is
gated behind a paid tier), so this test creates a product and gives it
stock the same way e2e/pos-held-transaction.spec.ts does before touching
Prescriptions at all.

## line-e2e-prescriptions-spec-ts-L21

`client/e2e/prescriptions.spec.ts:21`

The seeded test store's Business Vertical defaults to "General", which
hides the Prescriptions nav link entirely (dashboard-sidebar.tsx only
renders it when storeType === "pharmacy") and locks the module behind
LockedModuleOverlay even if navigated to directly
(lib/hooks/use-feature-gate.ts's canUsePrescriptions requires
store_type === "pharmacy" unconditionally — see
docs/features/prescriptions.md). Switch it first, the same real-write
path a store owner would use (Settings > Business Info).

## block-e2e-procurement-spec-ts-L3

`client/e2e/procurement.spec.ts:3`

Procurement is gated behind a paid tier (`!isFree` fallback in
lib/hooks/use-feature-gate.ts) via `<LockedModuleOverlay featureKey="procurement" />`
in app/(dashboard)/procurement/page.tsx, same as Expenses. The shared e2e
fixture (e2e/.auth/test-db.bin) is deliberately free-tier, so both tests
here elevate their own isolated per-test copy of the local DB via the
shared `loginAsPaidTier` helper (fixtures.ts) instead of touching the
shared fixture — see findings-log finding #9 (Expenses), whose exact
overlay-mount race root cause also applied here.

## line-e2e-procurement-spec-ts-L29

`client/e2e/procurement.spec.ts:29`

Only the viewport's own create view is mounted now (the pages render
one or the other rather than hiding one with CSS), but keep the
visible-instance match so this holds either way.

## line-e2e-procurement-spec-ts-L34

`client/e2e/procurement.spec.ts:34`

4b. Continue to the item-entry step (components/procurement/po-item-builder.tsx,
introduced in commit 113a368c, replaced the old "Add Items to Order"
section/separate-Add-button flow this test used to assert on).

## line-e2e-procurement-spec-ts-L43

`client/e2e/procurement.spec.ts:43`

5. Test Quick Add Product flow trigger
Type a product name that doesn't exist (components/procurement/po-item-builder.tsx
-> components/ui/product-combobox.tsx)

## line-e2e-procurement-spec-ts-L57

`client/e2e/procurement.spec.ts:57`

Click the pinned "Create ... as new product" row — selecting a product
combobox option now adds/opens directly, there is no separate "Add"
button anymore (product-combobox.tsx's AddNewProductOption).

## line-e2e-procurement-spec-ts-L77

`client/e2e/procurement.spec.ts:77`

Closes the exact gap flagged in docs/features/procurement.md: the
pre-existing test above only opens the Quick Add Product dialog and
never submits/sends/receives an order, so receivePurchaseOrder()
(lib/db/procurement-receiving.ts) — the Standard PO receiving path —
had zero e2e (or unit) coverage before this test.

## line-e2e-product-import-spec-ts-L4

`client/e2e/product-import.spec.ts:4`

Regression coverage for the Inventory > Catalog > Import flow: the exact
UI surface that shipped two real production bugs (a bulk-import
invalidation-storm freeze, and a background-sync race) with zero
e2e-level test coverage - only Vitest logic tests existed for
parseWorkbookSheet()/importProductRows(), never the dialog/sheet-picker
UI itself. This spec exercises the multi-sheet workbook path end to end
without ever clicking "Import N Row(s)", so it never writes rows into
the test store's database.

## line-e2e-product-import-spec-ts-L23

`client/e2e/product-import.spec.ts:23`

Sheet picker: the fixture has 3 sheets (Sheet1: 3 rows, Sheet2: 2 rows,
Sheet3: 0 rows), mirroring the shape of the real 3-sheet QuickBooks
export that originally triggered these bugs.

## line-e2e-product-import-spec-ts-L34

`client/e2e/product-import.spec.ts:34`

Column-mapping step: auto-mapping should match all 6 QuickBooks-shaped
columns (Item Number, Item Name, Average Unit Cost, Regular Price,
Department Name, Qty 1) and report Sheet1's 3 data rows.

## line-e2e-product-import-spec-ts-L41

`client/e2e/product-import.spec.ts:41`

Close without importing - this spec only verifies the dialog's own
UI/state machine, not the write path (covered separately by the
parseWorkbookSheet()/importProductRows() Vitest tests).

## line-e2e-products-spec-ts-L7

`client/e2e/products.spec.ts:7`

Navigate to products via sidebar: /inventory redirects to /inventory/overview,
so go to the Catalog tab directly (a click-through would pass the mouse near
the collapsed sidebar's hover-peek strip and risk intercepting the tab click).

## block-e2e-reports-spec-ts-L3

`client/e2e/reports.spec.ts:3`

Reports (app/(dashboard)/reports/page.tsx) has no plan-tier gate at all —
confirmed by reading lib/hooks/use-feature-gate.ts (its featureKey union
has no reports/analytics/daily_close entry) and the page itself (no
LockedModuleOverlay anywhere). Access is role-gated only: Operational
Reports and Analytics & Insights tabs only render for isAdmin, everyone
else lands on Daily Close. The shared e2e fixture's "admin" user is a
Store Owner, so no elevateToPaidTier-style workaround is needed here
(unlike expenses.spec.ts / procurement.spec.ts).

## line-e2e-reports-spec-ts-L20

`client/e2e/reports.spec.ts:20`

Default tab (no ?tab= param) is Operational Reports for admins
(isAdmin ? "reports" : "daily_close" in app/(dashboard)/reports/page.tsx) -
confirm the Report Center's 6 report cards render, each with
Export/Print actions, not an error/blank state.

## line-e2e-reports-spec-ts-L32

`client/e2e/reports.spec.ts:32`

Exact, because "Net Cash Expected" (cash sales less the day's cash
expenses) now sits below the payment-method row and a loose /Cash
Expected/i matches both.

## block-e2e-sales-lifecycle-spec-ts-L3

`client/e2e/sales-lifecycle.spec.ts:3`

Full golden-path lifecycle test using realistic pharmacy data (not
"Test Product 1" placeholders), covering the flow a real demo/store walk-
through exercises end to end: stock a real medicine via a cycle count,
sell it with a discount, log a real expense, and confirm the dashboard/POS
tiles reflect all of it correctly.

Stock is added via Inventory -> Cycle Count rather than Procurement,
because Procurement is gated behind a paid subscription tier (Starter and
above); a fresh free-tier store like this test's seeded fixture can't
reach it. Cycle Count isn't tier-gated and is the other real path to
getting stock into the system.

## line-e2e-sales-spec-ts-L19

`client/e2e/sales.spec.ts:19`

The seeded test store has no products yet, so create one via the catalog.
The quick-add form has no initial-stock fields (removed by design: stock
is only ever added via receiving a purchase order or a stock audit), so
a freshly created product always starts at zero stock.

## block-e2e-settings-spec-ts-L3

`client/e2e/settings.spec.ts:3`

Settings had zero dedicated e2e or unit coverage before this task (see
docs/features/settings.md, Step 3) despite being the single tab group
with the widest blast radius in the app — a role change or a sync
setting can silently affect every other feature. Given 21 sub-tabs, this
spec deliberately does NOT try to cover all of them: it follows the
brief's instruction to prioritize by blast radius, covering `staff`
(permission/role changes), `security` (auto-lock), `data`/`cloud` (sync
settings, directly tied to Task 0's sync-queue transaction race fix),
and `roles` (the permission matrix). Purely cosmetic tabs like
`appearance`/`general` (theme/color/sidebar — device-local preferences
with no business-state impact) are scoped out on purpose, not silently
skipped.

Auto-Lock (Security) and Auto-Sync (Data) are both paid-tier features
(`canAutoLock`/`canCloudSync` in lib/hooks/use-feature-gate.ts, both
`!isFree` fallbacks), and Staff account creation is capped at 0 seats on
the free tier (`maxStaffAccounts`). The shared e2e fixture
(e2e/.auth/test-db.bin) is a free-tier store on purpose (other specs rely
on that to test LockedModuleOverlay), so this spec elevates its own
per-test copy via the same dev-only `window.__e2eSetSubscriptionTier`
hook `expenses.spec.ts` established, then reloads so every
`useFeatureGate()` consumer picks up the elevated tier from a clean
mount (via the shared `loginAsPaidTier` helper in fixtures.ts).

## line-e2e-stock-transfer-spec-ts-L3

`client/e2e/stock-transfer.spec.ts:3`

Regression coverage for the Inventory > Ledger "Transfer Stock" entry
point (components/stock-batch/transfer-stock-dialog.tsx). The full
transfer flow (picking two different stores, a product, a quantity, and
confirming) needs a multi-store account and isn't exercisable against the
single-store seeded fixture (e2e/.auth/test-db.bin) this suite otherwise
shares - see lib/db/queries/stock-transfers.ts's Vitest suite for that
coverage instead. This spec only pins the gating behavior: a single-store
account (the seeded "admin" test user) has nothing to transfer between,
so the button must not appear and the rest of the ledger must render
exactly as it did before this feature.

## line-hooks-use-device-auth-status-ts-L9

`client/hooks/use-device-auth-status.ts:9`

Shared by the merged /login page's login and setup tabs so switching
between them never re-runs this check or shows a second loading spinner.
Each used to run this independently (useLogin + useOnboarding both had
their own copy), which caused a "loading" flash on every tab switch even
though the underlying answer never changes mid-session.

## line-hooks-use-login-ts-L7

`client/hooks/use-login.ts:7`

Device/account status (userCount, recentUsers, isChecking) now lives in
useDeviceAuthStatus, shared with the setup tab on the merged /login page.
This hook only owns the login form itself.

## line-hooks-use-login-ts-L28

`client/hooks/use-login.ts:28`

Left `isLoading` true: router.push() doesn't await the route
transition, so resetting it here would flip the form back to its
idle state for one frame while /dashboard is still loading.
An inspection session renders at /inspect, not the dashboard:
DashboardLayout requires a staff user and would bounce it.

## line-hooks-use-login-ts-L42

`client/hooks/use-login.ts:42`

Surfaces the real failure (e.g. a lockout countdown from
login-lockout.ts) instead of always claiming the database isn't
initialized, which misdiagnosed every other cause - same fix
already applied to lock-screen.tsx's equivalent catch block.

## line-hooks-use-media-query-ts-L4

`client/hooks/use-media-query.ts:4`

Always start at `false`, even on the client: this app is statically
exported (`output: "export"`), so the build has no `window` and bakes
`false` into the HTML. Lazy-reading the real matchMedia value here made
the client's first render disagree with that static HTML whenever the
real value was `true` (e.g. any desktop-width user), which React
reports as a hydration-mismatch crash — not a caught render exception,
so it never reached Sentry via the error boundary. Consumers that used
to rely on the real value being available immediately (ResponsiveModal
picking Dialog vs Drawer) should gate their first real render on a
`mounted` flag instead, rather than reaching for the value early here.

## block-hooks-use-media-query-ts-L31

`client/hooks/use-media-query.ts:31`

useMediaQuery plus the `resolved` flag a consumer needs before it may
branch its render on the answer. Because the raw hook deliberately starts
at `false` until its effect runs, choosing between a mobile and a desktop
component tree off the uncorrected value mounts the wrong one first and
then throws it away — a wasted mount plus a visible flash of the wrong
layout. React batches this hook's `resolved` effect with the underlying
one's correction into a single re-render, so the first render where
`resolved` is true already carries the real value.

## block-hooks-use-settings-tab-resolution-ts-L9

`client/hooks/use-settings-tab-resolution.ts:9`

Resolves `/settings/<tab>` to an internal tab, honouring the legacy aliases
and the one permission rule the tab rail, the mobile list and the URL all
share — so a hidden trigger and a typed URL can never disagree.

Extracted from use-settings.ts, which was at the 350-line limit.

## line-hooks-use-settings-tab-resolution-ts-L69

`client/hooks/use-settings-tab-resolution.ts:69`

openCloudLink is a useState setter (referentially stable); depending on
the whole sync-state object reran this on every render and reopened the
Link DumosRx Cloud dialog right after the user closed it. See
__tests__/settings-cloud-link-dialog-loop.test.ts.

## block-hooks-use-settings-ts-L17

`client/hooks/use-settings.ts:17`

Resolves the user's typed/selected auto-sync interval against the
store's plan-tier minimum. `0` (instant sync) is a real, meaningful
value distinct from "unset" — parseInt(rawInput) || 15 would silently
coerce "0" to 15 (0 is falsy), so this checks for NaN explicitly instead.
Extracted as a pure function so the clamp logic is unit-testable without
a StoreContext render harness.

## line-hooks-use-settings-ts-L58

`client/hooks/use-settings.ts:58`

"/settings" (root, isIndex) and "/settings/[tab]" are separate route
chunks even though they render the same SettingsClient — the sidebar's
<Link> only auto-prefetches whichever one it points to ("/settings"),
so landing there first and then clicking any tab (all of which share
this one "[tab]" chunk) pays a real first-time network+parse cost with
nothing yet on screen — the same gap confirmed live for Inventory's
Catalog/Movements tabs. Prefetching one representative tab warms that
shared chunk for every tab, not just this one; a no-op if we're
already on a "[tab]" route ourselves.

## line-hooks-use-smart-suggestions-ts-L6

`client/hooks/use-smart-suggestions.ts:6`

Category names are free-text and store-defined, so exact equality is too brittle
(e.g. a store's "Pain Relief" category should still match a rule authored as
"Analgesics" if either name contains the other). Substring matching in both
directions is forgiving of that naming drift without being a full fuzzy-match.

## line-hooks-use-smart-suggestions-ts-L53

`client/hooks/use-smart-suggestions.ts:53`

Symptom/condition clusters: any category in the cluster suggests every
other category in the same cluster (bidirectional co-purchase, not a
one-way pairing).

## line-hooks-use-smart-suggestions-ts-L89

`client/hooks/use-smart-suggestions.ts:89`

Fallback: no curated rule fired (small/uncatalogued store). Suggest other
in-stock products from the same category as what's already in the cart,
so the feature stays useful even without a matching rule.

## line-instrumentation-client-ts-L1

`client/instrumentation-client.ts:1`

Auto-loaded by Next.js on every page load in the browser. This app is a
static export (Tauri-bundled desktop/mobile, and FTP-deployed as-is to
app.dumosrx.com) with no server/edge runtime at all, so only this client
file applies; there is deliberately no sentry.server.config.ts /
sentry.edge.config.ts / instrumentation.ts.

## line-instrumentation-client-ts-L12

`client/instrumentation-client.ts:12`

Off on a developer's machine, sampled on the deployed dev build, full rate
in production. The per-environment table and why dev is sampled rather
than silenced: client/AGENTS.md, "What reaches Sentry".

## line-instrumentation-client-ts-L33

`client/instrumentation-client.ts:33`

The app already has a single deliberate crash choke point
(logCrash() in lib/utils/error-logger.ts) that logs locally first
(offline-first: the feedback table survives with no network) and
only then forwards to Sentry; everything routes through there
rather than scattering captureException calls or letting Sentry's
own automatic global error/rejection handlers fire independently,
which would otherwise double-report every uncaught error (once from
Sentry's default GlobalHandlers integration, once from logCrash).

## block-scripts-generate-precache-manifest-ts-L1

`client/scripts/generate-precache-manifest.ts:1`

Runs after `next build` (see package.json's "postbuild" script) against
the static export in `out/`. Writes `out/precache-manifest.json`: a flat
list of every URL the app shell needs to boot fully offline on a device
that has never opened it online before.

Why this exists instead of a real precache-manifest generator like
Workbox: `client/public/sw.js`'s own install handler previously had no
precaching at all - "content-hashed filenames from static export aren't
known ahead of time... without adding real build tooling" (its own
comment). This is that build tooling, kept deliberately small: no new
runtime dependency, no interaction with next.config.mjs's existing
withSentryConfig webpack wrapping (a second webpack-mutating plugin like
next-pwa stacked on top of that was judged riskier to verify than a
standalone script for the size of gap being closed here).

Every file under out/_next/** (hashed JS/CSS/build-manifest chunks) plus
every root-level file that isn't `.htaccess` (per-route HTML/.txt pages,
icons, manifest.json, the sql.js wasm binaries) is included - picking a
subset would require knowing which chunks a given route depends on ahead
of a specific build, which is exactly the problem a manifest avoids.

## line-scripts-generate-precache-manifest-ts-L61

`client/scripts/generate-precache-manifest.ts:61`

Also include every page's un-suffixed route form (e.g. "/dashboard" as
well as "/dashboard.html", "/" as well as "/index.html"): out/.htaccess
rewrites the extensionless route to its .html sibling server-side, but a
real navigation's request URL - and therefore the URL the service
worker's cache.match() looks up - is always the extensionless one. Only
caching the .html form left every route but "/" missing its actual
navigable cache key.

## line-scripts-generate-precache-manifest-ts-L109

`client/scripts/generate-precache-manifest.ts:109`

`urls` includes the extensionless route aliases added above (e.g.
"/dashboard" alongside "/dashboard.html") which have no file of their
own on disk - skipped here rather than crashing the postbuild, since
the .html file backing each one is already in this same list and
carries the same size information for fingerprinting purposes.

## block-scripts-release-ts-L1

`client/scripts/release.ts:1`

Release script for DumosRx desktop/mobile (Tauri).

Bumps the version in every file that needs to agree, commits, pushes,
and pushes a `vX.Y.Z` tag, which triggers .github/workflows/release.yml
(builds macOS/Windows/Linux/Android and deploys the updater feed).

Usage:
  npx tsx scripts/release.ts 0.0.28
  npm run release -- 0.0.28
  npx tsx scripts/release.ts 0.0.28 --dry-run   # preview only, no writes/commits/push
  npx tsx scripts/release.ts 0.0.28 --yes        # skip the confirmation prompt

See RELEASING.md at the repo root for the full process this automates.

## block-scripts-verify-schema-sync-ts-L39

`client/scripts/verify-schema-sync.ts:39`

The sync engine does not always write a client table to a server table of
the same name: `audit_logs` rows are applied to `activity_logs`, mirroring
SyncController's getModelForTable(). A separate, unused MySQL `audit_logs`
table also exists, so looking the client name up directly compared against
the wrong table entirely. Keep this in step with getModelForTable().

## line-scripts-verify-schema-sync-ts-L64

`client/scripts/verify-schema-sync.ts:64`

Inline `-- ...` comments contain commas of their own ("-- 'earned',
'redeemed'"), so splitting the raw block on commas both invented
phantom columns and swallowed the real column after the comment.

## line-scripts-verify-schema-sync-ts-L88

`client/scripts/verify-schema-sync.ts:88`

Find the STORE_SCOPED_TABLES block (the canonical list of synced,
store-scoped tables - moved here from core.ts's old inline syncColumns
array during the sync-engine extraction).

## line-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L1

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:1`

Copyright 2019-2023 Tauri Programme within The Commons Conservancy
SPDX-License-Identifier: Apache-2.0
SPDX-License-Identifier: MIT

## block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L10

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:10`

The last inserted `id`.

This value is not set for Postgres databases. If the
last inserted id is required on Postgres, the `select` function
must be used, with a `RETURNING` clause
(`INSERT INTO todos (title) VALUES ($1) RETURNING id`).

## block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L21

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:21`

**Database**

The `Database` class serves as the primary interface for
communicating with the rust side of the sql plugin.

## block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L33

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:33`

**load**

A static initializer which connects to the underlying database and
returns a `Database` instance once a connection to the database is established.

# Sqlite

The path is relative to `tauri::path::BaseDirectory::App` and must start with `sqlite:`.

@example
```ts
const db = await Database.load("sqlite:test.db");
```

## block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L56

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:56`

**get**

A static initializer which synchronously returns an instance of
the Database class while deferring the actual database connection
until the first invocation or selection on the database.

# Sqlite

The path is relative to `tauri::path::BaseDirectory::App` and must start with `sqlite:`.

@example
```ts
const db = Database.get("sqlite:test.db");
```

## block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L76

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:76`

**execute**

Passes a SQL expression to the database for execution.

@example
```ts
// for sqlite & postgres
// INSERT example
const result = await db.execute(
   "INSERT into todos (id, title, status) VALUES ($1, $2, $3)",
   [ todos.id, todos.title, todos.status ]
);
// UPDATE example
const result = await db.execute(
   "UPDATE todos SET title = $1, completed = $2 WHERE id = $3",
   [ todos.title, todos.status, todos.id ]
);

// for mysql
// INSERT example
const result = await db.execute(
   "INSERT into todos (id, title, status) VALUES (?, ?, ?)",
   [ todos.id, todos.title, todos.status ]
);
// UPDATE example
const result = await db.execute(
   "UPDATE todos SET title = ?, completed = ? WHERE id = ?",
   [ todos.title, todos.status, todos.id ]
);
```

## block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L123

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:123`

**select**

Passes in a SELECT query to the database for execution.

@example
```ts
// for sqlite & postgres
const result = await db.select(
   "SELECT * from todos WHERE id = $1", [ id ]
);

// for mysql
const result = await db.select(
   "SELECT * from todos WHERE id = ?", [ id ]
);
```

## block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L151

`client/src-tauri/vendor/tauri-plugin-sql/guest-js/index.ts:151`

**close**

Closes the database connection pool.

@example
```ts
const success = await db.close()
```
@param db - Optionally state the name of a database if you are managing more than one. Otherwise, all database pools will be in scope.

## block-test-support-console-noise-ts-L1

`client/test-support/console-noise.ts:1`

Log prefixes the app writes from fire-and-forget async work. These carry no
information a test run needs, and writing one after the last test has
finished is what strands a console rpc at worker teardown. See
client/AGENTS.md, "Console noise is suppressed in CI".

## block-test-support-console-noise-ts-L33

`client/test-support/console-noise.ts:33`

Wraps `log` and `warn` so a suppressible line is never written. `info` and
`error` are deliberately untouched: five test files assert on them, and
they are low-volume enough not to be worth the risk.

A no-op when `enabled` is false, which is how a local run keeps the output
a developer debugs with.

## line-vitest-setup-ts-L5

`client/vitest.setup.ts:5`

jsdom implements no matchMedia, and anything rendering the house Tooltip
(now including every product name) reads it to detect a touch device.
Defaults to the pointer path; a test wanting the touch path overrides it.

