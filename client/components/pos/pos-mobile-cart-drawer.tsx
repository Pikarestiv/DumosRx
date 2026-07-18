import { useState } from "react";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ChevronUp } from "lucide-react";
import { POSCustomerSelector } from "./pos-customer-selector";
import { POSCart } from "./pos-cart";
import { formatCurrency } from "@/lib/utils";

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
}

export function POSMobileCartDrawer({
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
}: any) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <div className="w-full bg-primary text-primary-foreground p-3.5 rounded-xl text-[15px] font-bold cursor-pointer flex items-center justify-between shadow-lg hover:bg-primary/90 transition-colors">
          <div className="flex items-center gap-2">
            <span>{cart.length} items</span>
            <span className="w-1 h-1 bg-primary-foreground/50 rounded-full" />
            <span>{formatCurrency(total, currencyCode)}</span>
          </div>
          <ChevronUp className="w-5 h-5" />
        </div>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh] flex flex-col bg-background">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Cart</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col flex-1 overflow-hidden">
          <POSCustomerSelector
            selectedCustomer={selectedCustomer}
            customers={customers}
            loadingCustomers={loadingCustomers}
            onSelectCustomer={onSelectCustomer}
            cartLength={cart.length}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <POSCart
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
              onCheckout={() => {
                setOpen(false);
                onCheckout();
              }}
              onHoldSale={() => {
                setOpen(false);
                onHoldSale?.();
              }}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
