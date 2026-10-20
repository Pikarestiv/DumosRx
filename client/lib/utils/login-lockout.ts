import { STORAGE_KEYS } from "@/lib/storage-keys";
// Exponential-backoff lockout for PIN-based login attempts (client-side only, matching this app's entirely-offline PIN check — see docs/KNOWN_…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-login-lockout-L2

const STORAGE_KEY = STORAGE_KEYS.loginLockout;
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

// Call BEFORE checking the PIN.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-login-lockout-ts-L43
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

// Call after a successful login.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-login-lockout-ts-L74
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
