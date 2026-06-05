"use client";

import { useStore } from "@/lib/context/store-context";
import { APP_NAME } from "@/lib/constants";
import Barcode from "react-barcode";

interface ReceiptProps {
  transaction: {
    id: string;
    date: string;
    items: any[];
    customer: any;
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    paymentMethod: string;
    amountPaid: number;
    change: number;
    paymentSplits?: {method: string; amount: number; accountId?: string}[];
  };
}

export function ReceiptView({ transaction }: ReceiptProps) {
  const { storeProfile, vatPercentage } = useStore();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: storeProfile?.currency?.replace(/[^A-Z]/g, "") || "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const shortId = transaction.id.split("-")[0].toUpperCase();
  const invoiceNo = `INV-${shortId}`;

  return (
    <div className="bg-white p-8 max-w-[400px] mx-auto text-black font-mono text-sm leading-tight printable-receipt">
      {/* Header */}
      <div className="text-center border-b border-black pb-4 mb-4">
        <h2 className="text-xl font-bold uppercase">{storeProfile?.name}</h2>
        {storeProfile?.address && <p>{storeProfile?.address}</p>}
        {storeProfile?.phone && <p>{storeProfile?.phone}</p>}
      </div>

      <div className="text-center mb-4">
        <h3 className="text-lg font-bold uppercase tracking-widest border border-black inline-block px-4 py-1">
          Invoice
        </h3>
      </div>

      <div className="mb-6 space-y-1">
        <div className="flex justify-between">
          <span className="font-bold">Invoice no:</span>
          <span>{invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Customer:</span>
          <span>{transaction.customer?.name || "Walk-in Customer"}</span>
        </div>
        {transaction.customer?.phone && (
          <div className="flex justify-between">
            <span className="font-bold">Mobile:</span>
            <span>{transaction.customer.phone}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="font-bold">Date:</span>
          <span>{new Date(transaction.date).toLocaleString("en-GB")}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="border-b border-black pb-2 mb-2">
        <div className="flex justify-between font-bold mb-2 border-b border-dashed border-black pb-1 text-xs">
          <span className="flex-1 w-1/2">Product</span>
          <span className="w-8 text-center">Qty</span>
          <span className="w-16 text-right">Price</span>
          <span className="w-20 text-right">Total</span>
        </div>
        {transaction.items.map((item) => (
          <div
            key={item.id}
            className="flex justify-between mb-1 text-xs items-start"
          >
            <span className="flex-1 w-1/2 break-words pr-2 leading-tight">
              {item.name}
            </span>
            <span className="w-8 text-center">{item.quantity}</span>
            <span className="w-16 text-right">
              {formatCurrency(item.unit_price)}
            </span>
            <span className="w-20 text-right">
              {formatCurrency(item.subtotal)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer / Totals */}
      <div className="space-y-1 pb-4 mb-4 border-b border-black">
        <div className="flex justify-between">
          <span>Sub total:</span>
          <span>{formatCurrency(transaction.subtotal)}</span>
        </div>
        {transaction.tax > 0 && (
          <div className="flex justify-between">
            <span>Tax ({vatPercentage}%):</span>
            <span>{formatCurrency(transaction.tax)}</span>
          </div>
        )}
        {transaction.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-{formatCurrency(transaction.discount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-2 mt-1 border-t border-dashed border-black">
          <span>Total:</span>
          <span>{formatCurrency(transaction.total)}</span>
        </div>
      </div>

      {/* Payment details */}
      <div className="space-y-1 mb-6 text-xs">
        {transaction.paymentMethod === "mixed" && transaction.paymentSplits ? (
          <>
            <div className="font-bold border-b border-dashed border-black pb-1 mb-1">
              Payment Breakdown (MIXED)
            </div>
            {transaction.paymentSplits.map((split, i) => (
              <div key={i} className="flex justify-between">
                <span className="uppercase">{split.method}:</span>
                <span>{formatCurrency(split.amount)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="flex justify-between">
            <span>Payment type:</span>
            <span className="uppercase font-bold">
              {transaction.paymentMethod}
            </span>
          </div>
        )}
        
        <div className="flex justify-between mt-2 pt-2 border-t border-dashed border-black">
          <span>Date:</span>
          <span>{new Date(transaction.date).toLocaleDateString("en-GB")}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Total paid:</span>
          <span>{formatCurrency(transaction.amountPaid)}</span>
        </div>
        {transaction.change > 0 && (
          <div className="flex justify-between font-bold text-lg">
            <span>Change:</span>
            <span>{formatCurrency(transaction.change)}</span>
          </div>
        )}
      </div>

      {/* Barcode */}
      <div className="flex flex-col items-center justify-center pt-4 mb-4 overflow-hidden">
        <Barcode
          value={transaction.id}
          width={1.2}
          height={40}
          fontSize={10}
          background="transparent"
        />
      </div>

      <div className="text-center italic text-xs">
        <p>Thank you for your patronage!</p>
        <p>
          {APP_NAME} - NextGen{" "}
          {storeProfile?.store_type === "store" ? "Store" : "Retail"} POS
        </p>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-receipt,
          .printable-receipt * {
            visibility: visible;
          }
          .printable-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
