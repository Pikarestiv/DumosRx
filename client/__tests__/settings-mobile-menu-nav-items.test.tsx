import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

/**
 * settings-client renders this menu as the ONLY settings navigation below the
 * md breakpoint (the desktop sidebar is `hidden md:flex`), so an entry left
 * `disabled: true, badge: "Soon"` here is unreachable on phones even after the
 * desktop tab nav has shipped it. Roles & Permissions was exactly that: live on
 * desktop, permanently "Soon" on mobile.
 */
async function renderMenu(isAdmin: boolean): Promise<HTMLElement> {
  const { SettingsMobileMenu } = await import("@/components/settings/settings-mobile-menu");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SettingsMobileMenu, { isAdmin }));
  });
  return container;
}

describe("SettingsMobileMenu nav items", () => {
  it("exposes Roles & Permissions to admins as a real link, not a disabled row", async () => {
    const container = await renderMenu(true);

    const link = container.querySelector('a[href="/settings/roles"]');
    expect(link).not.toBeNull();
    expect(link!.textContent).toContain("Roles & Permissions");

    expect(container.textContent).not.toContain("Soon");
    expect(container.querySelector(".opacity-50")).toBeNull();
  });

  it("still hides the admin-only Roles & Permissions entry from non-admins", async () => {
    const container = await renderMenu(false);

    expect(container.querySelector('a[href="/settings/roles"]')).toBeNull();
    expect(container.textContent).not.toContain("Roles & Permissions");
  });
});
