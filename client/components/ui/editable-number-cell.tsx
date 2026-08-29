import { useEffect, useState } from "react";

/** A number input that tracks its own text while typing instead of mirroring
 * the committed number on every keystroke. Without this, clearing the field
 * to type a fresh value immediately re-renders as "0" (parsing "" forces a
 * 0 commit, which round-trips back into the controlled `value`), so you'd
 * have to type a digit first then delete the stray 0 rather than just
 * clearing and typing. Here, an empty/partial field is allowed to sit as-is
 * until a valid number is typed (which commits immediately) or the field is
 * blurred still empty (which reverts to the last committed value). Shared
 * across every quick-edit numeric input in the app (cycle count ledger,
 * product catalog quick-edit) rather than reimplemented per table. */
export function EditableNumberCell({
  value,
  onCommit,
  parse,
  min = 0,
  step,
  hasError,
  widthClassName = "w-20",
  autoFocus,
}: {
  value: number;
  onCommit: (val: number) => void;
  parse: (raw: string) => number;
  min?: number;
  step?: string;
  hasError?: boolean;
  widthClassName?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={min}
      step={step}
      autoFocus={autoFocus}
      className={`${widthClassName} text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
        hasError
          ? "border-destructive text-destructive font-semibold"
          : "border-border"
      }`}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === "" || raw === "-") return;
        const parsed = parse(raw);
        if (!isNaN(parsed)) onCommit(Math.max(min, parsed));
      }}
      onBlur={() => {
        if (text === "" || isNaN(parse(text))) setText(String(value));
      }}
      onFocus={(e) => e.target.select()}
    />
  );
}
