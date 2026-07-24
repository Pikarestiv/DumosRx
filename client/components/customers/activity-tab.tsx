"use client";

import { useMemo, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { genericFuzzySearch } from "@/lib/utils/search";
import {
  CustomerTransaction,
  useCustomerTransactions,
} from "@/lib/hooks/use-customer-data";

const MAX_ITEMS_SHOWN = 2;

function ItemsCell({ txn }: { txn: CustomerTransaction }) {
  if (txn.itemNames.length === 0) {
    return (
      <span className="text-muted-foreground">
        {txn.itemCount} item{txn.itemCount === 1 ? "" : "s"}
      </span>
    );
  }
  const shown = txn.itemNames.slice(0, MAX_ITEMS_SHOWN);
  const extra = txn.itemCount - shown.length;
  return (
    <span
      className="truncate block max-w-[280px]"
      title={txn.itemNames.join(", ")}
    >
      {shown.join(", ")}
      {extra > 0 && (
        <span className="text-muted-foreground"> +{extra} more</span>
      )}
    </span>
  );
}

interface ActivityTabProps {
  currencyCode?: string;
  filterCustomerId?: string;
  filterCustomerName?: string;
  onClearFilter?: () => void;
}

export function ActivityTab({
  currencyCode = "NGN",
  filterCustomerId,
  filterCustomerName,
  onClearFilter,
}: ActivityTabProps) {
  const { transactions, loading } = useCustomerTransactions();
  const [searchTerm, setSearchTerm] = useState("");

  const scopedTransactions = useMemo(() => {
    if (!filterCustomerId) return transactions;
    return transactions.filter((t) => t.customerId === filterCustomerId);
  }, [transactions, filterCustomerId]);

  const { results: filtered } = genericFuzzySearch(
    searchTerm,
    scopedTransactions,
    ["customerName", "transactionNumber"],
  );

  return (
    <Card className="border rounded-[14px] shadow-sm flex flex-col h-[600px] overflow-hidden">
      <div className="p-4 border-b space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by customer or transaction ID"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted border-none rounded-[10px] pl-9 pr-4 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
        {filterCustomerId && (
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-[12px] font-medium">
              Showing history for {filterCustomerName || "customer"}
              <button
                onClick={onClearFilter}
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-[13px]">
          Loading activity...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-[13px]">
          No transactions found.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block flex-1 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="pl-4">Txn ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="pl-4 font-medium text-[12px]">
                      {txn.transactionNumber}
                    </TableCell>
                    <TableCell className="text-[13px]">
                      {txn.customerName}
                    </TableCell>
                    <TableCell className="text-[13px] font-medium">
                      {formatCurrency(txn.amount, currencyCode)}
                    </TableCell>
                    <TableCell className="text-[13px] text-amber-600">
                      {txn.pointsEarned > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-600" />
                          {txn.pointsEarned}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {formatDateTime(txn.date)}
                    </TableCell>
                    <TableCell className="text-[12.5px]">
                      <ItemsCell txn={txn} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden flex-1 overflow-y-auto p-2 space-y-2">
            {filtered.map((txn) => (
              <div
                key={txn.id}
                className="p-3 rounded-[10px] border bg-secondary/20 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[13px] font-semibold">
                      {txn.customerName}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {txn.transactionNumber}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold">
                      {formatCurrency(txn.amount, currencyCode)}
                    </div>
                    {txn.pointsEarned > 0 && (
                      <div className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                        <Star className="w-3 h-3 fill-amber-600" />
                        {txn.pointsEarned} pts
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[11.5px] text-muted-foreground truncate">
                  <ItemsCell txn={txn} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatDateTime(txn.date)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
