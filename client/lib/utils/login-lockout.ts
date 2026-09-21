/**
 * Exponential-backoff lockout for PIN-based login attempts (client-side
 * only, matching this app's entirely-offline PIN check — see
 * docs/KNOWN_BUGS.md's now-removed "PIN login has no attempt limit" entry).
 * CAPTCHA isn't a fit here: this is a local POS terminal with no guaranteed
 * network, not a web form facing bot traffic.
 *
 * Keyed by the typed identifier (username/email, lowercased) rather than a
 * resolved user id or the whole device, so:
 *  - trying many different bogus usernames doesn't help brute-force any one
 *    real account (each gets its own independent counter), and
 *  - locking out one staff member's account doesn't also lock out every
 *    other staff member sharing the same device.
 */

const STORAGE_KEY = "dumos_login_lockout";
const LOCKOUT_THRESHOLD = 5; // failed attempts allowed before any lockout
const BASE_LOCKOUT_MS = 30_000; // 30s for the first lockout
const MAX_LOCKOUT_MS = 30 * 60_000; // capped at 30 minutes

interface LockoutEntry {
  failedAttempts: number;
  lockedUntil: number | null;
}
type LockoutStore = Record<string, LockoutEntry>;

function normalizeKey(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function readStore(): LockoutStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LockoutStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: LockoutStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best-effort: a full/unavailable localStorage just means this
    // particular lockout isn't persisted, not a reason to block login.
  }
}

export interface LockoutStatus {
  locked: boolean;
  remainingMs: number;
}

/** Call BEFORE checking the PIN. Locked callers must not reach the PIN
 * comparison at all — this both blocks the login and avoids extending the
 * lockout further just from being retried while still locked. */
export function checkLoginLockout(identifier: string): LockoutStatus {
  const store = readStore();
  const entry = store[normalizeKey(identifier)];
  if (!entry?.lockedUntil) return { locked: false, remainingMs: 0 };

  const remainingMs = entry.lockedUntil - Date.now();
  if (remainingMs <= 0) return { locked: false, remainingMs: 0 };
  return { locked: true, remainingMs };
}

/** Call after a PIN attempt that didn't match. Escalates the lockout
 * duration exponentially once the failure count crosses the threshold. */
export function recordLoginFailure(identifier: string): void {
  const store = readStore();
  const key = normalizeKey(identifier);
  const entry = store[key] ?? { failedAttempts: 0, lockedUntil: null };
  entry.failedAttempts += 1;

  if (entry.failedAttempts >= LOCKOUT_THRESHOLD) {
    const exponent = entry.failedAttempts - LOCKOUT_THRESHOLD;
    const durationMs = Math.min(BASE_LOCKOUT_MS * 2 ** exponent, MAX_LOCKOUT_MS);
    entry.lockedUntil = Date.now() + durationMs;
  }

  store[key] = entry;
  writeStore(store);
}

/** Call after a successful login. Clears any accumulated failure history
 * for this identifier so a legitimate user isn't left one mistake away
 * from a lockout indefinitely. */
export function recordLoginSuccess(identifier: string): void {
  const store = readStore();
  const key = normalizeKey(identifier);
  if (key in store) {
    delete store[key];
    writeStore(store);
  }
}

/** Human-friendly "try again in ..." duration for a lockout toast. */
export function formatLockoutRemaining(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.ceil(totalSeconds / 60)}m`;
}
