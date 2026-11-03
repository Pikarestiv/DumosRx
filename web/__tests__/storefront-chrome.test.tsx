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

  it("carries only a small Powered by link to the platform site", () => {
    render(<StorefrontFooter store={store} />);
    const link = screen.getByText(/Powered by/).closest("a");
    expect(link?.getAttribute("href")).toBe(WEB_APP_URL);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
