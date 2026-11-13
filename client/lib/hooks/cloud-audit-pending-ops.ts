import {
  AuditSessionConflictError,
  AuditSessionRequestError,
  abandonAuditSession,
  completeAuditSession,
} from "@/lib/api/audit-sessions";

export const PENDING_AUDIT_SESSION_OPS_KEY = "dumos_audit_session_pending_ops";

export const FORBIDDEN_AUDIT_OP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingAuditSessionOp = (
  | { kind: "complete"; sessionId: string; leaseVersion: number; submittedStockAuditId: string | null; storeId?: string }
  | { kind: "abandon"; sessionId: string; reason?: string; leaseVersion?: number; storeId?: string }
) & { queuedAt?: number };

function readOps(): PendingAuditSessionOp[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_AUDIT_SESSION_OPS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOps(ops: PendingAuditSessionOp[]) {
  try {
    if (ops.length === 0) localStorage.removeItem(PENDING_AUDIT_SESSION_OPS_KEY);
    else localStorage.setItem(PENDING_AUDIT_SESSION_OPS_KEY, JSON.stringify(ops));
  } catch (err) {
    console.warn("[AuditSession] Could not persist pending session ops", err);
  }
}

export function queueAuditSessionOp(op: PendingAuditSessionOp) {
  writeOps([...readOps().filter((o) => o.sessionId !== op.sessionId), { ...op, queuedAt: Date.now() }]);
}

export function clearAuditSessionOps() {
  writeOps([]);
}

function readStampedOps(): PendingAuditSessionOp[] {
  const ops = readOps();
  if (ops.every((o) => typeof o.queuedAt === "number")) return ops;
  const stamped = ops.map((o) => (typeof o.queuedAt === "number" ? o : { ...o, queuedAt: Date.now() }));
  writeOps(stamped);
  return stamped;
}

export function pendingAuditSessionIds(): Set<string> {
  return new Set(readOps().map((o) => o.sessionId));
}

const SETTLED_STATUSES = new Set([404, 410, 422]);

function isSettled(err: unknown, op: PendingAuditSessionOp): boolean {
  if (err instanceof AuditSessionConflictError) return true;
  if (!(err instanceof AuditSessionRequestError)) return false;
  if (err.statusCode === 403) return Date.now() - (op.queuedAt ?? Date.now()) > FORBIDDEN_AUDIT_OP_TTL_MS;
  return SETTLED_STATUSES.has(err.statusCode);
}

async function send(op: PendingAuditSessionOp) {
  if (op.kind === "complete") {
    await completeAuditSession(op.sessionId, op.leaseVersion, op.submittedStockAuditId, op.storeId);
  } else {
    await abandonAuditSession(op.sessionId, op.reason, op.leaseVersion, op.storeId);
  }
}

let flushing: Promise<void> | null = null;

export function flushAuditSessionOps(): Promise<void> {
  flushing ??= (async () => {
    for (const op of readStampedOps()) {
      try {
        await send(op);
      } catch (err) {
        if (!isSettled(err, op)) continue;
      }
      writeOps(readOps().filter((o) => o.sessionId !== op.sessionId));
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
