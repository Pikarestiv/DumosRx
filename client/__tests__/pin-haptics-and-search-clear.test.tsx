import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PinPad } from "@/components/ui/pin-pad";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { SearchInput } from "@/components/ui/search-input";

describe("PIN haptic feedback", () => {
  const originalVibrate = navigator.vibrate;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  afterEach(() => {
    Object.defineProperty(navigator, "vibrate", {
      value: originalVibrate,
      configurable: true,
      writable: true,
    });
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("triggers haptic feedback on PinPad digit press and delete", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PinPad value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "5" }));
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
    expect(onChange).toHaveBeenCalledWith("5");

    rerender(<PinPad value="5" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(navigator.vibrate).toHaveBeenCalledWith(12);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does not throw when navigator.vibrate is unavailable", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const onChange = vi.fn();
    render(<PinPad value="" onChange={onChange} />);

    expect(() => fireEvent.click(screen.getByRole("button", { name: "1" }))).not.toThrow();
    expect(onChange).toHaveBeenCalledWith("1");
  });

  it("triggers haptic feedback when typing into InputOTP", () => {
    const onChange = vi.fn();
    const { container } = render(
      <InputOTP maxLength={4} value="" onChange={onChange}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>,
    );

    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    if (!input) return;
    fireEvent.change(input, { target: { value: "4" } });
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
  });
});

describe("SearchInput clear button", () => {
  it("shows a clear button only when value is non-empty and clears on click", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} placeholder="Search..." />);

    expect(screen.queryByRole("button", { name: /clear search/i })).toBeNull();

    rerender(<SearchInput value="amoxicillin" onChange={onChange} placeholder="Search..." />);
    const clearBtn = screen.getByRole("button", { name: /clear search/i });
    expect(clearBtn).toBeTruthy();

    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
