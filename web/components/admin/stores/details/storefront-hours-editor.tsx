"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { OpeningHours, Weekday } from "@/lib/storefront-hours";

const DAYS: { key: Weekday; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export const DEFAULT_DAY_HOURS = { open: "08:00", close: "18:00" };

export const hoursAreValid = (hours: OpeningHours): boolean =>
  DAYS.every(({ key }) => !hours[key] || hours[key]!.open < hours[key]!.close);

interface StorefrontHoursEditorProps {
  hours: OpeningHours;
  onChange: (hours: OpeningHours) => void;
  disabled: boolean;
}

export function StorefrontHoursEditor({ hours, onChange, disabled }: StorefrontHoursEditorProps) {
  const setDay = (day: Weekday, value: OpeningHours[Weekday]) => onChange({ ...hours, [day]: value });

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Opening hours</legend>
      {DAYS.map(({ key, label }) => {
        const day = hours[key];
        const invalid = Boolean(day && day.open >= day.close);
        return (
          <div key={key} className="flex flex-wrap items-center gap-3">
            <span className="w-24 text-sm">{label}</span>
            <Switch
              checked={Boolean(day)}
              disabled={disabled}
              aria-label={`${label} open`}
              onCheckedChange={(open) => setDay(key, open ? DEFAULT_DAY_HOURS : null)}
            />
            {day ? (
              <>
                <Input
                  type="time"
                  aria-label={`${label} opens at`}
                  aria-invalid={invalid}
                  value={day.open}
                  disabled={disabled}
                  onChange={(e) => setDay(key, { ...day, open: e.target.value })}
                  className="h-9 w-32"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label={`${label} closes at`}
                  aria-invalid={invalid}
                  value={day.close}
                  disabled={disabled}
                  onChange={(e) => setDay(key, { ...day, close: e.target.value })}
                  className="h-9 w-32"
                />
                {invalid ? <span className="text-xs text-destructive">Closing must be after opening</span> : null}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
