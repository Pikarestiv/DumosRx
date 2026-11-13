import {
  AuditSessionConflictError,
  AuditSessionRequestError,
  abandonAuditSession,
  completeAuditSession,
} from "@/lib/api/audit-sessions";

export const PENDING_AUDIT_SESSION_OPS_KEY = "dumos_audit_session_pending_ops";

export type PendingAuditSessionOp =
  | { kind: "complete"; sessionId: string; leaseVersion: number; submittedStockAuditId: string | null }
  | { kind: "abandon"; sessionId: string; reason?: string };

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
  writeOps([...readOps().filter((o) => o.sessionId !== op.sessionId), op]);
}

export function pendingAuditSessionIds(): Set<string> {
  return new Set(readOps().map((o) => o.sessionId));
}

const SETTLED_STATUSES = new Set([403, 404, 410, 422]);

function isSettled(err: unknown): boolean {
  if (err instanceof AuditSessionConflictError) return true;
  return err instanceof AuditSessionRequestError && SETTLED_STATUSES.has(err.statusCode);
}

async function send(op: PendingAuditSessionOp) {
  if (op.kind === "complete") {
    await completeAuditSession(op.sessionId, op.leaseVersion, op.submittedStockAuditId);
  } else {
    await abandonAuditSession(op.sessionId, op.reason);
  }
}

let flushing: Promise<void> | null = null;

export function flushAuditSessionOps(): Promise<void> {
  flushing ??= (async () => {
    for (const op of readOps()) {
      try {
        await send(op);
      } catch (err) {
        if (!isSettled(err)) continue;
      }
      writeOps(readOps().filter((o) => o.sessionId !== op.sessionId));
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
