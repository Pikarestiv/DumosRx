import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { accountManager } = vi.hoisted(() => ({
  accountManager: { value: { data: undefined, isLoading: false } as { data?: { data: unknown }; isLoading: boolean } },
}));

vi.mock("@/lib/hooks/use-account-manager", () => ({ useAccountManager: () => accountManager.value }));

import { ContactSpecialistCard } from "@/components/settings/store/contact-specialist-card";

const withManager = (manager: Record<string, string | null>) => {
  accountManager.value = { data: { data: { name: "Ada Obi", email: "ada@dumosrx.com", ...manager } }, isLoading: false };
};

describe("ContactSpecialistCard", () => {
  beforeEach(() => {
    accountManager.value = { data: undefined, isLoading: false };
  });

  it("shows the number to call, not only a Call button, and links both channels to it", () => {
    withManager({ phone: "0803 123 4567" });
    render(<ContactSpecialistCard />);

    expect(screen.getByText("0803 123 4567")).toBeTruthy();
    expect(screen.getByRole("link", { name: /call/i }).getAttribute("href")).toBe("tel:0803 123 4567");
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe("https://wa.me/2348031234567");
  });

  it("falls back to email, with no empty phone line, when the specialist has no number", () => {
    withManager({ phone: null });
    render(<ContactSpecialistCard />);

    expect(screen.getByRole("link", { name: /email/i }).getAttribute("href")).toBe("mailto:ada@dumosrx.com");
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  });

  it("renders nothing when the store has no account manager", () => {
    const { container } = render(<ContactSpecialistCard />);

    expect(container.textContent).toBe("");
  });
});
