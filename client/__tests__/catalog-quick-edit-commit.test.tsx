import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { EditableQuickNumberCell } from "@/components/products/catalog-editable-cells";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";

// U5: the catalog's inline stock-quantity quick-edit committed a real inventory adjustment (and a permanent movement-ledge…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-catalog-quick-edit-commit-test-tsx-L6
describe("catalog quick-edit commit semantics", () => {
  function renderCell(props: Partial<React.ComponentProps<typeof EditableQuickNumberCell>> = {}) {
    const onSave = vi.fn();
    render(
      <EditableQuickNumberCell
        displayValue="10 units"
        value={10}
        parse={(raw) => parseInt(raw, 10)}
        canEdit
        hasTouchCapability={false}
        onSave={onSave}
        ariaLabel="Edit stock quantity (10 units)"
        {...props}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit stock quantity/i }));
    return { onSave, input: screen.getByRole("spinbutton") as HTMLInputElement };
  }

  it("does not commit a blur when the cell requires an explicit confirm", () => {
    const { onSave, input } = renderCell({ commitOnBlur: false });

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps an edited confirm-only cell open after a click-away, so the typed value is not lost", () => {
    const { onSave, input } = renderCell({ commitOnBlur: false });

    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);

    const stillOpen = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(stillOpen.value).toBe("99");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTitle(/not saved yet/i)).toBeTruthy();
  });

  it("closes an untouched confirm-only cell on click-away", () => {
    const { input } = renderCell({ commitOnBlur: false });

    fireEvent.blur(input);

    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("lets Escape and the cross cancel an edited confirm-only cell", () => {
    const first = renderCell({ commitOnBlur: false });
    fireEvent.change(first.input, { target: { value: "99" } });
    fireEvent.keyDown(first.input, { key: "Escape" });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(first.onSave).not.toHaveBeenCalled();
    cleanup();

    const second = renderCell({ commitOnBlur: false });
    fireEvent.change(second.input, { target: { value: "99" } });
    fireEvent.blur(second.input);
    fireEvent.click(screen.getByTitle("Cancel"));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(second.onSave).not.toHaveBeenCalled();
  });

  it("keeps Enter and Space inside the editing cell so the row behind it does not open", () => {
    const onRowKey = vi.fn();
    render(
      <div onKeyDown={onRowKey}>
        <EditableQuickNumberCell
          displayValue="10 units"
          value={10}
          parse={(raw) => parseInt(raw, 10)}
          canEdit
          hasTouchCapability={false}
          onSave={vi.fn()}
          ariaLabel="Edit stock quantity (10 units)"
          commitOnBlur={false}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit stock quantity/i }));
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRowKey).not.toHaveBeenCalled();
  });

  it("commits on Enter when the cell requires an explicit confirm", () => {
    const { onSave, input } = renderCell({ commitOnBlur: false });

    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith(15);
  });

  it("commits via the checkmark button when the cell requires an explicit confirm", () => {
    const { onSave, input } = renderCell({ commitOnBlur: false });

    fireEvent.change(input, { target: { value: "22" } });
    fireEvent.click(screen.getByTitle("Save"));

    expect(onSave).toHaveBeenCalledWith(22);
  });

  it("still commits on blur for cells that opt into it (the default)", () => {
    const { onSave, input } = renderCell();

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    expect(onSave).toHaveBeenCalledWith(12);
  });

  it("exposes the caller's aria-label on the collapsed cell", () => {
    render(
      <EditableQuickNumberCell
        displayValue="₦150"
        value={150}
        parse={parseFloat}
        canEdit
        hasTouchCapability={false}
        onSave={vi.fn()}
        ariaLabel="Edit selling price (₦150)"
      />,
    );
    expect(screen.getByRole("button", { name: "Edit selling price (₦150)" })).toBeTruthy();
  });
});

describe("EditableNumberCell inputMode", () => {
  it("asks for a numeric keypad by default and a decimal one for stepped values", () => {
    const { rerender } = render(
      <EditableNumberCell value={1} onCommit={vi.fn()} parse={(r) => parseInt(r, 10)} />,
    );
    expect(screen.getByRole("spinbutton").getAttribute("inputmode")).toBe("numeric");

    rerender(
      <EditableNumberCell
        value={1}
        onCommit={vi.fn()}
        parse={parseFloat}
        step="0.01"
      />,
    );
    expect(screen.getByRole("spinbutton").getAttribute("inputmode")).toBe("decimal");
  });

  it("lets a caller override it", () => {
    render(
      <EditableNumberCell
        value={1}
        onCommit={vi.fn()}
        parse={parseFloat}
        inputMode="decimal"
      />,
    );
    expect(screen.getByRole("spinbutton").getAttribute("inputmode")).toBe("decimal");
  });
});
