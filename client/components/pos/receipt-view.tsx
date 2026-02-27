"use client";

import { useStore } from "@/lib/context/store-context";

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
  };
}

export function ReceiptView({ transaction }: ReceiptProps) {
  const { storeProfile, t } = useStore();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-white p-8 max-w-[400px] mx-auto text-black font-mono text-sm leading-tight printable-receipt">
      <div className="text-center border-b pb-4 mb-4">
        <h2 className="text-lg font-bold uppercase">{storeProfile?.name}</h2>
        <p>{storeProfile?.address}</p>
        <p>{storeProfile?.phone}</p>
      </div>

      <div className="mb-4">
        <p>Date: {new Date(transaction.date).toLocaleString()}</p>
        <p>Receipt #: {transaction.id.slice(0, 8).toUpperCase()}</p>
        {transaction.customer && <p>Customer: {transaction.customer.name}</p>}
      </div>

      <div className="border-b border-dashed pb-2 mb-2">
        <div className="flex justify-between font-bold mb-1">
          <span className="flex-1 italic">{t('product')}</span>
          <span className="w-8 text-center italic">Qty</span>
          <span className="w-20 text-right italic">Price</span>
        </div>
        {transaction.items.map((item) => (
          <div key={item.id} className="flex justify-between mb-1">
            <span className="flex-1">{item.name}</span>
            <span className="w-8 text-center">{item.quantity}</span>
            <span className="w-20 text-right">{formatCurrency(item.subtotal)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1 border-b border-dashed pb-2 mb-4">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(transaction.subtotal)}</span>
        </div>
        {transaction.tax > 0 && (
          <div className="flex justify-between">
            <span>Tax (7.5%):</span>
            <span>{formatCurrency(transaction.tax)}</span>
          </div>
        )}
        {transaction.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-{formatCurrency(transaction.discount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-1 border-t border-dotted">
          <span>TOTAL:</span>
          <span>{formatCurrency(transaction.total)}</span>
        </div>
      </div>

      <div className="space-y-1 mb-6">
        <div className="flex justify-between">
          <span>Paid via {transaction.paymentMethod?.toUpperCase()}:</span>
          <span>{formatCurrency(transaction.amountPaid)}</span>
        </div>
        {transaction.change > 0 && (
          <div className="flex justify-between font-bold">
            <span>CHANGE:</span>
            <span>{formatCurrency(transaction.change)}</span>
          </div>
        )}
      </div>

      <div className="text-center pt-4 border-t italic">
        <p>Thank you for your business!</p>
        <p>DumosRx - NextGen {storeProfile?.store_type === 'pharmacy' ? 'Pharmacy' : 'Retail'} POS</p>
      </div>
      
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-receipt, .printable-receipt * {
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
