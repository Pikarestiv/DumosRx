import React from "react";
import { POSMobileCartDrawer } from "./pos-mobile-cart-drawer";
import { Customer } from "@/lib/hooks/use-pos-data";

interface POSMobileCartWrapperProps {
  cart: any[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  calculatedDiscount: number;
  discountType: "percentage" | "fixed";
  setDiscount: (discount: number) => void;
  setDiscountType: (type: "percentage" | "fixed") => void;
  vatPercentage: number;
  currencyCode?: string;
  updateQuantity: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  onCheckout: () => void;
  onHoldSale: () => void;
  selectedCustomer: Customer | null;
  customers: Customer[];
  loadingCustomers: boolean;
  onSelectCustomer: (customer: Customer | null) => void;
}

export function POSMobileCartWrapper({
  cart,
  subtotal,
  tax,
  total,
  discount,
  calculatedDiscount,
  discountType,
  setDiscount,
  setDiscountType,
  vatPercentage,
  currencyCode,
  updateQuantity,
  removeFromCart,
  clearCart,
  onCheckout,
  onHoldSale,
  selectedCustomer,
  customers,
  loadingCustomers,
  onSelectCustomer,
}: POSMobileCartWrapperProps) {
  if (cart.length === 0) return null;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background to-transparent pointer-events-none">
      <div className="pointer-events-auto">
        <POSMobileCartDrawer
          cart={cart}
          subtotal={subtotal}
          tax={tax}
          total={total}
          discount={discount}
          calculatedDiscount={calculatedDiscount}
          discountType={discountType}
          setDiscount={setDiscount}
          setDiscountType={setDiscountType}
          vatPercentage={vatPercentage}
          currencyCode={currencyCode}
          updateQuantity={updateQuantity}
          removeFromCart={removeFromCart}
          clearCart={clearCart}
          onCheckout={onCheckout}
          onHoldSale={onHoldSale}
          selectedCustomer={selectedCustomer}
          customers={customers}
          loadingCustomers={loadingCustomers}
          onSelectCustomer={onSelectCustomer}
        />
      </div>
    </div>
  );
}
