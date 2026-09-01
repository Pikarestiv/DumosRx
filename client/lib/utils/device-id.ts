const DEVICE_ID_KEY = "dumos_device_id";

/**
 * Stable per-device identifier used to correlate remote logs (Sentry,
 * /logs/client-error) and the X-Device-Id sync header with a specific
 * physical device, since store_id/user_id alone can't distinguish which
 * terminal at a multi-device store is the one failing.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "unknown";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = "DRX-" + Math.random().toString(36).substring(2, 11).toUpperCase();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
