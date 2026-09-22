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
  onBlur,
  onCancel,
}: {
  value: number;
  onCommit: (val: number) => void;
  parse: (raw: string) => number;
  min?: number;
  step?: string;
  hasError?: boolean;
  widthClassName?: string;
  autoFocus?: boolean;
  /** Fired after the built-in revert-if-invalid blur logic, and also on
   * Enter (which just blurs the input) — lets a caller treat blur as
   * "finalize this edit" without duplicating the invalid-value handling. */
  onBlur?: () => void;
  /** Fired on Escape, instead of blurring: lets a caller close the edit
   * without treating it as a commit (blurring would run the normal
   * onBlur/save path, which Escape should explicitly bypass). */
  onCancel?: () => void;
}) {
  const [text, setText] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    // Skipped while focused: this effect exists to pick up an external
    // (non-user-typed) change to `value` — e.g. another row's edit
    // recalculating this one — while the field is idle. While the user is
    // actively typing, `onChange` below already keeps `value` in lockstep
    // for every valid intermediate value; re-running this resync mid-entry
    // clobbered a leading-zero decimal ("0.05") back to "0" the instant the
    // trailing digits made the parsed number equal 0 again after the "0."
    // prefix was typed (see docs/KNOWN_BUGS.md).
    if (isFocused) return;
    setText(String(value));
  }, [value, isFocused]);

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
        setIsFocused(false);
        if (text === "" || isNaN(parse(text))) setText(String(value));
        onBlur?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
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
