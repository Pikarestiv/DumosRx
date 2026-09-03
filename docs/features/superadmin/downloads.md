# Superadmin: System Downloads

`web/app/admin/downloads/page.tsx` — a static-looking page of four download
cards (Windows/.msi, macOS/.dmg, Linux/AppImage, Android/.apk) for
"DumosRx binaries for testing and manual distribution." Distinct from every
other section in this app: it makes **zero calls to the local Laravel
backend**. All of its data comes from a direct browser `fetch()` to a real
external production CDN, `https://downloads.dumosrx.com/updater.json`
(`lib/api/release-hooks.ts`, `useLatestRelease()`).

## What it does

`useLatestRelease()` fetches `updater.json` from the production CDN, reads
a `version` field from it if present (falling back to the hardcoded
`APP_VERSION` constant, `"v0.0.35"`, on any failure), and constructs four
download URLs from a fixed template:
`https://downloads.dumosrx.com/v{version}/DumosRx_{version}_{platform-suffix}`.

**Live-observed**: the CDN request returned **503** (`read_network_requests`
confirmed `GET https://downloads.dumosrx.com/updater.json` → 503 in this
environment). The hook's `try/catch` swallowed this gracefully — no
console error, no broken UI — and the page fell back to `APP_VERSION`,
correctly displaying "Latest Release: v0.0.35", matching
`web/lib/constants.ts`'s hardcoded value exactly.

## Bug: "Coming Soon" / "Unavailable" states for Linux and Android are dead code — always render as available

The page computes `linuxAssetExists = !!currentLinks.linux` and
`androidAssetExists = !!currentLinks.android` to decide whether to show a
live "Download" button or a grey "Coming Soon" / disabled "Unavailable"
card. But `currentLinks.linux` / `.android` are never actually verified
against the CDN — they're always a non-empty template-string URL
(`https://downloads.dumosrx.com/v{version}/DumosRx_{version}_amd64.AppImage`,
etc.), constructed unconditionally by `useLatestRelease()`'s `return`
statement regardless of whether that file exists, or even whether the
`updater.json` fetch itself succeeded. `!!currentLinks.linux` is therefore
always `true`. Confirmed live via `read_page` (interactive elements): both
the Linux and Android cards rendered enabled "Download" buttons with
`href`s pointing at
`https://downloads.dumosrx.com/v0.0.35/DumosRx_0.0.35_amd64.AppImage` and
`.../DumosRx-Android.apk` — never the "Coming Soon"/"Unavailable" branch,
even though the Linux and Android builds may or may not actually exist yet
at those URLs (this task did not click Download, per its conservative
scope around external/production actions, so file existence itself
wasn't verified — but the point stands: the UI has no way to ever show the
"doesn't exist" state it visibly has code for).

## Minor: `winSize`/`macSize`/`linuxSize`/`androidSize` are hardcoded to `""` always, not sourced from any real data

`useLatestRelease()`'s success-path `return` object sets all four `*Size`
fields to literal empty strings unconditionally — not read from
`updater.json`'s response at all, even in the (untested, since this
environment's CDN returned 503) case where that fetch succeeds. The
`defaultLinks` fallback object in `page.tsx` sets them to `"---"` instead,
but that fallback is only used if `links` itself is falsy, which doesn't
happen (the hook always resolves to a real object, never throws). Net
effect: the "size" line under each platform's install-format label (e.g.
".msi Installer") is always blank in this app, in every code path,
regardless of environment or CDN health — not a live bug exactly (nothing
crashes or misleads), but a piece of UI ("N MB" sizing info) that's fully
wired up presentation-side with no corresponding real data anywhere in the
fetch pipeline.

## Not a bug: production-domain dependency in local dev

This section's total independence from the local Laravel backend (all data
and all four real download links point at `downloads.dumosrx.com`, a real
production CDN, with no local/dev override mechanism analogous to
Communications' or Stores' backend URL selection) means this page's actual
tested behavior in local dev is "gracefully degrade to a hardcoded version
string when the CDN is unreachable" — which it does correctly. Flagged for
awareness alongside the same-class finding in Handoff (below): this app
has at least two places (`Downloads`, and the impersonation
handoff round-trip) that reach out to a real `dumosrx.com`-family domain
with no way to point them at a local stand-in.

## Console/network

No console errors. One real network call observed:
`GET https://downloads.dumosrx.com/updater.json` → 503 (handled
gracefully, see above). No download links were clicked (per this task's
scope: avoid actions against real external domains/CDNs whose actual file
availability is unverified).
