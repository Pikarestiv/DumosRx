import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";

/**
 * Regression coverage: the `[value]` resync effect fires whenever the
 * `value` PROP changes while the field is idle — by design, so an external
 * update (another row's edit recalculating this one, or a value arriving
 * from elsewhere while this cell happens to still be mounted) is picked up.
 * Before the fix, that resync ran even while the field was focused and
 * mid-edit: if `value` changes to something new WHILE the user is still
 * typing (e.g. this cell's `onCommit` round-tripping a parsed number back
 * into a parent's state, or truly external data landing mid-entry), the
 * effect immediately overwrote the in-progress text with `String(value)` —
 * clobbering a leading-zero decimal like "0.05" the moment the numeric
 * value changed underneath the still-being-typed text. See
 * docs/KNOWN_BUGS.md.
 *
 * Note: a plain sequential keystroke test (typing "0", "0.", "0.0", "0.05"
 * one onChange at a time) does NOT reproduce this even against the unfixed
 * component — verified directly by reverting the `isFocused` guard and
 * re-running such a test, which still passed. That's because React bails
 * out of re-rendering (and therefore re-running the `[value]` effect) when
 * a state setter is called with a value equal to the current one, and every
 * intermediate keystroke in that specific sequence either doesn't change
 * the parsed number or changes it to exactly what `String()` of the new
 * value already matches. The real trigger is an ordinary React re-render
 * that hands the input a genuinely different `value` prop while it's
 * focused — reproduced directly below via `rerender`, which is exactly
 * what the `[value]` effect's own dependency is watching.
 */
describe("EditableNumberCell leading-zero decimal entry", () => {
  it("does not clobber in-progress text when value changes while the field is focused", () => {
    const onCommit = vi.fn();
    // Starts at a nonzero committed value (e.g. an existing selling price)
    // so that a later rerender to a genuinely different `value` actually
    // changes the effect's dependency — a rerender back to the SAME value
    // wouldn't exercise the guard at all (React skips an unchanged effect
    // dependency regardless of the fix).
    const { rerender } = render(
      <EditableNumberCell value={5} onCommit={onCommit} parse={(raw) => parseFloat(raw)} />,
    );

    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.focus(input);

    // User is retyping the price as "0.05"...
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "0." } });
    fireEvent.change(input, { target: { value: "0.0" } });
    fireEvent.change(input, { target: { value: "0.05" } });
    expect(input.value).toBe("0.05");

    // ...but before blur, something else legitimately changes `value` to a
    // DIFFERENT number (a sibling row's recalculation, a sync pull, or this
    // component's own onCommit round-tripping through a parent whose state
    // update lands on a later render pass) — here simulated as the value
    // resetting to 0. The OLD behavior resynced the displayed text to this
    // new value immediately, clobbering "0.05" back down to "0" mid-entry
    // even though the field is still focused and the user isn't done typing.
    rerender(<EditableNumberCell value={0} onCommit={onCommit} parse={(raw) => parseFloat(raw)} />);

    expect(input.value).toBe("0.05");
  });

  it("still resyncs from an external value change while not focused", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <EditableNumberCell
        value={5}
        onCommit={onCommit}
        parse={(raw) => parseFloat(raw)}
      />,
    );

    rerender(
      <EditableNumberCell
        value={10}
        onCommit={onCommit}
        parse={(raw) => parseFloat(raw)}
      />,
    );

    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("10");
  });
});
