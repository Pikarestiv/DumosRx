import { apiClient } from "@/lib/api/client";
import { getAuthToken } from "@/lib/storage-keys";
import { isImpersonatedSession } from "@/lib/utils/impersonation";

export const STAFF_EMAIL_TAKEN_MESSAGE = "That email is already used by another account. Choose a different one.";

export const EMAIL_CHECK_TIMEOUT_MS = 4_000;

export class StaffEmailTakenError extends Error {
  constructor() {
    super(STAFF_EMAIL_TAKEN_MESSAGE);
    this.name = "StaffEmailTakenError";
  }
}

export async function assertStaffEmailFree(email: string | null | undefined, ignoreId?: string): Promise<void> {
  const address = email?.trim();
  if (!address || !navigator.onLine || !getAuthToken() || isImpersonatedSession()) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<{ available: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ available: true }), EMAIL_CHECK_TIMEOUT_MS);
  });

  let available = true;
  try {
    ({ available } = await Promise.race([apiClient.checkStaffEmailAvailable(address, ignoreId), timedOut]));
  } catch {
    return;
  } finally {
    clearTimeout(timer);
  }
  if (!available) throw new StaffEmailTakenError();
}
