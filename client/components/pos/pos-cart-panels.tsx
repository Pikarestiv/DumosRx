"use client";

import { POSCustomerSelector } from "./pos-customer-selector";
import { POSCart } from "./pos-cart";
import { POSMobileCartWrapper } from "./pos-mobile-cart-wrapper";

/** Desktop right-rail cart + mobile bottom cart drawer, sharing the same cart/checkout props. */
export function POSCartPanels(props: any) {
  const {
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
    heldSalesCount,
    onOpenHeldSales,
    isPrescriptionLocked,
    onEditPrescription,
    selectedCustomer,
    customers,
    loadingCustomers,
    onSelectCustomer,
  } = props;

  const sharedCartProps = {
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
    heldSalesCount,
    onOpenHeldSales,
    isPrescriptionLocked,
    onEditPrescription,
  };

  return (
    <>
      {/* Right: customer + cart, full page height (Desktop only) */}
      <div className="hidden lg:flex lg:w-[380px] xl:w-[420px] shrink-0 flex-col bg-background border-l border-border overflow-hidden h-full">
        <POSCustomerSelector
          selectedCustomer={selectedCustomer}
          customers={customers}
          loadingCustomers={loadingCustomers}
          onSelectCustomer={onSelectCustomer}
          cartLength={cart.length}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <POSCart {...sharedCartProps} />
        </div>
      </div>

      <POSMobileCartWrapper
        {...sharedCartProps}
        selectedCustomer={selectedCustomer}
        customers={customers}
        loadingCustomers={loadingCustomers}
        onSelectCustomer={onSelectCustomer}
      />
    </>
  );
}
