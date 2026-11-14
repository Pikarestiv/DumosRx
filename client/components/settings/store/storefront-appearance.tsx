"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  hoursAreValid,
  StorefrontHoursFields,
} from "./storefront-hours-fields";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import {
  useStorefrontSettings,
  useUpdateStorefrontSettings,
} from "@/lib/hooks/use-storefront-settings";
import {
  ACCENT_SWATCHES,
  PRESET_DEFAULTS,
  isHexColour,
  readableTextOn,
} from "@/lib/utils/storefront-accent";
import type {
  StorefrontOpeningHours,
  StorefrontPresetId,
  StorefrontSettings,
} from "@/lib/types/storefront-settings";
import { cn } from "@/lib/utils";

const PRESETS: {
  id: StorefrontPresetId;
  label: string;
  description: string;
}[] = [
  {
    id: "workshop",
    label: "Workshop",
    description:
      "Dark banner and square buttons. For hardware and general retail.",
  },
  {
    id: "clinic",
    label: "Clinic",
    description: "Light, calm and rounded. For pharmacies.",
  },
  {
    id: "studio",
    label: "Studio",
    description:
      "Elegant serif and outlined buttons. For beauty, spa and fashion.",
  },
];

const LANGUAGE_NAMES = { en: "English", fr: "Français" } as const;
const WHATSAPP_PATTERN = /^\+?[0-9 ()-]{6,32}$/;

function presetFor(settings: StorefrontSettings): StorefrontPresetId {
  const chosen = PRESETS.find((preset) => preset.id === settings.theme);
  if (chosen) return chosen.id;
  return settings.store_type === "pharmacy" ? "clinic" : "workshop";
}

export function StorefrontAppearance() {
  const { canCustomizeTheme, getUpgradeMessage } = useFeatureGate();
  const query = useStorefrontSettings(true);

  if (query.isLoading) return null;

  if (query.isError || !query.data || !query.data.allowed) {
    return (
      <p className="text-xs text-muted-foreground">
        Want a different look, language or opening hours on your storefront?
        Contact your account manager and they will set it up for you.
      </p>
    );
  }

  return (
    <AppearanceForm
      settings={query.data}
      locked={!canCustomizeTheme}
      lockedMessage={getUpgradeMessage(
        "custom_branding",
        "Upgrade your plan to customise how your storefront looks.",
      )}
    />
  );
}

interface AppearanceFormProps {
  settings: StorefrontSettings;
  locked: boolean;
  lockedMessage: string;
}

