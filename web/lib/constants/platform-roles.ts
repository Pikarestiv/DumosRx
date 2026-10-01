import type { AdminRole } from "@/lib/api/admin-hooks-roles";

export interface PlatformRoleOption {
  value: string;
  label: string;
  description: string;
}

/** The 3 built-in platform roles. Custom roles created through Admin
 * Permissions are merged on top of these at render time by
 * mergePlatformRoleOptions() — see docs/superpowers/specs for why the list is
 * dynamic rather than a fixed whitelist. */
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

/** Built-ins first, then every custom platform role not already covered by
 * one, deduped by slug. The single place this merge happens, shared by the
 * profile-edit role picker, the create-account page and the Team Activity
 * actor-role filter. */
export function mergePlatformRoleOptions(
  roles?: Pick<AdminRole, "name" | "slug">[] | null,
): PlatformRoleOption[] {
  const seen = new Set(PLATFORM_ROLE_OPTIONS.map((option) => option.value));
  const custom: PlatformRoleOption[] = [];

  for (const role of roles ?? []) {
    if (seen.has(role.slug)) continue;
    seen.add(role.slug);
    custom.push({
      value: role.slug,
      label: role.name,
      description: "Custom platform role",
    });
  }

  return [...PLATFORM_ROLE_OPTIONS, ...custom];
}

export function platformRoleSlugsFrom(
  roles?: Pick<AdminRole, "name" | "slug">[] | null,
): string[] {
  return mergePlatformRoleOptions(roles).map((option) => option.value);
}
