import { Label } from "@/components/ui/label";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

interface ReceiptPreviewProps {
  localName: string;
  localAddress: string;
  localPhone: string;
  localLogo: string;
  localReceiptHeader: string;
  localReceiptFooter: string;
  localReceiptTagline: string;
  showLogo: boolean;
  logoPosition?: "above" | "beside";
  showPhone: boolean;
  showAddress: boolean;
  hidePoweredBy?: boolean;
}

export function ReceiptPreview({
  localName,
  localAddress,
  localPhone,
  localLogo,
  localReceiptHeader,
  localReceiptFooter,
  localReceiptTagline,
  showLogo,
  logoPosition = "above",
  showPhone,
  showAddress,
  hidePoweredBy = false,
}: ReceiptPreviewProps) {
  const logoImg = showLogo && localLogo && (
    <img
      src={localLogo}
      alt="Store logo"
      className={
        logoPosition === "beside"
          ? "h-8 w-8 object-contain shrink-0"
          : "h-10 w-10 mx-auto object-contain mb-1"
      }
    />
  );
  const nameBlock = (
    <div className={logoPosition === "beside" ? "text-left" : undefined}>
      <div className="font-bold text-xs uppercase">
        {localName || "DUMOSRX STORE"}
      </div>
      {localReceiptTagline && (
        <div className="text-[8px] italic mt-0.5">{localReceiptTagline}</div>
      )}
    </div>
  );

  return (
    <div className="w-full md:w-64 flex-shrink-0">
      <Label className="mb-3 block">Live Preview</Label>
      <div className="bg-white text-black p-4 shadow-md rounded-sm border-t-8 border-primary font-mono text-[10px] space-y-2 select-none pointer-events-none">
        <div className="text-center border-b border-black pb-2 mb-2">
          {logoPosition === "beside" ? (
            <div className="flex items-center justify-center gap-2">
              {logoImg}
              {nameBlock}
            </div>
          ) : (
            <>
              {logoImg}
              {nameBlock}
            </>
          )}
          {(showPhone || showAddress) && (
            <div className="text-[8px] leading-tight mt-0.5">
              {showAddress && (localAddress || "123 Business Road, Nigeria")}
              {showAddress && showPhone && <br />}
              {showPhone && (localPhone || "0800-DUMOSRX")}
            </div>
          )}
        </div>

        <div className="text-center mb-2">
          <span className="font-bold uppercase tracking-widest border border-black inline-block px-2 py-0.5 text-[8px]">
            Invoice
          </span>
        </div>

        <div className="space-y-0.5 text-[8px] mb-2">
          <div className="flex justify-between">
            <span className="font-bold">Invoice no:</span>
            <span>INV-SAMPLE</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Customer:</span>
            <span>Walk-in Customer</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Date:</span>
            <span>{formatDateToDDMMYYYY(new Date())}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Cashier:</span>
            <span className="uppercase">ADMIN USER</span>
          </div>
        </div>

        <div className="border-b border-black pb-1 mb-1 text-[8px]">
          <div className="flex justify-between font-bold mb-1 border-b border-dashed border-black pb-0.5">
            <span className="flex-1 w-1/2">Product</span>
            <span className="w-4 text-center">Qty</span>
            <span className="w-10 text-right">Price</span>
            <span className="w-12 text-right">Total</span>
          </div>
          <div className="flex justify-between mb-0.5 items-start">
            <span className="flex-1 w-1/2 break-words pr-1 leading-tight">
              Item Name
            </span>
            <span className="w-4 text-center">2</span>
            <span className="w-10 text-right">2,500</span>
            <span className="w-12 text-right">5,000</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="flex-1 w-1/2 break-words pr-1 leading-tight">
              Sample Med
            </span>
            <span className="w-4 text-center">1</span>
            <span className="w-10 text-right">2,500</span>
            <span className="w-12 text-right">2,500</span>
          </div>
        </div>

        <div className="space-y-0.5 text-[8px] pb-1 mb-1 border-b border-black">
          <div className="flex justify-between">
            <span>Sub total:</span>
            <span>7,500.00</span>
          </div>
          <div className="flex justify-between">
            <span>VAT (7.5%):</span>
            <span>562.50</span>
          </div>
          <div className="flex justify-between font-bold pt-1 mt-0.5 border-t border-dashed border-black text-[9px]">
            <span>Total:</span>
            <span>8,062.50</span>
          </div>
        </div>

        <div className="space-y-0.5 text-[8px] mb-2">
          <div className="flex justify-between">
            <span>Payment type:</span>
            <span className="font-bold">CASH</span>
          </div>
          <div className="flex justify-between">
            <span>Total paid:</span>
            <span>8,100.00</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Change:</span>
            <span>37.50</span>
          </div>
        </div>

        <div className="text-center pt-2 space-y-1 text-[8px]">
          <div className="text-[10px] tracking-widest font-black opacity-30">
            ||||||||| ||| |||||
          </div>
          {localReceiptHeader && (
            <div className="italic">"{localReceiptHeader}"</div>
          )}
          <div className="mt-1">
            {localReceiptFooter || "Thank you for your patronage!"}
          </div>
          {!hidePoweredBy && (
            <div className="text-[7px] mt-1 opacity-50">Powered by dumosrx.com</div>
          )}
        </div>
      </div>
    </div>
  );
}
