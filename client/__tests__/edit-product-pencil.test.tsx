import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditProductPencil } from "@/components/products/edit-product-pencil";

describe("EditProductPencil", () => {
  it("opens the editor without triggering the row's own click", () => {
    const onClick = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <EditProductPencil productName="Norvasc" hasTouchCapability={false} onClick={onClick} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Norvasc" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
