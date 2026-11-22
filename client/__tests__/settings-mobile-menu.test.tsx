import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsMobileMenu } from "@/components/settings/settings-mobile-menu";

describe("SettingsMobileMenu", () => {
  it("renders the Danger Zone link with destructive background styling", () => {
    render(<SettingsMobileMenu isAdmin />);

    const link = screen.getByRole("link", { name: /danger zone/i });
    expect(link.className).toContain("bg-destructive");
    expect(link.className).toContain("text-destructive-foreground");
  });
});
