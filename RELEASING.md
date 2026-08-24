# Releasing DumosRx (Tauri desktop + Android)

This describes how to cut a new desktop/Android release. Web/backend deploys are separate (`deploy-client.yml`, `deploy-web.yml`, `deploy-backend.yml`, `deploy-dev.yml`) and are not covered here.

## What a release does

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. **`release`** (matrix: macOS, Windows, Linux): builds the Tauri desktop app for each OS via `tauri-apps/tauri-action`, signs the update payload with `TAURI_SIGNING_PRIVATE_KEY`, and publishes the binaries to a (draft-off, non-prerelease) GitHub Release tagged with the pushed tag.
2. **`release-android`**: builds the Android APK, signs it with the keystore secrets if present (falls back to an unsigned APK otherwise), and uploads it to the same GitHub Release.
3. **`deploy-ftp`** (needs both of the above): downloads every asset from the GitHub Release, regenerates `updater.json` from the `.sig` files Tauri produced, and FTP-uploads the binaries + `updater.json` to `downloads.dumosrx.com/<tag>/` (and the index page to the site root). This `updater.json` is what `AutoUpdater` (`components/tauri/auto-updater.tsx`) and the mobile "check for update" fallback actually poll: it's the source of truth in production, not anything committed in the repo.

## Cutting the release

`client/scripts/release.ts` (wired up as the `release` script in `client/package.json`) automates the whole thing: bumping the version in lockstep, committing, pushing, tagging, and pushing the tag.

```bash
cd client
npm run release -- 0.0.34
```

- `--dry-run`: preview every file it would change and the git commands it would run, with zero writes/commits/push.
- `--yes` / `-y`: skip its "Proceed?" confirmation prompt.

It bumps these together (the build will succeed but ship a mismatched version if any of them drift):

