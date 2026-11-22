import { vi } from "vitest";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import type { CloudAuditSession } from "@/lib/api/audit-sessions";

export const freshSheet: AuditItem[] = [
  { id: "p1", name: "Amoxil", sku: "A", category: "c", systemQty: 20 },
  { id: "p2", name: "Flagyl", sku: "F", category: "c", systemQty: 8 },
];

export function session(overrides: Partial<CloudAuditSession> = {}): CloudAuditSession {
  return {
    id: "S1",
    store_id: "store-1",
    created_by: "user-1",
    name: null,
    notes: null,
    status: "in_progress",
    active_till_id: "TILL-A",
    active_till_name: "Front till",
    active_user_id: "user-1",
    lease_version: 1,
    lease_expires_at: null,
    total_items_count: 2,
    counted_items_count: 1,
    submitted_stock_audit_id: null,
    started_at: "2026-11-10T09:00:00Z",
    completed_at: null,
    last_synced_at: null,
    items: [
      { product_id: "p1", counted: true, counted_quantity: 15, counted_at: "2026-11-10T09:05:00Z" },
    ],
    ...overrides,
  };
}

export type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response;
}

export function serve(routes: { active: () => CloudAuditSession | null; complete: Route }) {
  const calls: { url: string; body?: string }[] = [];
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    if (url.includes("/active")) return Promise.resolve(json({ success: true, session: routes.active() }));
    if (url.endsWith("/complete")) return Promise.resolve(routes.complete(url, init));
    if (url.endsWith("/abandon")) return Promise.resolve(json({ success: true, session: null }));
    return Promise.resolve(json({ success: true, last_synced_at: null }));
  }) as unknown as typeof fetch;
  return calls;
}

export const networkDown: Route = () => Promise.reject(new TypeError("Failed to fetch"));
