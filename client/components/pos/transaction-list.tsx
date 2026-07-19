import React from 'react';
import { TransactionItem } from './transaction-item';

export function TransactionList({
  groupedSales,
  currencyCode,
  canReturn,
  onSelectSale,
  onReturnClick,
  hasFilters,
}: any) {
  if (hasFilters) {
    return (
      <div className="text-center py-10 text-muted-foreground border rounded-xl border-dashed">
        No recent sales found
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {Object.entries(groupedSales).map(([groupName, sales]: [string, any]) => {
        if (sales.length === 0) return null;
        return (
          <div key={groupName} className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase pl-1">
              {groupName}
            </h3>
            <div className="flex flex-col gap-3">
              {sales.map((sale: any) => (
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
