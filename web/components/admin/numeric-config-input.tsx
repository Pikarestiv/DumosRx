"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumericConfigInputProps {
  id?: string;
  label: string;
  labelClass?: string;
  inputClass?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  isAcceptable: (candidate: number) => boolean;
  rejectionHint: string;
  formatValue?: (value: number) => string;
  onCommit: (value: number) => void;
}

export function NumericConfigInput({
  id,
  label,
  labelClass,
  inputClass,
  value,
  min,
  max,
  step,
  disabled,
  isAcceptable,
  rejectionHint,
  formatValue = (v) => String(v),
  onCommit,
}: NumericConfigInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(null);
  }

  const accepts = (text: string) => {
    if (text.trim() === "") return false;
    const candidate = Number(text);
    return Number.isFinite(candidate) && isAcceptable(candidate);
  };

  const text = draft ?? String(value);
  const isRejected = !accepts(text);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        className={`${inputClass ?? ""} ${isRejected ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (accepts(next)) onCommit(Number(next));
        }}
        onBlur={() => setDraft(null)}
        disabled={disabled}
      />
      {isRejected && (
        <p className="text-xs text-rose-500">
          {rejectionHint} Until then {formatValue(value)} stays saved.
        </p>
      )}
    </div>
  );
}
