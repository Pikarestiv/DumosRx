import type { PlatformRoleSlug } from "@/lib/types/admin";

export interface PlatformRoleOption {
  value: PlatformRoleSlug;
  label: string;
  description: string;
}

/** Shared by the create-platform-admin page and the super-admin profile
 * editor so both offer exactly the roles PUT /admin/users/{id} accepts. */
export const PLATFORM_ROLE_OPTIONS: readonly PlatformRoleOption[] = [
  {
    value: "platform_admin",
    label: "Platform Admin",
    description: "Partner/co-founder: can register accounts and grant trials",
  },
  {
    value: "agent",
    label: "Agent",
    description: "Onboarding agent: can register accounts, has a referral link",
  },
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Full platform access, including managing other platform accounts",
  },
] as const;
