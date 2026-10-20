import { STORAGE_KEYS } from "@/lib/storage-keys";
const DEVICE_ID_KEY = STORAGE_KEYS.deviceId;

// Stable per-device identifier used to correlate remote logs (Sentry, /logs/client-error) and the X-Device-Id sync header with a specific phys…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-device-id-ts-L4
export function getDeviceId(): string {
  if (typeof window === "undefined") return "unknown";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = "DRX-" + Math.random().toString(36).substring(2, 11).toUpperCase();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
