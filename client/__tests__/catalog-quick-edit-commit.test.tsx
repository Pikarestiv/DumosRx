import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }) }));

import { EditableCategoryCell, EditableQuickNumberCell } from "@/components/products/catalog-editable-cells";
import type { Product } from "@/components/products/types";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";

// U5: the catalog's inline stock-quantity quick-edit committed a real inventory adjustment (and a permanent movement-ledge…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-catalog-quick-edit-commit-test-tsx-L6
describe("catalog quick-edit commit semantics (every inline cell)", () => {
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

  it("does not commit a blur", () => {
    const { onSave, input } = renderCell();

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps an edited cell open after a click-away, so the typed value is not lost", () => {
    const { onSave, input } = renderCell();

    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);

    const stillOpen = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(stillOpen.value).toBe("99");
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTitle(/not saved yet/i)).toBeTruthy();
  });

  it("closes an untouched cell on click-away", () => {
    const { input } = renderCell();

    fireEvent.blur(input);

    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("still closes an untouched cell on click-away after an earlier edit was cancelled with the cross", () => {
    const { input } = renderCell();
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.click(screen.getByTitle("Cancel"));
    expect(screen.queryByRole("spinbutton")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Edit stock quantity/i }));
    fireEvent.blur(screen.getByRole("spinbutton"));

    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("lets Escape and the cross cancel an edited cell", () => {
    const first = renderCell();
    fireEvent.change(first.input, { target: { value: "99" } });
    fireEvent.keyDown(first.input, { key: "Escape" });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(first.onSave).not.toHaveBeenCalled();
    cleanup();

    const second = renderCell();
    fireEvent.change(second.input, { target: { value: "99" } });
    fireEvent.blur(second.input);
    fireEvent.click(screen.getByTitle("Cancel"));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(second.onSave).not.toHaveBeenCalled();
  });

  it("stops a tap on Save or Cancel from moving focus off the input first, which would run the blur path", () => {
    const { input } = renderCell();
    fireEvent.change(input, { target: { value: "15" } });

    for (const title of ["Save", "Cancel"]) {
      expect(fireEvent.pointerDown(screen.getByTitle(title))).toBe(false);
      expect(fireEvent.mouseDown(screen.getByTitle(title))).toBe(false);
    }
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
        />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit stock quantity/i }));
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRowKey).not.toHaveBeenCalled();
  });

  it("commits on Enter", () => {
    const { onSave, input } = renderCell();

    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSave).toHaveBeenCalledWith(15);
  });

  it("commits via the checkmark button", () => {
    const { onSave, input } = renderCell();

    fireEvent.change(input, { target: { value: "22" } });
    fireEvent.click(screen.getByTitle("Save"));

    expect(onSave).toHaveBeenCalledWith(22);
  });

  it("treats a selling price like a stock count: a click-away with a changed value saves nothing and keeps it open", () => {
    const onSave = vi.fn();
    render(
      <EditableQuickNumberCell
        displayValue="₦150"
        value={150}
        parse={parseFloat}
        canEdit
        hasTouchCapability={false}
        onSave={onSave}
        ariaLabel="Edit selling price (₦150)"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit selling price/ }));
    const input = screen.getByRole("spinbutton") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "175" } });
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("175");
    expect(screen.getByTitle(/not saved yet/i)).toBeTruthy();
    fireEvent.click(screen.getByTitle("Save"));
    expect(onSave).toHaveBeenCalledWith(175);
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

describe("catalog category cell follows the same rule", () => {
  const product = { id: "p1", name: "Soap", category: "Toiletries" } as Product;
  const open = () => {
    const onSave = vi.fn();
    render(<EditableCategoryCell product={product} categoryOptions={["Toiletries", "Drugs"]} canEdit hasTouchCapability={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit category/ }));
    return { onSave, input: screen.getByRole("combobox") as HTMLInputElement };
  };

  it("keeps a typed category open and unsaved on click-away", () => {
    const { onSave, input } = open();

    fireEvent.change(input, { target: { value: "Drugs" } });
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Drugs");
    expect(screen.getByTitle(/not saved yet/i)).toBeTruthy();
  });

  it("closes an untouched category cell on click-away", () => {
    const { onSave, input } = open();

    fireEvent.blur(input);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the category picked from the list straight away", () => {
    const { onSave, input } = open();

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: "Drugs" }));

    expect(onSave).toHaveBeenCalledWith(product, "Drugs");
  });

  it("saves a typed category with the tick, and drops it with the cross", () => {
    const first = open();
    fireEvent.change(first.input, { target: { value: "Drugs" } });
    fireEvent.click(screen.getByTitle("Save"));
    expect(first.onSave).toHaveBeenCalledWith(product, "Drugs");
    cleanup();

    const second = open();
    fireEvent.change(second.input, { target: { value: "Drugs" } });
    fireEvent.click(screen.getByTitle("Cancel"));
    expect(second.onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
