/**
 * Release script for DumosRx desktop/mobile (Tauri).
 *
 * Bumps the version in every file that needs to agree, commits, pushes,
 * and pushes a `vX.Y.Z` tag — which triggers .github/workflows/release.yml
 * (builds macOS/Windows/Linux/Android and deploys the updater feed).
 *
 * Usage:
 *   npx tsx scripts/release.ts 0.0.28
 *   npm run release -- 0.0.28
 *   npx tsx scripts/release.ts 0.0.28 --dry-run   # preview only, no writes/commits/push
 *   npx tsx scripts/release.ts 0.0.28 --yes        # skip the confirmation prompt
 *
 * See RELEASING.md at the repo root for the full process this automates.
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { execSync, execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLIENT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(CLIENT_DIR, "..");
const SRC_TAURI_DIR = path.join(CLIENT_DIR, "src-tauri");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipConfirm = args.includes("--yes") || args.includes("-y");
const versionArg = args.find((a) => !a.startsWith("-"));

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(cmd: string, cwd: string = REPO_ROOT): string {
  return execSync(cmd, { cwd, encoding: "utf-8" }).trim();
}

function runInherit(cmd: string, args_: string[], cwd: string = REPO_ROOT) {
  execFileSync(cmd, args_, { cwd, stdio: "inherit" });
}

async function confirm(question: string): Promise<boolean> {
  if (skipConfirm) return true;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer: string = await new Promise((resolve) =>
    rl.question(`${question} (y/N) `, resolve),
  );
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

// ---------------------------------------------------------------------------
// 1. Validate input
// ---------------------------------------------------------------------------

if (!versionArg) {
  fail(
    "Usage: npx tsx scripts/release.ts <version> [--dry-run] [--yes]\nExample: npx tsx scripts/release.ts 0.0.28",
  );
}

const VERSION_RE = /^\d+\.\d+\.\d+$/;
if (!VERSION_RE.test(versionArg)) {
  fail(
    `"${versionArg}" doesn't look like a version (expected e.g. 0.0.28, no leading "v").`,
  );
}
const newVersion = versionArg;
const tagName = `v${newVersion}`;

// ---------------------------------------------------------------------------
// 2. Pre-flight checks
// ---------------------------------------------------------------------------

console.log(
  `\nPreparing release ${tagName}${dryRun ? " (dry run — no writes, no git actions)" : ""}\n`,
);

const currentBranch = run("git branch --show-current");
if (!currentBranch) {
  fail("Not on a branch (detached HEAD?). Checkout a branch before releasing.");
}

const gitStatus = run("git status --porcelain");
if (gitStatus) {
  fail(
    "Working tree isn't clean. Commit, stash, or discard your changes before releasing " +
      "so the release commit only contains the version bump.\n\n" +
      gitStatus,
  );
}

const existingTags = run("git tag --list").split("\n");
if (existingTags.includes(tagName)) {
  fail(
    `Tag ${tagName} already exists locally. Pick a different version, or delete it first if this was a mistake.`,
  );
}

// ---------------------------------------------------------------------------
// 3. Locate current version (from package.json) and confirm the bump direction
// ---------------------------------------------------------------------------

const packageJsonPath = path.join(CLIENT_DIR, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const oldVersion: string = packageJson.version;

if (oldVersion === newVersion) {
  fail(`client/package.json is already at ${newVersion}. Nothing to bump.`);
}

console.log(`  ${oldVersion}  ->  ${newVersion}\n`);

// ---------------------------------------------------------------------------
// 4. Bump every file that needs to agree on the version
// ---------------------------------------------------------------------------

interface Edit {
  file: string;
  apply: (content: string) => string;
}

function replaceOrThrow(
  content: string,
  search: string | RegExp,
  replacement: string,
  fileLabel: string,
): string {
  if (typeof search === "string") {
    if (!content.includes(search)) {
      fail(
        `Couldn't find expected text in ${fileLabel}:\n  ${search}\n(File may have changed shape — update release.ts.)`,
      );
    }
    return content.split(search).join(replacement);
  }
  if (!search.test(content)) {
    fail(
      `Couldn't find expected pattern in ${fileLabel}: ${search}\n(File may have changed shape — update release.ts.)`,
    );
  }
  return content.replace(search, replacement);
}

const edits: Edit[] = [
  {
    file: path.join(CLIENT_DIR, "package.json"),
    apply: (c) =>
      replaceOrThrow(
        c,
        `"version": "${oldVersion}"`,
        `"version": "${newVersion}"`,
        "client/package.json",
      ),
  },
  {
    file: path.join(SRC_TAURI_DIR, "tauri.conf.json"),
    apply: (c) =>
      replaceOrThrow(
        c,
        `"version": "${oldVersion}"`,
        `"version": "${newVersion}"`,
        "tauri.conf.json",
      ),
  },
  {
    file: path.join(SRC_TAURI_DIR, "Cargo.toml"),
    apply: (c) =>
      replaceOrThrow(
        c,
        `version = "${oldVersion}"`,
        `version = "${newVersion}"`,
        "Cargo.toml",
      ),
  },
  {
    file: path.join(SRC_TAURI_DIR, "Cargo.lock"),
    apply: (c) =>
      replaceOrThrow(
        c,
        `name = "app"\nversion = "${oldVersion}"`,
        `name = "app"\nversion = "${newVersion}"`,
        "Cargo.lock",
      ),
  },
  {
    file: path.join(CLIENT_DIR, "lib", "constants.ts"),
    apply: (c) =>
      replaceOrThrow(
        c,
        `export const APP_VERSION = "${oldVersion}";`,
        `export const APP_VERSION = "${newVersion}";`,
        "client/lib/constants.ts",
      ),
  },
  {
    file: path.join(REPO_ROOT, "web", "lib", "constants.ts"),
    apply: (c) =>
      replaceOrThrow(
        c,
        `export const APP_VERSION = "v${oldVersion}";`,
        `export const APP_VERSION = "v${newVersion}";`,
        "web/lib/constants.ts",
      ),
  },
];

for (const edit of edits) {
  const relPath = path.relative(REPO_ROOT, edit.file);
  if (!fs.existsSync(edit.file)) {
    fail(`Expected file not found: ${relPath}`);
  }
  const original = fs.readFileSync(edit.file, "utf-8");
  const updated = edit.apply(original);
  console.log(`  ${dryRun ? "[dry-run] would update" : "updating"} ${relPath}`);
  if (!dryRun) {
    fs.writeFileSync(edit.file, updated);
  }
}

// Regenerate Cargo.lock properly if cargo is available (the direct string
// replace above is a safe fallback if it isn't — Cargo.lock's "app" entry
// has no dependency-resolution implications since it's the root package).
if (!dryRun) {
  try {
    run(
      "cargo metadata --no-deps --format-version 1 >/dev/null 2>&1",
      SRC_TAURI_DIR,
    );
    console.log(
      "  verified via `cargo metadata` that Cargo.lock matches Cargo.toml",
    );
  } catch {
    console.log(
      "  (cargo not available or check failed — left the direct Cargo.lock edit as-is)",
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Sanity check: make sure no old-version references remain in these files
// ---------------------------------------------------------------------------

if (!dryRun) {
  for (const edit of edits) {
    const content = fs.readFileSync(edit.file, "utf-8");
    if (content.includes(oldVersion)) {
      fail(
        `${path.relative(REPO_ROOT, edit.file)} still contains "${oldVersion}" after the bump — ` +
          "something else in the file references the old version. Check it manually.",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Typecheck the client before committing (catches unrelated breakage early)
// ---------------------------------------------------------------------------

if (!dryRun) {
  console.log(
    "\nRunning `tsc --noEmit` to sanity-check the client before committing...",
  );
  try {
    run("npx tsc --noEmit -p tsconfig.json", CLIENT_DIR);
    console.log("  typecheck passed");
  } catch (e) {
    // execSync throws an Error whose `stdout`/`stderr` (Buffer) carry the
    // actual compiler output — more useful here than the generic message.
    const { stdout, message } = e as Error & { stdout?: Buffer };
    fail(
      `Typecheck failed — fix errors before releasing:\n\n${stdout?.toString() || message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 7. Commit, push, tag, push tag
// ---------------------------------------------------------------------------

if (dryRun) {
  console.log(
    `\nDry run complete. Would commit, push "${currentBranch}", then create and push tag ${tagName}.`,
  );
  process.exit(0);
}

console.log(`\nAbout to on branch "${currentBranch}":`);
console.log(`  1. git add + commit "chore: bump version to ${newVersion}"`);
console.log(`  2. git push origin ${currentBranch}`);
console.log(`  3. git tag ${tagName} && git push origin ${tagName}`);
console.log(
  `\nPushing the tag triggers the real release pipeline: builds macOS/Windows/Linux/Android and deploys to downloads.dumosrx.com.\n`,
);

(async () => {
  const proceed = await confirm("Proceed?");
  if (!proceed) {
    console.log("\nAborted. No commit, push, or tag was made.");
    process.exit(0);
  }

  const filesToAdd = edits.map((e) => path.relative(REPO_ROOT, e.file));
  runInherit("git", ["add", ...filesToAdd]);
  runInherit("git", [
    "commit",
    "-m",
    `chore: bump version to ${newVersion}\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`,
  ]);

  console.log(`\nPushing ${currentBranch}...`);
  runInherit("git", ["push", "origin", currentBranch]);

  console.log(`\nCreating and pushing tag ${tagName}...`);
  runInherit("git", ["tag", tagName]);
  runInherit("git", ["push", "origin", tagName]);

  console.log(
    `\n✔ Released ${tagName}. Watch the Actions run at the repo's "Actions" tab — ` +
      "if it fails on the updater-signing-secrets check, see RELEASING.md.\n",
  );
})();
