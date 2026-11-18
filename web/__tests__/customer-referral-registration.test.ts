import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockRegister = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/api/client", () => ({
  webApiClient: {
    register: (...args: unknown[]) => mockRegister(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useRegisterForm, type RegisterFormValues } from "@/components/auth/hooks/use-register-form";

const validFormValues: RegisterFormValues = {
  store_name: "Downtown Pharmacy",
  store_type: "pharmacy",
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  username: "janedoe",
  phone: "08012345678",
  pin: "1234",
  password: "password123",
  password_confirmation: "password123",
};

describe("A-372: Customer and agent referral forwarding during registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockRegister.mockResolvedValue({ token: "fake-jwt-token" });
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = { href: "" };
  });

  it("forwards ref parameter from URL in registration payload", async () => {
    mockSearchParams = new URLSearchParams("ref=STORE-REF-123");
    const { result } = renderHook(() => useRegisterForm());

    await act(async () => {
      await result.current.onSubmit(validFormValues);
    });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const payload = mockRegister.mock.calls[0][0];
    expect(payload.ref).toBe("STORE-REF-123");
  });

  it("forwards referrer query parameter as ref if ref is not provided", async () => {
    mockSearchParams = new URLSearchParams("referrer=STORE-REF-456");
    const { result } = renderHook(() => useRegisterForm());

    await act(async () => {
      await result.current.onSubmit(validFormValues);
    });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const payload = mockRegister.mock.calls[0][0];
    expect(payload.ref).toBe("STORE-REF-456");
  });

  it("forwards both agent_ref and customer ref when both are present", async () => {
    mockSearchParams = new URLSearchParams("agent_ref=AGT-001&ref=STORE-REF-789");
    const { result } = renderHook(() => useRegisterForm());

    await act(async () => {
      await result.current.onSubmit(validFormValues);
    });

    expect(mockRegister).toHaveBeenCalledTimes(1);
    const payload = mockRegister.mock.calls[0][0];
    expect(payload.agent_ref).toBe("AGT-001");
    expect(payload.ref).toBe("STORE-REF-789");
  });
});