- `client/package.json` → `"version"`
- `client/src-tauri/tauri.conf.json` → `"version"` (this is what Tauri actually stamps on the shipped app/installers)
- `client/src-tauri/Cargo.toml` → `[package].version`, then re-verifies `Cargo.lock`'s `app` entry via `cargo metadata` (falls back to a direct string replace if `cargo` isn't available)
- `client/lib/constants.ts` → `APP_VERSION` (no `v` prefix)
- `web/lib/constants.ts` → `APP_VERSION` (with `v` prefix, used in the marketing site's footer/download links)

Before touching any files it checks the working tree is clean, the tag doesn't already exist locally, and the requested version actually differs from the current one. After bumping it re-reads every edited file to confirm no old-version string remains, then runs `tsc --noEmit`. All of that fails loudly (no commit) rather than shipping a half-bumped or type-broken release. Only after you confirm the prompt does it commit (`chore: bump version to X.Y.Z`), `git push origin <branch>`, then `git tag vX.Y.Z && git push origin vX.Y.Z`: that last push is what actually triggers the release workflow below.

The tag name must match `v*` and match the version just bumped to (the workflow uses `github.ref_name` verbatim as the release name and the FTP folder name). The script guarantees this since it derives the tag from the version argument itself.

If the script is ever unavailable/broken, the manual fallback is to make the same 5 edits by hand, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Required secrets

| Secret | Used for |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Signs the updater payload (`.sig` files). `TAURI_SIGNING_PRIVATE_KEY` is the raw text content of the `.key` file (not re-encoded). Must match the `pubkey` in `tauri.conf.json`, see the format note below. |
| `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEY_ALIAS` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD` | Signs the Android APK. If `ANDROID_KEYSTORE_BASE64` is unset, an unsigned APK is uploaded instead, expected for test builds, not for a public release. |
| `FTP_SERVER` / `FTP_USERNAME` / `FTP_PASSWORD` | Deploys binaries + `updater.json` to `downloads.dumosrx.com`. |
| `GITHUB_TOKEN` | Provided automatically by Actions; used to create the release and download its assets. |

## Updater safeguards

Two checks guard against silently shipping a broken update feed:

- **`release` job** fails immediately, before building, if `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is unset.
- **`deploy-ftp` job** refuses to publish `updater.json` if it would end up with an empty `platforms` object, and warns (without failing) if any of the three expected platforms (`darwin-aarch64`, `windows-x86_64`, `linux-x86_64`) is missing.

**Post-mortem, v0.0.26 / v0.0.27:** both releases shipped with no `.sig` files at all, so `updater.json` ended up with `"platforms": {}` (v0.0.26 published it silently; the v0.0.27 attempt was correctly caught and failed by the safeguard above). The secrets were present and valid the whole time; the actual root cause was `client/src-tauri/tauri.conf.json` missing `bundle.createUpdaterArtifacts: true`. In Tauri v2 this flag is required for `tauri build` to produce signed updater archives (`.app.tar.gz`, `.msi.zip`, `.AppImage.tar.gz`) at all; without it, `tauri-action`'s JS wrapper falls back to manually tarring the raw bundle (you can see this in the build log as an explicit `tar czf ...` step) purely so *something* gets uploaded, but that fallback has no access to the signer, hence "Signature not found for the updater JSON. Skipping upload...". Fixed by adding `"createUpdaterArtifacts": true` under `"bundle"` in `tauri.conf.json`. If a future release ever again produces zero `.sig` files despite this flag being set, suspect the signing secrets themselves (see the "Verify updater signing secrets are set" step) rather than this flag.

**Post-mortem, v0.0.28 (first two attempts):** every desktop platform (macOS/Windows/Linux; Android was unaffected since it doesn't go through this code path) failed at the "Bundling ... (updater)" step with `failed to decode pubkey: failed to decode base64 pubkey: failed to convert base64 to utf8: invalid utf-8 sequence of ...`. This looked like a bad secret and wasn't: it reproduced locally with `npm run tauri build` using three different keypairs, including a freshly-generated one with `tauri.conf.json`'s `pubkey` swapped to match it. The actual bug: **`pubkey` in `tauri.conf.json` must be the full raw contents of the `.pub` file** (a base64 wrapper around a two-line `untrusted comment: ...` + key block), not just the bare key string (the `RWQ...` line) that `tauri signer generate` prints to the terminal for convenience. The bare key line decodes straight to raw binary, never valid UTF-8, so Tauri's build-time pubkey validation, which base64-decodes the config value and expects valid UTF-8 text back, fails on it every time regardless of which private key is signing. Fixed by setting `pubkey` to `$(cat ~/.tauri/<name>.key.pub)` (the whole file, unmodified) instead of just the key line. To sanity-check this locally without waiting on CI: `npx tauri signer sign <file> --private-key "$(cat ~/.tauri/<name>.key)" --password "..."` exercises the CLI's key-parsing but *not* this specific config-validation path. Only a real `tauri build --bundles app` (or full build) reproduces it.

## Known gaps (not yet addressed)

- **No OS-level code signing or notarization.** `TAURI_SIGNING_PRIVATE_KEY` only signs the updater payload, not the app binary: macOS builds will show an "unidentified developer" Gatekeeper warning and Windows builds will show a SmartScreen warning. Fixing this needs a paid Apple Developer ID (+ notarization credentials) and a Windows code-signing certificate.
- **No Intel Mac build.** The `macos-latest` runner is Apple Silicon (arm64) only, and the workflow doesn't pass `--target universal-apple-darwin`. Intel Mac users currently get no build and no updater entry (`darwin-x86_64` never appears in the generated `updater.json`). Deferred per request, revisit when Intel Mac support is needed.
- The `updater.json` committed at the repo root is a stale manual template (references raw `.dmg`/`.msi`/`.AppImage` files, not the `.tar.gz`/`.zip` update-archive formats Tauri's updater actually expects). It is **not** used by the release pipeline and can be ignored or removed.
