import { PERMISSION_CATALOG } from "./permissions";

// Every settings tab that was hidden behind the coarse `isAdmin` check (i.e.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-settings-tabs-ts-L3
export const ADMIN_ONLY_SETTINGS_TABS = [
  "personal-info",
  "business-info",
  "branches",
  "payment-methods",
  "receipt-settings",
  "register-configs",
  "product-units",
  "categories",
  "data",
  "staff",
  "system",
  "billing",
  "roles",
  "danger-zone",
] as const;

export const DIAGNOSTICS_SETTINGS_TAB = "diagnostics";

export const ALL_SETTINGS_TABS = [
  "appearance",
  "personal-info",
  "security",
  "business-info",
  "branches",
  "staff",
  "payment-methods",
  "receipt-settings",
  "register-configs",
  "product-units",
  "categories",
  "notifications",
  "data",
  "system",
  "billing",
  "roles",
  "danger-zone",
  DIAGNOSTICS_SETTINGS_TAB,
] as const;

// The Store & Settings permission key each settings tab requires, replacing the one coarse `isAdmin` gate that used to cover all of them.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-settings-tabs-L49
export const SETTINGS_TAB_PERMISSIONS: Record<string, string> = {
  "business-info": "manage_store_settings",
  branches: "manage_store_settings",
  "receipt-settings": "manage_store_settings",
  "register-configs": "manage_store_settings",
  "payment-methods": "manage_payment_accounts",
  data: "backup_restore_data",
  billing: "manage_billing",
  system: "manage_device_settings",
};

// The two support sessions that can see the diagnostics console.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-settings-tabs-ts-L67
export interface SupportSessionAccess {
  inspecting?: boolean;
  impersonating?: boolean;
}

// Pure so the whole tab-visibility rule is unit-testable without an auth render harness.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-settings-tabs-ts-L62
export function canAccessSettingsTab(
  tab: string,
  isAdmin: boolean,
  hasKey: (key: string) => boolean,
  support: SupportSessionAccess = {},
): boolean {
  // Both support sessions, not just inspection:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-constants-settings-tabs-ts-L73
  if (tab === DIAGNOSTICS_SETTINGS_TAB) {
    return !!support.inspecting || !!support.impersonating;
  }

  // An on-till inspection is read-only, so it is denied the tabs whose actions bypass the write guard.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-constants-settings-tabs-ts-L80
  if (support.inspecting) return false;

  const required = SETTINGS_TAB_PERMISSIONS[tab];
  if (required) return hasKey(required);
  return isAdmin || !(ADMIN_ONLY_SETTINGS_TABS as readonly string[]).includes(tab);
}

/** Guards against a typo in the map above silently granting a tab to
 * everyone: an unknown key would never be in any group's permission list. */
export function settingsTabPermissionKeysAreInCatalog(): boolean {
  const known = new Set(PERMISSION_CATALOG.map((p) => p.key));
  return Object.values(SETTINGS_TAB_PERMISSIONS).every((k) => known.has(k));
}
