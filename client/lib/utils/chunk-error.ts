/** A stale tab holding chunk hashes from before the last auto-deploy (see
 * the debounced storefront rebuild) will 404 the moment it lazy-loads a
 * route it doesn't already have in memory - not a real crash, just the
 * browser needing a fresh copy of the app. Shared between error-boundary.tsx
 * (triggers the one-time auto-reload) and global-error-listener.tsx (clears
 * the guard once the app boots cleanly), so the two never drift apart. */
// Each browser engine phrases a stale/missing dynamic-import chunk
// differently: Chromium says "Loading chunk N failed" (webpack's own
// wording) or "Failed to fetch dynamically imported module"; Safari says
// "Importing a module script failed"; Firefox says "error loading
// dynamically imported module". All three are the same underlying failure
// - a 404 on a chunk this tab's stale build references - so all three
// trigger the same auto-reload.
export const CHUNK_ERROR_PATTERN =
  /Loading (chunk|CSS chunk) [\w.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
export const CHUNK_RELOAD_GUARD_KEY = "chunk-error-reload-attempted";

export function isChunkLoadError(error: Error | null | undefined): boolean {
  return !!error && CHUNK_ERROR_PATTERN.test(error.message);
}
