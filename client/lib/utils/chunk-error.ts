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
//
// A fourth shape, distinct from all of the above: this app is a static
// export (`output: export`), and the host serving it falls back to
// `index.html` (200 OK, HTML) for a path it doesn't have, rather than a
// real 404 - so a stale chunk request doesn't fail to fetch at all, it
// "succeeds" with an HTML document, which the browser then tries to
// execute as the JS module it asked for. That throws a plain SyntaxError
// whose message is just "Unexpected token '<'" (the start of
// `<!DOCTYPE html>`) - confirmed live in production (Sentry: 5 of these
// from one device across a single deploy window, each one a blank
// /dashboard or /settings/:tab the person had to manually refresh out of,
// since nothing here was recognizing it as the same stale-chunk problem
// the other three patterns already auto-reload for).
export const CHUNK_ERROR_PATTERN =
  /Loading (chunk|CSS chunk) [\w.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unexpected token '<'/i;
export const CHUNK_RELOAD_GUARD_KEY = "chunk-error-reload-attempted";

// "Unexpected token '<'" isn't unique to a script tag being handed HTML -
// V8's JSON.parse() throws the exact same wording ("Unexpected token '<',
// \"<!DOCTYPE \"... is not valid JSON") whenever an API response body is
// HTML instead of JSON, e.g. base-client.ts's unguarded response.json()
// hitting a proxy/gateway error page. That's a real backend problem, not a
// stale chunk, and must NOT trigger the auto-reload here: the reload guard
// (CHUNK_RELOAD_GUARD_KEY) is cleared on every successful boot (see
// global-error-listener.tsx), so misclassifying a persistent backend
// outage as a stale chunk would reload, boot, guard clears, same JSON
// error on the next request, reload again - forever, not once.
const JSON_PARSE_ERROR_PATTERN = /is not valid JSON/i;

export function isChunkLoadError(error: Error | null | undefined): boolean {
  if (!error) return false;
  if (JSON_PARSE_ERROR_PATTERN.test(error.message)) return false;
  return CHUNK_ERROR_PATTERN.test(error.message);
}
