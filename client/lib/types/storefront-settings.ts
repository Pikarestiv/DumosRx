export type StorefrontPresetId = "workshop" | "clinic" | "studio" | "market" | "boutique" | "grove";
export type StorefrontLocaleId = "en" | "fr";
export type StorefrontWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type StorefrontOpeningHours = Partial<Record<StorefrontWeekday, { open: string; close: string } | null>>;

/** What a plan's storefront may do: config/storefront_entitlements.php on the server. */
export interface StorefrontEntitlements {
  storefront_enabled: boolean;
  allowed_presets: StorefrontPresetId[];
  custom_accent_colour: boolean;
  max_online_products: number | null;
  checkout_whatsapp: boolean;
  checkout_transfer_mobile_money: boolean;
  checkout_pay_on_delivery: boolean;
  checkout_paystack: boolean;
  checkout_flutterwave: boolean;
  remove_powered_by_badge: boolean;
  services_on_storefront: boolean;
  visitor_language_switch: boolean;
  owner_self_edit_look: boolean;
  rebuild_mode: "scheduled" | "on_demand";
  custom_domain: boolean;
}

interface StorefrontPlanDetails {
  entitlements?: StorefrontEntitlements;
  checkout_warning?: string | null;
}

export interface StorefrontSettings extends StorefrontPlanDetails {
  allowed: true;
  theme: string;
  available_themes: StorefrontPresetId[];
  accent: string | null;
  tagline: string | null;
  whatsapp: string | null;
  pickup_minutes: number | null;
  opening_hours: StorefrontOpeningHours | null;
  locale: StorefrontLocaleId;
  enabled_locales: StorefrontLocaleId[];
  available_locales: StorefrontLocaleId[];
  store_type: string | null;
}

export type StorefrontSettingsResponse = StorefrontSettings | ({ allowed: false } & StorefrontPlanDetails);

export type StorefrontSettingsUpdate = Partial<
  Pick<StorefrontSettings, "accent" | "tagline" | "whatsapp" | "pickup_minutes" | "opening_hours" | "locale" | "enabled_locales">
> & { theme?: StorefrontPresetId };
