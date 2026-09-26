#!/usr/bin/env node
/**
 * Post-build guard for the storefront static export, run between `npm run
 * build` and the FTP sync (.github/workflows/deploy-web.yml).
 *
 * The FTP deploy is a *sync*: anything missing from `web/out/` is deleted
 * from the server. A build that emitted fewer storefront pages than the API
 * says exist would therefore delete live, paid storefronts — see
 * `docs/STOREFRONT_REVIEW.md` (SF-P0-1). `getStorefrontSlugs()` now throws
 * instead of degrading, so this is the belt to that braces: it re-asks the
 * API and asserts every slug actually landed on disk.
 *
 * Exits non-zero (failing the deploy before anything is uploaded) on a
 * missing directory or an unreachable API. STOREFRONT_ALLOW_EMPTY=1 skips
 * the check, matching the build-time escape hatch for offline/sandbox work.
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const OUT_STORE_DIR = join(process.cwd(), "out", "store");

function fail(message) {
  console.error(`[verify-storefront-output] ${message}`);
  process.exit(1);
}

async function listBuiltSlugs() {
  let entries;
  try {
    entries = await readdir(OUT_STORE_DIR, { withFileTypes: true });
  } catch (error) {
    fail(`could not read ${OUT_STORE_DIR}: ${error.message}`);
  }
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await stat(join(OUT_STORE_DIR, entry.name, "index.html"));
      slugs.push(entry.name);
    } catch {
      fail(`out/store/${entry.name}/ has no index.html — the page did not render.`);
    }
  }
  return slugs;
}

async function fetchExpectedSlugs(apiUrl) {
  let res;
  try {
    res = await fetch(`${apiUrl}/storefront-slugs`);
  } catch (error) {
    fail(`could not reach ${apiUrl}/storefront-slugs: ${error.message}`);
  }
  if (!res.ok) {
    fail(`${apiUrl}/storefront-slugs returned HTTP ${res.status}`);
  }
  let payload;
  try {
    payload = await res.json();
  } catch (error) {
    fail(`${apiUrl}/storefront-slugs returned unparseable JSON: ${error.message}`);
  }
  if (!Array.isArray(payload?.slugs)) {
    fail(`${apiUrl}/storefront-slugs returned no "slugs" array`);
  }
  return payload.slugs;
}

async function main() {
  if (process.env.STOREFRONT_ALLOW_EMPTY === "1") {
    console.log(
      "[verify-storefront-output] STOREFRONT_ALLOW_EMPTY=1 — skipping the storefront output check.",
    );
    return;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    fail("NEXT_PUBLIC_API_URL is not set — cannot verify the storefront output.");
  }

  const expected = await fetchExpectedSlugs(apiUrl);
  const built = new Set(await listBuiltSlugs());
  const missing = expected.filter((slug) => !built.has(slug));

  if (missing.length > 0) {
    fail(
      `${missing.length} live storefront(s) are missing from out/store/ ` +
        `(${missing.join(", ")}). Deploying this build would delete them from ` +
        `production. Aborting before the FTP sync.`,
    );
  }

  console.log(
    `[verify-storefront-output] OK — ${expected.length} live storefront(s) present ` +
      `in out/store/ (${built.size} director${built.size === 1 ? "y" : "ies"} total).`,
  );
}

await main();