function AppearanceForm({
  settings,
  locked,
  lockedMessage,
}: AppearanceFormProps) {
  const save = useUpdateStorefrontSettings();
  const [chosenPreset, setPreset] = useState<StorefrontPresetId | null>(null);
  const preset = chosenPreset ?? presetFor(settings);
  const [accent, setAccent] = useState(settings.accent ?? "");
  const [tagline, setTagline] = useState(settings.tagline ?? "");
  const [whatsapp, setWhatsapp] = useState(settings.whatsapp ?? "");
  const [pickup, setPickup] = useState(
    settings.pickup_minutes ? String(settings.pickup_minutes) : "",
  );
  const [hours, setHours] = useState<StorefrontOpeningHours>(
    settings.opening_hours ?? {},
  );
  const [locale, setLocale] = useState(settings.locale);
  const [allowSwitch, setAllowSwitch] = useState(
    settings.enabled_locales.length > 1,
  );

  const defaults = PRESET_DEFAULTS[preset];
  const accentValid = accent === "" || isHexColour(accent);
  const readability = isHexColour(accent)
    ? readableTextOn(accent, defaults.ink)
    : null;
  const whatsappValid = whatsapp === "" || WHATSAPP_PATTERN.test(whatsapp);
  const pickupValid =
    pickup === "" ||
    (/^\d+$/.test(pickup) && Number(pickup) >= 1 && Number(pickup) <= 1440);
  const valid =
    accentValid && whatsappValid && pickupValid && hoursAreValid(hours);
  const anyOpenDay = Object.values(hours).some(Boolean);

  const submit = () =>
    save.mutate(
      {
        ...(chosenPreset ? { theme: chosenPreset } : {}),
        accent: accent === "" ? null : accent.toUpperCase(),
        tagline: tagline.trim() || null,
        whatsapp: whatsapp.trim() || null,
        pickup_minutes: pickup === "" ? null : Number(pickup),
        opening_hours: anyOpenDay ? hours : null,
        locale,
        enabled_locales: allowSwitch
          ? [
              locale,
              ...settings.available_locales.filter((code) => code !== locale),
            ]
          : [locale],
      },
      {
        onSuccess: () =>
          toast.success(
            "Saved. Your storefront updates within about 15 minutes.",
          ),
        onError: (error) =>
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : "Could not save your storefront settings",
          ),
      },
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !locked) submit();
      }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Look &amp; details</h4>
        <p className="text-xs text-muted-foreground">
          How your public storefront looks and what it tells customers.
        </p>
      </div>

      {locked ? (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <Lock className="h-4 w-4 shrink-0" /> {lockedMessage}
        </p>
      ) : null}

      <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
        <div
          role="radiogroup"
          aria-label="Storefront style"
          className="grid gap-3 md:grid-cols-3"
        >
          {PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={preset === option.id}
              onClick={() => setPreset(option.id)}
              className={cn(
                "space-y-1 rounded-lg border p-3 text-left text-sm",
                preset === option.id && "ring-2 ring-primary",
              )}
            >
              <span className="block font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">
                {option.description}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sf-accent">Accent colour</Label>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Use accent ${swatch}`}
                aria-pressed={accent.toUpperCase() === swatch}
                onClick={() => setAccent(swatch)}
                className={cn(
                  "h-8 w-8 rounded-full border",
                  accent.toUpperCase() === swatch &&
                    "ring-2 ring-primary ring-offset-2",
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
            <Input
              id="sf-accent"
              value={accent}
              placeholder={defaults.accent}
              aria-invalid={!accentValid}
              onChange={(event) => setAccent(event.target.value.trim())}
              className="h-9 w-32 font-mono text-xs"
            />
            {accent !== "" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAccent("")}
              >
                Use the style&apos;s colour
              </Button>
            ) : null}
          </div>
          {!accentValid ? (
            <p className="text-xs text-destructive">
              Use a six-digit hex colour such as #F2B705.
            </p>
          ) : null}
          {readability && !readability.readable ? (
            <p role="alert" className="text-xs font-medium text-amber-600">
              Text is hard to read on this colour (
              {readability.contrast.toFixed(1)}:1, 4.5:1 needed). Pick a lighter
              or darker one.
            </p>
          ) : null}
        </div>

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
              <p className="text-xs text-destructive">
                Digits, spaces and a leading + only.
              </p>
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
            {!pickupValid ? (
              <p className="text-xs text-destructive">
                A whole number from 1 to 1440.
              </p>
            ) : null}
          </div>
        </div>

        <StorefrontHoursFields hours={hours} onChange={setHours} />

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Language</legend>
          <div className="space-y-2">
            <Label htmlFor="sf-locale">Default language</Label>
            <select
              id="sf-locale"
              value={locale}
              onChange={(event) =>
                setLocale(event.target.value as StorefrontSettings["locale"])
              }
              className="flex h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
            >
              {settings.available_locales.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowSwitch}
              onChange={(event) => setAllowSwitch(event.target.checked)}
            />
            Let customers switch language
          </label>
        </fieldset>
      </fieldset>

      {!locked ? (
        <Button type="submit" disabled={!valid || save.isPending}>
          {save.isPending ? "Saving…" : "Save look & details"}
        </Button>
      ) : null}
    </form>
  );
}
