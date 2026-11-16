import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  StorefrontOpeningHours,
  StorefrontWeekday,
} from "@/lib/types/storefront-settings";

const DAYS: { key: StorefrontWeekday; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_DAY = { open: "08:00", close: "18:00" };

export const hoursAreValid = (hours: StorefrontOpeningHours): boolean =>
  DAYS.every(({ key }) => {
    const day = hours[key];
    return !day || day.open < day.close;
  });

interface StorefrontHoursFieldsProps {
  hours: StorefrontOpeningHours;
  onChange: (hours: StorefrontOpeningHours) => void;
}

export function StorefrontHoursFields({
  hours,
  onChange,
}: StorefrontHoursFieldsProps) {
  const setDay = (
    key: StorefrontWeekday,
    value: StorefrontOpeningHours[StorefrontWeekday],
  ) => onChange({ ...hours, [key]: value });

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
              aria-label={`${label} open`}
              onCheckedChange={(open) => setDay(key, open ? DEFAULT_DAY : null)}
            />
            {day ? (
              <>
                <Input
                  type="time"
                  aria-label={`${label} opens at`}
                  aria-invalid={invalid}
                  value={day.open}
                  onChange={(e) =>
                    setDay(key, { ...day, open: e.target.value })
                  }
                  className="h-9 w-32"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label={`${label} closes at`}
                  aria-invalid={invalid}
                  value={day.close}
                  onChange={(e) =>
                    setDay(key, { ...day, close: e.target.value })
                  }
                  className="h-9 w-32"
                />
                {invalid ? (
                  <span className="text-xs text-destructive">
                    Closing must be after opening
                  </span>
                ) : null}
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
