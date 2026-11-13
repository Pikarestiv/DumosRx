"use client";

import { memo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { EmptyCart, HeldSalesChip, PrescriptionLockBanner } from "./pos-cart-notices";
import { RequestItemDialog } from "./request-item-dialog";
import { ProformaPreviewDialog } from "./proforma-preview-dialog";
import { SpotSourceDialog } from "./spot-source-dialog";
import { POSCartItem } from "./pos-cart-item";
import { POSCartActions } from "./pos-cart-actions";
import { useRevealChangedCartLine } from "@/lib/hooks/use-reveal-changed-cart-line";
import { POSRedeemReward } from "./pos-redeem-reward";
import { POSCartDiscount } from "./pos-cart-discount";
import { POSCartMarkupPicker } from "./pos-cart-markup-picker";
import type { CartItem, RedeemedOption, MarkupType, SpotSourcingConfig, SpotSourcingSplitOptions } from "@/lib/hooks/use-pos-cart";
import type { Customer } from "@/lib/types/customer";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useHasPermission } from "@/lib/hooks/use-permissions";

interface POSCartProps {
  cart: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  calculatedDiscount?: number;
  discountType?: "fixed" | "percentage";
  setDiscount?: (discount: number) => void;
  setDiscountType?: (type: "fixed" | "percentage") => void;
  selectedCustomer?: Customer | null;
  redeemedOption?: RedeemedOption | null;
  onRedeemReward?: (option: { id: string; label: string; points_cost: number; discount_value: number }) => void;
  onClearRedemption?: () => void;
  vatPercentage: number;
  currencyCode?: string;
  updateQuantity: (id: string, quantity: number) => void;
  removeFromCart: (id: string) => void;
  onRequestClearCart: () => void;
  onCheckout: () => void;
  onHoldSale?: () => void;
  heldSalesCount?: number;
  onOpenHeldSales?: () => void;
  isPrescriptionLocked?: boolean;
  onEditPrescription?: () => void;
  isResellerSale?: boolean;
  setIsResellerSale?: (value: boolean) => void;
  markupType?: MarkupType | null;
  setMarkupType?: (value: MarkupType | null) => void;
  updateUnitPrice?: (id: string, price: number) => void;
  updateSpotSourcing?: (
    id: string,
    config: SpotSourcingConfig | null,
    splitOptions?: SpotSourcingSplitOptions,
  ) => void;
}

