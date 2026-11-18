import { apiClient } from "@/lib/api/client";
import { getAuthToken } from "@/lib/storage-keys";
import { isImpersonatedSession } from "@/lib/utils/impersonation";

export const STAFF_EMAIL_TAKEN_MESSAGE = "That email is already used by another account. Choose a different one.";

export class StaffEmailTakenError extends Error {
  constructor() {
    super(STAFF_EMAIL_TAKEN_MESSAGE);
    this.name = "StaffEmailTakenError";
  }
}

export async function assertStaffEmailFree(email: string | null | undefined, ignoreId?: string): Promise<void> {
  const address = email?.trim();
  if (!address || !navigator.onLine || !getAuthToken() || isImpersonatedSession()) return;

  let available = true;
  try {
    ({ available } = await apiClient.checkStaffEmailAvailable(address, ignoreId));
  } catch {
    return;
  }
  if (!available) throw new StaffEmailTakenError();
}
