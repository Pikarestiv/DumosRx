import bcrypt from "bcryptjs";

// POS unlock PINs used to be stored (and synced, and serialized by the API) in plaintext.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pin-hash-L3
export const PIN_HASH_ROUNDS = 10;

/** A full bcrypt hash: $2a$/$2b$/$2y$ + cost + 53 chars of salt+digest. */
const BCRYPT_HASH_PATTERN = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

// Whether a stored `users.pin` value is already a bcrypt hash, as opposed to a legacy plaintext PIN written before this change (or synced down…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pin-hash-ts-L10
export function isPinHashed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && BCRYPT_HASH_PATTERN.test(stored);
}

/** Hashes a raw PIN for storage. Already-hashed input passes through so a
 * re-save can never double-hash a value and lock someone out. */
export function hashPin(pin: string): string {
  if (isPinHashed(pin)) return pin;
  return bcrypt.hashSync(pin, PIN_HASH_ROUNDS);
}

// Verifies a typed PIN against whatever is stored, hashed or legacy plaintext.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pin-hash-ts-L26
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

// True when a stored value matched but is still plaintext - i.e.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pin-hash-ts-L52
export function needsPinRehash(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.length > 0 && !isPinHashed(stored);
}
