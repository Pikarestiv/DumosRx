import { API_BASE_URL } from "@/lib/constants";
import { anchorClock } from "./monotonic-clock";

// Tolerance for "this device's clock agrees with the server".
// Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-server-clock-ts-L4
export const CLOCK_AGREEMENT_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const SERVER_TIME_TIMEOUT_MS = 8000;

export interface ServerClockReading {
  serverNow: Date;
  localNow: Date;
  driftMs: number;
  agrees: boolean;
}

// Authoritative time from the public `/health` endpoint, which is unauthenticated and returns `{status, timestamp}` — reachable even when a fu…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#licensing-server-clock-ts-L20
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

    anchorClock(serverNow.getTime());

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
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  let magnitude: string;
  if (days > 0) {
    magnitude = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  } else if (hours > 0) {
    magnitude = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else {
    magnitude = `${minutes}m`;
  }

  return `${magnitude} ${driftMs > 0 ? "ahead of" : "behind"} our servers`;
}
