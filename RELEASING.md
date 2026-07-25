# Releasing DumosRx (Tauri desktop + Android)

This describes how to cut a new desktop/Android release. Web/backend deploys are separate (`deploy-client.yml`, `deploy-web.yml`, `deploy-backend.yml`, `deploy-dev.yml`) and are not covered here.

## What a release does

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. **`release`** (matrix: macOS, Windows, Linux) — builds the Tauri desktop app for each OS via `tauri-apps/tauri-action`, signs the update payload with `TAURI_SIGNING_PRIVATE_KEY`, and publishes the binaries to a (draft-off, non-prerelease) GitHub Release tagged with the pushed tag.
2. **`release-android`** — builds the Android APK, signs it with the keystore secrets if present (falls back to an unsigned APK otherwise), and uploads it to the same GitHub Release.
3. **`deploy-ftp`** (needs both of the above) — downloads every asset from the GitHub Release, regenerates `updater.json` from the `.sig` files Tauri produced, and FTP-uploads the binaries + `updater.json` to `downloads.dumosrx.com/<tag>/` (and the index page to the site root). This `updater.json` is what `AutoUpdater` (`components/tauri/auto-updater.tsx`) and the mobile "check for update" fallback actually poll — it's the source of truth in production, not anything committed in the repo.

## Before tagging: bump the version in lockstep

There is no automated bump script yet — these must be updated together, or the build will succeed but ship a mismatched version:

- `client/package.json` → `"version"`
- `client/src-tauri/tauri.conf.json` → `"version"` (this is what Tauri actually stamps on the shipped app/installers)
- `client/src-tauri/Cargo.toml` → `[package].version`, and then run `cd client/src-tauri && cargo metadata --no-deps --format-version 1 >/dev/null` (or any cargo command) once so `Cargo.lock`'s `app` entry picks up the new version too
- `client/lib/constants.ts` → `APP_VERSION` (no `v` prefix)
- `web/lib/constants.ts` → `APP_VERSION` (with `v` prefix — used in the marketing site's footer/download links)

Commit that as its own change before tagging.

## Cutting the release

```bash
git tag v0.0.27
git push origin v0.0.27
```

The tag name must match `v*` and should match the version you just bumped to (the workflow uses `github.ref_name` verbatim as the release name and the FTP folder name).

## Required secrets

| Secret | Used for |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Signs the updater payload (`.sig` files). Must match the `pubkey` in `tauri.conf.json`. |
| `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEY_ALIAS` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD` | Signs the Android APK. If `ANDROID_KEYSTORE_BASE64` is unset, an unsigned APK is uploaded instead — expected for test builds, not for a public release. |
| `FTP_SERVER` / `FTP_USERNAME` / `FTP_PASSWORD` | Deploys binaries + `updater.json` to `downloads.dumosrx.com`. |
| `GITHUB_TOKEN` | Provided automatically by Actions; used to create the release and download its assets. |

## Updater safeguards

Two checks guard against silently shipping a broken update feed:

- **`release` job** fails immediately, before building, if `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is unset.
- **`deploy-ftp` job** refuses to publish `updater.json` if it would end up with an empty `platforms` object, and warns (without failing) if any of the three expected platforms (`darwin-aarch64`, `windows-x86_64`, `linux-x86_64`) is missing.

**Post-mortem, v0.0.26 / v0.0.27:** both releases shipped with no `.sig` files at all, so `updater.json` ended up with `"platforms": {}` (v0.0.26 published it silently; the v0.0.27 attempt was correctly caught and failed by the safeguard above). The secrets were present and valid the whole time — the actual root cause was `client/src-tauri/tauri.conf.json` missing `bundle.createUpdaterArtifacts: true`. In Tauri v2 this flag is required for `tauri build` to produce signed updater archives (`.app.tar.gz`, `.msi.zip`, `.AppImage.tar.gz`) at all; without it, `tauri-action`'s JS wrapper falls back to manually tarring the raw bundle (you can see this in the build log as an explicit `tar czf ...` step) purely so *something* gets uploaded, but that fallback has no access to the signer, hence "Signature not found for the updater JSON. Skipping upload...". Fixed by adding `"createUpdaterArtifacts": true` under `"bundle"` in `tauri.conf.json`. If a future release ever again produces zero `.sig` files despite this flag being set, suspect the signing secrets themselves (see the "Verify updater signing secrets are set" step) rather than this flag.

## Known gaps (not yet addressed)

- **No OS-level code signing or notarization.** `TAURI_SIGNING_PRIVATE_KEY` only signs the updater payload, not the app binary — macOS builds will show an "unidentified developer" Gatekeeper warning and Windows builds will show a SmartScreen warning. Fixing this needs a paid Apple Developer ID (+ notarization credentials) and a Windows code-signing certificate.
- **No Intel Mac build.** The `macos-latest` runner is Apple Silicon (arm64) only, and the workflow doesn't pass `--target universal-apple-darwin`. Intel Mac users currently get no build and no updater entry (`darwin-x86_64` never appears in the generated `updater.json`). Deferred per request — revisit when Intel Mac support is needed.
- The `updater.json` committed at the repo root is a stale manual template (references raw `.dmg`/`.msi`/`.AppImage` files, not the `.tar.gz`/`.zip` update-archive formats Tauri's updater actually expects) — it is **not** used by the release pipeline and can be ignored or removed.
