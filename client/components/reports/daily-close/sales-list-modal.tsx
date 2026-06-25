import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface SalesListModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  reportDate: string;
  salesToday: any[];
  paymentFilter: string;
  setPaymentFilter: (filter: string) => void;
  setSelectedSale: (sale: any) => void;
  currencyCode?: string;
}

export function SalesListModal({
  isOpen,
  onOpenChange,
  reportDate,
  salesToday,
  paymentFilter,
  setPaymentFilter,
  setSelectedSale,
  currencyCode,
}: SalesListModalProps) {
  const [salesSearch, setSalesSearch] = useState("");

  const filteredSales = useMemo(() => {
    return salesToday.filter((s: any) => {
      const matchesSearch = s.transaction_number
        .toLowerCase()
        .includes(salesSearch.toLowerCase());
      const matchesFilter =
        paymentFilter === "all" ||
        s.payment_method?.toLowerCase() === paymentFilter;
      return matchesSearch && matchesFilter;
    });
  }, [salesToday, salesSearch, paymentFilter]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col pt-10">
        <DialogHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-4 mt-2 border-b mb-4">
          <DialogTitle>Sales on {reportDate}</DialogTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Payment Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">POS / Card</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Search receipt..."
              value={salesSearch}
              onChange={(e) => setSalesSearch(e.target.value)}
              className="h-8 w-full sm:w-[200px]"
            />
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Receipt No</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No sales found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((sale: any) => (
                  <TableRow
                    key={sale.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedSale(sale)}
                  >
                    <TableCell>
                      {new Date(sale.transaction_date).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {sale.transaction_number}
                    </TableCell>
                    <TableCell className="capitalize">
                      {sale.payment_method}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(sale.total_amount, currencyCode)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
