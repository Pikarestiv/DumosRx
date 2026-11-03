const DEVICE_ID_KEY = "dumos_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "unknown";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = "DRX-WEB-" + Math.random().toString(36).substring(2, 11).toUpperCase();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
