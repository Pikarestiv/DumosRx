import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNumberInputWheelGuard } from "@/lib/hooks/use-number-input-wheel-guard";

function Fixture() {
  useNumberInputWheelGuard();
  return (
    <>
      <input type="number" aria-label="received" />
      <input type="text" aria-label="note" />
    </>
  );
}

describe("number input wheel guard", () => {
  it("blurs a focused number input when the wheel turns over it", () => {
    render(<Fixture />);
    const input = screen.getByLabelText("received");
    input.focus();
    fireEvent.wheel(input);
    expect(document.activeElement).not.toBe(input);
  });

  it("leaves a focused text input alone", () => {
    render(<Fixture />);
    const input = screen.getByLabelText("note");
    input.focus();
    fireEvent.wheel(input);
    expect(document.activeElement).toBe(input);
  });
});
