/**
 * Runs after `next build` (see package.json's "postbuild" script) against
 * the static export in `out/`. Writes `out/precache-manifest.json`: a flat
 * list of every URL the app shell needs to boot fully offline on a device
 * that has never opened it online before.
 *
 * Why this exists instead of a real precache-manifest generator like
 * Workbox: `client/public/sw.js`'s own install handler previously had no
 * precaching at all - "content-hashed filenames from static export aren't
 * known ahead of time... without adding real build tooling" (its own
 * comment). This is that build tooling, kept deliberately small: no new
 * runtime dependency, no interaction with next.config.mjs's existing
 * withSentryConfig webpack wrapping (a second webpack-mutating plugin like
 * next-pwa stacked on top of that was judged riskier to verify than a
 * standalone script for the size of gap being closed here).
 *
 * Every file under out/_next/** (hashed JS/CSS/build-manifest chunks) plus
 * every root-level file that isn't `.htaccess` (per-route HTML/.txt pages,
 * icons, manifest.json, the sql.js wasm binaries) is included - picking a
 * subset would require knowing which chunks a given route depends on ahead
 * of a specific build, which is exactly the problem a manifest avoids.
 */
import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, relative, sep } from "path";

const OUT_DIR = join(__dirname, "..", "out");
const MANIFEST_PATH = join(OUT_DIR, "precache-manifest.json");
const SW_PATH = join(OUT_DIR, "sw.js");
const EXCLUDED_ROOT_FILES = new Set([".htaccess", "precache-manifest.json"]);

function walk(dir: string, urls: string[]): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, urls);
      continue;
    }
    const rel = relative(OUT_DIR, fullPath).split(sep).join("/");
    if (!rel.includes("/") && EXCLUDED_ROOT_FILES.has(rel)) continue;
    urls.push(`/${rel}`);
  }
}

function main() {
  const urls: string[] = [];
  try {
    walk(OUT_DIR, urls);
  } catch (err) {
    // No `out/` yet (e.g. a non-export dev flow calling this directly) -
    // fail soft rather than breaking the build, since the SW's runtime
    // caching still works without a manifest, just not on a cold first
    // launch.
    console.warn(
      `[precache-manifest] Skipped: couldn't read ${OUT_DIR} (${(err as Error).message})`,
    );
    return;
  }

  // Also include every page's un-suffixed route form (e.g. "/dashboard" as
  // well as "/dashboard.html", "/" as well as "/index.html"): out/.htaccess
  // rewrites the extensionless route to its .html sibling server-side, but a
  // real navigation's request URL - and therefore the URL the service
  // worker's cache.match() looks up - is always the extensionless one. Only
  // caching the .html form left every route but "/" missing its actual
  // navigable cache key.
  const routeUrls = urls
    .filter((url) => url.endsWith(".html"))
    .map((url) => (url === "/index.html" ? "/" : url.slice(0, -".html".length)));
  for (const routeUrl of routeUrls) {
    if (!urls.includes(routeUrl)) urls.push(routeUrl);
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(urls));
  console.log(`[precache-manifest] Wrote ${urls.length} URLs to ${MANIFEST_PATH}`);

  stampCacheVersion(urls);
}

/**
 * sw.js's CACHE_VERSION is a hardcoded literal in the source file
 * (client/public/sw.js) that's only meant to change when the caching
 * STRATEGY changes, not on every deploy - so a browser only re-checks this
 * file's bytes (and therefore only runs install()/activate()'s cache prune)
 * when that literal changes. Left alone, an ordinary deploy that only
 * changes app code never bumps it, so activate()'s prune - the thing that's
 * supposed to bound the precache's size across deploys - never runs, and
 * every deploy's newly hashed /_next chunks pile up in the same cache
 * forever (the exact unbounded-growth risk activate()'s own comment warns
 * about: exceeding an iOS per-origin quota evicts the WHOLE origin,
 * including the local SQLite database's IndexedDB persistence).
 *
 * Fixed by rewriting the EXPORTED copy's CACHE_VERSION (never the source
 * file) to include a hash of this build's own file list + sizes: stable for
 * an unchanged build, different for any build whose output actually
 * changed, which is exactly the condition that should trigger a fresh
 * install()/activate() cycle.
 */
function stampCacheVersion(urls: string[]): void {
  let swSource: string;
  try {
    swSource = readFileSync(SW_PATH, "utf8");
  } catch (err) {
    console.warn(`[precache-manifest] Skipped sw.js version stamp: couldn't read ${SW_PATH} (${(err as Error).message})`);
    return;
  }

  // `urls` includes the extensionless route aliases added above (e.g.
  // "/dashboard" alongside "/dashboard.html") which have no file of their
  // own on disk - skipped here rather than crashing the postbuild, since
  // the .html file backing each one is already in this same list and
  // carries the same size information for fingerprinting purposes.
  const fingerprint = urls
    .slice()
    .sort()
    .map((url) => {
      try {
        return `${url}:${statSync(join(OUT_DIR, url === "/" ? "index.html" : url)).size}`;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is string => entry !== null)
    .join("\n");
  const buildId = createHash("sha256").update(fingerprint).digest("hex").slice(0, 12);

  const versionPattern = /const CACHE_VERSION = "[^"]*";/;
  if (!versionPattern.test(swSource)) {
    console.warn("[precache-manifest] Skipped sw.js version stamp: CACHE_VERSION literal not found");
    return;
  }
  const stamped = swSource.replace(versionPattern, `const CACHE_VERSION = "dumosrx-${buildId}";`);
  writeFileSync(SW_PATH, stamped);
  console.log(`[precache-manifest] Stamped sw.js CACHE_VERSION = dumosrx-${buildId}`);
}

main();
