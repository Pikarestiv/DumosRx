import { PERMISSION_CATALOG } from "./permissions";

/**
 * Every settings tab that was hidden behind the coarse `isAdmin` check
 * (i.e. `manage_staff`) before the Store & Settings enforcement pass.
 * Tabs listed in SETTINGS_TAB_PERMISSIONS below are resolved by their own
 * key instead; the rest still fall back to this list.
 */
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
] as const;

/**
 * The Store & Settings permission key each settings tab requires, replacing
 * the one coarse `isAdmin` gate that used to cover all of them. The map is
 * the single source of truth for the desktop tab rail, the mobile menu list
 * and use-settings' URL resolution, so a tab can never be reachable by
 * typing `/settings/<tab>` after its trigger has been hidden.
 *
 * Tabs deliberately absent keep the `isAdmin` fallback: `personal-info` has
 * no key in the catalog, `product-units` / `categories` belong to Inventory
 * & Stock, `staff` / `roles` to Staff & Groups, and `danger-zone` already
 * enforces `factory_reset` inside the panel itself.
 */
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

/**
 * Pure so the whole tab-visibility rule is unit-testable without an auth
 * render harness. `hasKey` is the caller's own permission check
 * (useHasPermission in a component, hasPermission() in a hook).
 */
export function canAccessSettingsTab(
  tab: string,
  isAdmin: boolean,
  hasKey: (key: string) => boolean,
): boolean {
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
