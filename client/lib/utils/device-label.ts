import { isTauri } from "@/lib/db/core";

function detectOS(ua: string): string {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "an unknown OS";
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return "Opera";
  if (/chrome\//i.test(ua)) return "Chrome";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/safari\//i.test(ua)) return "Safari";
  return "a browser";
}

// Human-readable device label sent as X-Device-Label alongside the opaque X-Device-Id, purely so the admin panel's staff sync view can show so…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-device-label-ts-L21
export function getDeviceLabel(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "Unknown device";
  }
  const ua = navigator.userAgent;
  if (isTauri()) {
    return `Desktop App (${detectOS(ua)})`;
  }
  return `${detectBrowser(ua)} on ${detectOS(ua)}`;
}