export const POSCart = memo(function POSCart({
  cart,
  subtotal,
  tax,
  total,
  discount,
  calculatedDiscount = 0,
  discountType = "fixed",
  setDiscount,
  setDiscountType,
  selectedCustomer = null,
  redeemedOption = null,
  onRedeemReward,
  onClearRedemption,
  vatPercentage,
  currencyCode,
  updateQuantity,
  removeFromCart,
  onRequestClearCart,
  onCheckout,
  onHoldSale,
  heldSalesCount = 0,
  onOpenHeldSales,
  isPrescriptionLocked = false,
  onEditPrescription,
  isResellerSale = false,
  setIsResellerSale,
  markupType = null,
  setMarkupType,
  updateUnitPrice,
  updateSpotSourcing,
}: POSCartProps) {
  const { listRef, revealedId } = useRevealChangedCartLine(cart);

  const [showDiscount, setShowDiscount] = useState(false);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showProformaDialog, setShowProformaDialog] = useState(false);
  const [spotSourceItem, setSpotSourceItem] = useState<CartItem | null>(null);
  const { withRestriction, canUseResellerCommission, canUseMarkupSales, canUseProformaQuotes } = useFeatureGate();
  // Unconditional top-level const, never inlined into the JSX conditions below:
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-cart-tsx-L105
  const canApplyDiscounts = useHasPermission("apply_discounts");
  const canHoldSales = useHasPermission("hold_sales");

  // canUseMarkupSales can flip false mid-session (an admin disables the markup_sales_enabled toggle on another device, or do…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-pos-pos-cart-tsx-L113
  useEffect(() => {
    if (!canUseMarkupSales && isResellerSale) {
      setIsResellerSale?.(false);
    }
  }, [canUseMarkupSales, isResellerSale, setIsResellerSale]);

  const markupPickerRef = useRef<HTMLDivElement>(null);
  const [markupPickerAlert, setMarkupPickerAlert] = useState(false);

  useEffect(() => {
    if (!markupPickerAlert) return;
    const timer = setTimeout(() => setMarkupPickerAlert(false), 1500);
    return () => clearTimeout(timer);
  }, [markupPickerAlert]);

  const handleCharge = () => {
    if (isResellerSale && !markupType) {
      toast.error("Choose who this reseller sale is for: a Reseller Agent or Store Markup");
      markupPickerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setMarkupPickerAlert(false);
      requestAnimationFrame(() => setMarkupPickerAlert(true));
      return;
    }
    onCheckout();
  };

  const showHoldAction = cart.length > 0 && canHoldSales;
  const showClearCartAction = cart.length > 0 && !isPrescriptionLocked;

  return (
    <div className="flex flex-col h-full">
      {!!isPrescriptionLocked && <PrescriptionLockBanner onEditPrescription={onEditPrescription} />}
      {cart.length > 0 && canUseMarkupSales && (
        <POSCartMarkupPicker
          pickerRef={markupPickerRef}
          alert={markupPickerAlert}
          isResellerSale={isResellerSale}
          onResellerSaleChange={withRestriction(
            (v: boolean) => setIsResellerSale?.(v),
            { featureAllowed: canUseResellerCommission, featureKey: "reseller_commission" },
          )}
          markupType={markupType}
          setMarkupType={setMarkupType}
        />
      )}
      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-1.5 min-h-[120px]">
        {cart.length === 0 && <EmptyCart />}
        {cart.length > 0 &&
          cart.map((item, idx) => (
            <POSCartItem
              key={item.id}
              highlighted={item.id === revealedId}
              item={item}
              currencyCode={currencyCode}
              isLast={idx === cart.length - 1}
              updateQuantity={updateQuantity}
              removeFromCart={removeFromCart}
              isLocked={isPrescriptionLocked}
              isResellerSale={isResellerSale}
              updateUnitPrice={updateUnitPrice}
              onConfigureSpotSourcing={(item) => setSpotSourceItem(item)}
            />
          ))}
      </div>

      <div className="border-t border-border px-5 pt-3 pb-4 bg-muted/10">
        {heldSalesCount > 0 && <HeldSalesChip count={heldSalesCount} onOpen={onOpenHeldSales} />}

        <div className="space-y-1.5 mb-3">
          {subtotal !== total && (
            <div className="flex justify-between text-[12.5px] text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, currencyCode)}</span>
            </div>
          )}

          {(vatPercentage > 0 || tax > 0) && (
            <div className="flex justify-between text-[12.5px] text-muted-foreground">
              <span>VAT ({vatPercentage}%)</span>
              <span>{formatCurrency(tax, currencyCode)}</span>
            </div>
          )}

          {redeemedOption && (
            <POSRedeemReward
              selectedCustomer={selectedCustomer}
              redeemedOption={redeemedOption}
              onRedeem={onRedeemReward || (() => {})}
              onClear={onClearRedemption || (() => {})}
              currencyCode={currencyCode}
            />
          )}

          {!redeemedOption && (
            <POSCartDiscount
              discount={discount}
              discountType={discountType}
              setDiscount={setDiscount}
              setDiscountType={setDiscountType}
              showDiscount={showDiscount}
              setShowDiscount={setShowDiscount}
              canApplyDiscounts={canApplyDiscounts}
              currencyCode={currencyCode}
            />
          )}

          {!redeemedOption && !(showDiscount || discount > 0) && (
            <POSRedeemReward
              selectedCustomer={selectedCustomer}
              redeemedOption={null}
              onRedeem={onRedeemReward || (() => {})}
              onClear={onClearRedemption || (() => {})}
              currencyCode={currencyCode}
            />
          )}

          {calculatedDiscount > 0 && (
            <div className="flex justify-end text-xs text-destructive font-medium">
              <span>-{formatCurrency(calculatedDiscount, currencyCode)}</span>
            </div>
          )}

          <div className="flex justify-between text-base font-bold text-foreground mt-1.5 pt-2 border-t border-dashed border-border">
            <span>Total</span>
            <span>{formatCurrency(total, currencyCode)}</span>
          </div>
        </div>

        <POSCartActions
          onRequestItem={() => setShowRequestDialog(true)}
          onHoldSale={showHoldAction ? onHoldSale : undefined}
          onClearCart={showClearCartAction ? onRequestClearCart : undefined}
          onPreviewQuote={
            cart.length > 0
              ? withRestriction(() => setShowProformaDialog(true), {
                  featureAllowed: canUseProformaQuotes,
                  featureKey: "proforma_quotes",
                })
              : undefined
          }
        />

        <RequestItemDialog open={showRequestDialog} onOpenChange={setShowRequestDialog} />
        <ProformaPreviewDialog
          open={showProformaDialog}
          onOpenChange={setShowProformaDialog}
          cart={cart}
          subtotal={subtotal}
          tax={tax}
          discount={calculatedDiscount}
          total={total}
          selectedCustomer={selectedCustomer}
        />

        <button
          onClick={handleCharge}
          disabled={cart.length === 0}
          className="w-full bg-primary text-primary-foreground border-0 p-3.5 rounded-xl text-[15px] font-bold cursor-pointer flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Charge {formatCurrency(total, currencyCode)}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className="w-[18px] h-[18px] ml-1"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <SpotSourceDialog
        open={spotSourceItem !== null}
        onOpenChange={(open) => !open && setSpotSourceItem(null)}
        cartItem={spotSourceItem}
        currencyCode={currencyCode}
        onConfirm={(config, quantity, sellingPrice, splitOptions) => {
          if (spotSourceItem) {
            updateSpotSourcing?.(spotSourceItem.id, config, splitOptions);
          }
        }}
        onRevertToShelf={() => {
          if (spotSourceItem) {
            updateSpotSourcing?.(spotSourceItem.id, null);
          }
        }}
      />
    </div>
  );
});
