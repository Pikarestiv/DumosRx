import { STAFF_EMAIL_TAKEN_MESSAGE } from "@/lib/utils/staff-email-check";

export function normalizeStaffEmail(email: string | null | undefined): string | null {
  const address = email?.trim();
  return address ? address : null;
}

export function staffSaveErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  if (!message.includes("UNIQUE")) return null;
  if (message.includes("users.email")) return STAFF_EMAIL_TAKEN_MESSAGE;
  if (message.includes("users.username")) return "That username is already used in this store. Choose a different one.";
  return "Another staff account already uses one of these details. Check them and try again.";
}
