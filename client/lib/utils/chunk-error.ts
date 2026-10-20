import { STORAGE_KEYS } from "@/lib/storage-keys";
// A stale tab holding chunk hashes from before the last auto-deploy will 404 the moment it lazy-loads a route it doesn't have.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-chunk-error-ts-L2
// Each browser engine phrases a stale/missing dynamic-import chunk differently, plus a fourth static-export-specific failure shape.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-chunk-error-ts-L2
export const CHUNK_ERROR_PATTERN =
  /Loading (chunk|CSS chunk) [\w.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unexpected token '<'/i;
export const CHUNK_RELOAD_GUARD_KEY = STORAGE_KEYS.chunkReloadGuard;

// "Unexpected token '<'" isn't unique to a script tag being handed HTML - V8's JSON.parse() throws the exact same wording ("Unexpected token '…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-chunk-error-ts-L28
const JSON_PARSE_ERROR_PATTERN = /is not valid JSON/i;

// One reload per deployed build, not per tab session.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-chunk-error-L43
export function shouldReloadForChunkError(buildSha: string): boolean {
  try {
    const key = `${CHUNK_RELOAD_GUARD_KEY}:${buildSha}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, new Date().toISOString());
    return true;
  } catch {
    return true;
  }
}

export function isChunkLoadError(error: Error | null | undefined): boolean {
  if (!error) return false;
  if (JSON_PARSE_ERROR_PATTERN.test(error.message)) return false;
  return CHUNK_ERROR_PATTERN.test(error.message);
}
