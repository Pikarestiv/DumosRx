import type { StaffMember } from "@/lib/types/dashboard";

export interface StaffFormData {
  // Index signature keeps this assignable to the mutation hooks' loosely
  // typed `Record<string, unknown>` payload, matching the (untyped-object)
  // structural assignability this form data had before it was named here.
  [key: string]: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  role: string;
  store_id: string;
  password: string;
  pin: string;
}

/**
 * Only the fields that actually differ from the staff member's current
 * values. An update should express intent to change something, not
 * silently resubmit the whole form. This matters beyond tidiness: fields
 * the dropdown/inputs pre-fill from the record but can't actually represent
 * as an option (e.g. a store owner's role is "store_owner", which isn't a
 * selectable choice in the role dropdown) used to get resent verbatim on
 * every save regardless of whether the user touched them, tripping
 * validation that was never meant to reject that field in the first place.
 * `store_id` deliberately compares against the record's *raw* value, not
 * the dropdown's pre-filled fallback (first store in the list), so an
 * owner with no store_id doesn't get silently assigned one just because
 * they saved an unrelated field.
 */
export function getChangedFields(
  formData: StaffFormData,
  staffMember: StaffMember,
): Partial<StaffFormData> {
  const originals: Record<keyof Omit<StaffFormData, "password">, string> = {
    first_name: staffMember.first_name || "",
    last_name: staffMember.last_name || "",
    email: staffMember.email || "",
    username: staffMember.username || "",
    role: staffMember.role || "",
    store_id: staffMember.store_id || "",
    pin: staffMember.pin || "",
  };

  const changed: Partial<StaffFormData> = {};
  (Object.keys(originals) as (keyof typeof originals)[]).forEach((key) => {
    if (formData[key] !== originals[key]) {
      changed[key] = formData[key];
    }
  });

  // No "original" to diff a password against. Only send it if the user
  // actually typed a new one.
  if (formData.password) {
    changed.password = formData.password;
  }

  return changed;
}
