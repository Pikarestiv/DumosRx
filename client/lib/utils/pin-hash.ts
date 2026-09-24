import bcrypt from "bcryptjs";

/**
 * POS unlock PINs used to be stored (and synced, and serialized by the API)
 * in plaintext. They're bcrypt-hashed now - everywhere they're written,
 * both here and server-side (see User::hashPin() in the Laravel app).
 *
 * Verification has to happen HERE, not on the server: PIN login is fully
 * offline by design (auth-context.tsx's login() never makes a network call
 * to authenticate), so the device compares the typed PIN against the hash
 * that synced down into local SQLite.
 *
 * bcryptjs is the library because it's pure JavaScript with zero
 * dependencies and no native bindings - this app ships as a Next.js static
 * export AND inside a Tauri webview on desktop, Android and iOS, none of
 * which can load a native node addon.
 *
 * bcrypt embeds its own cost factor in the hash string, so a hash verifies
 * correctly regardless of what cost either side used to produce it -
 * PHP-side (Laravel 11 defaults to 12, not 10) and JS-side hashes are fully
 * interoperable without needing to agree on a number. This constant is only
 * used when THIS device originates a new hash (a fresh PIN, or migrating a
 * legacy plaintext one on login); 10 is bcryptjs's own default and kept
 * deliberately lower than Laravel's 12 - hashing runs synchronously on the
 * main thread during PIN entry (see pinMatches below), and a 4-digit PIN's
 * 10,000-value keyspace doesn't benefit much from the extra cost anyway.
 */
export const PIN_HASH_ROUNDS = 10;

/** A full bcrypt hash: $2a$/$2b$/$2y$ + cost + 53 chars of salt+digest. */
const BCRYPT_HASH_PATTERN = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Whether a stored `users.pin` value is already a bcrypt hash, as opposed
 * to a legacy plaintext PIN written before this change (or synced down from
 * a device still running an older build).
 */
export function isPinHashed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && BCRYPT_HASH_PATTERN.test(stored);
}

/** Hashes a raw PIN for storage. Already-hashed input passes through so a
 * re-save can never double-hash a value and lock someone out. */
export function hashPin(pin: string): string {
  if (isPinHashed(pin)) return pin;
  return bcrypt.hashSync(pin, PIN_HASH_ROUNDS);
}

/**
 * Verifies a typed PIN against whatever is stored, hashed or legacy
 * plaintext. Synchronous on purpose: the call sites filter a handful of
 * candidate user rows, and a sync compare keeps that code a plain
 * predicate instead of an async reduce. One bcrypt compare at cost 10 is a
 * few tens of milliseconds, against at most a couple of rows.
 */
export function pinMatches(
  candidatePin: string,
  stored: string | null | undefined,
): boolean {
  if (!candidatePin || !stored) return false;

  if (isPinHashed(stored)) {
    try {
      return bcrypt.compareSync(candidatePin, stored);
    } catch {
      // A malformed/truncated hash (e.g. one that round-tripped through the
      // old VARCHAR(4) column) throws rather than returning false.
      return false;
    }
  }

  return stored === candidatePin;
}

/**
 * True when a stored value matched but is still plaintext - i.e. this
 * successful login is the moment to rewrite it as a hash. See
 * migrateLegacyPinToHash() in lib/db/queries/auth.ts.
 */
export function needsPinRehash(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.length > 0 && !isPinHashed(stored);
}
