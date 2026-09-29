import type { AdminAccountType } from "@/lib/types/admin";

// Maps the filter dropdown's display labels to the backend's raw `role`
// slugs (AdminUserService::getGlobalUsers's `role` query param does an exact
// match against the `users.role` column, not the humanized label). Staff-tier
// roles are absent by design: staff accounts are no longer listed in the
// Platform Users directory at all, they are reached from a store's details
// page or from its owner's profile. See web/AGENTS.md.
export const ROLE_FILTER_SLUGS: Record<string, string> = {
  "Super Admin": "super_admin",
  "Platform Admin": "platform_admin",
  Agent: "agent",
  "Store Owner": "store_owner",
  "Store Admin": "admin",
};

export const ACCOUNT_TYPE_TABS: Array<{
  value: AdminAccountType;
  label: string;
  hint: string;
}> = [
  {
    value: "owners",
    label: "Store Owners",
    hint: "Accounts that own a store. Their staff live on the store's details page.",
  },
  {
    value: "platform",
    label: "Platform Team",
    hint: "Super admins, platform admins and agents — no store affiliation.",
  },
];

export const ROLE_LABELS_BY_ACCOUNT_TYPE: Record<AdminAccountType, string[]> = {
  owners: ["Store Owner", "Store Admin"],
  platform: ["Super Admin", "Platform Admin", "Agent"],
  staff: [],
};
