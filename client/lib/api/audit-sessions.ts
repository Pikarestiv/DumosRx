import { apiClient } from "@/lib/api/client";
import { getToken } from "@/lib/api/token-manager";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { getStoredActiveStoreId, getStoredUser } from "@/lib/storage-keys";
import { APP_VERSION, BUILD_SHA } from "@/lib/constants";

export interface CloudAuditSessionItem {
  id?: string;
  audit_session_id?: string;
  product_id: string;
  system_quantity?: number | null;
  counted_quantity?: number | null;
  cost_price?: number | null;
  counted_cost_price?: number | null;
  selling_price?: number | null;
  counted_selling_price?: number | null;
  counted?: boolean;
  notes?: string | null;
  counted_at?: string | null;
}

export interface CloudAuditSession {
  id: string;
  store_id: string;
  created_by: string;
  name: string | null;
  notes: string | null;
  status: "in_progress" | "completion_pending_sync" | "completed" | "abandoned";
  active_till_id: string | null;
  active_till_name: string | null;
  active_user_id: string | null;
  lease_version: number;
  lease_expires_at: string | null;
  total_items_count: number;
  counted_items_count: number;
  submitted_stock_audit_id: string | null;
  started_at: string;
  completed_at: string | null;
  last_synced_at: string | null;
  items?: CloudAuditSessionItem[];
  creator?: { id: string; first_name: string; last_name: string };
  active_user?: { id: string; first_name: string; last_name: string };
}

export class AuditSessionConflictError extends Error {
  public conflict: boolean;
  public session?: CloudAuditSession | null;
  public statusCode: number;

  constructor(message: string, session?: CloudAuditSession | null, statusCode = 409) {
    super(message);
    this.name = "AuditSessionConflictError";
    this.conflict = true;
    this.session = session;
    this.statusCode = statusCode;
  }
}

export class AuditSessionRequestError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "AuditSessionRequestError";
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (typeof window === "undefined") {
    return headers;
  }

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const activeStoreId = getStoredActiveStoreId();
  if (activeStoreId) {
    headers["X-Store-Id"] = activeStoreId;
  }

  headers["X-Device-Id"] = getDeviceId();
  headers["X-Device-Label"] = getDeviceLabel();
  headers["X-App-Version"] = APP_VERSION;
  headers["X-Build-Sha"] = BUILD_SHA;

  const actingUserId = getStoredUser()?.id;
  if (actingUserId) {
    headers["X-Acting-User-Id"] = actingUserId;
  }

  return headers;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${apiClient.getBaseURL()}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...options.headers,
    },
  });

  if (response.status === 409) {
    let payload: { message?: string; session?: CloudAuditSession } = {};
    try {
      payload = await response.json();
    } catch {
      // payload remains empty
    }
    throw new AuditSessionConflictError(
      payload.message || "Audit session conflict or superseded lease.",
      payload.session,
      409
    );
  }

  if (!response.ok) {
    let errorMessage = `Audit session API error (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.message) errorMessage = errJson.message;
    } catch {
      // fallback to status code
    }
    throw new AuditSessionRequestError(errorMessage, response.status);
  }

  return response.json() as Promise<T>;
}

export async function fetchActiveAuditSession(
  includeItems = true
): Promise<{ success: boolean; session: CloudAuditSession | null }> {
  return request<{ success: boolean; session: CloudAuditSession | null }>(
    `/app/audit-sessions/active?include_items=${includeItems ? 1 : 0}`
  );
}

export async function startAuditSession(payload: {
  name?: string;
  notes?: string;
  items: CloudAuditSessionItem[];
}): Promise<{ success: boolean; session: CloudAuditSession }> {
  return request<{ success: boolean; session: CloudAuditSession }>(
    "/app/audit-sessions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function heartbeatAuditSession(
  sessionId: string,
  leaseVersion: number
): Promise<{ success: boolean; lease_expires_at: string; lease_version: number }> {
  return request<{ success: boolean; lease_expires_at: string; lease_version: number }>(
    `/app/audit-sessions/${sessionId}/heartbeat`,
    {
      method: "POST",
      body: JSON.stringify({
        till_id: getDeviceId(),
        lease_version: leaseVersion,
      }),
    }
  );
}

export async function syncAuditSessionItems(
  sessionId: string,
  leaseVersion: number,
  items: CloudAuditSessionItem[]
): Promise<{
  success: boolean;
  total_items_count: number;
  counted_items_count: number;
  last_synced_at: string;
  lease_expires_at: string;
}> {
  return request<{
    success: boolean;
    total_items_count: number;
    counted_items_count: number;
    last_synced_at: string;
    lease_expires_at: string;
  }>(`/app/audit-sessions/${sessionId}/sync-items`, {
    method: "POST",
    body: JSON.stringify({
      till_id: getDeviceId(),
      lease_version: leaseVersion,
      items,
    }),
  });
}

export async function takeoverAuditSession(
  sessionId: string,
  reason?: string
): Promise<{ success: boolean; session: CloudAuditSession }> {
  return request<{ success: boolean; session: CloudAuditSession }>(
    `/app/audit-sessions/${sessionId}/takeover`,
    {
      method: "POST",
      body: JSON.stringify({
        till_id: getDeviceId(),
        till_name: getDeviceLabel(),
        reason,
      }),
    }
  );
}

function storeHeader(storeId?: string): Record<string, string> {
  return storeId ? { "X-Store-Id": storeId } : {};
}

export async function completeAuditSession(
  sessionId: string,
  leaseVersion: number,
  submittedStockAuditId?: string | null,
  storeId?: string
): Promise<{ success: boolean; session: CloudAuditSession }> {
  return request<{ success: boolean; session: CloudAuditSession }>(
    `/app/audit-sessions/${sessionId}/complete`,
    {
      method: "POST",
      headers: storeHeader(storeId),
      body: JSON.stringify({
        till_id: getDeviceId(),
        lease_version: leaseVersion,
        submitted_stock_audit_id: submittedStockAuditId || null,
      }),
    }
  );
}

export async function abandonAuditSession(
  sessionId: string,
  reason?: string,
  leaseVersion?: number,
  storeId?: string
): Promise<{ success: boolean; session: CloudAuditSession }> {
  const lease = leaseVersion === undefined ? {} : { till_id: getDeviceId(), lease_version: leaseVersion };
  return request<{ success: boolean; session: CloudAuditSession }>(
    `/app/audit-sessions/${sessionId}/abandon`,
    {
      method: "POST",
      headers: storeHeader(storeId),
      body: JSON.stringify({ reason, ...lease }),
    }
  );
}

