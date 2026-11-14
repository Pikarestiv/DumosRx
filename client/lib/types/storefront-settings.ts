export type StorefrontPresetId = "workshop" | "clinic" | "studio";
export type StorefrontLocaleId = "en" | "fr";
export type StorefrontWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type StorefrontOpeningHours = Partial<Record<StorefrontWeekday, { open: string; close: string } | null>>;

export interface StorefrontSettings {
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

export type StorefrontSettingsUpdate = Partial<
  Pick<StorefrontSettings, "accent" | "tagline" | "whatsapp" | "pickup_minutes" | "opening_hours" | "locale" | "enabled_locales">
> & { theme?: StorefrontPresetId };
