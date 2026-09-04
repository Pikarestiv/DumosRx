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

## RESOLVED: "Coming Soon" / "Unavailable" states for Linux and Android were dead code, and per-platform sizes were hardcoded empty

**Fix commit:** see git log (batch-c-downloads-billing).

Both bugs shared one root cause in `useLatestRelease()`
(`web/lib/api/release-hooks.ts`): every platform URL was unconditionally
template-string-constructed from the version number, with `winSize`/
`macSize`/`linuxSize`/`androidSize` hardcoded to `""`. `!!currentLinks.linux`
was therefore always `true`, so the "Coming Soon" branch in
`app/admin/downloads/page.tsx` was unreachable regardless of whether a
Linux/Android build actually existed.

**Investigation finding that changed the fix's shape:** a direct `curl` of
`https://downloads.dumosrx.com/updater.json` returns real per-platform data,
but its `platforms` key only lists Tauri's registered **auto-update**
target — currently just `darwin-aarch64` — not the full set of raw
installers actually uploaded to the CDN. Live HEAD checks against the
CDN's conventional URLs found the Windows `.msi`, Linux `.AppImage`, and
Android `.apk` all real, live, 200-with-Content-Length files today, despite
none of those platforms appearing in `platforms`. So `platforms` is
unreliable as an existence signal and is now used only to read the version
string.

**Bigger finding: CORS blocks this entirely from the browser.** A live
`fetch()` test from this app's own origin to `downloads.dumosrx.com`
(both `updater.json` and the binaries) fails with `TypeError: Failed to
fetch` — the CDN sends no `Access-Control-Allow-Origin` header at all
(confirmed via `curl -I -H "Origin: ..."`: no `access-control-*` header in
the response, on GET, HEAD, or an OPTIONS preflight). A `mode: "no-cors"`
fetch succeeds but returns an opaque response with no readable status or
headers — useless for existence/size checks. This means the **previously
shipped code never actually read `updater.json` successfully in a real
browser either**, at any point — its try/catch always landed in the catch
branch (previously masked because the CDN also happened to return a real
503 during the original survey, same symptom, different cause).

Compounding this, `web/next.config.ts` has `output: "export"` (a fully
static build, FTP-deployed, no Node server in production) — a same-origin
Next.js Route Handler proxy was tried first and does work in concept, but
`force-dynamic` is rejected by Next at build time under `output: "export"`,
so that approach is a dead end for this app specifically.

**Real fix:** moved the cross-origin work to the existing Laravel backend,
which every other admin page already talks to and which has no CORS
restriction talking to other servers. New endpoint:
`GET admin/downloads/manifest` (`AdminController::downloadsManifest` ->
inline logic using `Illuminate\Support\Facades\Http`, `super_admin`-gated
like every other AdminController method). It fetches `updater.json`
server-side for the version, then `Http::pool()`s a HEAD request to each
platform's conventional URL, returning real `exists`/`sizeBytes` per
platform. `useLatestRelease()` now calls this endpoint via the existing
`webApiClient.request()` pattern instead of fetching the CDN directly;
Linux/Android URLs are only populated when the backend confirms the file
exists (empty string otherwise, so the page's existing `!!currentLinks.linux`
gating is finally meaningful); Windows/macOS keep their URL either way,
matching the page's pre-existing lack of a "Coming Soon" branch for them.
Sizes are formatted from real `Content-Length` bytes (`formatSize()`,
e.g. "81.3 MB"); a platform confirmed to exist but with an unexpectedly
unreadable `Content-Length` would show "Unknown size" rather than a
fabricated value (not currently exercised — every platform's HEAD probe
returns a real Content-Length live).

**Live-verified** (`http://localhost:3002/admin/downloads`, real CDN,
2026-09-04): all four platforms are genuinely available right now, and all
four render correctly — Windows "10.6 MB", macOS "10.8 MB", Linux "81.3 MB",
Android "96.1 MB", all with real, working "Download" buttons (not "Coming
Soon"), hrefs independently re-confirmed via `curl -I` to return 200. This
is the **correct** rendering given all four platforms are real today; the
fix's actual value is that the page now derives this from a live check
instead of an always-true assumption, so it will correctly flip to "Coming
Soon" the day a platform's build genuinely isn't there.

No PHPUnit coverage for the new `admin/downloads/manifest` endpoint (it
depends entirely on a live external CDN's current file layout, which isn't
something a deterministic backend test should assert against) — verified
live only, as above.

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
