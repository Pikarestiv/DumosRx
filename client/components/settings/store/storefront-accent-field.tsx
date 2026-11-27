import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ACCENT_SWATCHES, isHexColour, readableTextOn } from "@/lib/utils/storefront-accent";
import { EnterpriseBadge } from "./enterprise-badge";

interface StorefrontAccentFieldProps {
  accent: string;
  onChange: (accent: string) => void;
  defaults: { ink: string; accent: string };
  locked: boolean;
}

export function StorefrontAccentField({ accent, onChange, defaults, locked }: StorefrontAccentFieldProps) {
  const valid = accent === "" || isHexColour(accent);
  const readability = isHexColour(accent) ? readableTextOn(accent, defaults.ink) : null;

  return (
    <fieldset disabled={locked} className="space-y-2 disabled:opacity-60">
      <div className="flex items-center gap-2">
        <Label htmlFor="sf-accent">Accent colour</Label>
        {locked ? <EnterpriseBadge /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Use accent ${swatch}`}
            aria-pressed={accent.toUpperCase() === swatch}
            onClick={() => onChange(swatch)}
            className={cn("h-8 w-8 rounded-full border", accent.toUpperCase() === swatch && "ring-2 ring-primary ring-offset-2")}
            style={{ backgroundColor: swatch }}
          />
        ))}
        <Input
          id="sf-accent"
          value={accent}
          placeholder={defaults.accent}
          aria-invalid={!valid}
          onChange={(event) => onChange(event.target.value.trim())}
          className="h-9 w-32 font-mono text-xs"
        />
        {accent !== "" ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
            Use the style&apos;s colour
          </Button>
        ) : null}
      </div>
      {!valid ? <p className="text-xs text-destructive">Use a six-digit hex colour such as #F2B705.</p> : null}
      {readability && !readability.readable ? (
        <p role="alert" className="text-xs font-medium text-amber-600">
          Text is hard to read on this colour ({readability.contrast.toFixed(1)}:1, 4.5:1 needed). Pick a lighter or darker one.
        </p>
      ) : null}
    </fieldset>
  );
}
