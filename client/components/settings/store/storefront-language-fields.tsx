import { Label } from "@/components/ui/label";
import type { StorefrontLocaleId } from "@/lib/types/storefront-settings";
import { EnterpriseBadge } from "./enterprise-badge";

const LANGUAGE_NAMES = { en: "English", fr: "Français" } as const;

interface StorefrontLanguageFieldsProps {
  locale: StorefrontLocaleId;
  onLocaleChange: (locale: StorefrontLocaleId) => void;
  available: StorefrontLocaleId[];
  allowSwitch: boolean;
  onAllowSwitchChange: (allow: boolean) => void;
  switchLocked: boolean;
}

export function StorefrontLanguageFields({
  locale,
  onLocaleChange,
  available,
  allowSwitch,
  onAllowSwitchChange,
  switchLocked,
}: StorefrontLanguageFieldsProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Language</legend>
      <div className="space-y-2">
        <Label htmlFor="sf-locale">Default language</Label>
        <select
          id="sf-locale"
          value={locale}
          onChange={(event) => onLocaleChange(event.target.value as StorefrontLocaleId)}
          className="flex h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
        >
          {available.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowSwitch && !switchLocked}
          disabled={switchLocked}
          onChange={(event) => onAllowSwitchChange(event.target.checked)}
        />
        Let customers switch language
        {switchLocked ? <EnterpriseBadge /> : null}
      </label>
    </fieldset>
  );
}
