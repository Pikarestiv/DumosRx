import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));

describe("ResponsiveModal on mobile when swipe-to-dismiss is off", () => {
  it("still closes from the X button", () => {
    const onOpenChange = vi.fn();
    render(
      <ResponsiveModal open onOpenChange={onOpenChange} title="Add" swipeToDismiss={false}>
        <input aria-label="Name" />
      </ResponsiveModal>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("still closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <ResponsiveModal open onOpenChange={onOpenChange} title="Add" swipeToDismiss={false}>
        <input aria-label="Name" />
      </ResponsiveModal>,
    );

    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
