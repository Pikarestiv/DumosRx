import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ChevronUp, ShoppingCart } from "lucide-react";
import { POSCart } from "./pos-cart";
import { formatCurrency } from "@/lib/utils";

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
  heldSalesCount,
  onOpenHeldSales,
}: any) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <div className="w-full bg-primary text-primary-foreground p-3 sm:p-3.5 rounded-[20px] cursor-pointer flex items-center justify-between shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:bg-primary/90 transition-colors">
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center w-[46px] h-[46px] rounded-[14px] bg-white/15">
              <ShoppingCart className="w-5 h-5 text-white" />
              <div className="absolute -top-1.5 -right-1.5 bg-white text-primary text-[11.5px] font-bold w-[22px] h-[22px] rounded-full flex items-center justify-center shadow-sm">
                {cart.length}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[13.5px] font-medium text-white/90 leading-[1.2] mb-0.5">
                {cart.length} items
              </span>
              <span className="text-[19px] font-bold leading-[1.2] tracking-tight">
                {formatCurrency(total, currencyCode)}
              </span>
            </div>
          </div>
          <ChevronUp className="w-6 h-6 mr-1 opacity-90" />
        </div>
      </DrawerTrigger>
      <DrawerContent className="h-[94vh] max-h-[94vh] mt-0 flex flex-col bg-background">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Cart</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-3.5 border-b border-border">
            <div className="text-[15px] font-semibold">Current sale</div>
            <div className="text-xs text-muted-foreground">
              {cart.length} items
            </div>
          </div>
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
              heldSalesCount={heldSalesCount}
              onOpenHeldSales={() => {
                setOpen(false);
                onOpenHeldSales?.();
              }}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
