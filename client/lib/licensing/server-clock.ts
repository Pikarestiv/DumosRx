import { API_BASE_URL } from "@/lib/constants";

/**
 * Tolerance for "this device's clock agrees with the server". Wide enough to
 * absorb ordinary RTC drift and request latency, far narrower than any skew
 * capable of poisoning the monotonic watermark.
 */
export const CLOCK_AGREEMENT_TOLERANCE_MS = 5 * 60 * 1000;

const SERVER_TIME_TIMEOUT_MS = 8000;

export interface ServerClockReading {
  serverNow: Date;
  localNow: Date;
  driftMs: number;
  agrees: boolean;
}

/**
 * Authoritative time from the public `/health` endpoint, which is
 * unauthenticated and returns `{status, timestamp}` — reachable even when a
 * full sync is failing, which is the state a clock-locked device is in.
 */
export async function readServerClock(): Promise<ServerClockReading | null> {
  if (typeof window === "undefined" || !navigator.onLine) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_TIME_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { timestamp?: string };
    if (!body?.timestamp) return null;

    const serverNow = new Date(body.timestamp);
    if (Number.isNaN(serverNow.getTime())) return null;

    const localNow = new Date();
    const driftMs = localNow.getTime() - serverNow.getTime();

    return {
      serverNow,
      localNow,
      driftMs,
      agrees: Math.abs(driftMs) <= CLOCK_AGREEMENT_TOLERANCE_MS,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function describeDrift(driftMs: number): string {
  const totalMinutes = Math.round(Math.abs(driftMs) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const magnitude = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return `${magnitude} ${driftMs > 0 ? "ahead of" : "behind"} our servers`;
}
