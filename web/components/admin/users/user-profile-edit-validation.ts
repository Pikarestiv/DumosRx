import {
  PLATFORM_ROLE_SLUGS,
  type AdminUser,
  type AdminUserProfileUpdate,
  type PlatformRoleSlug,
} from "@/lib/types/admin";

/** The always-present floor. Any caller that can see the custom platform
 * roles (via usePlatformRoleOptions) passes the merged set instead. */
const BUILT_IN_SLUGS: readonly string[] = PLATFORM_ROLE_SLUGS;

export interface UserProfileEditValues {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  role: PlatformRoleSlug;
}

export type UserProfileEditErrors = Partial<Record<keyof UserProfileEditValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUserProfileEdit(
  values: UserProfileEditValues,
  allowedRoleSlugs: readonly string[] = BUILT_IN_SLUGS,
): UserProfileEditErrors {
  const errors: UserProfileEditErrors = {};

  if (values.first_name.trim().length < 2) {
    errors.first_name = "First name must be at least 2 characters.";
  }
  if (values.last_name.trim().length < 2) {
    errors.last_name = "Last name must be at least 2 characters.";
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (!allowedRoleSlugs.includes(values.role)) {
    errors.role = "Pick one of the platform roles.";
  }

  return errors;
}

export function toEditValues(
  user: AdminUser,
  allowedRoleSlugs: readonly string[] = BUILT_IN_SLUGS,
): UserProfileEditValues {
  return {
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    phone: user.phone ?? "",
    email: user.email,
    role: allowedRoleSlugs.includes(user.role_slug ?? "")
      ? (user.role_slug as PlatformRoleSlug)
      : "platform_admin",
  };
}

/** Only what the admin actually changed, so an untouched field is never
 * resent (and an unchanged email never trips the server's uniqueness rule). */
export function buildUserProfileUpdate(
  user: AdminUser,
  values: UserProfileEditValues,
  allowedRoleSlugs: readonly string[] = BUILT_IN_SLUGS,
): AdminUserProfileUpdate {
  const original = toEditValues(user, allowedRoleSlugs);
  const payload: AdminUserProfileUpdate = {};

  if (values.first_name.trim() !== original.first_name) payload.first_name = values.first_name.trim();
  if (values.last_name.trim() !== original.last_name) payload.last_name = values.last_name.trim();
  if (values.phone.trim() !== original.phone) payload.phone = values.phone.trim();
  if (values.email.trim() !== original.email) payload.email = values.email.trim();
  if (values.role !== original.role) payload.role = values.role;

  return payload;
}
