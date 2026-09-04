# DumosRx Superadmin Panel — Smoke-Test Index

Produced by walking every section of the superadmin panel (`web/`, a
separate Next.js app from the store-owner-facing `client/` app — see
`docs/features/README.md` and its `_findings-log.md` for that app's own,
separately-run smoke test) against the real seeded dev backend, logged in
as `admin@dumosrx.com` (`super_admin`). Documents what each control does,
verifies every action against its real backend endpoint, and investigates
(without fixing) every bug found along the way — this survey was scoped
as investigation-and-documentation only across all 5 batches; no
application code was changed.

## Sections (nav order)

1. [Login](login.md) — PIN/password auth entry point, session-restore-on-reload.
2. [Stores](stores.md) — Store Fleet list, store detail dialog, per-store actions (including Impersonate).
3. [Users](users.md) — Platform Users list, role/store display, bulk actions.
4. [Global Products](products.md) — platform-wide product catalog, metrics, standardize/export actions.
5. [Marketing](marketing.md) — Coupons and Affiliates & Referrals (program-level, coupon-style) tabs.
6. [My Referrals](referrals.md) — every user's own personal referral code/link and who signed up through it (distinct from Marketing's referral program).
7. [Activity Log](activity.md) — cross-cutting platform audit trail.
8. [System](system.md) — health metrics, live Sentry error feed, default account-manager config.
9. [Communications](communications.md) — Broadcasts, User Feedback, Email Campaigns.
10. [Downloads](downloads.md) — desktop/mobile client download page and release-asset links.
11. [Platform Settings](settings.md) — System Health, Billing & Plans, Dynamic Suggestions, Email Templates, Integrations, Security (6 sub-tabs under one catch-all route).
12. [Handoff](handoff.md) — the impersonation-session round trip (Stores' "Impersonate" action out to the `client/` app and back).

## Findings log

[`_findings-log.md`](_findings-log.md) is the running record of everything
found while walking the panel — see its Summary section at the top for
the totals and headline bugs.

## Batches this survey ran in

1. Products / Marketing
2. Login / Stores / Users
3. Activity / System
4. Communications / Downloads / Handoff
5. My Referrals / Platform Settings (this batch — closes out the survey)

Each batch's own section doc has a "Live walkthrough" section describing
exactly what was clicked/tested and a "Caveats" section noting anything
deliberately not exercised live (almost always because the action was a
real, unscoped, platform-wide mutation with no dry-run — e.g. Products'
"Standardize Catalog", Settings' pricing/security config saves, Security's
"Require Email Verification" toggle) and why.
