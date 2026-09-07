import React from 'react';
import { Receipt } from 'lucide-react';
import { TransactionItem } from './transaction-item';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/lib/context/auth-context';
import type { SaleWithDetails } from '@/lib/types/sale';

function NoRecentSalesFound() {
  const { user } = useAuth();
  const isAuditor = user?.role === "auditor";
  return (
    <div className="border rounded-xl border-dashed">
      <EmptyState
        icon={Receipt}
        title="No recent sales found"
        action={isAuditor ? undefined : { label: "Go to POS", href: "/pos" }}
      />
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
