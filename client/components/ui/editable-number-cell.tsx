import { useEffect, useState } from "react";

// A number input that tracks its own text while typing instead of mirroring the committed number on every keystroke.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-editable-number-cell-tsx-L3
// `undefined` renders as an empty field (and shows `placeholder`), which is distinct from 0 - a cycle-count row nobody has…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-editable-number-cell-tsx-L13
function toText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

export function EditableNumberCell({
  value,
  onCommit,
  parse,
  min = 0,
  step,
  hasError,
  widthClassName = "w-20",
  autoFocus,
  onBlur,
  onCancel,
  ariaLabel,
  onSubmit,
  inputMode,
  placeholder,
  onClear,
}: {
  value: number | undefined;
  onCommit: (val: number) => void;
  parse: (raw: string) => number;
  min?: number;
  step?: string;
  hasError?: boolean;
  widthClassName?: string;
  autoFocus?: boolean;
  /** Fired on Enter INSTEAD of blurring, when provided: lets a caller treat
   * Enter as the only explicit commit without blur also counting as one. */
  onSubmit?: () => void;
  /** Which on-screen keyboard mobile/Android WebView should offer. Defaults
   * to "decimal" for a stepped (fractional) field, "numeric" otherwise. */
  inputMode?: "numeric" | "decimal";
  // Fired after the built-in revert-if-invalid blur logic, and also on Enter (which just blurs the input) — lets a caller tr…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-editable-number-cell-tsx-L51
  onBlur?: () => void;
  // Fired on Escape, instead of blurring:
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-editable-number-cell-tsx-L55
  onCancel?: () => void;
  // Accessible name for the input.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-editable-number-cell-tsx-L59
  ariaLabel?: string;
  // Shown while the field is empty - e.g.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-editable-number-cell-tsx-L64
  placeholder?: string;
  // When provided, blurring an empty field reports the value as cleared instead of reverting to the last committed number.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-ui-editable-number-cell-tsx-L68
  onClear?: () => void;
}) {
  const [text, setText] = useState(toText(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    // Skipped while focused:
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-ui-editable-number-cell-tsx-L78
    if (isFocused) return;
    setText(toText(value));
  }, [value, isFocused]);

  return (
    <input
      type="number"
      inputMode={inputMode ?? (step ? "decimal" : "numeric")}
      min={min}
      step={step}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      className={`${widthClassName} text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background font-semibold placeholder:font-normal [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
        hasError
          ? "border-destructive text-destructive"
          : "border-border text-foreground"
      }`}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === "" || raw === "-") return;
        const parsed = parse(raw);
        if (!isNaN(parsed)) onCommit(Math.max(min, parsed));
      }}
      onBlur={() => {
        setIsFocused(false);
        if (text === "" && onClear) onClear();
        else if (text === "" || isNaN(parse(text))) setText(toText(value));
        onBlur?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (onSubmit) {
            e.preventDefault();
            onSubmit();
          } else e.currentTarget.blur();
        }
        else if (e.key === "Escape") {
          // Chrome's native <input type="number"> has its own Escape
          // behavior (revert + blur) that fires as the key's default action.
          // Left unsuppressed, that native blur races our own state update
          // below and occasionally wins, running the blur-triggered save
          // path before onCancel's skipNextBlur guard is set — an
          // intermittent bug where Escape saved instead of canceling.
          e.preventDefault();
          onCancel?.();
        }
      }}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
      }}
    />
  );
}
