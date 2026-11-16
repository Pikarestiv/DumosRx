import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DatePickerInput } from "@/components/ui/date-picker-input";

function ControlledPicker() {
  const [value, setValue] = useState<string | undefined>(undefined);
  return <DatePickerInput value={value} onChange={setValue} ariaLabel="Expiry" />;
}

describe("DatePickerInput typing inside a controlled parent", () => {
  it("keeps the first digit when the parent echoes the cleared value back", () => {
    render(<ControlledPicker />);
    const input = screen.getByLabelText("Expiry") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1" } });
    expect(input.value).toBe("1");

    fireEvent.change(input, { target: { value: "12" } });
    expect(input.value).toBe("12");
  });

  it("keeps the remaining digits when a complete date is edited", () => {
    render(<ControlledPicker />);
    const input = screen.getByLabelText("Expiry") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "12122030" } });
    expect(input.value).toBe("12/12/2030");

    fireEvent.change(input, { target: { value: "12/12/203" } });
    expect(input.value).toBe("12/12/203");
  });
});
