# Settings

Route: `app/(dashboard)/settings/[tab]/page.tsx` → `SettingsPage`
(`app/(dashboard)/settings/[tab]/settings-client.tsx`), driven by the
`useSettings()` hook (`hooks/use-settings.ts` + `use-settings-form.ts` +
`use-settings-security.ts` + `use-settings-sync.ts`). The left-rail nav
(`settings-tab-nav.tsx`) groups tabs under Account / Business / Sales /
Inventory / System headings; non-admin users only ever see `appearance`,
`security`, and `notifications` (every other tab is gated by
`ADMIN_ONLY_TABS` in `use-settings-form.ts` and silently bounces back to
`appearance` if a non-admin lands on one directly).

## URL aliases

Several of the 21 tab names the brief lists are **not** distinct panels —
they're old/short URL aliases that `useSettings()`'s `TAB_ALIASES` map (plus
two special-cased renames) redirect to a canonical internal tab, so the
sidebar highlights the right item and the URL bar still shows the friendly
name:

| URL segment | Resolves to (internal tab) |
|---|---|
| `general` | `appearance` |
| `alerts` | `notifications` |
| `account` | `personal-info` |
| `store` | `business-info` |
| `cloud` | `data` (and opens the `CloudLinkDialog` if the store isn't cloud-linked yet) |

This document gives each of the 21 brief-listed names its own `##` heading
as requested, but the aliased ones point at their canonical section instead
of duplicating content.

## General (`general` → alias of `appearance`)

See **Appearance**, below — `general` is the exact same panel, just an older
URL. Confirmed live: `/settings/general` and `/settings/appearance` render
identically and both highlight "General" in the nav.

## Appearance

Panel: `AppearancePanel` (`panels/appearance-panel.tsx`), composed of
`theme-appearance-card.tsx`, `sidebar-preferences-card.tsx`, and
`regional-settings-card.tsx`. Fields:

- **Theme Mode** — Light / Dark / System, three big buttons. Client-only
  (via `next-themes`, `useTheme()`), no store write.
- **Color Themes** — 6 named palettes (Dumos Blue, Ocean Breeze, Emerald
  Health, Ruby Retail, Midnight Gold, Professional Slate).
- **Sidebar → Expand on hover when collapsed** — a switch controlling
  whether the collapsed sidebar peeks open on mouse hover.
- **Regional Settings** — Currency and VAT Percentage (store-level, admin
  edits these under Business Info's edit form, not here — this card is
  read-only display of the same fields).

**Verified live:** toggled Theme Mode to Dark, hard-navigated to
`/settings/appearance` again — Dark mode (and the selected Dumos Blue swatch
highlight) survived the reload. Reverted to Light before finishing the task.
This is a purely device-local (`localStorage`) preference, not a
store-profile field — it does not sync across devices/staff accounts.

## Account (`account` → alias of `personal-info`)

See **Personal Info**, below.

## Store (`store` → alias of `business-info`)

See **Business Info**, below.

## Personal Info

Panel: `AccountSettings` (`components/settings/account/account-settings.tsx`),
composed of `profile-settings.tsx`, `sessions-list.tsx`, and
`account-danger-zone.tsx`. Admin-only tab.

- **Personal Information** — First Name, Last Name, Email (read-only —
  "Emails cannot be changed"), Phone. Edit toggled via a pencil icon.
- **Sessions & Devices** — lists every login session (web / Client App /
  Impersonation Token) with IP and last-active timestamp, each with its own
  "Log out" action, plus a bulk "Log out of all other devices". This is real
  account session data pulled from the cloud backend, not local-only.
- **Danger Zone** — Clear Sales / Clear Logs / Clear Inventory / Clear
  Customers / Clear Terminals / Nuke Everything (Full Reset) / Request
  Account Deletion. These are destructive, irreversible, cloud-account-wide
  actions (per the page's own copy: "cannot be undone"). **Not exercised
  live** — this task's live-walkthrough store is a real, shared dev/demo
  account (Pikarestiv Stores 2, Pro trial), not an isolated fixture, so none
  of the Danger Zone buttons were clicked. This is a deliberate scoping
  decision, not an oversight.

## Business Info

Panel: `BusinessInfoPanel` (`panels/business-info-panel.tsx`). Admin-only.

- **Business Vertical** — Pharmacy / Grocery / Supermarket / General. "Switching
  modes changes the terminology and active modules" per its own copy — a
  store-wide, disruptive change. **Not exercised live** (store was left on
  Pharmacy, its existing vertical) to avoid altering terminology/modules for
  a shared dev account mid-task.
- **Your Contact Specialist** — read-only contact card (name/email, Call /
  WhatsApp buttons), not a setting.
- **Business Information** (edit-toggled via pencil icon) — Business Name,
  Registration/CAC Number, Address, Phone, Email, Business Logo upload.
- **Store Profile** — Store URL Slug (public storefront link), **Enable
  Online Store** switch, **Enable Loyalty Program** switch, PCN License
  Number, **Include Retail Items in Suggestions** switch.

**Enable Loyalty Program** — next to Enable Online Store, same visual
pattern. Backed by `stores.loyalty_program_enabled` (DEFAULT `1`/ON, so
existing Pro/Enterprise stores saw no behavior change when this was added).
Only meaningful on Pro/Enterprise plans (`canAccessLoyaltyProgramPlan`,
plan-tier only — deliberately *not* the combined `canUseLoyaltyProgram`,
since gating the switch's own visibility on the combined value would hide
it the moment it's turned off); on a lower plan, clicking it shows an
upgrade toast instead of enabling it, matching Enable Online Store's
existing convention. Turning it off hides the Redeem Reward control in POS
and stops loyalty point writes entirely — see `docs/features/pos.md`. The
same switch (same field, same `updateStoreProfile()` mutation) also appears
in the Loyalty Settings dialog (Customers → Loyalty tab → Edit Settings),
for convenience.

**Verified live:** toggled "Include Retail Items in Suggestions" on inside
edit mode, saved, hard-reloaded `/settings/business-info` — the toggle
correctly showed "Enabled" after reload, confirming the write persisted to
`storeProfile`. Left it enabled (a low-risk, easily-reversible setting) —
noted here for anyone reconciling this store's later state.

## Branches

Panel: `FleetOverview` + `MultiStoreCard` (`components/settings/store/`).
Admin-only. A list-management page (Add Store / edit / delete), not a
toggle-form — "Manage every store location on this account." On this store
the list was empty (single-location account); not exercised further since
adding a real store location is a heavier, harder-to-cleanly-revert action
than a toggle.

## Staff

Panel: `StaffManagement` (`components/settings/staff-management.tsx`) with
two sub-tabs: **Management** (list + add/edit/delete staff, search, Role/
Status filters, CSV export) and **Activities** (`staff-activities-tab.tsx`).
Admin-only. Header shows `TOTAL STAFF n / max` and `ACTIVE NOW n` stat
cards, gated by `maxStaffAccounts` (`useFeatureGate`) — this store's Pro
trial showed `3 / 10 max`.

Each staff row has an Edit dialog (`staff-form-dialog.tsx`): First/Last
Name, Username, New Login PIN (optional, "leave blank to keep existing"),
Email, System Role (`Admin (Local Master)` / `Manager (Admin)` /
`Specialist (Sub-account)` / `Sales Staff / Cashier` / `Auditor (Read-only)`
— from `STAFF_ROLES`), Assigned Store.

**Verified live:** edited "Pika Store1 Cashier2" from Sales Staff/Cashier →
Specialist, saved, hard-reloaded `/settings/staff` — the Role column
correctly showed "Specialist" after reload. Reverted back to Sales Staff /
Cashier and confirmed the revert also persisted, leaving the store's staff
roster unchanged from before this task.

**e2e coverage:** this is the highest-blast-radius tab in Settings (role
changes gate feature access app-wide), covered by `e2e/settings.spec.ts`
— see Step 4 below.

## Roles & Permissions (`roles`)

Component: `RolesPermissionsPlaceholder`
(`components/settings/roles-permissions-placeholder.tsx`). **This tab is not
implemented** — it renders a static "coming soon" card ("Custom staff roles
with fine-grained permissions are coming soon. For now, manage staff access
from the Staff page.") with no fields, toggles, or forms of any kind. It is
also `disabled` with a "Soon" badge in the nav rail
(`settings-tab-nav.tsx`'s `NAV_GROUPS`), though the route itself still
resolves fine if visited directly. There is nothing here to change or
persist — confirmed live by navigating to `/settings/roles` directly.

This matters for Step 4: the brief's e2e priority list names `roles`
alongside `staff`/`security`/`data` as a "change one real setting, reload,
assert it persisted" target, but there is no real setting on this page to
change. The e2e spec instead asserts the placeholder renders correctly and
documents this explicitly rather than silently faking a persistence
assertion against a static page.

## Payment Methods

Panel: `PaymentMethodsPanel` (`panels/payment-methods-panel.tsx`). Admin-only.

- **Payment Methods** — five switches: Cash, Card / POS, Transfer, Credit
  (Debt), Mixed Payment — "Toggle which payment methods your cashiers can
  accept at checkout." All five were enabled on this store.
- **Require Payment Destination Account** — switch; "Force cashiers to
  select which bank/terminal received Transfers or Card payments."
- **Payment Accounts** — list of named destination accounts (bank/mobile
  money/terminal), each with its own Edit; "Add Account" button.

**Verified live:** toggled "Require Payment Destination Account" on,
hard-reloaded — persisted as Enabled. Reverted it off afterward (its
original state).

## Receipt Settings

Panel: `ReceiptSettingsPanel` (`panels/receipt-settings-panel.tsx`),
composed with a live receipt preview (`receipt-preview.tsx`). Admin-only.

- **Printer Paper Size** — Thermal (80mm) / A4 / Standard paper. Explicitly
  called out in the UI as **"This device only: a receipt printer is a
  property of this terminal, not your account"** — i.e. `localStorage`-scoped
  per browser/device, not a `storeProfile` field like the rest of this tab.
- **Store Logo** — "Managed under Business Information above" (not editable
  here).
- **Footer Message 1 / 2** (optional custom receipt footer text).
- **Show Logo on Receipt**, **Show Phone & Address**, **Hide "Powered by
  dumosrx.com"** — three switches, editable via the section's pencil icon.
- **Live Preview** — renders an actual sample receipt reflecting the current
  form values in real time.

**Verified live:** changed Printer Paper Size from Thermal (80mm) → A4 /
Standard paper (no edit-mode needed — this one field is directly
interactive), hard-reloaded `/settings/receipt-settings` — persisted as A4.
Reverted to Thermal (80mm) afterward. Confirms the per-device/`localStorage`
scoping claim in the UI copy is accurate: this survives a reload (same
device) but is a different persistence mechanism from the rest of the tab.

## Register Configs

Panel: `RegisterConfigsPanel` (`panels/register-configs-panel.tsx`).
Admin-only. Two switches, both directly interactive (no edit-mode gate):

- **Require Sale Notes** — "Ensure every sale includes a note before
  checkout can be completed." Off by default on this store.
- **Display Item Stock Levels** — "Show available stock next to each item
  while selling." On by default.

**Verified live:** toggled Require Sale Notes on, hard-reloaded — persisted
as Enabled. Reverted off afterward.

## Product Units

Panel: `ProductUnitsCard` (`components/settings/store/product-units-card.tsx`).
Admin-only. "Add custom selling or pack units for your products, on top of
the built-in list" — a tag-list CRUD (add via `+` → text input → Save; each
tag has an `×` to remove). A large built-in unit list (Ampoule, Bag, Bottle,
… Vial) is always available and not editable. This store already had one
custom unit, "Gross".

**Verified live:** added a custom unit "SmokeTestUnit", hard-reloaded
`/settings/product-units` — it was still present in "Your custom units"
after reload, confirming the add persisted. Removed it afterward, leaving
only the pre-existing "Gross" custom unit.

## Categories

Panel: `CategoriesCard` (`components/settings/store/categories-card.tsx`).
Admin-only. Same tag-list CRUD pattern as Product Units, for product
categories used "across your catalog, inventory filters, and stock audits."
This store had 26 real categories in use (Analgesics, Antibiotics, Baby
Care, Beverages, … Wines & Spirits) — not exercised further live, since the
underlying add/remove mechanism is identical to the one already verified on
Product Units and this store's category list is real, in-use catalog data.

## Alerts (`alerts` → alias of `notifications`)

See **Notifications**, below.

## Notifications

Panel: `AlertsPanel` (`panels/alerts-panel.tsx`) wrapping
`alert-settings.tsx`. "Stock Batch Alerts — Configure when you want to be
warned about stock issues":

- **Low Stock Warning** switch — "Notify when stock hits reorder level."
- **Expiry Warning** switch — "Notify before products expire," plus a
  **Days before expiry to warn** number field (edit-mode gated, pencil icon
  + "Save Alert Preferences" button). This store's default was 90 days.

**Verified live:** changed Days before expiry from 90 → 60, saved,
hard-reloaded — persisted as "60 days". Reverted to 90 afterward.

## Data

Panel: `DataPanel` (`panels/data-panel.tsx`) wrapping `DataSettings`
(`data-settings.tsx`) + `DataSettingsAutoSync`
(`data-settings-auto-sync.tsx`) + `DemoDataSettings` (hidden unless
`storeProfile.is_demo` — not shown on this real account). Admin-only.

- **Data Synchronization** status card — "Connected to Cloud" / last-synced
  timestamp, "Sync Now" button.
- **Background Automation** (`DataSettingsAutoSync`) — **Auto-Sync Changes**
  switch, and when on, a **Sync Interval** dropdown + "Save Auto-Sync
  Settings" button. Gated behind `canCloudSync`
  (`useFeatureGate`'s `cloud_sync` feature, `!isFree` fallback) — free-tier
  stores see this whole block dimmed/disabled with a "Pro Feature" badge.
- **Backup & Restore** — Download Local Backup, Restore from File.
- **Danger Zone → Factory Reset** — "Wipe all local data (products, sales,
  etc.) and start fresh," a "Reset All Data" button. **Not exercised live**
  (irreversible local-data wipe on a real dev account).

### Cross-reference: Task 0's sync-queue transaction race fix

This is the UI surface for the setting whose backend race Task 0 fixed.
Task 0 found `getPendingSyncItems()` (`client/lib/db/core.ts`) wasn't
awaiting `awaitSettledTransactions()` (`client/lib/db/base-helpers.ts`)
before reading pending sync-queue rows, so the background auto-sync timer
(driven by exactly this **Sync Interval** value) could read a stale/
in-flight view of the queue. That fix is entirely in the read path this
setting's timer triggers — it does not change what interval values are
offered or how they're stored, which this task independently re-verified
live.

**On the brief's claimed 15-minute default:** the literal `|| 15` fallback
does exist in the current code, but it's in a different spot than the
initial-state default. Two separate `15`-related fallbacks exist and it's
easy to conflate them:

1. **Initial form state** (`hooks/use-settings-form.ts` line 25) — what the
   Sync Interval dropdown shows when the panel first mounts:
   ```ts
   const [autoSyncInterval, setAutoSyncInterval] = useState(
     storeProfile?.auto_sync_interval?.toString() || minimumSyncIntervalMinutes.toString()
   );
   ```
   `minimumSyncIntervalMinutes` comes from `useFeatureGate()` →
   `getLimit('sync_interval', isEnterprise ? 15 : isPro ? 30 : 360)`
   (`lib/hooks/use-feature-gate.ts` line 125) — tier-dependent: **15 min for
   Enterprise, 30 min for Pro, 360 min (6 hours) for Free/Starter**. No flat
   `15` literal here.
2. **The save handler** (`hooks/use-settings.ts` line 235,
   `handleSaveAutoSyncSettings`) — this is where the brief's literal `|| 15`
   actually lives:
   ```ts
   let interval = parseInt(autoSyncInterval) || 15;
   if (autoSyncEnabled && interval < minimumSyncIntervalMinutes) {
     interval = minimumSyncIntervalMinutes;
     setAutoSyncInterval(minimumSyncIntervalMinutes.toString());
   }
   updateStoreProfile({ auto_sync_enabled: autoSyncEnabled ? 1 : 0, auto_sync_interval: interval });
   ```
   In practice this `|| 15` branch is close to unreachable — `autoSyncInterval`
   is always a valid numeric string from the `<Select>`'s fixed option list,
   never blank/NaN — and even if it did fire, the very next line immediately
   clamps anything below `minimumSyncIntervalMinutes` back up to the tier
   minimum (30 for this Pro-trial store), so a stray `15` could never
   actually stick for a Pro/Enterprise-tier store below its own minimum...
   except Enterprise's minimum genuinely *is* 15, so for that one tier the
   fallback and the tier minimum happen to coincide.

Live-confirmed on this store (Pro trial): the Sync Interval dropdown showed
**"Every 30 Minutes"** as its pre-existing value, and the dropdown's offered
options were exactly {30 min, 1 hour, 6 hours} — the 5-min and 15-min
options were hidden because `minimumSyncIntervalMinutes (30) <= 5 / <= 15`
are both false, matching `data-settings-auto-sync.tsx`'s conditional
rendering.

**Verified live:** changed Sync Interval from 30 Minutes → 1 Hour, clicked
"Save Auto-Sync Settings", hard-reloaded `/settings/data` — persisted as
"Every 1 Hour". Reverted to 30 Minutes afterward. Auto-Sync Changes was
already on for this store.

## Security

Panel: `SecurityPanel` (`panels/security-panel.tsx`) wrapping
`security-settings.tsx`. Available to all staff (not admin-only).

- **Login PIN** — "Change PIN" opens an inline current/new/confirm-PIN form
  (`useSettingsSecurity` → `changePin()`). **Not exercised live** (would
  change the real login credential for the account being used to walk every
  other tab in this same session).
- **Auto-Lock Screen** — a dropdown (Off / 1 / 5 / 15 / 30 Minutes),
  "Lock dashboard after a period of inactivity," backed by
  `useAutoLockStore` (a persisted zustand store, `lib/hooks/use-auto-lock.ts`)
  — device-local, not a `storeProfile` field. Gated behind `canAutoLock`
  (`useFeatureGate`).

**Verified live:** changed Auto-Lock Screen from 5 Minutes → 15 Minutes,
hard-reloaded `/settings/security` — persisted as "15 Minutes". Reverted to
5 Minutes afterward.

**e2e coverage:** covered by `e2e/settings.spec.ts` via the Auto-Lock Screen
dropdown (PIN change intentionally left out of automated coverage for the
same reason it wasn't exercised live above — it would invalidate the
shared e2e fixture's login credential for every other spec that reuses it).

## Staff (`staff`)

Already documented above, under **Staff**.

## System

Panel: `SystemSettings` (`components/settings/system-settings.tsx`).
Admin-only. Entirely informational / download-links — **no configurable
settings live on this tab**:

- **Install App** — PWA install prompt.
- **Get DumosRx on Other Devices** — Windows / macOS / Linux / Android (APK)
  download links.
- **Subscription & Billing** — "Manage Billing" shortcut into the Billing tab.
- **System Updates** — Application Version (0.0.35 at time of this task),
  Environment (Web Browser), Platform (MacOS).
- **About DumosRx** — static licensing/support blurb.

Not exercised for persistence (there's nothing on this page a user can set).

## Cloud (`cloud` → alias of `data`)

See **Data**, above. Confirmed live: `/settings/cloud` resolves to the
"Data" tab (nav highlights "Data & Sync"), and — since the store used for
the live walkthrough was already cloud-linked — does **not** pop the
`CloudLinkDialog`; per `hooks/use-settings.ts`, that dialog only
auto-opens on the `cloud` alias when `isCloudLinked` is false.

### Bug found and fixed: the dialog couldn't be dismissed on a non-linked store

Writing `e2e/settings.spec.ts` (a fresh, non-cloud-linked fixture store)
surfaced a real bug the live walkthrough above never hit, since that store
was already linked: on `/settings/cloud` with `isCloudLinked === false`,
the "Link DumosRx Cloud" dialog reopened immediately after being dismissed
(Escape or Close) — every time, with no way to actually get rid of it short
of navigating away.

**Root cause:** `hooks/use-settings.ts`'s tab-resolution `useEffect`
depended on the whole `syncState` object (returned fresh, as a new object
literal, by `useSettingsSync()` on every render) instead of the one setter
it actually calls, `syncState.setIsCloudLinkOpen`. Because `syncState` never
has a stable identity, the effect reran on every render of `useSettings()`,
and its body unconditionally re-opens the dialog whenever
`internalTab === "cloud" && !isCloudLinked` — true for as long as the route
stays on the alias, regardless of whether the user just closed it a moment
ago. Fixed by narrowing the dependency to `syncState.setIsCloudLinkOpen`
(a `useState` setter, referentially stable across renders), so the effect
now only reruns when `tabParam`/`isCloudLinked`/`isAdmin`/`activeTab`
genuinely change. Verified with a source-inspection regression test,
`client/__tests__/settings-cloud-link-dialog-loop.test.ts` (RED pre-fix,
GREEN post-fix, following the same source-inspection pattern
`profit-loss-tab-currency-formatting.test.ts` established, since no
component-rendering harness exists in this repo yet), and re-verified in
`e2e/settings.spec.ts`'s data/cloud test, which closes the dialog and
asserts it stays closed on a subsequent render before moving on.

## Billing

Panel: `BillingSettings` (`components/settings/billing/billing-settings.tsx`),
three sub-tabs: **My Subscription** (`subscription-plans.tsx` /
`subscription-plan-card.tsx` / `subscription-status-alert.tsx`), **Billing
History** (`billing-history.tsx`), **Referral Program**
(`referral-tab.tsx`). Admin-only.

- **My Subscription** — Monthly/Yearly toggle, coupon code field, and four
  plan cards (Free / Starter / Pro / Enterprise) with per-plan feature
  bullets and pricing; the current plan is marked "CURRENT PLAN" with a
  disabled "Current Plan" button, others show "Subscribe"/"Downgrade". This
  store showed a **"Pro Trial (8 Days Remaining)"** status banner above the
  plan grid.
- **Billing History** / **Referral Program** — not walked in depth (no
  destructive/state-changing controls found on a skim; out of scope for
  this task's time budget given 21 tabs to cover).

**Not exercised live:** subscribing, downgrading, or applying a coupon are
real billing/purchase actions (even on a trial account, these can trigger
real payment-provider flows) — out of scope per this task's operating
rules around financial actions. Documented read-only.

---

### Step 3: Test coverage gap (pre-existing)

```
$ grep -rl "settings" client/e2e/ client/__tests__/
client/e2e/prescriptions.spec.ts
```

That one hit is `prescriptions.spec.ts`'s `page.goto('/settings/business-info')`
call used incidentally to seed a PCN license number for an unrelated
prescriptions test — it exercises no Settings behavior itself. **Before this
task, there was zero dedicated e2e or unit coverage for any of the 21
Settings tabs** — the single biggest, and only fully-empty, coverage gap
found across this whole smoke-test project. See `client/e2e/settings.spec.ts`
(added by this task) for what's now covered.

### Step 4: e2e coverage added

`client/e2e/settings.spec.ts` covers, by blast radius (not tab count, per
the brief):

1. **Staff** — edit a staff member's System Role, reload, assert it
   persisted.
2. **Security** — change the Auto-Lock Screen interval, reload, assert it
   persisted.
3. **Data / Sync** — elevate to Pro tier (via the same
   `window.__e2eSetSubscriptionTier` dev-only hook `expenses.spec.ts`
   established, since Auto-Sync is a paid-tier feature and the shared
   fixture DB is deliberately free-tier), change the Sync Interval, save,
   reload, assert it persisted. This directly exercises the UI surface for
   Task 0's sync-queue transaction race fix.
4. **Roles & Permissions** — asserts the placeholder ("coming soon" copy)
   renders, since there is no real setting on this page to change (see the
   **Roles & Permissions** section above).

**Deliberately scoped out**, and called out here rather than silently
skipped: purely cosmetic tabs like `appearance`/`general` (theme/color/
sidebar preferences — device-local, no state that matters to the business),
and the read-only/informational `system` tab. This matches the brief's
explicit instruction to prioritize by blast radius, not tab count.
