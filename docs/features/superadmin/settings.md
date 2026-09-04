# Platform Settings (Superadmin)

Route: `web/app/admin/settings/[[...tab]]/page.tsx` →
`settings-client.tsx` (`PlatformSettingsClient`), a catch-all route
rendering 6 sub-tabs as separate components under
`components/admin/views/`: System Health (`health`, default/no-tab),
Billing & Plans (`billing`), Dynamic Suggestions (`suggestions`), Email
Templates (`templates`), Integrations (`integrations`), Security
(`security`).

**Scope confirmation vs. the task brief's guess:** correct — this is the
superadmin panel's own system-config area, and it does indeed have
multiple sub-tabs behind the catch-all route (6, matching
`generateStaticParams()`'s 6 entries in `page.tsx`). Every tab loads real
backend data (no hardcoded/mock content found anywhere), and 5 of the 6
tabs have a real, correctly-wired save mutation
(`useUpdateSystemConfigMutation` → `PUT admin/system-configs/{key}` →
`SystemConfigController::update`, all keyed into the generic
`system_configs` table via `SystemConfig::setVal()`/`getVal()`). One tab
(System Health) is read/refresh-only by design, mirroring — but not
literally reusing — the separate `/admin/system` page surveyed in an
earlier batch (same `useAdminHealth()` hook and `GET admin/health`
endpoint, already verified correct there).

## Data flow (per tab)

- **System Health** (`system-health-tab.tsx`): `useAdminHealth()` → `GET
  admin/health` (already-verified endpoint from the System-page batch).
  "Run Diagnostics" re-issues the same `GET` (live-confirmed via network
  tab: two fresh 200s on click). "System Status" button is `toast.info`
  only — no API call, by design (external status-page integration "being
  provisioned").
- **Billing & Plans** (`subscription-config-tab.tsx` +
  `plan-tier-card.tsx`): `useSystemConfig("subscription_plans")` and
  `useSystemConfig("social_links")` → `GET
  /system-configs/{key}` (public route,
  `SystemConfigController::show`) → `{ success, data }`, unwrapped by
  `webApiClient.getSystemConfig()` to just `data`. Save →
  `useUpdateSystemConfigMutation()` → `PUT admin/system-configs/{key}` →
  200 with the new value. Both directions verified correct by source read
  (matching shapes, no nesting bug); **not exercised live** — see Findings
  below for why this tab specifically was left alone.
- **Dynamic Suggestions** (`suggestions-config-tab.tsx`):
  `useSystemConfig("global_suggestions")`, same save mutation as above.
  Real backend value for this dev DB is `[]` (an empty array, not the
  `{store: {...}, retail: {...}}` object shape the frontend's
  `SuggestionsConfig` type expects) — handled gracefully via optional
  chaining (`serverConfig.store?.names || []`), so every category renders
  as an empty list rather than crashing. This reflects the config
  genuinely never having been seeded/used on this dev backend, not a
  wiring bug.
- **Email Templates** (`email-templates-tab.tsx` +
  `template-list.tsx`/`template-editor.tsx`): `useAdminEmailTemplates()` →
  `GET admin/email-templates` (`EmailTemplateController::index`, real
  Eloquent-backed `email_templates` table, confirmed 4 real rows via
  `php artisan tinker`: Email Verification, Welcome Email, Password Reset,
  Administrative Notification). Selecting a template issues `GET
  admin/email-templates/{id}` for full content. Save →
  `useUpdateAdminEmailTemplateMutation()` → `PUT
  admin/email-templates/{id}` with `{ subject, body }`. Live Sandbox
  preview is 100% client-side (`getCompiledPreview()` regex-substitutes
  mock values for Blade variables) — no backend call, by design.
- **Integrations** (`integrations-tab.tsx`): `useSystemConfig("smartsupp_key")`
  / save+clear via the same `useUpdateSystemConfigMutation()`.
- **Security** (`security-config-tab.tsx`):
  `useSystemConfig("require_email_verification")` / same save mutation.
  Live value on this dev DB is unset (`NULL`, confirmed via tinker),
  renders as the toggle defaulting to off, matching `Boolean(null) ===
  false`.

All 5 mutable tabs share one generic backend contract
(`system_configs` key/value table, `SystemConfigController`), already
verified structurally correct in an earlier batch's System-page
investigation for the `default_account_manager_id` key — this batch
extends that same verification to 5 more keys used by Settings
specifically (`subscription_plans`, `social_links`, `global_suggestions`,
`smartsupp_key`, `require_email_verification`).

## Live walkthrough

Tested at `http://localhost:3002/admin/settings` and its 5 sub-routes,
logged in as `admin@dumosrx.com` (super_admin).

- **System Health:** loaded live data (matches the separately-verified
  `/admin/system` page's data source). "System Status" confirmed as a
  stub toast. "Run Diagnostics" confirmed as a real re-fetch via network
  tab.
- **Billing & Plans:** loaded real live pricing/tier/social-link config
  from the DB (`Max Staff` showed `0` for Free tier, matching the DB's
  real `limits.staff: 0` exactly). **Deliberately not saved** — this is a
  real, unscoped, platform-wide pricing/feature-gate config with no
  preview/dry-run and immediate effect per its own on-page copy ("These
  changes will reflect immediately on the user dashboard"). Inspected only,
  per this task's conservative-mutation guidance. See Findings for a real
  schema-mismatch bug found purely by inspection (no save required to
  reproduce).
- **Dynamic Suggestions:** loaded real (empty) data; confirmed the
  add-entry / search-filter / remove-entry interactions all work
  correctly as pure client-side state changes (added a throwaway
  "TestEntrySmoke" tag, confirmed it rendered with a remove control).
  **Deliberately not saved** — no reason to leave test data in a shared
  config that other tools/tabs may read.
- **Email Templates:** loaded all 4 real templates; selected "Email
  Verification" (auto-selected on load), confirmed real subject/content
  loaded (`Please Verify Your DumosRx Account`), and confirmed the Live
  Sandbox preview toggle renders a correctly mock-substituted HTML
  preview. Not saved (no reason to alter real system email copy for other
  testers).
- **Integrations (Smartsupp):** round-trip tested live — see Findings for
  a real, reproduced bug in the "Disable Widget" path. Save-with-a-value
  path confirmed fully correct (real `PUT admin/system-configs/smartsupp_key`
  → 200, UI flipped to "Active" with the live-widget banner).
- **Security:** loaded real (unset → off) state; **not toggled/saved** —
  this is a real, platform-wide authentication-requirement flag
  (`require_email_verification`) that would immediately change signup
  behavior for every new registration on the shared dev backend other
  batches/testers may still be using; inspected only.

## Findings

### Bug: "Disable Widget" on the Integrations tab always fails with a 422 (`The value field is required.`) — the smartsupp_key can be set but never cleared through this UI

**Severity:** Medium (real, reproduced, blocks a documented action with no
workaround inside the app).

Live-reproduced: set the Smartsupp key to a throwaway test value
(`smoketest_dummy_key_123`), saved successfully (`PUT
admin/system-configs/smartsupp_key` → 200, UI flipped to "Active" with the
live-widget banner) — then clicked "Disable Widget"
(`integrations-tab.tsx`'s `handleClear`, which calls
`updateMutation.mutateAsync({ key: "smartsupp_key", value: "" })`) and got
a toast: `The value field is required.` Network tab confirmed `PUT
admin/system-configs/smartsupp_key` → **422**.

**Root cause:** `SystemConfigController::update()` validates the request
with `'value' => 'required'`. Laravel's `required` rule treats an empty
string as absent/failing (this is standard, well-known Laravel validation
behavior — `required` fails on `""`, unlike `present` or `nullable`,
which would each accept it). The Integrations tab is the only one of the
5 mutable Settings tabs whose "clear it back to empty" affordance actually
tries to save an empty string; the other tabs either don't have a
comparable clear action, or clear-equivalent states are non-empty (e.g. a
boolean `false`, or an empty array `[]`, both of which pass `required`
fine since only PHP's "empty" *string* is special-cased by that rule).

**Effect:** once a superadmin sets a real Smartsupp key through this UI —
even accidentally, or as a test — there's no way to fully unset/hide the
chat widget again from this page. The `Input` field could still be
manually cleared and "Save Key" clicked instead, but that hits the exact
same `PUT` with `value: ""` and the exact same 422 — there is no working
path at all to restore the "Disabled" state through this UI once a value
has ever been set.

**Recovery for this task:** since the UI path is provably broken, the
dev DB's `smartsupp_key` config was restored to its pre-test empty-string
value directly via `php artisan tinker`
(`App\Models\SystemConfig::setVal('smartsupp_key', '')`) after
confirming the bug, so this batch leaves the shared dev backend in the
same state it found it.

**Suggested fix scope** (not implemented — investigation only): either
relax the backend validation for this key specifically (e.g. `'value' =>
'present'` instead of `'required'`, or a dedicated `nullable` branch for
string configs), or have the frontend send a sentinel (e.g. `null`) that
the backend explicitly treats as "clear this key" rather than sending
`""` through the same generic "set a value" contract.

### Bug: "Billing & Plans" tab's tier `limits`/`features` UI schema doesn't match what's actually stored for `subscription_plans`, on two separate axes

**Severity:** Medium-High (silent data-loss risk on save, even though no
save was performed to confirm the write side — the read-side mismatch
alone is unambiguous and reproducible by inspection).

Live-observed: every tier's "Sync Interval (Mins)" field
(`plan-tier-card.tsx:117-124`, bound to `tier.limits.sync_interval`)
renders **blank** for all 4 tiers. Root cause, confirmed via `php artisan
tinker` dump of the real `subscription_plans` config's `tiers.free.limits`:

```json
{"staff": 0, "stores": 1, "inventories": -1}
```

— there is no `sync_interval` key in the real stored data at all; the
real third limit field is called `inventories`, not `sync_interval`. The
frontend's `TierLimits` type (`lib/types/admin.ts:173`) and
`plan-tier-card.tsx` both hardcode `sync_interval` as the third limit
field, and its state-hydration `useEffect`
(`subscription-config-tab.tsx:71-100`) only falls back to a default value
when the *whole* `limits` object is missing (`serverConfig.tiers?.free?.limits
?? {defaults}`) — since the real `limits` object is present (just missing
this one key), the fallback never fires, and the real `inventories` value
has no corresponding input at all anywhere on the page.

Second, larger mismatch: the real stored `features` object per tier uses
keys `basic_inventory`, `mobile_access`, `theme_customizer`, `store_url`
(confirmed via tinker; `theme_customizer` is a real, currently-enforced
client-app feature gate — confirmed live in
`client/components/ui/theme-customizer.tsx:73`, which calls
`withRestriction(..., { featureKey: 'theme_customizer' })`) — **none of
which appear anywhere in `plan-tier-card.tsx`'s 18-item Feature Gates
toggle list.** Conversely, that toggle list includes keys like
`mobile_app`, `ecommerce`, `smart_pos`, `broadcast_create`,
`custom_branding`, `barcode_generation`, `loyalty_program` that **do not
exist anywhere in the real stored config**, and a repo-wide grep found no
backend PHP code that reads `loyalty_program`, `broadcast_create`, or
`barcode_generation` as a feature-gate key at all — these toggles appear
to be either stale from an earlier schema, or aspirational for
features/keys that were never actually wired to real gating logic.

**Effect if ever saved:** because `updateLimits`/`updateFeatures`
(`plan-tier-card.tsx:33-39`) spread the existing tier object before
merging updates, a save wouldn't *drop* the real `inventories` value or
the real `mobile_access`/`store_url`/`basic_inventory`/`theme_customizer`
flags outright — but it would (a) write a garbage `sync_interval: NaN`
into every tier's `limits` (from `Number("")`), permanently polluting the
stored schema with a field the backend never otherwise produces, and (b)
leave the real, currently-enforced `theme_customizer` gate (and the other
3 real feature flags) completely unmanageable through this UI, since no
control for them exists — a superadmin trying to, say, disable theme
customization for the Free tier has no way to do so here despite the
backend fully supporting it.

Not fixed — investigation only, and this tab's Save button was
deliberately never clicked in this task specifically because of this
finding (once the blank Sync Interval field was noticed, saving was
avoided to prevent writing the `NaN` pollution into the shared dev
backend's real pricing config).

**Suggested fix scope** (not implemented): reconcile
`TierLimits`/`TierFeatures` (`lib/types/admin.ts`) and
`plan-tier-card.tsx`'s hardcoded field/toggle lists against
`laravel-server/config/plans.php` and
`laravel-server/database/seeders/SystemConfigSeeder.php` (both confirmed
to use the real `inventories`/`basic_inventory`/`mobile_access`/
`theme_customizer`/`store_url` field names), likely by treating one of the
two schemas as canonical and updating the other to match.

### Not investigated further (informational): every Settings sub-tab component fetches its own `useSystemConfig()` keys independently, causing redundant duplicate GETs on tab switches

Network tab showed the same `system-configs/{key}` GETs firing multiple
times across a single tab-switching session (e.g. `smartsupp_key` fetched
6 times, `subscription_plans` 3 times) — each tab component re-mounts and
re-queries on every switch rather than the 6 tabs sharing one
longer-lived query cache scope. Not a correctness bug (React Query
dedupes concurrent identical requests and each individual response was
correct), just a minor inefficiency; not logged as an open finding since
it has no user-visible effect.

## Caveats

- Billing & Plans, Dynamic Suggestions, and Security tabs' **Save**
  actions were deliberately not clicked live, per this task's
  conservative-mutation guidance — each controls a real, platform-wide,
  immediately-effective config with no dry-run. All three were verified
  as correctly wired by source read (matching request/response shapes,
  real endpoints) and, for Billing & Plans, by the schema-mismatch finding
  above (which was itself found without ever needing to save).
- Email Templates' Save was not clicked live for the same reason (would
  alter real system email copy visible to other testers/batches sharing
  this dev backend) — verified correct by source read and by the
  successful, harmless Live Sandbox preview round-trip.
- Integrations' Smartsupp key was round-tripped live (set → confirmed
  active → attempted clear → found the 422 bug → DB manually restored to
  original empty state via `tinker`, since the in-app "Disable Widget"
  path is the one proven broken).
