import { STORAGE_KEYS } from "@/lib/storage-keys";

/**
 * Single source of truth for "is this session a read-only on-till admin
 * inspection?". Mirrors lib/utils/impersonation.ts deliberately — the sync
 * engine, the write helpers and the UI must all answer this the same way
 * rather than each reaching for storage with its own key.
 *
 * sessionStorage, not localStorage: the spec requires the session to end on
 * app restart, and sessionStorage gives that for free rather than through an
 * expiry check something could skip. See
 * docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.
 */
export interface TillInspectionSession {
  admin: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
  };
  sessionId: string;
  /** Hard cap, derived locally from the server's duration (see lib/api/admin-till-session.ts). */
  hardExpiresAt: string;
  /** Rolling idle deadline, pushed out by real interaction. */
  idleExpiresAt: string;
  storeId: string | null;
  deviceId: string;
}

export const TILL_INSPECTION_STORAGE_KEY = STORAGE_KEYS.tillInspection;

export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

export const IDLE_WARNING_MS = 2 * 60 * 1000;

export const READ_ONLY_REFUSAL_MESSAGE =
  "This is a read-only admin inspection session. Sign in as a store user to make changes.";

export function startTillInspectionSession(session: TillInspectionSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TILL_INSPECTION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable; the session simply cannot start */
  }
}

export function getTillInspectionSession(): TillInspectionSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TILL_INSPECTION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as TillInspectionSession;
    if (!session?.sessionId) return null;

    return expiresAt(session) > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function isTillInspectionSession(): boolean {
  return getTillInspectionSession() !== null;
}

/** Pushes the idle deadline out. Called on real interaction, never on a timer. */
export function extendTillInspectionSession(): void {
  const session = getTillInspectionSession();
  if (!session) return;

  startTillInspectionSession({
    ...session,
    idleExpiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
  });
}

/** Milliseconds until the session ends, or null when none is live. */
export function msUntilInspectionExpiry(): number | null {
  const session = getTillInspectionSession();
  return session ? expiresAt(session) - Date.now() : null;
}

export function endTillInspectionSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TILL_INSPECTION_STORAGE_KEY);
  } catch {
    /* storage unavailable; nothing to clear */
  }
}

function expiresAt(session: TillInspectionSession): number {
  const idle = new Date(session.idleExpiresAt).getTime();
  const hard = new Date(session.hardExpiresAt).getTime();

  return Math.min(
    Number.isNaN(idle) ? 0 : idle,
    Number.isNaN(hard) ? 0 : hard,
  );
}
