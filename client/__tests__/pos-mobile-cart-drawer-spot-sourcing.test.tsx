import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const posCartProps = vi.fn();
vi.mock("@/components/pos/pos-cart", () => ({
  POSCart: (props: unknown) => {
    posCartProps(props);
    return null;
  },
}));

import { POSMobileCartWrapper } from "@/components/pos/pos-mobile-cart-wrapper";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

describe("POSMobileCartWrapper (A-369)", () => {
  it("hands updateSpotSourcing down to the cart inside the phone drawer", () => {
    const updateSpotSourcing = vi.fn();
    render(
      <POSMobileCartWrapper
        cart={[{ id: "p1" } as unknown as CartItem]}
        subtotal={1}
        tax={0}
        total={1}
        discount={0}
        vatPercentage={0}
        updateQuantity={vi.fn()}
        removeFromCart={vi.fn()}
        onRequestClearCart={vi.fn()}
        onCheckout={vi.fn()}
        updateSpotSourcing={updateSpotSourcing}
      />,
    );
    fireEvent.click(screen.getByText("1 items"));
    const drawerCart = posCartProps.mock.calls.at(-1)?.[0] as { updateSpotSourcing?: unknown } | undefined;
    expect(drawerCart?.updateSpotSourcing).toBe(updateSpotSourcing);
  });
});
