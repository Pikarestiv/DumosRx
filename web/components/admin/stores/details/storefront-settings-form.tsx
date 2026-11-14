"use client";

import { useState } from "react";
import { toast } from "sonner";

import { hoursAreValid, StorefrontHoursEditor } from "./storefront-hours-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateStoreStorefrontSettingsMutation } from "@/lib/api/admin-hooks";
import { ACCENT_SWATCHES, isHexColour, readableForeground } from "@/lib/storefront-accent";
import type { OpeningHours } from "@/lib/storefront-hours";
import { LOCALE_NAMES, STOREFRONT_LOCALES, resolveEnabledLocales, resolveLocale, type StorefrontLocale } from "@/lib/storefront-i18n";
import { resolveStorefrontPreset } from "@/lib/storefront-themes";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";
import { cn } from "@/lib/utils";

interface StorefrontSettingsFormProps {
  store: AdminStoreDetail;
  accent: string;
  onAccentChange: (accent: string) => void;
  editable: boolean;
}

const WHATSAPP_PATTERN = /^\+?[0-9 ()-]{6,32}$/;
const TAGLINE_MAX = 140;

export function StorefrontSettingsForm({ store, accent, onAccentChange, editable }: StorefrontSettingsFormProps) {
  const save = useUpdateStoreStorefrontSettingsMutation();
  const { storefront } = store;
  const preset = resolveStorefrontPreset(storefront.theme, store.store_type);
  const [tagline, setTagline] = useState(storefront.tagline ?? "");
  const [whatsapp, setWhatsapp] = useState(storefront.whatsapp ?? "");
  const [pickup, setPickup] = useState(storefront.pickup_minutes ? String(storefront.pickup_minutes) : "");
  const [hours, setHours] = useState<OpeningHours>(storefront.opening_hours ?? {});
  const [locale, setLocale] = useState<StorefrontLocale>(resolveLocale(storefront.locale));
  const [ownerStyle, setOwnerStyle] = useState(Boolean(storefront.owner_style_enabled));
  const [allowSwitch, setAllowSwitch] = useState(resolveEnabledLocales(resolveLocale(storefront.locale), storefront.enabled_locales).length > 1);

  const accentValid = accent === "" || isHexColour(accent);
  const contrast = isHexColour(accent) ? readableForeground(accent, preset.ink) : null;
  const whatsappValid = whatsapp === "" || WHATSAPP_PATTERN.test(whatsapp);
  const pickupValid = pickup === "" || (/^\d+$/.test(pickup) && Number(pickup) >= 1 && Number(pickup) <= 1440);
  const valid = accentValid && whatsappValid && pickupValid && hoursAreValid(hours);
  const anyOpenDay = Object.values(hours).some(Boolean);

  const submit = () =>
    save.mutate(
      {
        id: store.id,
        settings: {
          accent: accent === "" ? null : accent.toUpperCase(),
          tagline: tagline.trim() || null,
          whatsapp: whatsapp.trim() || null,
          pickup_minutes: pickup === "" ? null : Number(pickup),
          opening_hours: anyOpenDay ? hours : null,
          locale,
          owner_style_enabled: ownerStyle,
          enabled_locales: allowSwitch ? [locale, ...STOREFRONT_LOCALES.filter((code) => code !== locale)] : [locale],
        },
      },
      {
        onSuccess: () => toast.success("Storefront settings saved; they go live with the next rebuild"),
        onError: (error) =>
          toast.error(error instanceof Error && error.message ? error.message : "Could not save the storefront settings"),
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
      <div className="space-y-2">
        <label htmlFor="storefront-accent" className="text-sm font-medium">
          Accent colour
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              disabled={!editable}
              aria-label={`Use accent ${swatch}`}
              aria-pressed={accent.toUpperCase() === swatch}
              onClick={() => onAccentChange(swatch)}
              className={cn("h-8 w-8 rounded-full border", accent.toUpperCase() === swatch && "ring-2 ring-foreground ring-offset-2")}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <Input
            id="storefront-accent"
            value={accent}
            disabled={!editable}
            placeholder={preset.accent}
            aria-invalid={!accentValid}
            onChange={(event) => onAccentChange(event.target.value.trim())}
            className="h-9 w-32 font-mono text-xs"
          />
          {accent !== "" && editable ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onAccentChange("")}>
              Use the preset&apos;s colour
            </Button>
          ) : null}
        </div>
        {!accentValid ? <p className="text-xs text-destructive">Use a six-digit hex colour such as #F2B705.</p> : null}
        {contrast && !contrast.readable ? (
          <p role="alert" className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Neither white nor dark text is easy to read on this colour ({contrast.contrast.toFixed(1)}:1, 4.5:1 needed).
            Buttons will be hard to read.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="storefront-tagline" className="text-sm font-medium">
          Tagline
        </label>
        <Input
          id="storefront-tagline"
          value={tagline}
          maxLength={TAGLINE_MAX}
          disabled={!editable}
          placeholder="Leave blank to use the default for this store type"
          onChange={(event) => setTagline(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="storefront-whatsapp" className="text-sm font-medium">
            WhatsApp number
          </label>
          <Input
            id="storefront-whatsapp"
            value={whatsapp}
            disabled={!editable}
            aria-invalid={!whatsappValid}
            placeholder="+237 6 00 00 00 00"
            onChange={(event) => setWhatsapp(event.target.value)}
          />
          {!whatsappValid ? <p className="text-xs text-destructive">Digits, spaces and a leading + only.</p> : null}
        </div>
        <div className="space-y-2">
          <label htmlFor="storefront-pickup" className="text-sm font-medium">
            Pickup time (minutes)
          </label>
          <Input
            id="storefront-pickup"
            inputMode="numeric"
            value={pickup}
            disabled={!editable}
            aria-invalid={!pickupValid}
            placeholder="20"
            onChange={(event) => setPickup(event.target.value)}
          />
          {!pickupValid ? <p className="text-xs text-destructive">A whole number from 1 to 1440.</p> : null}
        </div>
      </div>

      <StorefrontHoursEditor hours={hours} onChange={setHours} disabled={!editable} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Language</legend>
        <div className="space-y-2">
          <label htmlFor="storefront-locale" className="text-sm">
            Default language
          </label>
          <select
            id="storefront-locale"
            value={locale}
            disabled={!editable}
            onChange={(event) => setLocale(resolveLocale(event.target.value))}
            className="flex h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
          >
            {STOREFRONT_LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_NAMES[code]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowSwitch}
            disabled={!editable}
            onChange={(event) => setAllowSwitch(event.target.checked)}
          />
          Let visitors switch language
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Owner access</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={ownerStyle}
            disabled={!editable}
            onChange={(event) => setOwnerStyle(event.target.checked)}
          />
          <span>
            Let the store owner change the look themselves from the till
            <span className="block text-xs text-muted-foreground">
              Off by default. Each change the owner saves queues an automatic rebuild of every storefront, which costs a deploy.
            </span>
          </span>
        </label>
      </fieldset>

      {editable ? (
        <Button type="submit" disabled={!valid || save.isPending}>
          {save.isPending ? "Saving…" : "Save storefront settings"}
        </Button>
      ) : null}
    </form>
  );
}
