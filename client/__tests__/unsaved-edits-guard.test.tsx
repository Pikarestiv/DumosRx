import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { UnsavedEditsGuard } from "@/components/dashboard/unsaved-edits-guard";
import { EditableQuickNumberCell } from "@/components/products/catalog-editable-cells";
import { hasUnsavedEdits, useUnsavedEdit } from "@/lib/hooks/use-unsaved-edit";

function Editing({ unsaved }: { unsaved: boolean }) {
  useUnsavedEdit(unsaved);
  return null;
}

const page = (unsaved: boolean, links = <a href="/inventory">Inventory</a>) => (
  <>
    <Editing unsaved={unsaved} />
    <UnsavedEditsGuard />
    {links}
  </>
);

const beforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("leaving with an unsaved inline edit", () => {
  beforeEach(() => push.mockClear());

  it("asks the browser to confirm closing or refreshing the tab only while an edit is unsaved", () => {
    const { rerender, unmount } = render(page(true));
    expect(beforeUnload()).toBe(true);

    rerender(page(false));
    expect(beforeUnload()).toBe(false);

    rerender(page(true));
    unmount();
    expect(beforeUnload()).toBe(false);
  });

  it("stops an in-app link and asks first; Stay keeps the page and the edit", () => {
    render(page(true));

    fireEvent.click(screen.getByRole("link", { name: "Inventory" }));

    expect(screen.getByText("You have a change that isn't saved")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(push).not.toHaveBeenCalled();
    expect(hasUnsavedEdits()).toBe(true);
  });

  it("leaves to the link's address when the user chooses to lose the change", () => {
    render(page(true, <a href="/reports?tab=sales">Reports</a>));

    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));

    expect(push).toHaveBeenCalledWith("/reports?tab=sales");
    expect(hasUnsavedEdits()).toBe(false);
  });

  it("lets every link through when nothing is unsaved", () => {
    render(page(false));

    const notPrevented = fireEvent.click(screen.getByRole("link", { name: "Inventory" }));

    expect(notPrevented).toBe(true);
    expect(screen.queryByText("You have a change that isn't saved")).toBeNull();
  });

  it.each([
    ["an external link", <a key="x" href="https://example.com/">Out</a>],
    ["a link that opens a new tab", <a key="x" href="/inventory" target="_blank">Out</a>],
  ])("does not interfere with %s", (_label, link) => {
    render(page(true, link));

    const notPrevented = fireEvent.click(screen.getByRole("link", { name: "Out" }));

    expect(notPrevented).toBe(true);
    expect(screen.queryByText("You have a change that isn't saved")).toBeNull();
  });

  it("lets a modifier-click through, since it opens a new tab", () => {
    render(page(true));

    expect(fireEvent.click(screen.getByRole("link", { name: "Inventory" }), { metaKey: true })).toBe(true);
  });
});

describe("an inline cell and the unsaved-edit guard", () => {
  const renderCell = () => {
    render(
      <EditableQuickNumberCell displayValue="10 units" value={10} parse={(r) => parseInt(r, 10)} canEdit hasTouchCapability={false} onSave={vi.fn()} ariaLabel="Edit stock (10)" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit stock/ }));
    return screen.getByRole("spinbutton");
  };

  it("counts as unsaved only once its value has been changed, and announces it", () => {
    const input = renderCell();
    expect(hasUnsavedEdits()).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("");

    fireEvent.change(input, { target: { value: "15" } });

    expect(hasUnsavedEdits()).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/not saved yet/i);
  });

  it("stops counting once the edit is cancelled", () => {
    const input = renderCell();
    fireEvent.change(input, { target: { value: "15" } });

    fireEvent.click(screen.getByTitle("Cancel"));

    expect(hasUnsavedEdits()).toBe(false);
  });
});
