import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";

// Regression coverage: the `[value]` resync effect fires whenever the `value` PROP changes while the field is idle — by de…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-editable-number-cell-leading-zero-test-tsx-L5
describe("EditableNumberCell leading-zero decimal entry", () => {
  it("does not clobber in-progress text when value changes while the field is focused", () => {
    const onCommit = vi.fn();
    // Starts at a nonzero committed value (e.g.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-editable-number-cell-leading-zero-test-tsx-L35
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

    // ...but before blur, something else legitimately changes `value` to a DIFFERENT number (a sibling row's recalculation, a…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-editable-number-cell-leading-zero-test-tsx-L54
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

// A cycle-count row nobody has reached yet has no counted quantity at all, which is not the same as a count of zero - so t…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-editable-number-cell-leading-zero-test-tsx-L89
describe("EditableNumberCell: an absent value", () => {
  it("renders empty with its placeholder instead of 'undefined'", () => {
    render(
      <EditableNumberCell
        value={undefined}
        placeholder="10"
        onCommit={vi.fn()}
        parse={(raw) => parseInt(raw, 10)}
        ariaLabel="Counted"
      />,
    );
    const input = screen.getByLabelText("Counted") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("10");
  });

  it("reports a cleared field through onClear rather than reverting", () => {
    const onClear = vi.fn();
    render(
      <EditableNumberCell
        value={7}
        onCommit={vi.fn()}
        onClear={onClear}
        parse={(raw) => parseInt(raw, 10)}
        ariaLabel="Counted"
      />,
    );
    const input = screen.getByLabelText("Counted") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");
  });

  it("still reverts an emptied field when no onClear is given", () => {
    render(
      <EditableNumberCell
        value={7}
        onCommit={vi.fn()}
        parse={(raw) => parseInt(raw, 10)}
        ariaLabel="Counted"
      />,
    );
    const input = screen.getByLabelText("Counted") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input.value).toBe("7");
  });
});
