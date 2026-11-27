"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hoursAreValid, StorefrontHoursFields } from "./storefront-hours-fields";
import { useStorefrontSettings, useUpdateStorefrontSettings } from "@/lib/hooks/use-storefront-settings";
import { PRESET_DEFAULTS, isHexColour } from "@/lib/utils/storefront-accent";
import type { StorefrontOpeningHours, StorefrontPresetId, StorefrontSettings } from "@/lib/types/storefront-settings";
import { StorefrontStylePicker } from "./storefront-style-picker";
import { StorefrontAccentField } from "./storefront-accent-field";
import { StorefrontLanguageFields } from "./storefront-language-fields";
import { StorefrontPlanFeatures } from "./storefront-plan-features";
import { isStorefrontPreset, presetLabel } from "./storefront-preset-options";

const WHATSAPP_PATTERN = /^\+[0-9 ()-]{6,31}$/;

function presetFor(settings: StorefrontSettings): StorefrontPresetId | null {
  if (isStorefrontPreset(settings.theme)) {
    return settings.available_themes.includes(settings.theme) ? settings.theme : null;
  }
  return settings.store_type === "pharmacy" ? "clinic" : "workshop";
}

function CheckoutWarning({ warning }: { warning?: string | null }) {
  if (!warning) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {warning}
    </p>
  );
}

export function StorefrontAppearance() {
  const query = useStorefrontSettings(true);

  if (query.isLoading) return null;

  const data = query.isError ? undefined : query.data;
  const warning = <CheckoutWarning warning={data?.checkout_warning} />;

  if (data?.allowed) {
    return (
      <div className="space-y-4">
        {warning}
        <AppearanceForm settings={data} />
      </div>
    );
  }

  if (data?.entitlements && !data.entitlements.owner_self_edit_look) {
    return (
      <div className="space-y-4">
        {warning}
        <StorefrontPlanFeatures entitlements={data.entitlements} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {warning}
      <p className="text-xs text-muted-foreground">
        Want a different look, language or opening hours? Your account manager can change them for you.
      </p>
    </div>
  );
}

function AppearanceForm({ settings }: { settings: StorefrontSettings }) {
  const save = useUpdateStorefrontSettings();
  const accentLocked = settings.entitlements?.custom_accent_colour === false;
  const switchLocked = settings.entitlements?.visitor_language_switch === false;
  const [chosenPreset, setPreset] = useState<StorefrontPresetId | null>(null);
  const preset = chosenPreset ?? presetFor(settings);
  const managedPresetLabel = preset === null ? presetLabel(settings.theme) : undefined;
  const [accent, setAccent] = useState(settings.accent ?? "");
  const [tagline, setTagline] = useState(settings.tagline ?? "");
  const [whatsapp, setWhatsapp] = useState(settings.whatsapp ?? "");
  const [pickup, setPickup] = useState(settings.pickup_minutes ? String(settings.pickup_minutes) : "");
  const [hours, setHours] = useState<StorefrontOpeningHours>(settings.opening_hours ?? {});
  const [locale, setLocale] = useState(settings.locale);
  const [allowSwitch, setAllowSwitch] = useState(settings.enabled_locales.length > 1);

  const defaults = PRESET_DEFAULTS[preset ?? "workshop"];
  const accentValid = accentLocked || accent === "" || isHexColour(accent);
  const whatsappValid = whatsapp === "" || WHATSAPP_PATTERN.test(whatsapp);
  const pickupValid = pickup === "" || (/^\d+$/.test(pickup) && Number(pickup) >= 1 && Number(pickup) <= 1440);
  const valid = accentValid && whatsappValid && pickupValid && hoursAreValid(hours);
  const anyOpenDay = Object.values(hours).some(Boolean);
  const switchOn = allowSwitch && !switchLocked;

  const submit = () =>
    save.mutate(
      {
        ...(chosenPreset ? { theme: chosenPreset } : {}),
        ...(accentLocked ? {} : { accent: accent === "" ? null : accent.toUpperCase() }),
        tagline: tagline.trim() || null,
        whatsapp: whatsapp.trim() || null,
        pickup_minutes: pickup === "" ? null : Number(pickup),
        opening_hours: anyOpenDay ? hours : null,
        locale,
        enabled_locales: switchOn ? [locale, ...settings.available_locales.filter((code) => code !== locale)] : [locale],
      },
      {
        onSuccess: () => toast.success("Saved. Your storefront updates within about 15 minutes."),
        onError: (error) =>
          toast.error(error instanceof Error && error.message ? error.message : "Could not save your storefront settings"),
      },
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) submit();
      }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Look &amp; details</h4>
        <p className="text-xs text-muted-foreground">How your public storefront looks and what it tells customers.</p>
      </div>

      {managedPresetLabel ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          Your storefront uses the {managedPresetLabel} style, set by your account manager. Choosing a style below replaces it.
        </p>
      ) : null}
      <StorefrontStylePicker selected={preset} allowed={settings.available_themes} onSelect={setPreset} />

      <StorefrontAccentField accent={accent} onChange={setAccent} defaults={defaults} locked={accentLocked} />

      <div className="space-y-2">
        <Label htmlFor="sf-tagline">Tagline</Label>
        <Input
          id="sf-tagline"
          value={tagline}
          maxLength={140}
          placeholder="Leave blank to use a default for your type of store"
          onChange={(event) => setTagline(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sf-whatsapp">WhatsApp number</Label>
          <Input
            id="sf-whatsapp"
            value={whatsapp}
            aria-invalid={!whatsappValid}
            placeholder="+237 6 00 00 00 00"
            onChange={(event) => setWhatsapp(event.target.value)}
          />
          {!whatsappValid ? (
            <p className="text-xs text-destructive">Start with + and the country code, e.g. +237 6 00 00 00 00.</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="sf-pickup">Pickup time (minutes)</Label>
          <Input
            id="sf-pickup"
            inputMode="numeric"
            value={pickup}
            aria-invalid={!pickupValid}
            placeholder="20"
            onChange={(event) => setPickup(event.target.value)}
          />
          {!pickupValid ? <p className="text-xs text-destructive">A whole number from 1 to 1440.</p> : null}
        </div>
      </div>

      <StorefrontHoursFields hours={hours} onChange={setHours} />

      <StorefrontLanguageFields
        locale={locale}
        onLocaleChange={setLocale}
        available={settings.available_locales}
        allowSwitch={allowSwitch}
        onAllowSwitchChange={setAllowSwitch}
        switchLocked={switchLocked}
      />

      <Button type="submit" disabled={!valid || save.isPending}>
        {save.isPending ? "Saving…" : "Save look & details"}
      </Button>
    </form>
  );
}
