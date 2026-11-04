import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

import { TraditionalLoginForm } from "@/components/auth/traditional-login-form";

describe("TraditionalLoginForm credential inputs and codeMode flexibility", () => {
  it("renders 4-slot PIN input and PIN label in default mode", () => {
    render(
      <TraditionalLoginForm
        username="admin"
        setUsername={vi.fn()}
        pin=""
        setPin={vi.fn()}
        isLoading={false}
        onSubmit={vi.fn()}
        codeMode={false}
      />
    );

    expect(screen.getByText("PIN")).toBeDefined();
    expect(screen.getByPlaceholderText("admin")).toBeDefined();
  });

  it("swaps to a flexible password/code input when codeMode is true", () => {
    const setPin = vi.fn();
    render(
      <TraditionalLoginForm
        username="owner@example.com"
        setUsername={vi.fn()}
        pin=""
        setPin={setPin}
        isLoading={false}
        onSubmit={vi.fn()}
        codeMode={true}
      />
    );

    expect(screen.getByText("PIN or Access code")).toBeDefined();
    const pinInput = screen.getByPlaceholderText("PIN, password, or 12-digit code") as HTMLInputElement;
    expect(pinInput).toBeDefined();

    // Allows typing alphanumeric password
    fireEvent.change(pinInput, { target: { value: "SecretPass123" } });
    expect(setPin).toHaveBeenCalledWith("SecretPass123");
  });

  it("enables the submit button when PIN is 4 digits or password/code is >= 4 chars in codeMode", () => {
    const { rerender } = render(
      <TraditionalLoginForm
        username="owner@example.com"
        setUsername={vi.fn()}
        pin="12"
        setPin={vi.fn()}
        isLoading={false}
        onSubmit={vi.fn()}
        codeMode={true}
      />
    );

    const submitBtn = screen.getByRole("button", { name: "Authorize Entry" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // 4-digit PIN in codeMode enables button
    rerender(
      <TraditionalLoginForm
        username="owner@example.com"
        setUsername={vi.fn()}
        pin="1234"
        setPin={vi.fn()}
        isLoading={false}
        onSubmit={vi.fn()}
        codeMode={true}
      />
    );
    expect(submitBtn.disabled).toBe(false);

    // 8-character password in codeMode enables button
    rerender(
      <TraditionalLoginForm
        username="owner@example.com"
        setUsername={vi.fn()}
        pin="12341234"
        setPin={vi.fn()}
        isLoading={false}
        onSubmit={vi.fn()}
        codeMode={true}
      />
    );
    expect(submitBtn.disabled).toBe(false);

    // 12-digit till code in codeMode enables button
    rerender(
      <TraditionalLoginForm
        username="owner@example.com"
        setUsername={vi.fn()}
        pin="123456789012"
        setPin={vi.fn()}
        isLoading={false}
        onSubmit={vi.fn()}
        codeMode={true}
      />
    );
    expect(submitBtn.disabled).toBe(false);
  });
});
