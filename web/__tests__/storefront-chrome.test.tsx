import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreContactBlock } from "@/components/storefront/store-contact-block";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { WEB_APP_URL } from "@/lib/constants";

const store = { id: "s1", name: "Grace Pharmacy", address: "12 Allen Avenue", location: "Ikeja", phone: "0801", email: null };

describe("storefront chrome", () => {
  it("labels the address and phone and links the phone number", () => {
    render(<StoreContactBlock store={store} />);
    expect(screen.getByText("Address")).toBeTruthy();
    expect(screen.getByText("12 Allen Avenue, Ikeja")).toBeTruthy();
    expect(screen.getByText("0801").closest("a")?.getAttribute("href")).toBe("tel:0801");
    expect(screen.queryByText("Email")).toBeNull();
  });

  it("renders nothing for a store with no contact details", () => {
    const { container } = render(<StoreContactBlock store={{ id: "s1", name: "Bare" }} />);
    expect(container.innerHTML).toBe("");
  });

  it("links Home, Shop and Contact, the store's contact details, and Powered by the platform site", () => {
    render(<StorefrontFooter storeSlug="grace" store={store} storefront={{ id: "f1", slug: "grace", name: "Grace Pharmacy", about: "Family pharmacy since 1998." }} />);

    const footerNav = screen.getByRole("navigation", { name: "Footer" });
    const quickLinks = Array.from(footerNav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(quickLinks).toEqual([
      ["Home", "/store/grace"],
      ["Shop", "/store/grace/catalog"],
      ["Contact", "/store/grace#contact"],
    ]);
    expect(screen.getByText("Family pharmacy since 1998.")).toBeTruthy();
    expect(screen.getByText("0801").closest("a")?.getAttribute("href")).toBe("tel:0801");
    expect(screen.getByText("12 Allen Avenue, Ikeja")).toBeTruthy();
    expect(screen.getByText(/Powered by/).closest("a")?.getAttribute("href")).toBe(WEB_APP_URL);
  });

  it("never links the unlinked Track Order or prescription routes", () => {
    render(<StorefrontFooter storeSlug="grace" store={store} />);

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.includes("/track") || href.includes("/prescription"))).toBe(false);
  });
});
