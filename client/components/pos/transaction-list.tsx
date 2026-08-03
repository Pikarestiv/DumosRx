import React from 'react';
import { Receipt } from 'lucide-react';
import { TransactionItem } from './transaction-item';
import type { SaleWithDetails } from '@/lib/types/sale';

function NoRecentSalesFound() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground border rounded-xl border-dashed">
      <Receipt className="w-7 h-7 opacity-30" />
      No recent sales found
    </div>
  );
}

interface TransactionListProps {
  groupedSales: { [key: string]: SaleWithDetails[] };
  currencyCode?: string;
  canReturn?: boolean;
  onSelectSale: (sale: SaleWithDetails) => void;
  onReturnClick: (sale: SaleWithDetails) => void;
  hasFilters: boolean;
}

export function TransactionList({
  groupedSales,
  currencyCode,
  canReturn,
  onSelectSale,
  onReturnClick,
  hasFilters,
}: TransactionListProps) {
  if (hasFilters) {
    return <NoRecentSalesFound />;
  }

  return (
    <div className="space-y-6 pb-6">
      {Object.entries(groupedSales).map(([groupName, sales]) => {
        if (sales.length === 0) return null;
        return (
          <div key={groupName} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase pl-1">
              {groupName}
            </h3>
            <div className="flex flex-col gap-3">
              {sales.map((sale) => (
                <TransactionItem
                  key={sale.id}
                  sale={sale}
                  currencyCode={currencyCode}
                  canReturn={canReturn}
                  onClick={() => onSelectSale(sale)}
                  onReturnClick={onReturnClick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
