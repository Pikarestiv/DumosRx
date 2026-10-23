"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const RELINK_CODE_LENGTH = 8;

export const normalizeRelinkCode = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();

interface RelinkCodeFieldProps {
  value: string;
  error: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}

export function RelinkCodeField({ value, error, disabled, onChange }: RelinkCodeFieldProps) {
  return (
    <div className="grid gap-2 py-4">
      <Label htmlFor="relink-code">Re-link Code</Label>
      <Input
        id="relink-code"
        className="font-mono text-center text-lg tracking-[0.3em] uppercase"
        placeholder="ABCD2345"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={RELINK_CODE_LENGTH + 4}
        value={value}
        onChange={(e) => onChange(normalizeRelinkCode(e.target.value))}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? "relink-code-error" : undefined}
      />
      {error ? (
        <p id="relink-code-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Single use and valid for 15 minutes. The owner generates it under Sessions &amp; Devices on the web dashboard.
        </p>
      )}
    </div>
  );
}
